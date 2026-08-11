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
  private sessions: Map<string, PeerSession> = new Map();
  private peerConnections: Map<string, Set<string>> = new Map();

  constructor(httpServer: HTTPServer) {
    const corsOrigin = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
      : "*";

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`[WebRTC] Client connected: ${socket.id}`);

      socket.on("register-peer", (data: { displayName: string; isInitiator: boolean; preferredPeerId?: string }, callback) => {
        let session = this.sessions.get(socket.id);
        let peerId: string;

        if (session) {
          // Existing session — update display name in-place
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
            for (const [sId, s] of Array.from(this.sessions.entries())) {
              if (s.peerId === preferred && sId !== socket.id) {
                console.log(`[WebRTC] Evicting stale session ${sId} for peer ${preferred}`);
                this.sessions.delete(sId);
                this.peerConnections.delete(sId);
              }
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
          this.peerConnections.set(socket.id, new Set());
          // Notify any other active session that was previously paired with this peerId
          for (const [otherSocketId, otherSession] of Array.from(this.sessions.entries())) {
            if (otherSocketId !== socket.id) {
              const otherConns = this.peerConnections.get(otherSocketId);
              if (otherConns) {
                // Re-link new socket ID in connection set
                otherConns.add(socket.id);
                this.peerConnections.get(socket.id)?.add(otherSocketId);

                console.log(`[WebRTC] Auto-reconnecting peers: ${peerId} <-> ${otherSession.peerId}`);
                this.io.to(otherSocketId).emit("peer-connected", {
                  peerId,
                  displayName: data.displayName,
                });
                this.io.to(socket.id).emit("peer-connected", {
                  peerId: otherSession.peerId,
                  displayName: otherSession.displayName,
                });
              }
            }
          }
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

        // Find the target peer by peerId
        let targetSocketId: string | null = null;
        const sessionsArray = Array.from(this.sessions.entries());
        for (const [socketId, session] of sessionsArray) {
          if (session.peerId === data.to) {
            targetSocketId = socketId;
            break;
          }
        }

        if (!targetSocketId) {
          console.warn(`[WebRTC] Target peer not found: ${data.to}`);
          socket.emit("signal-error", { message: "Target peer not found" });
          return;
        }

        // Track connection
        const connections = this.peerConnections.get(socket.id);
        if (connections) {
          connections.add(targetSocketId);
        }

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

        let targetSocketId: string | null = null;
        for (const [sId, session] of this.sessions.entries()) {
          if (session.peerId === data.to) {
            targetSocketId = sId;
            break;
          }
        }

        if (targetSocketId) {
          this.io.to(targetSocketId).emit("relay-file-data", {
            from: fromSession.peerId,
            fromDisplayName: fromSession.displayName,
            payload: data.payload,
          });
        }
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
          this.sessions.delete(socket.id);
          this.peerConnections.delete(socket.id);

          // Notify connected peers
          const connections = this.peerConnections.get(socket.id);
          if (connections) {
            connections.forEach((connectedSocketId) => {
              this.io.to(connectedSocketId).emit("peer-disconnected", {
                peerId: session.peerId,
              });
            });
          }
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
    const sessionsValues = Array.from(this.sessions.values());
    for (const session of sessionsValues) {
      if (session.peerId === peerId) {
        return session;
      }
    }
    return null;
  }

  public getActivePeers(): PeerSession[] {
    const peersArray: PeerSession[] = [];
    const sessionsValues = Array.from(this.sessions.values());
    sessionsValues.forEach((session) => {
      peersArray.push(session);
    });
    return peersArray;
  }
}

export default WebRTCSignalingService;
