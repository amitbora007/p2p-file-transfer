// Dedicated OPFS Web Worker
// Executes synchronous atomic disk writes via createSyncAccessHandle()
// Supported on Safari iOS 15.2+, Safari macOS 15.2+, Chrome 102+, Firefox 111+, Edge
// Eliminates main-thread blocking and keeps JavaScript heap RAM under 20 MB during 1-5 GB transfers.

interface ActiveHandle {
  fileHandle: FileSystemFileHandle;
  accessHandle: any; // FileSystemSyncAccessHandle
  fileName: string;
  expectedSize: number;
  writtenChunks: number;
}

const activeHandles = new Map<string, ActiveHandle>();

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

self.onmessage = async (e: MessageEvent) => {
  const { type, transferId } = e.data;

  try {
    if (type === "init") {
      const { fileName, expectedSize } = e.data;
      const root = await navigator.storage.getDirectory();
      const tempName = `opfs_${transferId}_${sanitizeFileName(fileName)}`;
      const fileHandle = await root.getFileHandle(tempName, { create: true });
      const accessHandle = await (fileHandle as any).createSyncAccessHandle();

      activeHandles.set(transferId, {
        fileHandle,
        accessHandle,
        fileName,
        expectedSize,
        writtenChunks: 0,
      });

      self.postMessage({ type: "init-complete", transferId, success: true });
    } else if (type === "write") {
      const { offset, buffer } = e.data;
      const handle = activeHandles.get(transferId);
      if (handle && handle.accessHandle) {
        const uint8 = new Uint8Array(buffer);
        handle.accessHandle.write(uint8, { at: offset });
        handle.writtenChunks++;
      }
    } else if (type === "finalize") {
      const handle = activeHandles.get(transferId);
      if (handle) {
        handle.accessHandle.flush();
        handle.accessHandle.close();
        const file = await handle.fileHandle.getFile();
        activeHandles.delete(transferId);

        self.postMessage({
          type: "finalize-complete",
          transferId,
          success: true,
          size: file.size,
          verified: file.size === handle.expectedSize,
        });
      } else {
        self.postMessage({
          type: "finalize-complete",
          transferId,
          success: false,
          error: "Handle not found",
        });
      }
    } else if (type === "cleanup") {
      const handle = activeHandles.get(transferId);
      if (handle) {
        try {
          handle.accessHandle.close();
        } catch (_) {}
        activeHandles.delete(transferId);
      }
      try {
        const root = await navigator.storage.getDirectory();
        const tempName = `opfs_${transferId}_${sanitizeFileName(e.data.fileName || "")}`;
        await root.removeEntry(tempName);
      } catch (_) {}
      self.postMessage({ type: "cleanup-complete", transferId });
    }
  } catch (error: any) {
    self.postMessage({
      type: "error",
      transferId,
      error: error?.message || String(error),
    });
  }
};
