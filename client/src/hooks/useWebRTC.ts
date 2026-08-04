import { useEffect, useRef, useState, useCallback } from "react";
import SimplePeer from "simple-peer";
import { io, Socket } from "socket.io-client";

export interface PeerInfo {
  peerId: string;
  displayName: string;
  isInitiator: boolean;
}

export interface TransferProgress {
  fileName: string;
  progress: number;
  total: number;
  speed: number;
  timeRemaining: number;
}

export interface UseWebRTCOptions {
  displayName: string;
  isInitiator: boolean;
}

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

export function useWebRTC({ displayName, isInitiator }: UseWebRTCOptions) {
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const [peerId, setPeerId] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [remotePeerInfo, setRemotePeerInfo] = useState<PeerInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const remoteIdRef = useRef<string>("");

  // Initialize socket connection
  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[WebRTC] Socket connected");
      // Register this peer
      socket.emit("register-peer", { displayName, isInitiator }, (response: any) => {
        if (response.success) {
          setPeerId(response.peerId);
          console.log(`[WebRTC] Registered with peerId: ${response.peerId}`);
        }
      });
    });

    socket.on("signal", (data: any) => {
      console.log(`[WebRTC] Received signal: ${data.type}`);
      setRemotePeerInfo({
        peerId: data.from,
        displayName: data.fromDisplayName,
        isInitiator: false,
      });

      remoteIdRef.current = data.from;

      // If we don't have a peer connection yet and this is an offer, create one
      if (!peerRef.current && data.type === "offer") {
        console.log(`[WebRTC] Creating peer connection for incoming offer`);
        createPeerConnection(false, data.from);
      }

      if (peerRef.current) {
        try {
          peerRef.current.signal(data.data);
        } catch (err) {
          console.error("[WebRTC] Error signaling peer:", err);
        }
      }
    });

    socket.on("signal-error", (data: any) => {
      setError(data.message);
      console.error("[WebRTC] Signal error:", data.message);
    });

    socket.on("peer-disconnected", (data: any) => {
      console.log(`[WebRTC] Peer disconnected: ${data.peerId}`);
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      setConnected(false);
      setRemotePeerInfo(null);
    });

    socket.on("error", (error: any) => {
      setError(`Socket error: ${error}`);
      console.error("[WebRTC] Socket error:", error);
    });

    socket.on("disconnect", () => {
      console.log("[WebRTC] Socket disconnected");
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [displayName, isInitiator]);

  const createPeerConnection = useCallback(
    (initiator: boolean, remoteId: string) => {
      if (peerRef.current) {
        console.log("[WebRTC] Peer connection already exists");
        return;
      }

      console.log(`[WebRTC] Creating peer connection (initiator: ${initiator})`);

      const peer = new SimplePeer({
        initiator,
        trickle: true,
        streams: [],
        config: {
          iceServers: STUN_SERVERS,
        },
      });

      peer.on("signal", (data: any) => {
        console.log(`[WebRTC] Sending signal: ${data.type}`);
        socketRef.current?.emit("signal", {
          type: data.type,
          data: data,
          from: peerId,
          to: remoteId,
        });
      });

      peer.on("connect", () => {
        console.log("[WebRTC] Peer connection established");
        setConnected(true);
        setError("");
      });

      peer.on("error", (err: any) => {
        const errorMsg = `Peer error: ${err.message || err}`;
        setError(errorMsg);
        console.error("[WebRTC] Peer error:", err);
      });

      peer.on("close", () => {
        console.log("[WebRTC] Peer connection closed");
        setConnected(false);
      });

      peerRef.current = peer;
    },
    [peerId]
  );

  const connectToPeer = useCallback(
    (targetPeerId: string) => {
      if (!socketRef.current || !peerId) {
        setError("Socket or peer ID not initialized");
        return;
      }

      console.log(`[WebRTC] Initiating connection to ${targetPeerId}`);
      remoteIdRef.current = targetPeerId;
      createPeerConnection(true, targetPeerId);
    },
    [peerId, createPeerConnection]
  );

  const sendFile = useCallback(
    async (file: File) => {
      if (!peerRef.current || !peerRef.current.connected) {
        setError("Not connected to peer");
        return;
      }

      console.log(`[WebRTC] Sending file: ${file.name}`);

      const chunkSize = 64 * 1024; // 64KB chunks
      const totalChunks = Math.ceil(file.size / chunkSize);
      let sentChunks = 0;
      const startTime = Date.now();

      const reader = new FileReader();

      const sendChunk = (start: number) => {
        if (start >= file.size) {
          // Send completion message
          peerRef.current?.send(
            JSON.stringify({
              type: "file-complete",
              fileName: file.name,
              fileSize: file.size,
            })
          );
          setTransferProgress(null);
          console.log(`[WebRTC] File transfer complete: ${file.name}`);
          return;
        }

        const end = Math.min(start + chunkSize, file.size);
        const blob = file.slice(start, end);

        reader.onload = (e) => {
          if (e.target?.result) {
            const data = e.target.result as ArrayBuffer;
            peerRef.current?.send(
              JSON.stringify({
                type: "file-chunk",
                fileName: file.name,
                chunkIndex: sentChunks,
                totalChunks: totalChunks,
                data: Array.from(new Uint8Array(data)),
              })
            );

            sentChunks++;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = (sentChunks * chunkSize) / elapsed / (1024 * 1024); // MB/s
            const timeRemaining = ((totalChunks - sentChunks) * chunkSize) / (speed * 1024 * 1024);

            setTransferProgress({
              fileName: file.name,
              progress: sentChunks,
              total: totalChunks,
              speed,
              timeRemaining,
            });

            sendChunk(end);
          }
        };

        reader.readAsArrayBuffer(blob);
      };

      sendChunk(0);
    },
    []
  );

  const receiveFile = useCallback((onChunk: (data: any) => void, onComplete: (data: any) => void) => {
    if (!peerRef.current) {
      setError("Peer not initialized");
      return;
    }

    peerRef.current.on("data", (data: any) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "file-chunk") {
          onChunk(message);
          const progress = (message.chunkIndex / message.totalChunks) * 100;
          setTransferProgress({
            fileName: message.fileName,
            progress: message.chunkIndex,
            total: message.totalChunks,
            speed: 0,
            timeRemaining: 0,
          });
        } else if (message.type === "file-complete") {
          onComplete(message);
          setTransferProgress(null);
          console.log(`[WebRTC] File received: ${message.fileName}`);
        }
      } catch (err) {
        console.error("[WebRTC] Error parsing message:", err);
      }
    });
  }, []);

  return {
    peerId,
    connected,
    remotePeerInfo,
    error,
    transferProgress,
    connectToPeer,
    sendFile,
    receiveFile,
  };
}
