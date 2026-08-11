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
}

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

  // Handle visibility change (e.g. screen lock/unlock or tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[WakeLock] Page visible, re-requesting Wake Lock");
        if (connected || transferProgress !== null) {
          requestWakeLock();
        }
        if (socketRef.current?.connected) {
          const { displayName: curName, isInitiator: curInit } = optionsRef.current;
          socketRef.current.emit("register-peer", { displayName: curName, isInitiator: curInit }, (response: any) => {
            if (response?.success && response.peerId) {
              setPeerId(response.peerId);
              peerIdRef.current = response.peerId;
            }
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [connected, transferProgress, requestWakeLock]);

  const pauseTransfer = useCallback(() => {
    if (!isPausedRef.current) {
      pausedStartTimeRef.current = Date.now();
    }
    isPausedRef.current = true;
    setIsPaused(true);
    if (dataChannelRef.current?.readyState === "open") {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: "file-pause" }));
      } catch (e) {
        console.error("[WebRTC] Error sending pause control:", e);
      }
    }
  }, []);

  const resumeTransfer = useCallback(() => {
    if (isPausedRef.current && pausedStartTimeRef.current !== null) {
      totalPausedDurationRef.current += Date.now() - pausedStartTimeRef.current;
      pausedStartTimeRef.current = null;
    }
    isPausedRef.current = false;
    setIsPaused(false);
    if (dataChannelRef.current?.readyState === "open") {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: "file-resume" }));
      } catch (e) {
        console.error("[WebRTC] Error sending resume control:", e);
      }
    }
  }, []);

  const cancelTransfer = useCallback(() => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
    pausedStartTimeRef.current = null;
    totalPausedDurationRef.current = 0;
    receiveStartTimeRef.current = null;
    setTransferProgress(null);
    if (dataChannelRef.current?.readyState === "open") {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: "file-cancel" }));
      } catch (e) {
        console.error("[WebRTC] Error sending cancel control:", e);
      }
    }
  }, []);

  const setupDataChannelEvents = useCallback((channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.bufferedAmountLowThreshold = 1024 * 1024; // 1MB threshold

    channel.onopen = () => {
      console.log("[WebRTC] Data channel opened");
      setConnected(true);
      setError("");
    };

    channel.onclose = () => {
      console.log("[WebRTC] Data channel closed");
      setConnected(false);
    };

    channel.onerror = (err) => {
      console.error("[WebRTC] Data channel error:", err);
      setError("Data channel error");
    };

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "file-chunk") {
          if (onChunkRef.current) {
            onChunkRef.current(message);
          }
          if (receiveStartTimeRef.current === null || message.chunkIndex === 0) {
            receiveStartTimeRef.current = Date.now();
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
          });
        } else if (message.type === "file-complete") {
          receiveStartTimeRef.current = null;
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
        }
      } catch (err) {
        console.error("[WebRTC] Error parsing message:", err);
      }
    };
  }, []);

  const createPeerConnection = useCallback(
    (initiator: boolean, remoteId: string) => {
      if (pcRef.current) {
        console.log("[WebRTC] Peer connection already exists");
        return;
      }

      console.log(`[WebRTC] Creating native RTCPeerConnection (initiator: ${initiator})`);

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
          } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
            if (dataChannelRef.current?.readyState !== "open") {
              setConnected(false);
            }
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
    const PEER_ID_KEY = "p2p_stable_peer_id";
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
      const { displayName: curName, isInitiator: curInit } = optionsRef.current;
      socket.emit(
        "register-peer",
        { displayName: curName, isInitiator: curInit, preferredPeerId: stablePeerId },
        (response: any) => {
          if (response?.success) {
            // Server may return the preferred ID or a new one (if preferred was taken)
            setPeerId(response.peerId);
            peerIdRef.current = response.peerId;
            localStorage.setItem(PEER_ID_KEY, response.peerId);
            if (response.lanIps && response.lanIps.length > 0) {
              setServerLanIp(response.lanIps[0]);
            }
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

    socket.on("peer-disconnected", (data: any) => {
      console.log(`[WebRTC] Peer disconnected: ${data.peerId}`);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      dataChannelRef.current = null;
      setConnected(false);
      setRemotePeerInfo(null);
    });

    socket.on("error", (error: any) => {
      setError(`Socket error: ${error}`);
      console.error("[WebRTC] Socket error:", error);
    });

    socket.on("disconnect", () => {
      console.log("[WebRTC] Socket disconnected");
      if (dataChannelRef.current?.readyState !== "open") {
        setConnected(false);
      }
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

      console.log(`[WebRTC] Initiating connection to ${targetPeerId}`);
      remoteIdRef.current = targetPeerId;
      createPeerConnection(true, targetPeerId);
    },
    [createPeerConnection]
  );

  const sendFile = useCallback(
    async (file: File) => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== "open") {
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

      const reader = new FileReader();

      const checkPauseOrCancel = async (): Promise<boolean> => {
        while (isPausedRef.current && !isCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return isCancelledRef.current;
      };

      const sendChunk = async (start: number) => {
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
          channel.send(
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

        // WebRTC DataChannel flow control: pause if bufferedAmount > 2MB
        if (channel.bufferedAmount > 2 * 1024 * 1024) {
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
            try {
              channel.send(
                JSON.stringify({
                  type: "file-chunk",
                  fileName: file.name,
                  chunkIndex: sentChunks,
                  totalChunks: totalChunks,
                  data: Array.from(new Uint8Array(data)),
                })
              );
            } catch (err: any) {
              console.error("[WebRTC] Error sending chunk:", err);
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
    onChunkRef.current = onChunk;
    onCompleteRef.current = onComplete;
  }, []);

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
    sendFile,
    receiveFile,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
  };
}
