import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import crypto from "crypto";
import os from "os";

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const k in interfaces) {
    for (const k2 of interfaces[k] || []) {
      if (k2.family === "IPv4" && !k2.internal) {
        addresses.push(k2.address);
      }
    }
  }
  return addresses;
}

export interface PeerSession {
  id: string;
  peerId: string;
  displayName: string;
  createdAt: number;
  isInitiator: boolean;
}

export interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate";
  data: any;
  from: string;
  to: string;
}

class WebRTCSignalingService {
  private io: SocketIOServer;
  private sessions: Map<string, PeerSession> = new Map(); // socketId -> PeerSession
  private peerIdToSocketId: Map<string, string> = new Map(); // peerId -> socketId (O(1) lookup index)
  private peerConnections: Map<string, Set<string>> = new Map(); // socketId -> Set<connectedSocketId>
  private sweeperInterval: NodeJS.Timeout | null = null;

  constructor(httpServer: HTTPServer) {
    const corsOrigin = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
      : "*";

    // Senior Backend Socket.IO Tuning:
    // - pingInterval: 10s & pingTimeout: 5s -> detect dead 4G sockets fast (5s threshold)
    // - maxHttpBufferSize: 10MB cap per chunk payload
    // - perMessageDeflate: false -> disable compression to reduce CPU overhead on high-throughput binary chunks
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
      pingInterval: 10000,
      pingTimeout: 5000,
      maxHttpBufferSize: 10 * 1024 * 1024,
      perMessageDeflate: false,
    });

    this.setupEventHandlers();
    this.startStaleSessionSweeper();
  }

  /**
   * Background Memory Sweeper (runs every 30s):
   * Purges orphaned sessions whose socket disconnected or exceeded 2 hours max TTL.
   */
  private startStaleSessionSweeper() {
    this.sweeperInterval = setInterval(() => {
      const now = Date.now();
      const maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours

      for (const [socketId, session] of Array.from(this.sessions.entries())) {
        const socketExists = this.io.sockets.sockets.has(socketId);
        const isExpired = now - session.createdAt > maxAgeMs;

        if (!socketExists || isExpired) {
          console.log(`[WebRTC Sweeper] Purging dead/stale session: ${session.peerId} (${socketId})`);
          this.removeSession(socketId);
        }
      }
    }, 30000);
  }

  private removeSession(socketId: string) {
    const session = this.sessions.get(socketId);
    if (session) {
      if (session.peerId) {
        this.peerIdToSocketId.delete(session.peerId);
      }
      this.sessions.delete(socketId);

      const connections = this.peerConnections.get(socketId);
      if (connections) {
        connections.forEach((connectedSocketId) => {
          this.io.to(connectedSocketId).emit("peer-disconnected", {
            peerId: session.peerId,
          });
        });
      }
      this.peerConnections.delete(socketId);
    }
  }

  private setupEventHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`[WebRTC] Client connected: ${socket.id}`);

      socket.on("register-peer", (data: { displayName: string; isInitiator: boolean; preferredPeerId?: string }, callback) => {
        let session = this.sessions.get(socket.id);
        let peerId: string;

        if (session) {
          // Existing session — update display name and peerId if preferredPeerId changed
          const oldPeerId = session.peerId;
          if (data.preferredPeerId && data.preferredPeerId !== oldPeerId) {
            console.log(`[WebRTC] Updating socket ${socket.id} Peer ID: ${oldPeerId} -> ${data.preferredPeerId}`);
            this.peerIdToSocketId.delete(oldPeerId);
            session.peerId = data.preferredPeerId;
            this.peerIdToSocketId.set(data.preferredPeerId, socket.id);
          }
          const nameChanged = session.displayName !== data.displayName;
          session.displayName = data.displayName;
          session.isInitiator = data.isInitiator;
          peerId = session.peerId;
          if (nameChanged) {
            console.log(`[WebRTC] Peer name updated: ${peerId} (${data.displayName})`);
          }
        } else {
          // New connection — reuse the client's preferred Peer ID and evict any stale dead session
          const preferred = data.preferredPeerId;
          if (preferred) {
            const staleSocketId = this.peerIdToSocketId.get(preferred);
            if (staleSocketId && staleSocketId !== socket.id) {
              console.log(`[WebRTC] Evicting stale session ${staleSocketId} for preferred peer ${preferred}`);
              this.removeSession(staleSocketId);
            }
            peerId = preferred;
          } else {
            peerId = this.generatePeerId();
          }

          session = {
            id: socket.id,
            peerId,
            displayName: data.displayName,
            createdAt: Date.now(),
            isInitiator: data.isInitiator,
          };

          this.sessions.set(socket.id, session);
          this.peerIdToSocketId.set(peerId, socket.id);
          this.peerConnections.set(socket.id, new Set());
        }

        if (typeof callback === "function") {
          callback({
            success: true,
            peerId,
            sessionId: socket.id,
            lanIps: getLocalIpAddresses(),
          });
        }
      });

      socket.on("signal", (data: SignalingMessage) => {
        const fromSession = this.sessions.get(socket.id);
        if (!fromSession) {
          console.warn(`[WebRTC] Signal received from unregistered peer: ${socket.id}`);
          return;
        }

        // Fast O(1) target lookup index
        const targetSocketId = this.peerIdToSocketId.get(data.to) || null;

        if (!targetSocketId) {
          console.warn(`[WebRTC] Target peer not found: ${data.to}`);
          socket.emit("signal-error", { message: "Target peer not found" });
          return;
        }

        // Track connection in BOTH directions
        const conn1 = this.peerConnections.get(socket.id);
        if (conn1) conn1.add(targetSocketId);
        const conn2 = this.peerConnections.get(targetSocketId);
        if (conn2) conn2.add(socket.id);

        // If offer or initial connection, notify both sides that peer-connected
        if (data.type === "offer") {
          const targetSession = this.sessions.get(targetSocketId);
          if (targetSession) {
            this.io.to(socket.id).emit("peer-connected", {
              peerId: targetSession.peerId,
              displayName: targetSession.displayName,
            });
            this.io.to(targetSocketId).emit("peer-connected", {
              peerId: fromSession.peerId,
              displayName: fromSession.displayName,
            });
          }
        }

        // Forward the signal
        this.io.to(targetSocketId).emit("signal", {
          type: data.type,
          data: data.data,
          from: fromSession.peerId,
          fromDisplayName: fromSession.displayName,
        });

        console.log(`[WebRTC] Signal forwarded: ${fromSession.peerId} -> ${data.to} (${data.type})`);
      });

      socket.on("relay-file-data", (data: { to: string; payload: any }) => {
        const fromSession = this.sessions.get(socket.id);
        if (!fromSession) return;

        // Fast O(1) target lookup index
        const targetSocketId = this.peerIdToSocketId.get(data.to) || null;

        if (targetSocketId) {
          this.io.to(targetSocketId).emit("relay-file-data", {
            from: fromSession.peerId,
            fromDisplayName: fromSession.displayName,
            payload: data.payload,
          });
        }
      });

      socket.on("explicit-disconnect", (data?: { to?: string }) => {
        const fromSession = this.sessions.get(socket.id);
        if (!fromSession) return;

        const targetSocketIds = new Set<string>();

        // 1. Direct lookup by target peer ID
        if (data?.to) {
          const directSocketId = this.peerIdToSocketId.get(data.to);
          if (directSocketId) targetSocketIds.add(directSocketId);
        }

        // 2. All connected sockets in socket.id's tracking map
        const conns1 = this.peerConnections.get(socket.id);
        if (conns1) {
          conns1.forEach((tid) => targetSocketIds.add(tid));
        }

        // 3. Reverse lookup in all peerConnections sets containing socket.id
        for (const [otherSocketId, connSet] of Array.from(this.peerConnections.entries())) {
          if (connSet.has(socket.id)) {
            targetSocketIds.add(otherSocketId);
          }
        }

        console.log(`[WebRTC] Explicit disconnect from ${fromSession.peerId} (${socket.id}) notifying ${targetSocketIds.size} target peers`);

        targetSocketIds.forEach((targetSocketId) => {
          this.peerConnections.get(socket.id)?.delete(targetSocketId);
          this.peerConnections.get(targetSocketId)?.delete(socket.id);

          this.io.to(targetSocketId).emit("peer-disconnected", {
            peerId: fromSession.peerId,
            explicit: true,
          });
        });
      });

      socket.on("get-peer-info", (callback) => {
        const session = this.sessions.get(socket.id);
        if (session && typeof callback === "function") {
          callback({
            peerId: session.peerId,
            displayName: session.displayName,
            isInitiator: session.isInitiator,
          });
        }
      });

      socket.on("disconnect", () => {
        const session = this.sessions.get(socket.id);
        if (session) {
          console.log(`[WebRTC] Peer disconnected: ${session.peerId}`);
          this.removeSession(socket.id);
        }
      });

      socket.on("error", (error) => {
        console.error(`[WebRTC] Socket error for ${socket.id}:`, error);
      });
    });
  }

  private generatePeerId(): string {
    return crypto.randomBytes(6).toString("hex").toUpperCase();
  }

  public getIO(): SocketIOServer {
    return this.io;
  }

  public getPeerInfo(peerId: string): PeerSession | null {
    const socketId = this.peerIdToSocketId.get(peerId);
    if (socketId) {
      return this.sessions.get(socketId) || null;
    }
    return null;
  }

  public getActivePeers(): PeerSession[] {
    return Array.from(this.sessions.values());
  }
}

export default WebRTCSignalingService;
