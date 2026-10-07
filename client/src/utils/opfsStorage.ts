// Progressive Zero-RAM OPFS Storage Utility
// Streams binary chunks directly to disk to prevent Safari and mobile memory crashes on 1-5 GB transfers.
// 1st priority: Dedicated Web Worker with createSyncAccessHandle() (Zero main-thread blocking, zero copy)
// 2nd priority: Main-thread persistent FileSystemWritableFileStream (Created once per transfer)
// 3rd priority: IndexedDB chunk storage fallback

import { chunkStorage } from "./chunkStorage";

export interface FinalizeResult {
  verified: boolean;
  size: number;
  file: File | Blob | null;
  error?: string;
}

export class OPFSStorageManager {
  private worker: Worker | null = null;
  private workerReady = false;
  private isOPFSSupported = false;
  private activeStreams = new Map<string, { fileHandle: FileSystemFileHandle; writable?: any; fileName: string; expectedSize: number }>();
  private pendingInitResolvers = new Map<string, (success: boolean) => void>();
  private pendingFinalizeResolvers = new Map<string, (result: FinalizeResult) => void>();

  constructor() {
    if (typeof window !== "undefined" && typeof navigator !== "undefined" && !!navigator?.storage?.getDirectory) {
      this.isOPFSSupported = true;
      this.initWorker();
    }
  }

