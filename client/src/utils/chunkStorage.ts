// IndexedDB-backed chunk storage for large file transfers (2 GB+)
// Prevents Mobile Safari / Chrome memory crashes by storing chunks in browser origin storage
// instead of holding gigabytes of binary data in JavaScript RAM.

const DB_NAME = "p2p_file_transfer_chunks";
const STORE_NAME = "chunks";

export interface ChunkRecord {
  chunkIndex: number;
  data: Uint8Array;
}

class ChunkStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB not supported"));
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = (e: any) => {
        const db = e.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "chunkIndex" });
        }
      };

      request.onsuccess = (e: any) => resolve(e.target.result as IDBDatabase);
      request.onerror = (e) => reject(e);
    });

    return this.dbPromise;
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {
      console.warn("[ChunkStorage] Error clearing IndexedDB storage:", e);
    }
  }

  async saveChunk(chunkIndex: number, data: Uint8Array): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ chunkIndex, data });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("Failed to save chunk"));
      });
    } catch (e) {
      console.warn(`[ChunkStorage] Error saving chunk #${chunkIndex}:`, e);
    }
  }

  async compileBlob(totalChunks: number, mimeType = "application/octet-stream"): Promise<Blob> {
    const db = await this.getDB();

    const parts: BlobPart[] = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      const end = Math.min(i + BATCH_SIZE, totalChunks);
      const batchPromises: Promise<ChunkRecord | null>[] = [];

      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      for (let j = i; j < end; j++) {
        batchPromises.push(
          new Promise<ChunkRecord | null>((resolve) => {
            const req = store.get(j);
            req.onsuccess = () => resolve((req.result as ChunkRecord) || null);
            req.onerror = () => resolve(null);
          })
        );
      }

      const records = await Promise.all(batchPromises);
      for (const rec of records) {
        if (rec && rec.data) {
          parts.push(new Uint8Array(rec.data) as BlobPart);
        }
      }
    }

    return new Blob(parts, { type: mimeType });
  }
}

export const chunkStorage = new ChunkStorage();
