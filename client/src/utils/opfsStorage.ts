// OPFS (Origin Private File System) Storage Utility
// Progressive disk-backed file streaming for 2 GB+ transfers
// Keeps JavaScript RAM usage under 10 MB on iOS Safari, Mobile Chrome, and Desktop browsers.

export class OPFSStorage {
  private isSupported: boolean;

  constructor() {
    this.isSupported = typeof window !== "undefined" && !!navigator?.storage?.getDirectory;
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async writeChunk(transferId: string, fileName: string, offset: number, data: Uint8Array): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      const root = await navigator.storage.getDirectory();
      const tempName = `opfs_${transferId}_${this.sanitizeName(fileName)}`;
      const fileHandle = await root.getFileHandle(tempName, { create: true });

      // Use createWritable stream if available (Chrome, Safari 15.2+, Firefox, Edge)
      if ("createWritable" in fileHandle) {
        const writable = await (fileHandle as any).createWritable({ keepExistingData: true });
        await writable.seek(offset);
        await writable.write(data);
        await writable.close();
        return true;
      }

      // SyncAccessHandle fallback for Web Workers or WebKit
      if ("createSyncAccessHandle" in fileHandle) {
        const accessHandle = await (fileHandle as any).createSyncAccessHandle();
        accessHandle.write(data, { at: offset });
        accessHandle.flush();
        accessHandle.close();
        return true;
      }
    } catch (e) {
      console.warn("[OPFSStorage] Error writing chunk to OPFS:", e);
    }

    return false;
  }

  async getFileBlob(transferId: string, fileName: string, mimeType = "application/octet-stream"): Promise<Blob | null> {
    if (!this.isSupported) return null;

    try {
      const root = await navigator.storage.getDirectory();
      const tempName = `opfs_${transferId}_${this.sanitizeName(fileName)}`;
      const fileHandle = await root.getFileHandle(tempName, { create: false });
      const file = await fileHandle.getFile();
      return new Blob([file], { type: mimeType });
    } catch (e) {
      console.warn("[OPFSStorage] Error reading OPFS blob:", e);
      return null;
    }
  }

  async cleanup(transferId: string, fileName: string): Promise<void> {
    if (!this.isSupported) return;

    try {
      const root = await navigator.storage.getDirectory();
      const tempName = `opfs_${transferId}_${this.sanitizeName(fileName)}`;
      await root.removeEntry(tempName);
      console.log(`[OPFSStorage] Cleaned up temporary OPFS file: ${tempName}`);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }
}

export const opfsStorage = new OPFSStorage();