  private initWorker() {
    if (typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(new URL("../workers/opfsWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = async (e: MessageEvent) => {
        const { type, transferId } = e.data;
        if (type === "init-complete") {
          const resolver = this.pendingInitResolvers.get(transferId);
          if (resolver) {
            resolver(e.data.success);
            this.pendingInitResolvers.delete(transferId);
          }
        } else if (type === "finalize-complete") {
          const resolver = this.pendingFinalizeResolvers.get(transferId);
          if (resolver) {
            let file: File | null = null;
            if (e.data.success) {
              try {
                const streamInfo = this.activeStreams.get(transferId);
                const root = await navigator.storage.getDirectory();
                const tempName = `opfs_${transferId}_${this.sanitizeName(streamInfo?.fileName || "")}`;
                const fileHandle = await root.getFileHandle(tempName, { create: false });
                file = await fileHandle.getFile();
              } catch (err) {
                console.warn("[OPFS] Error getting file after worker finalize:", err);
              }
            }
            resolver({
              verified: file ? file.size === (this.activeStreams.get(transferId)?.expectedSize ?? e.data.size) : false,
              size: file ? file.size : e.data.size,
              file,
              error: e.data.error,
            });
            this.pendingFinalizeResolvers.delete(transferId);
          }
        } else if (type === "error") {
          console.warn("[OPFS Worker Error]:", e.data.error);
          const initRes = this.pendingInitResolvers.get(transferId);
          if (initRes) {
            initRes(false);
            this.pendingInitResolvers.delete(transferId);
          }
          const finRes = this.pendingFinalizeResolvers.get(transferId);
          if (finRes) {
            finRes({ verified: false, size: 0, file: null, error: e.data.error });
            this.pendingFinalizeResolvers.delete(transferId);
          }
        }
      };
      this.workerReady = true;
    } catch (e) {
      console.warn("[OPFS] Worker initialization failed, falling back to main-thread stream:", e);
      this.worker = null;
      this.workerReady = false;
    }
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async initTransfer(transferId: string, fileName: string, expectedSize: number): Promise<boolean> {
    this.activeStreams.set(transferId, {
      fileHandle: null as any,
      fileName,
      expectedSize,
    });

    // Strategy 1: Dedicated OPFS Worker
    if (this.workerReady && this.worker) {
      return new Promise<boolean>((resolve) => {
        this.pendingInitResolvers.set(transferId, resolve);
        this.worker!.postMessage({
          type: "init",
          transferId,
          fileName,
          expectedSize,
        });
        // 5 second fallback timeout
        setTimeout(() => {
          if (this.pendingInitResolvers.has(transferId)) {
            this.pendingInitResolvers.delete(transferId);
            resolve(false);
          }
        }, 5000);
      });
    }

    // Strategy 2: Persistent Main-thread Writable Stream
    if (this.isOPFSSupported) {
      try {
        const root = await navigator.storage.getDirectory();
        const tempName = `opfs_${transferId}_${this.sanitizeName(fileName)}`;
        const fileHandle = await root.getFileHandle(tempName, { create: true });
        let writable: any = null;
        if ("createWritable" in fileHandle) {
          writable = await (fileHandle as any).createWritable({ keepExistingData: true });
        }
        this.activeStreams.set(transferId, {
          fileHandle,
          writable,
          fileName,
          expectedSize,
        });
        return true;
      } catch (e) {
        console.warn("[OPFS] Main-thread init failed, falling back to IndexedDB:", e);
      }
    }

    // Strategy 3: IndexedDB Fallback
    await chunkStorage.clear();
    return true;
  }

  async writeChunk(transferId: string, offset: number, data: Uint8Array): Promise<boolean> {
    // Strategy 1: Dedicated Worker (Zero copy with transferable buffer)
    if (this.workerReady && this.worker && this.pendingInitResolvers.get(transferId) === undefined) {
      try {
        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        this.worker.postMessage(
          {
            type: "write",
            transferId,
            offset,
            buffer,
          },
          [buffer]
        );
        return true;
      } catch (_) {}
    }

    // Strategy 2: Main-thread Persistent Stream
    const streamInfo = this.activeStreams.get(transferId);
    if (streamInfo && streamInfo.writable) {
      try {
        await streamInfo.writable.seek(offset);
        await streamInfo.writable.write(data);
        return true;
      } catch (e) {
        console.warn("[OPFS] Write error in main-thread stream:", e);
      }
    }

    // Strategy 3: IndexedDB fallback
    const chunkIdx = Math.floor(offset / (64 * 1024));
    await chunkStorage.saveChunk(chunkIdx, data);
    return true;
  }

  async finalizeTransfer(transferId: string, expectedSize: number): Promise<FinalizeResult> {
    const streamInfo = this.activeStreams.get(transferId);
    const fileName = streamInfo?.fileName || "received_file";

    // Strategy 1: Dedicated Worker
    if (this.workerReady && this.worker) {
      return new Promise<FinalizeResult>((resolve) => {
        this.pendingFinalizeResolvers.set(transferId, resolve);
        this.worker!.postMessage({
          type: "finalize",
          transferId,
          expectedSize,
        });
        setTimeout(() => {
          if (this.pendingFinalizeResolvers.has(transferId)) {
            this.pendingFinalizeResolvers.delete(transferId);
            resolve({ verified: false, size: 0, file: null, error: "Finalize timeout" });
          }
        }, 30000);
      });
    }

    // Strategy 2: Main-thread Stream
    if (streamInfo) {
      try {
        if (streamInfo.writable) {
          await streamInfo.writable.close();
        }
        const file = await streamInfo.fileHandle.getFile();
        return {
          verified: file.size === expectedSize,
          size: file.size,
          file,
        };
      } catch (e: any) {
        console.warn("[OPFS] Main-thread finalize failed, falling back to IndexedDB:", e);
      }
    }

    // Strategy 3: IndexedDB fallback compilation
    try {
      const totalChunks = Math.ceil(expectedSize / (64 * 1024));
      const blob = await chunkStorage.compileBlob(totalChunks);
      return {
        verified: blob.size === expectedSize,
        size: blob.size,
        file: blob,
      };
    } catch (e: any) {
      return {
        verified: false,
        size: 0,
        file: null,
        error: e?.message || "Compilation failed",
      };
    }
  }

  async getFileBlob(transferId: string, fileName?: string): Promise<Blob | File | null> {
    const streamInfo = this.activeStreams.get(transferId);
    const resolvedName = fileName || streamInfo?.fileName || "";

    if (this.isOPFSSupported && resolvedName) {
      try {
        const root = await navigator.storage.getDirectory();
        const tempName = `opfs_${transferId}_${this.sanitizeName(resolvedName)}`;
        const fileHandle = await root.getFileHandle(tempName, { create: false });
        return await fileHandle.getFile();
      } catch (e) {
        console.warn("[OPFS] getFileBlob error:", e);
      }
    }

    return null;
  }

  async cleanup(transferId: string, fileName?: string): Promise<void> {
    const streamInfo = this.activeStreams.get(transferId);
    const resolvedName = fileName || streamInfo?.fileName || "";

    if (this.workerReady && this.worker) {
      this.worker.postMessage({
        type: "cleanup",
        transferId,
        fileName: resolvedName,
      });
    }

    if (streamInfo && streamInfo.writable) {
      try {
        await streamInfo.writable.close();
      } catch (_) {}
    }

    this.activeStreams.delete(transferId);

    if (this.isOPFSSupported && resolvedName) {
      try {
        const root = await navigator.storage.getDirectory();
        const tempName = `opfs_${transferId}_${this.sanitizeName(resolvedName)}`;
        await root.removeEntry(tempName);
      } catch (_) {}
    }

    try {
      await chunkStorage.clear();
    } catch (_) {}
  }
}

export const opfsStorage = new OPFSStorageManager();
