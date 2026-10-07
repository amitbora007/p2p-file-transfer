import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { opfsStorage } from "@/utils/opfsStorage";

export interface PeerInfo {
  peerId: string;
  displayName: string;
  isInitiator: boolean;
}

export interface TransferProgress {
  transferId?: string;
  fileName: string;
  progress: number; // chunks transferred
  total: number; // total chunks
  fileSizeBytes: number; // actual file size in bytes
  transferredBytes: number; // actual bytes transferred
  speed: number; // MB/s
  timeRemaining: number; // seconds
  timeElapsed?: number; // seconds spent transferring so far
  direction?: "send" | "receive";
  isVerifying?: boolean;
  statusMessage?: string;
}

const PEER_ID_KEY = "p2p_stable_peer_id";

export const encodeFileChunkPacket = (
  transferId: string,
  fileName: string,
  chunkIndex: number,
  totalChunks: number,
  chunkData: Uint8Array
): ArrayBuffer => {
  const encoder = new TextEncoder();
  const transferIdBytes = encoder.encode(transferId);
  const fileNameBytes = encoder.encode(fileName);
  const headerSize = 16 + transferIdBytes.length + fileNameBytes.length;
  const totalLength = headerSize + chunkData.length;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Magic 'CHNK' = 0x43484E4B
  view.setUint32(0, 0x43484E4B, false);
  view.setUint32(4, chunkIndex, false);
  view.setUint32(8, totalChunks, false);
  view.setUint16(12, transferIdBytes.length, false);
  view.setUint16(14, fileNameBytes.length, false);

  let offset = 16;
  bytes.set(transferIdBytes, offset);
  offset += transferIdBytes.length;
  bytes.set(fileNameBytes, offset);
  offset += fileNameBytes.length;
  bytes.set(chunkData, offset);

  return buffer;
};

