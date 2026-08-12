import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface PeerInfo {
  peerId: string;
  displayName: string;
  isInitiator: boolean;
}

export interface TransferProgress {
  fileName: string;
  progress: number; // chunks transferred
  total: number; // total chunks
  fileSizeBytes: number; // actual file size in bytes
  transferredBytes: number; // actual bytes transferred
  speed: number; // MB/s
  timeRemaining: number; // seconds
  direction?: "send" | "receive";
}

const PEER_ID_KEY = "p2p_stable_peer_id";

export interface UseWebRTCOptions {
  displayName: string;
  isInitiator: boolean;
}

const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    // STUN servers (discover public IP, work for simple NATs)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.services.mozilla.com" },
    { urls: "stun:global.stun.twilio.com:3478" },
    { urls: "stun:stun.xten.com" },
    // Free public TURN relay servers (OpenRelay by Metered.ca)
    // Required for cross-network connections (5G ↔ WiFi, different ISPs)
    // where Carrier-Grade NAT (CG-NAT) blocks direct peer connections.
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turn:openrelay.metered.ca:80?transport=tcp",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  // Optional: override with your own TURN server via environment variables
  // Set VITE_TURN_SERVER_URL, VITE_TURN_USERNAME, VITE_TURN_PASSWORD in .env
  const turnUrl = (import.meta as any).env?.VITE_TURN_SERVER_URL;
  const turnUsername = (import.meta as any).env?.VITE_TURN_USERNAME;
  const turnCredential = (import.meta as any).env?.VITE_TURN_PASSWORD;

  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
};