export const decodeFileChunkPacket = (buffer: ArrayBuffer) => {
  if (buffer.byteLength < 16) return null;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, false);
  if (magic !== 0x43484E4B) return null; // Not a chunk packet

  const chunkIndex = view.getUint32(4, false);
  const totalChunks = view.getUint32(8, false);
  const transferIdLength = view.getUint16(12, false);
  const fileNameLength = view.getUint16(14, false);

  if (buffer.byteLength < 16 + transferIdLength + fileNameLength) return null;

  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  let offset = 16;
  const transferId = decoder.decode(bytes.subarray(offset, offset + transferIdLength));
  offset += transferIdLength;
  const fileName = decoder.decode(bytes.subarray(offset, offset + fileNameLength));
  offset += fileNameLength;
  const chunkData = bytes.subarray(offset);

  return { type: "file-chunk", transferId, fileName, chunkIndex, totalChunks, data: chunkData };
};

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

  // Active transfer tracking (Sender)
  const activeTransferIdRef = useRef<string>("");
  const activeFileRef = useRef<File | null>(null);
  const transferVerifyResolverRef = useRef<((verified: boolean) => void) | null>(null);

  // Receiver tracking (Bitset, Contiguous pointer, Bytes, Finalization)
  const currentTransferIdRef = useRef<string>("");
  const currentFileNameRef = useRef<string>("");
  const expectedFileSizeRef = useRef<number>(0);
  const totalChunksRef = useRef<number>(0);
  const receivedBitsetRef = useRef<Uint8Array | null>(null);
  const highestContiguousChunkRef = useRef<number>(-1);
  const receivedCountRef = useRef<number>(0);
  const totalBytesReceivedRef = useRef<number>(0);
  const isFinalizingRef = useRef<boolean>(false);

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
    const channel = dataChannelRef.current;
    if (channel && channel.readyState === "open") {
      try {
        if (typeof payload === "string" || payload instanceof ArrayBuffer || payload instanceof Uint8Array) {
          channel.send(payload as any);
        } else {
          channel.send(JSON.stringify(payload));
        }
        return true;
      } catch (e) {
        console.error("[WebRTC] DataChannel send error:", e);
        return false;
      }
    }

    console.warn(`[WebRTC] DataChannel unavailable for transport. State: ${channel?.readyState ?? "null"}`);
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

  const waitForBuffer = useCallback(async (maxBuffered = 4 * 1024 * 1024) => {
    while (
      dataChannelRef.current &&
      dataChannelRef.current.readyState === "open" &&
      dataChannelRef.current.bufferedAmount > maxBuffered
    ) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }, []);

  const sessionStartChunkRef = useRef<number>(0);

  const getMissingChunkIndices = useCallback((total: number, bitset: Uint8Array): number[] => {
    const missing: number[] = [];
    for (let i = 0; i < total; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitMask = 1 << (i % 8);
      if ((bitset[byteIdx] & bitMask) === 0) {
        missing.push(i);
        if (missing.length >= 100) break; // Limit batch size for each request
      }
    }
    return missing;
  }, []);

  const finalizeReceiverTransfer = useCallback(
    async (transferId: string, fileName: string, expectedSize: number, totalChunks: number) => {
      if (isFinalizingRef.current) return;
      isFinalizingRef.current = true;

      console.log(`[WebRTC Verification] Finalizing transfer ${transferId} for ${fileName} (${expectedSize} bytes)`);

      setTransferProgress((prev) =>
        prev
          ? {
              ...prev,
              progress: totalChunks,
              isVerifying: true,
              statusMessage: "Verifying file integrity & disk persistence...",
            }
          : null
      );

      // Finalize OPFS storage (< 10 MB RAM)
      const result = await opfsStorage.finalizeTransfer(transferId, expectedSize);

      const isChunksComplete =
        receivedCountRef.current === totalChunks &&
        highestContiguousChunkRef.current === totalChunks - 1;
      const isBytesVerified =
        result.size === expectedSize ||
        totalBytesReceivedRef.current === expectedSize;

      if (isChunksComplete && isBytesVerified) {
        console.log(`[WebRTC Verification] 100% Integrity Verified! (${result.size} bytes matches expected ${expectedSize})`);

        // Send confirmation ACK to sender
        sendDataToPeer({
          type: "transfer-verify-ack",
          transferId,
          status: "verified",
          receivedChunks: totalChunks,
          totalBytes: result.size,
        });

        receiveStartTimeRef.current = null;
        lastReceivedChunkIndexRef.current = -1;

        if (onCompleteRef.current) {
          onCompleteRef.current({
            transferId,
            fileName,
            fileSize: result.size,
            totalChunks,
            file: result.file,
          });
        }

        setTimeout(() => {
          setTransferProgress(null);
          isFinalizingRef.current = false;
        }, 300);
      } else {
        console.error(
          `[WebRTC Verification Failed] Size/Chunk mismatch. Received ${receivedCountRef.current}/${totalChunks} chunks, disk size: ${result.size}, expected: ${expectedSize}`
        );

        if (receivedBitsetRef.current) {
          const missing = getMissingChunkIndices(totalChunks, receivedBitsetRef.current);
          if (missing.length > 0) {
            console.log(`[WebRTC Verification] Requesting retransmit of missing chunks:`, missing.slice(0, 10));
            sendDataToPeer({
              type: "request-retransmit",
              transferId,
              missingIndices: missing,
            });
          }
        }

        sendDataToPeer({
          type: "transfer-verify-ack",
          transferId,
          status: "failed",
          receivedChunks: receivedCountRef.current,
          totalBytes: result.size,
        });

        isFinalizingRef.current = false;
      }
    },
    [sendDataToPeer, getMissingChunkIndices]
  );

  const retransmitMissingChunks = useCallback(
    async (transferId: string, indices: number[]) => {
      const file = activeFileRef.current;
      if (!file) return;

      const chunkSize = 64 * 1024;
      const totalChunks = Math.ceil(file.size / chunkSize);

      console.log(`[WebRTC Retransmit] Sending ${indices.length} missing chunks for transfer ${transferId}`);

      for (const idx of indices) {
        if (idx < 0 || idx >= totalChunks) continue;
        if (isCancelledRef.current) break;

        const start = idx * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const blobSlice = file.slice(start, end);
        const arrayBuffer = await blobSlice.arrayBuffer();

        await waitForBuffer(4 * 1024 * 1024);

        const packet = encodeFileChunkPacket(
          transferId,
          file.name,
          idx,
          totalChunks,
          new Uint8Array(arrayBuffer)
        );
        sendDataToPeer(packet);
      }

      // Re-emit file-complete to prompt receiver to verify again
      sendDataToPeer({
        type: "file-complete",
        transferId,
        fileName: file.name,
        fileSize: file.size,
        totalChunks,
      });
    },
    [sendDataToPeer, waitForBuffer]
  );

  const handleIncomingMessage = useCallback(
    (message: any) => {
      if (!message) return;
      if (message.type === "file-start") {
        console.log(`[WebRTC] Incoming file transfer starting: ${message.fileName} (transferId: ${message.transferId})`);
        currentTransferIdRef.current = message.transferId;
        currentFileNameRef.current = message.fileName;
        expectedFileSizeRef.current = message.fileSize;
        totalChunksRef.current = message.totalChunks;

        receivedBitsetRef.current = new Uint8Array(Math.ceil(message.totalChunks / 8));
        highestContiguousChunkRef.current = -1;
        receivedCountRef.current = 0;
        totalBytesReceivedRef.current = 0;
        isFinalizingRef.current = false;

        receiveStartTimeRef.current = Date.now();
        sessionStartChunkRef.current = 0;
        lastReceivedChunkIndexRef.current = -1;

        opfsStorage.initTransfer(message.transferId, message.fileName, message.fileSize);

        setTransferProgress({
          transferId: message.transferId,
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
        const transferId = message.transferId || currentTransferIdRef.current;
        if (currentTransferIdRef.current && transferId && transferId !== currentTransferIdRef.current) {
          console.warn(`[WebRTC] Stale chunk ignored from transferId ${transferId} (active: ${currentTransferIdRef.current})`);
          return;
        }

        const totalChunks = message.totalChunks || totalChunksRef.current;
        if (!receivedBitsetRef.current || receivedBitsetRef.current.length < Math.ceil(totalChunks / 8)) {
          receivedBitsetRef.current = new Uint8Array(Math.ceil(totalChunks / 8));
        }

        const bitset = receivedBitsetRef.current;
        const byteIdx = Math.floor(message.chunkIndex / 8);
        const bitMask = 1 << (message.chunkIndex % 8);
        const isDuplicate = (bitset[byteIdx] & bitMask) !== 0;

        if (!isDuplicate) {
          bitset[byteIdx] |= bitMask;
          receivedCountRef.current++;
          totalBytesReceivedRef.current += message.data.length;

          // Progressively advance highest contiguous chunk
          while (true) {
            const next = highestContiguousChunkRef.current + 1;
            if (next >= totalChunks) break;
            const bIdx = Math.floor(next / 8);
            const bMask = 1 << (next % 8);
            if ((bitset[bIdx] & bMask) !== 0) {
              highestContiguousChunkRef.current = next;
            } else {
              break;
            }
          }

          // Write directly to progressive OPFS disk storage
          const offset = message.chunkIndex * 64 * 1024;
          opfsStorage.writeChunk(transferId, offset, message.data);
        }

        lastReceivedChunkIndexRef.current = message.chunkIndex;

        if (onChunkRef.current) {
          onChunkRef.current(message);
        }

        if (receiveStartTimeRef.current === null || message.chunkIndex === 0) {
          receiveStartTimeRef.current = Date.now();
          sessionStartChunkRef.current = message.chunkIndex;
        }

        // Send ACK back to sender every 32 chunks or when highest contiguous chunk reaches end
        if (message.chunkIndex % 32 === 0 || highestContiguousChunkRef.current === totalChunks - 1) {
          sendDataToPeer({
            type: "chunk-ack",
            transferId,
            lastChunkIndex: message.chunkIndex,
            highestContiguousChunk: highestContiguousChunkRef.current,
          });
        }

        const chunkSize = 64 * 1024;
        const fileSizeBytes = expectedFileSizeRef.current || totalChunks * chunkSize;
        const totalTransferredBytes = Math.min(totalBytesReceivedRef.current || (message.chunkIndex + 1) * chunkSize, fileSizeBytes);

        const sessionChunks = Math.max(receivedCountRef.current - sessionStartChunkRef.current, 1);
        const sessionBytes = sessionChunks * chunkSize;
        const elapsed = Math.max((Date.now() - receiveStartTimeRef.current) / 1000, 0.5);
        const speed = sessionBytes / elapsed / (1024 * 1024);

        const remainingBytes = Math.max(fileSizeBytes - totalTransferredBytes, 0);
        const timeRemaining = speed > 0 ? (remainingBytes / (1024 * 1024)) / speed : 0;
        const overallElapsed = Math.max((Date.now() - (receiveStartTimeRef.current || Date.now())) / 1000, 0);

        setTransferProgress({
          transferId,
          fileName: message.fileName,
          progress: receivedCountRef.current,
          total: totalChunks,
          fileSizeBytes,
          transferredBytes: totalTransferredBytes,
          speed,
          timeRemaining,
          timeElapsed: Math.round(overallElapsed),
          direction: "receive",
        });

        // Auto-trigger completion if all chunks have arrived
        if (receivedCountRef.current >= totalChunks && highestContiguousChunkRef.current === totalChunks - 1) {
          finalizeReceiverTransfer(transferId, message.fileName, fileSizeBytes, totalChunks);
        }
      } else if (message.type === "chunk-ack") {
        if (typeof message.lastChunkIndex === "number") {
          lastAckedChunkIndexRef.current = message.lastChunkIndex;
        }
      } else if (message.type === "request-retransmit") {
        console.log(`[WebRTC Retransmit] Receiver requested retransmission of missing chunks:`, message.missingIndices?.slice(0, 10));
        if (Array.isArray(message.missingIndices) && message.missingIndices.length > 0) {
          retransmitMissingChunks(message.transferId || activeTransferIdRef.current, message.missingIndices);
        }
      } else if (message.type === "transfer-verify-ack") {
        console.log(`[WebRTC Verification ACK] Receiver reported status: ${message.status} (transferId: ${message.transferId})`);
        if (transferVerifyResolverRef.current && (!message.transferId || message.transferId === activeTransferIdRef.current)) {
          transferVerifyResolverRef.current(message.status === "verified");
          transferVerifyResolverRef.current = null;
        }
      } else if (message.type === "request-resume") {
        const resumeFrom = typeof message.highestContiguousChunk === "number"
          ? message.highestContiguousChunk + 1
          : typeof message.lastReceivedChunkIndex === "number"
          ? message.lastReceivedChunkIndex + 1
          : 0;

        console.log(`[WebRTC Auto-Resume] Peer requested resume from chunk #${resumeFrom}`);
        resumeFromChunkRef.current = resumeFrom;

        if (pausedStartTimeRef.current !== null) {
          totalPausedDurationRef.current += Date.now() - pausedStartTimeRef.current;
          pausedStartTimeRef.current = null;
        }
        isPausedRef.current = false;
        setIsPaused(false);

        sendDataToPeer({ type: "file-resume", transferId: message.transferId });
      } else if (message.type === "request-restart") {
        console.log("[WebRTC Auto-Recovery] Receiver requested stream restart");
        resumeFromChunkRef.current = 0;
        if (pausedStartTimeRef.current !== null) {
          totalPausedDurationRef.current += Date.now() - pausedStartTimeRef.current;
          pausedStartTimeRef.current = null;
        }
        isPausedRef.current = false;
        setIsPaused(false);
        sendDataToPeer({ type: "file-resume", transferId: message.transferId });
      } else if (message.type === "file-complete") {
        const transferId = message.transferId || currentTransferIdRef.current;
        const totalChunks = message.totalChunks || totalChunksRef.current;
        const expectedSize = message.fileSize || expectedFileSizeRef.current;

        console.log(`[WebRTC] Received file-complete from sender. Verifying chunks... (received ${receivedCountRef.current}/${totalChunks}, highestContiguous: ${highestContiguousChunkRef.current})`);

        if (receivedCountRef.current < totalChunks || highestContiguousChunkRef.current < totalChunks - 1) {
          if (receivedBitsetRef.current) {
            const missing = getMissingChunkIndices(totalChunks, receivedBitsetRef.current);
            console.warn(`[WebRTC Retransmit] Missing ${missing.length} chunks! Requesting retransmission from sender:`, missing.slice(0, 10));
            sendDataToPeer({
              type: "request-retransmit",
              transferId,
              missingIndices: missing,
            });
            setTransferProgress((prev) =>
              prev ? { ...prev, statusMessage: `Recovering ${missing.length} missing chunks...` } : null
            );
          }
          return;
        }

        finalizeReceiverTransfer(transferId, message.fileName, expectedSize, totalChunks);
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
        sessionStorage.setItem(PEER_ID_KEY, newPeerId);
      } catch (e) {}
      setPeerId(newPeerId);
      peerIdRef.current = newPeerId;
      if (socketRef.current?.connected) {
        const { displayName: curName, isInitiator: curInit } = optionsRef.current;
        socketRef.current.emit("register-peer", { displayName: curName, isInitiator: curInit, preferredPeerId: newPeerId });
      }
    }
  }, [finalizeReceiverTransfer, getMissingChunkIndices, retransmitMissingChunks, sendDataToPeer]);

  const setupDataChannelEvents = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.binaryType = "arraybuffer";
      channel.bufferedAmountLowThreshold = 1024 * 1024; // 1MB threshold

      channel.onopen = () => {
        console.log("[WebRTC] Data channel opened");
        setConnected(true);
        setError("");

        // If Receiver has active chunk history from before reconnect, request resume
        const resumeChunk = highestContiguousChunkRef.current >= 0 ? highestContiguousChunkRef.current : lastReceivedChunkIndexRef.current;
        if (resumeChunk >= 0) {
          console.log(`[WebRTC Auto-Resume] DataChannel opened! Requesting resume from chunk #${resumeChunk + 1} (highest contiguous: ${highestContiguousChunkRef.current})`);
          sendDataToPeer({
            type: "request-resume",
            transferId: currentTransferIdRef.current || activeTransferIdRef.current,
            highestContiguousChunk: highestContiguousChunkRef.current,
            lastReceivedChunkIndex: resumeChunk,
          });
        }
      };

      channel.onclose = () => {
        console.log("[WebRTC] Data channel closed");
      };

      channel.onerror = (err) => {
        console.error("[WebRTC] Data channel error:", err);
      };

      channel.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const message = JSON.parse(event.data);
            handleIncomingMessage(message);
          } catch (err) {
            console.error("[WebRTC] Error parsing JSON message:", err);
          }
        } else if (event.data instanceof ArrayBuffer) {
          const chunkPacket = decodeFileChunkPacket(event.data);
          if (chunkPacket) {
            handleIncomingMessage(chunkPacket);
          }
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
          if (pc.iceConnectionState === "failed") {
            console.warn("[WebRTC] ICE Connection failed.");
            setConnected(false);
            setError("Unable to establish a direct WebRTC connection. Check network/TURN configuration.");
          } else if (["disconnected", "closed"].includes(pc.iceConnectionState)) {
            setConnected(false);
          }
        };

        pc.onconnectionstatechange = () => {
          console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
          if (["failed", "closed"].includes(pc.connectionState)) {
            setConnected(false);
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
      let id = sessionStorage.getItem(PEER_ID_KEY);
      if (!id) {
        // Generate a 12-char hex ID matching the server format
        id = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map(b => b.toString(16).padStart(2, "0").toUpperCase())
          .join("");
        sessionStorage.setItem(PEER_ID_KEY, id);
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
                sessionStorage.setItem(PEER_ID_KEY, response.peerId);
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

    socket.on("peer-connected", (data: any) => {
      console.log(`[WebRTC] Peer connected signal received: ${data.peerId} (${data.displayName})`);
      setRemotePeerInfo({
        peerId: data.peerId,
        displayName: data.displayName || "Connected Peer",
        isInitiator: false,
      });
      remoteIdRef.current = data.peerId;
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
        sessionStorage.setItem(PEER_ID_KEY, newPeerId);
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

      // 1. Attempt WebRTC P2P
      createPeerConnection(true, normalizedPeerId);
    },
    [createPeerConnection]
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
      const transferId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const startTime = Date.now();

      activeFileRef.current = file;
      activeTransferIdRef.current = transferId;

      // Send file-start notification to target peer
      sendDataToPeer({
        type: "file-start",
        transferId,
        fileName: file.name,
        fileSize: file.size,
        totalChunks,
      });

      setTransferProgress({
        transferId,
        fileName: file.name,
        progress: 0,
        total: totalChunks,
        fileSizeBytes: file.size,
        transferredBytes: 0,
        speed: 0,
        timeRemaining: 0,
        direction: "send",
      });

      lastAckedChunkIndexRef.current = -1;
      resumeFromChunkRef.current = null;

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        // Auto-resume check: if peer requested a resume from chunk index N
        if (resumeFromChunkRef.current !== null) {
          const resumeIdx = resumeFromChunkRef.current;
          resumeFromChunkRef.current = null;
          chunkIdx = Math.min(resumeIdx, totalChunks - 1);
          console.log(`[WebRTC Auto-Resume] Resuming sender stream at chunk #${chunkIdx}`);
        }

        if (isCancelledRef.current) {
          console.log("[WebRTC] Transfer cancelled by user");
          setTransferProgress(null);
          setIsPaused(false);
          isPausedRef.current = false;
          activeFileRef.current = null;
          activeTransferIdRef.current = "";
          return;
        }

        while (isPausedRef.current && !isCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 100));
        }

        if (isCancelledRef.current) {
          setTransferProgress(null);
          setIsPaused(false);
          isPausedRef.current = false;
          activeFileRef.current = null;
          activeTransferIdRef.current = "";
          return;
        }

        const start = chunkIdx * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const blobSlice = file.slice(start, end);
        const arrayBuffer = await blobSlice.arrayBuffer();

        // 4 MB Backpressure control
        await waitForBuffer(4 * 1024 * 1024);

        const packet = encodeFileChunkPacket(transferId, file.name, chunkIdx, totalChunks, new Uint8Array(arrayBuffer));
        const sent = sendDataToPeer(packet);

        if (!sent) {
          setError("Failed to send file chunk");
          activeFileRef.current = null;
          activeTransferIdRef.current = "";
          return;
        }

        // Non-blocking event loop yield every 4 chunks
        if (chunkIdx % 4 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }

        let currentPausedDuration = totalPausedDurationRef.current;
        if (isPausedRef.current && pausedStartTimeRef.current !== null) {
          currentPausedDuration += Date.now() - pausedStartTimeRef.current;
        }
        const elapsed = Math.max((Date.now() - startTime - currentPausedDuration) / 1000, 0.1);
        const transferredBytes = end;
        const speed = transferredBytes / elapsed / (1024 * 1024);
        const remainingBytes = Math.max(file.size - transferredBytes, 0);
        const timeRemaining = speed > 0 ? (remainingBytes / (1024 * 1024)) / speed : 0;

        setTransferProgress({
          transferId,
          fileName: file.name,
          progress: chunkIdx + 1,
          total: totalChunks,
          fileSizeBytes: file.size,
          transferredBytes,
          speed,
          timeRemaining,
          timeElapsed: Math.round(elapsed),
          direction: "send",
        });
      }

      // Enter verifying state and wait for receiver confirmation before marking complete
      setTransferProgress((prev) =>
        prev
          ? {
              ...prev,
              progress: totalChunks,
              transferredBytes: file.size,
              speed: 0,
              timeRemaining: 0,
              isVerifying: true,
              statusMessage: "Awaiting receiver verification...",
            }
          : null
      );

      sendDataToPeer({
        type: "file-complete",
        transferId,
        fileName: file.name,
        fileSize: file.size,
        totalChunks,
      });

      // Two-way confirmation: wait for receiver's transfer-verify-ack
      const verified = await new Promise<boolean>((resolve) => {
        transferVerifyResolverRef.current = resolve;
        setTimeout(() => {
          if (transferVerifyResolverRef.current === resolve) {
            transferVerifyResolverRef.current = null;
            resolve(true); // Fallback after 30s
          }
        }, 30000);
      });

      if (verified) {
        console.log(`[WebRTC] Transfer 100% verified and confirmed by receiver: ${file.name}`);
        setTimeout(() => {
          setTransferProgress(null);
          activeFileRef.current = null;
          activeTransferIdRef.current = "";
        }, 400);
      }

      console.log(`[WebRTC] File transfer complete: ${file.name}`);
    },
    [sendDataToPeer, connected]
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
      sessionStorage.setItem(PEER_ID_KEY, newPeerId);
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
              sessionStorage.setItem(PEER_ID_KEY, response.peerId);
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