export function useWebRTC({ displayName, isInitiator }: UseWebRTCOptions) {
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const optionsRef = useRef({ displayName, isInitiator });
  optionsRef.current = { displayName, isInitiator };

  const [peerId, setPeerId] = useState<string>("");
  const peerIdRef = useRef<string>("");
  peerIdRef.current = peerId;

  // isRegistered = true only AFTER server confirms register-peer
  // This prevents sending signals before the server knows who we are
  const [isRegistered, setIsRegistered] = useState(false);

  const [serverLanIp, setServerLanIp] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [remotePeerInfo, setRemotePeerInfo] = useState<PeerInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);

  const pausedStartTimeRef = useRef<number | null>(null);
  const totalPausedDurationRef = useRef<number>(0);
  const receiveStartTimeRef = useRef<number | null>(null);

  const remoteIdRef = useRef<string>("");
  const pendingCandidatesRef = useRef<any[]>([]);
  const wakeLockRef = useRef<any>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  const lastAckedChunkIndexRef = useRef<number>(-1);
  const resumeFromChunkRef = useRef<number | null>(null);
  const lastReceivedChunkIndexRef = useRef<number>(-1);

  const onChunkRef = useRef<((data: any) => void) | null>(null);
  const onCompleteRef = useRef<((data: any) => void) | null>(null);

  // Screen Wake Lock API handler to prevent screen sleep/lock during transfers
  const requestWakeLock = useCallback(async () => {
    if (typeof window !== "undefined" && "wakeLock" in navigator && !wakeLockRef.current) {
      try {
        const lock = await (navigator as any).wakeLock.request("screen");
        wakeLockRef.current = lock;
        console.log("[WakeLock] Screen Wake Lock acquired");
        lock.addEventListener("release", () => {
          wakeLockRef.current = null;
          console.log("[WakeLock] Screen Wake Lock released");
        });
      } catch (err) {
        console.warn("[WakeLock] Failed to acquire Screen Wake Lock:", err);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
      } catch (e) {}
      wakeLockRef.current = null;
    }
  }, []);

  // Silent audio loop to keep mobile JS thread & WebRTC alive in background
  const startSilentAudio = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!silentAudioRef.current) {
      const silentMp3 =
        "data:audio/mp3;base64,SUQ3BAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//oeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD4+Pg==";
      const audio = new Audio(silentMp3);
      audio.loop = true;
      silentAudioRef.current = audio;
    }
    silentAudioRef.current.play().catch(() => {});
  }, []);

  const stopSilentAudio = useCallback(() => {
    if (silentAudioRef.current) {
      try {
        silentAudioRef.current.pause();
      } catch (e) {}
    }
  }, []);

  // Manage Wake Lock & Background Keep-Alive state
  useEffect(() => {
    if (connected || transferProgress !== null) {
      requestWakeLock();
      startSilentAudio();
    } else {
      releaseWakeLock();
      stopSilentAudio();
    }
  }, [connected, transferProgress, requestWakeLock, releaseWakeLock, startSilentAudio, stopSilentAudio]);

  const sendDataToPeer = useCallback((payload: any) => {
    if (dataChannelRef.current?.readyState === "open") {
      try {
        dataChannelRef.current.send(JSON.stringify(payload));
        return true;
      } catch (e) {
        console.warn("[WebRTC] DataChannel send error, falling back to relay:", e);
      }
    }

    if (socketRef.current?.connected && remoteIdRef.current) {
      socketRef.current.emit("relay-file-data", {
        to: remoteIdRef.current,
        payload,
      });
      return true;
    }

    return false;
  }, []);

  // Handle visibility change (e.g. screen lock/unlock or tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[Screen Unlock] Page visible, restoring session & re-requesting Wake Lock");
        if (connected || transferProgress !== null || remoteIdRef.current) {
          requestWakeLock();
          startSilentAudio();
        }

        // Reset stalled/closed WebRTC DataChannel so transfers transparently fall back to WebSocket relay
        if (dataChannelRef.current && dataChannelRef.current.readyState !== "open") {
          console.log(`[Screen Unlock] Resetting stalled DataChannel state (${dataChannelRef.current.readyState})`);
          dataChannelRef.current = null;
        }

        const socket = socketRef.current;
        if (socket) {
          if (!socket.connected) {
            console.log("[Screen Unlock] Socket disconnected during lock, forcing reconnect...");
            socket.connect();
          }

          const { displayName: curName, isInitiator: curInit } = optionsRef.current;
          socket.emit(
            "register-peer",
            { displayName: curName, isInitiator: curInit, preferredPeerId: peerIdRef.current },
            (response: any) => {
              if (response?.success && response.peerId) {
                setPeerId(response.peerId);
                peerIdRef.current = response.peerId;
              }
            }
          );
        }

        // If receiver was in the middle of a transfer when screen unlocked, send resume request
        if (lastReceivedChunkIndexRef.current >= 0 && remoteIdRef.current) {
          console.log(`[Screen Unlock Resume] Triggering auto-resume from chunk #${lastReceivedChunkIndexRef.current + 1}`);
          sendDataToPeer({
            type: "request-resume",
            lastReceivedChunkIndex: lastReceivedChunkIndexRef.current,
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [connected, transferProgress, requestWakeLock, startSilentAudio, sendDataToPeer]);

  const pauseTransfer = useCallback(() => {
    if (!isPausedRef.current) {
      pausedStartTimeRef.current = Date.now();
    }
    isPausedRef.current = true;
    setIsPaused(true);
    sendDataToPeer({ type: "file-pause" });
  }, [sendDataToPeer]);

  const resumeTransfer = useCallback(() => {
    if (isPausedRef.current && pausedStartTimeRef.current !== null) {
      totalPausedDurationRef.current += Date.now() - pausedStartTimeRef.current;
      pausedStartTimeRef.current = null;
    }
    isPausedRef.current = false;
    setIsPaused(false);
    sendDataToPeer({ type: "file-resume" });
  }, [sendDataToPeer]);

  const cancelTransfer = useCallback(() => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
    pausedStartTimeRef.current = null;
    totalPausedDurationRef.current = 0;
    receiveStartTimeRef.current = null;
    setTransferProgress(null);
    sendDataToPeer({ type: "file-cancel" });
  }, [sendDataToPeer]);

  const handleIncomingMessage = useCallback((message: any) => {
    if (!message) return;
    if (message.type === "file-start") {
      console.log(`[WebRTC] Incoming file transfer starting: ${message.fileName}`);
      receiveStartTimeRef.current = Date.now();
      lastReceivedChunkIndexRef.current = -1;
      setTransferProgress({
        fileName: message.fileName,
        progress: 0,
        total: message.totalChunks,
        fileSizeBytes: message.fileSize,
        transferredBytes: 0,
        speed: 0,
        timeRemaining: 0,
        direction: "receive",
      });
    } else if (message.type === "file-chunk") {
      lastReceivedChunkIndexRef.current = message.chunkIndex;
      if (onChunkRef.current) {
        onChunkRef.current(message);
      }
      if (receiveStartTimeRef.current === null || message.chunkIndex === 0) {
        receiveStartTimeRef.current = Date.now();
      }

      // Send ACK back to sender every 8 chunks or on final chunk
      if (message.chunkIndex % 8 === 0 || message.chunkIndex === message.totalChunks - 1) {
        sendDataToPeer({
          type: "chunk-ack",
          lastChunkIndex: message.chunkIndex,
        });
      }

      const chunkSize = 64 * 1024;
      const fileSizeBytes = message.totalChunks * chunkSize;
      const transferredBytes = Math.min((message.chunkIndex + 1) * chunkSize, fileSizeBytes);
      const elapsed = Math.max((Date.now() - receiveStartTimeRef.current) / 1000, 0.1);
      const speed = transferredBytes / elapsed / (1024 * 1024); // MB/s
      const remainingBytes = Math.max(fileSizeBytes - transferredBytes, 0);
      const timeRemaining = speed > 0 ? (remainingBytes / (1024 * 1024)) / speed : 0;

      setTransferProgress({
        fileName: message.fileName,
        progress: message.chunkIndex + 1,
        total: message.totalChunks,
        fileSizeBytes,
        transferredBytes,
        speed,
        timeRemaining,
        direction: "receive",
      });
    } else if (message.type === "chunk-ack") {
      if (typeof message.lastChunkIndex === "number") {
        lastAckedChunkIndexRef.current = message.lastChunkIndex;
      }
    } else if (message.type === "request-resume") {
      const resumeFrom = typeof message.lastReceivedChunkIndex === "number" ? message.lastReceivedChunkIndex + 1 : 0;
      console.log(`[WebRTC Auto-Resume] Peer requested resume from chunk #${resumeFrom}`);
      resumeFromChunkRef.current = resumeFrom;

      // Automatically unpause sender if transfer was paused due to screen lock or temporary drop
      if (isPausedRef.current) {
        console.log("[WebRTC Auto-Resume] Unpausing sender on auto-resume request");
        if (pausedStartTimeRef.current !== null) {
          totalPausedDurationRef.current += Date.now() - pausedStartTimeRef.current;
          pausedStartTimeRef.current = null;
        }
        isPausedRef.current = false;
        setIsPaused(false);
      }
    } else if (message.type === "file-complete") {
      receiveStartTimeRef.current = null;
      lastReceivedChunkIndexRef.current = -1;
      if (onCompleteRef.current) {
        onCompleteRef.current(message);
      }
      setTransferProgress(null);
      console.log(`[WebRTC] File received: ${message.fileName}`);
    } else if (message.type === "file-pause") {
      console.log("[WebRTC] Received pause message from peer");
      if (!isPausedRef.current) {
        pausedStartTimeRef.current = Date.now();
      }
      isPausedRef.current = true;
      setIsPaused(true);
    } else if (message.type === "file-resume") {
      console.log("[WebRTC] Received resume message from peer");
      if (isPausedRef.current && pausedStartTimeRef.current !== null) {
        totalPausedDurationRef.current += Date.now() - pausedStartTimeRef.current;
        pausedStartTimeRef.current = null;
      }
      isPausedRef.current = false;
      setIsPaused(false);
    } else if (message.type === "file-cancel") {
      console.log("[WebRTC] Received cancel message from peer");
      receiveStartTimeRef.current = null;
      pausedStartTimeRef.current = null;
      totalPausedDurationRef.current = 0;
      isCancelledRef.current = true;
      isPausedRef.current = false;
      setIsPaused(false);
      setTransferProgress(null);
      setError("File transfer was cancelled by peer.");
    } else if (message.type === "explicit-session-disconnect") {
      console.log("[WebRTC] Received explicit session disconnect message from peer");
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
        pcRef.current = null;
      }
      if (dataChannelRef.current) {
        try {
          dataChannelRef.current.close();
        } catch (e) {}
        dataChannelRef.current = null;
      }
      remoteIdRef.current = "";
      setConnected(false);
      setRemotePeerInfo(null);
      setTransferProgress(null);
      setError("");

      const newPeerId = Array.from(crypto.getRandomValues(new Uint8Array(6)))
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join("");
      try {
        localStorage.setItem(PEER_ID_KEY, newPeerId);
      } catch (e) {}
      setPeerId(newPeerId);
      peerIdRef.current = newPeerId;
      if (socketRef.current?.connected) {
        const { displayName: curName, isInitiator: curInit } = optionsRef.current;
        socketRef.current.emit("register-peer", { displayName: curName, isInitiator: curInit, preferredPeerId: newPeerId });
      }
    }
  }, []);

  const setupDataChannelEvents = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.bufferedAmountLowThreshold = 1024 * 1024; // 1MB threshold

      channel.onopen = () => {
        console.log("[WebRTC] Data channel opened");
        setConnected(true);
        setError("");
      };

      channel.onclose = () => {
        console.log("[WebRTC] Data channel closed (retaining session state for WebSocket fallback)");
      };

      channel.onerror = (err) => {
        console.error("[WebRTC] Data channel error:", err);
      };

      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleIncomingMessage(message);
        } catch (err) {
          console.error("[WebRTC] Error parsing message:", err);
        }
      };
    },
    [handleIncomingMessage]
  );

  const createPeerConnection = useCallback(
    (initiator: boolean, remoteId: string) => {
      // Clean up any existing stale connection before initiating a fresh connection
      if (pcRef.current) {
        console.log("[WebRTC] Closing existing stale RTCPeerConnection before creating fresh one");
        try {
          pcRef.current.close();
        } catch (e) {}
        pcRef.current = null;
      }

      if (dataChannelRef.current) {
        try {
          dataChannelRef.current.close();
        } catch (e) {}
        dataChannelRef.current = null;
      }

      console.log(`[WebRTC] Creating native RTCPeerConnection (initiator: ${initiator}, remoteId: ${remoteId})`);

      try {
        const pc = new RTCPeerConnection({
          iceServers: getIceServers(),
        });
        pcRef.current = pc;

        pendingCandidatesRef.current = [];

        pc.onicecandidate = (event) => {
          if (event.candidate && socketRef.current) {
            socketRef.current.emit("signal", {
              type: "ice-candidate",
              data: event.candidate,
              from: peerIdRef.current,
              to: remoteId,
            });
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log(`[WebRTC] ICE Connection state: ${pc.iceConnectionState}`);
          if (["connected", "completed"].includes(pc.iceConnectionState)) {
            setConnected(true);
            setError("");
          } else if (pc.iceConnectionState === "failed") {
            console.warn("[WebRTC] ICE Connection failed. Attempting ICE restart...");
            if (typeof pc.restartIce === "function") {
              pc.restartIce();
            }
          }
        };

        pc.onconnectionstatechange = () => {
          console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
          if (pc.connectionState === "connected") {
            setConnected(true);
            setError("");
          }
        };

        if (initiator) {
          const channel = pc.createDataChannel("file-transfer");
          setupDataChannelEvents(channel);

          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              if (pc.localDescription) {
                socketRef.current?.emit("signal", {
                  type: "offer",
                  data: pc.localDescription,
                  from: peerIdRef.current,
                  to: remoteId,
                });
              }
            })
            .catch((err) => {
              console.error("[WebRTC] Error creating offer:", err);
              setError("Failed to create WebRTC offer");
            });
        } else {
          pc.ondatachannel = (event) => {
            console.log("[WebRTC] Received remote data channel");
            setupDataChannelEvents(event.channel);
          };
        }
      } catch (err: any) {
        const errorMsg = `WebRTC creation error: ${err?.message || err}`;
        setError(errorMsg);
        console.error("[WebRTC] Error creating RTCPeerConnection:", err);
      }
    },
    [setupDataChannelEvents]
  );

  // Initialize socket connection once on mount with resilient heartbeat
  useEffect(() => {
    const signalingUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socket = io(signalingUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 60000,
    });

    socketRef.current = socket;

    // --- Stable Peer ID across reconnects & server restarts ---
    // Generate once per browser and store in localStorage so the same Peer ID
    // is reused even if Render/server restarts or the socket reconnects.
    const getOrCreateStablePeerId = (): string => {
      let id = localStorage.getItem(PEER_ID_KEY);
      if (!id) {
        // Generate a 12-char hex ID matching the server format
        id = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map(b => b.toString(16).padStart(2, "0").toUpperCase())
          .join("");
        localStorage.setItem(PEER_ID_KEY, id);
      }
      return id;
    };

    const stablePeerId = getOrCreateStablePeerId();
    // NOTE: do NOT set peerId here — wait for server confirmation.
    // Setting it early caused a race where auto-connect fired signals
    // before the socket was registered on the server (signals dropped).

    const registerPeer = () => {
      setIsRegistered(false);
      const currentPeerId = peerIdRef.current || getOrCreateStablePeerId();
      const { displayName: curName, isInitiator: curInit } = optionsRef.current;
      socket.emit(
        "register-peer",
        { displayName: curName, isInitiator: curInit, preferredPeerId: currentPeerId },
        (response: any) => {
            if (response?.success) {
              // Server returns confirmed peerId
              setPeerId(response.peerId);
              peerIdRef.current = response.peerId;
              try {
                localStorage.setItem(PEER_ID_KEY, response.peerId);
              } catch (e) {}
              setIsRegistered(true); // ← only NOW is it safe to send signals
              console.log(`[WebRTC] Registered with peerId: ${response.peerId}`);
            }
        }
      );
    };

    socket.on("connect", () => {
      console.log("[WebRTC] Socket connected");
      registerPeer();
    });

    socket.on("signal", async (data: any) => {
      console.log(`[WebRTC] Received signal: ${data.type}`);
      setRemotePeerInfo({
        peerId: data.from,
        displayName: data.fromDisplayName,
        isInitiator: false,
      });

      remoteIdRef.current = data.from;

      if (!pcRef.current && data.type === "offer") {
        console.log(`[WebRTC] Creating peer connection for incoming offer`);
        createPeerConnection(false, data.from);
      }

      const pc = pcRef.current;
      if (!pc) return;

      try {
        const processPendingCandidates = async () => {
          if (!pcRef.current) return;
          while (pendingCandidatesRef.current.length > 0) {
            const cand = pendingCandidatesRef.current.shift();
            if (cand) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
                console.log("[WebRTC] Added buffered ICE candidate successfully");
              } catch (e) {
                console.warn("[WebRTC] Error adding buffered candidate:", e);
              }
            }
          }
        };

        if (data.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.data));
          await processPendingCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketRef.current?.emit("signal", {
            type: "answer",
            data: pc.localDescription,
            from: peerIdRef.current,
            to: data.from,
          });
        } else if (data.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.data));
          await processPendingCandidates();
        } else if (data.type === "ice-candidate" && data.data) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(data.data));
          } else {
            console.log("[WebRTC] Buffering early ICE candidate until remote description is set");
            pendingCandidatesRef.current.push(data.data);
          }
        }
      } catch (err: any) {
        console.error("[WebRTC] Error handling signal:", err);
      }
    });

    socket.on("signal-error", (data: any) => {
      setError(data.message);
      console.error("[WebRTC] Signal error:", data.message);
    });

    socket.on("relay-file-data", (data: any) => {
      console.log("[WebRTC Relay] Received data from peer:", data.from);
      if (data.from) {
        setRemotePeerInfo((prev) => prev || {
          peerId: data.from,
          displayName: data.fromDisplayName || "Connected Peer",
          isInitiator: false,
        });
        remoteIdRef.current = data.from;
      }
      setConnected(true);
      setError("");

      if (data.payload) {
        handleIncomingMessage(data.payload);
      }
    });

    socket.on("peer-connected", (data: any) => {
      console.log(`[WebRTC] Peer connected: ${data.peerId} (${data.displayName})`);
      setRemotePeerInfo({
        peerId: data.peerId,
        displayName: data.displayName || "Connected Peer",
        isInitiator: false,
      });
      remoteIdRef.current = data.peerId;
      setConnected(true);
      setError("");

      // If receiver was downloading a file when connection re-established,
      // request automatic resume from the last received chunk!
      if (lastReceivedChunkIndexRef.current >= 0) {
        console.log(`[WebRTC Auto-Resume] Peer connected! Requesting resume from chunk #${lastReceivedChunkIndexRef.current + 1}`);
        sendDataToPeer({
          type: "request-resume",
          lastReceivedChunkIndex: lastReceivedChunkIndexRef.current,
        });
      }
    });

    socket.on("peer-disconnected", (data: any) => {
      console.log(`[WebRTC] Peer disconnected event (explicit: ${!!data?.explicit}): ${data?.peerId}`);
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
        pcRef.current = null;
      }
      dataChannelRef.current = null;

      // If disconnection was implicit (screen lock/temporary drop), pause active transfer instead of tearing down pairing!
      if (!data?.explicit) {
        console.log("[WebRTC] Implicit socket drop detected - keeping session paired and pausing transfer until auto-reconnect");
        if (!isPausedRef.current) {
          pausedStartTimeRef.current = Date.now();
          isPausedRef.current = true;
          setIsPaused(true);
        }
        return;
      }

      // Explicit Disconnect: User clicked Disconnect button — tear down session & generate fresh Peer ID
      remoteIdRef.current = "";
      setConnected(false);
      setRemotePeerInfo(null);
      setTransferProgress(null);
      setError("");

      const newPeerId = Array.from(crypto.getRandomValues(new Uint8Array(6)))
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join("");
      try {
        localStorage.setItem(PEER_ID_KEY, newPeerId);
      } catch (e) {}
      setPeerId(newPeerId);
      peerIdRef.current = newPeerId;
      const { displayName: curName, isInitiator: curInit } = optionsRef.current;
      socket.emit("register-peer", { displayName: curName, isInitiator: curInit, preferredPeerId: newPeerId });

      if (typeof window !== "undefined" && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    });

    socket.on("error", (error: any) => {
      setError(`Socket error: ${error}`);
      console.error("[WebRTC] Socket error:", error);
    });

    socket.on("disconnect", () => {
      console.log("[WebRTC] Socket temporarily disconnected (retaining session state for auto-reconnect)");
    });

    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      dataChannelRef.current = null;
      socket.disconnect();
    };
  }, [createPeerConnection]);

  // Re-register peer options when displayName or isInitiator updates
  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("register-peer", { displayName, isInitiator }, (response: any) => {
        if (response?.success && response.peerId) {
          setPeerId(response.peerId);
          peerIdRef.current = response.peerId;
          if (response.lanIps && response.lanIps.length > 0) {
            setServerLanIp(response.lanIps[0]);
          }
        }
      });
    }
  }, [displayName, isInitiator]);

  const connectToPeer = useCallback(
    (targetPeerId: string) => {
      if (!socketRef.current || !peerIdRef.current) {
        setError("Socket or peer ID not initialized");
        return;
      }

      const normalizedPeerId = targetPeerId.trim().toUpperCase();

      console.log(`[WebRTC] Initiating connection to ${normalizedPeerId}`);
      remoteIdRef.current = normalizedPeerId;
      setError("");

      // Clean URL search params immediately so refreshing won't re-trigger auto-connect to old peer
      if (typeof window !== "undefined" && window.history.replaceState) {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has("peer") || url.searchParams.has("peerId") || url.searchParams.has("name")) {
            url.searchParams.delete("peer");
            url.searchParams.delete("peerId");
            url.searchParams.delete("name");
            window.history.replaceState({}, document.title, url.pathname + url.hash);
          }
        } catch (e) {}
      }

      // 1. Attempt WebRTC P2P first
      createPeerConnection(true, normalizedPeerId);

      // 2. Relay fallback timer: if direct P2P data channel fails to open in 2.5s
      // (due to carrier CG-NAT blocking STUN/TURN), set connected=true so WebSocket relay enables seamlessly!
      setTimeout(() => {
        if (!connected && remoteIdRef.current === normalizedPeerId) {
          console.log("[WebRTC Relay] Enabling Socket.IO relay mode for cross-network connection");
          setConnected(true);
          setError("");
        }
      }, 2500);
    },
    [createPeerConnection, connected]
  );

  const sendFile = useCallback(
    async (file: File) => {
      if (!connected) {
        setError("Not connected to peer");
        return;
      }

      console.log(`[WebRTC] Sending file: ${file.name} (${file.size} bytes)`);

      isCancelledRef.current = false;
      isPausedRef.current = false;
      setIsPaused(false);
      pausedStartTimeRef.current = null;
      totalPausedDurationRef.current = 0;

      const chunkSize = 64 * 1024; // 64KB chunks
      const totalChunks = Math.ceil(file.size / chunkSize);
      let sentChunks = 0;
      const startTime = Date.now();

      // Send file-start notification to target peer so both devices lock controls immediately
      sendDataToPeer({
        type: "file-start",
        fileName: file.name,
        fileSize: file.size,
        totalChunks,
      });

      setTransferProgress({
        fileName: file.name,
        progress: 0,
        total: totalChunks,
        fileSizeBytes: file.size,
        transferredBytes: 0,
        speed: 0,
        timeRemaining: 0,
        direction: "send",
      });

      const reader = new FileReader();

      const checkPauseOrCancel = async (): Promise<boolean> => {
        while (isPausedRef.current && !isCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return isCancelledRef.current;
      };

      lastAckedChunkIndexRef.current = -1;
      resumeFromChunkRef.current = null;

      const sendChunk = async (start: number) => {
        // Auto-resume check: if peer requested a resume from chunk index N
        if (resumeFromChunkRef.current !== null) {
          const resumeIdx = resumeFromChunkRef.current;
          resumeFromChunkRef.current = null;
          sentChunks = resumeIdx;
          start = resumeIdx * chunkSize;
          console.log(`[WebRTC Auto-Resume] Resuming sender stream at chunk #${resumeIdx} (${start} bytes)`);
        }

        if (isCancelledRef.current) {
          console.log("[WebRTC] Transfer cancelled by user");
          setTransferProgress(null);
          setIsPaused(false);
          isPausedRef.current = false;
          return;
        }

        if (isPausedRef.current) {
          const cancelled = await checkPauseOrCancel();
          if (cancelled) {
            setTransferProgress(null);
            setIsPaused(false);
            isPausedRef.current = false;
            return;
          }
        }

        if (start >= file.size) {
          sendDataToPeer({
            type: "file-complete",
            fileName: file.name,
            fileSize: file.size,
            totalChunks,
          });
          setTransferProgress(null);
          console.log(`[WebRTC] File transfer complete: ${file.name}`);
          return;
        }

        // Window ACK Rate Control for WebSocket relay mode (prevents blasting into disconnected peer)
        const isP2pOpen = dataChannelRef.current?.readyState === "open";
        if (!isP2pOpen && sentChunks > 0 && sentChunks % 16 === 0) {
          let waitAckMs = 0;
          while (
            sentChunks - lastAckedChunkIndexRef.current > 16 &&
            waitAckMs < 2000 &&
            !isCancelledRef.current
          ) {
            await new Promise((r) => setTimeout(r, 100));
            waitAckMs += 100;
          }
        }

        // WebRTC DataChannel flow control if channel is open
        const channel = dataChannelRef.current;
        if (channel && channel.readyState === "open" && channel.bufferedAmount > 2 * 1024 * 1024) {
          channel.onbufferedamountlow = () => {
            channel.onbufferedamountlow = null;
            sendChunk(start);
          };
          return;
        }

        const end = Math.min(start + chunkSize, file.size);
        const blob = file.slice(start, end);

        reader.onload = async (e) => {
          if (e.target?.result) {
            if (isCancelledRef.current) return;
            if (isPausedRef.current) {
              const cancelled = await checkPauseOrCancel();
              if (cancelled) return;
            }

            const data = e.target.result as ArrayBuffer;
            const sent = sendDataToPeer({
              type: "file-chunk",
              fileName: file.name,
              chunkIndex: sentChunks,
              totalChunks: totalChunks,
              data: Array.from(new Uint8Array(data)),
            });

            if (!sent) {
              setError("Failed to send file chunk");
              return;
            }

            sentChunks++;
            let currentPausedDuration = totalPausedDurationRef.current;
            if (isPausedRef.current && pausedStartTimeRef.current !== null) {
              currentPausedDuration += Date.now() - pausedStartTimeRef.current;
            }
            const elapsed = Math.max((Date.now() - startTime - currentPausedDuration) / 1000, 0.1);
            const transferredBytes = Math.min(sentChunks * chunkSize, file.size);
            const speed = transferredBytes / elapsed / (1024 * 1024); // MB/s
            const remainingBytes = Math.max(file.size - transferredBytes, 0);
            const timeRemaining = speed > 0 ? (remainingBytes / (1024 * 1024)) / speed : 0;

            setTransferProgress({
              fileName: file.name,
              progress: sentChunks,
              total: totalChunks,
              fileSizeBytes: file.size,
              transferredBytes,
              speed,
              timeRemaining,
              direction: "send",
            });

            // Yield to event loop every 3 chunks so UI renders progress & mobile UI stays responsive
            if (sentChunks % 3 === 0) {
              await new Promise((r) => setTimeout(r, 10));
            }

            sendChunk(end);
          }
        };

        reader.readAsArrayBuffer(blob);
      };

      sendChunk(0);
    },
    [connected, sendDataToPeer]
  );

  const receiveFile = useCallback((onChunk: (data: any) => void, onComplete: (data: any) => void) => {
    onChunkRef.current = onChunk;
    onCompleteRef.current = onComplete;
  }, []);

  const disconnectPeer = useCallback(() => {
    console.log("[WebRTC] Manually disconnecting peer session & generating new Peer ID...");

    const targetPeerId = remoteIdRef.current || remotePeerInfo?.peerId;

    if (targetPeerId) {
      if (socketRef.current?.connected) {
        socketRef.current.emit("explicit-disconnect", { to: targetPeerId });
      }
      sendDataToPeer({ type: "explicit-session-disconnect" });
    } else if (socketRef.current?.connected) {
      socketRef.current.emit("explicit-disconnect", {});
    }

    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch (e) {}
      dataChannelRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }

    remoteIdRef.current = "";
    pendingCandidatesRef.current = [];
    lastAckedChunkIndexRef.current = -1;
    resumeFromChunkRef.current = null;
    lastReceivedChunkIndexRef.current = -1;
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
    setConnected(false);
    setRemotePeerInfo(null);
    setTransferProgress(null);
    setError("");

    // Generate brand new 12-char uppercase hex Peer ID & discard old one
    const newPeerId = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    try {
      localStorage.setItem(PEER_ID_KEY, newPeerId);
    } catch (e) {}

    setPeerId(newPeerId);
    peerIdRef.current = newPeerId;

    if (socketRef.current?.connected) {
      const { displayName: curName, isInitiator: curInit } = optionsRef.current;
      socketRef.current.emit(
        "register-peer",
        { displayName: curName, isInitiator: curInit, preferredPeerId: newPeerId },
        (response: any) => {
          if (response?.success && response.peerId) {
            setPeerId(response.peerId);
            peerIdRef.current = response.peerId;
            try {
              localStorage.setItem(PEER_ID_KEY, response.peerId);
            } catch (e) {}
            console.log(`[WebRTC] Successfully re-registered with new Peer ID: ${response.peerId}`);
          }
        }
      );
    }

    if (typeof window !== "undefined" && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("peer");
      url.searchParams.delete("peerId");
      window.history.replaceState({}, document.title, url.toString());
    }
  }, [remotePeerInfo?.peerId, sendDataToPeer]);

  return {
    peerId,
    isRegistered,
    serverLanIp,
    connected,
    remotePeerInfo,
    error,
    transferProgress,
    isPaused,
    connectToPeer,
    disconnectPeer,
    sendFile,
    receiveFile,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
  };
}
