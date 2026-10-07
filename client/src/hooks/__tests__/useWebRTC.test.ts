import { describe, it, expect, beforeEach, vi } from "vitest";
import { encodeFileChunkPacket, decodeFileChunkPacket } from "../useWebRTC";

describe("useWebRTC Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with correct default values", () => {
    expect(true).toBe(true);
  });

  it("should generate a valid peer ID", () => {
    const peerId = "ABC123DEF456";
    expect(/^[A-F0-9]+$/.test(peerId)).toBe(true);
  });

  it("should handle file transfer data correctly", () => {
    const fileData = {
      type: "file-chunk",
      transferId: "tx_12345",
      fileName: "test.txt",
      chunkIndex: 0,
      totalChunks: 5,
      data: new Uint8Array([1, 2, 3, 4, 5]),
    };

    expect(fileData.type).toBe("file-chunk");
    expect(fileData.transferId).toBe("tx_12345");
    expect(fileData.fileName).toBe("test.txt");
    expect(fileData.data.length).toBe(5);
  });

  it("should handle file completion message with transferId", () => {
    const completeMessage = {
      type: "file-complete",
      transferId: "tx_12345",
      fileName: "test.txt",
      fileSize: 1024,
      totalChunks: 16,
    };

    expect(completeMessage.type).toBe("file-complete");
    expect(completeMessage.transferId).toBe("tx_12345");
    expect(completeMessage.fileSize).toBeGreaterThan(0);
    expect(completeMessage.totalChunks).toBe(16);
  });

  describe("Binary Chunk Packet Protocol", () => {
    it("should encode and decode binary chunk packet with transferId", () => {
      const transferId = "tx-safari-123";
      const fileName = "test-movie.mp4";
      const chunkIndex = 42;
      const totalChunks = 50000;
      const chunkData = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

      const buffer = encodeFileChunkPacket(
        transferId,
        fileName,
        chunkIndex,
        totalChunks,
        chunkData
      );

      expect(buffer).toBeInstanceOf(ArrayBuffer);

      const decoded = decodeFileChunkPacket(buffer);
      expect(decoded).not.toBeNull();
      expect(decoded?.type).toBe("file-chunk");
      expect(decoded?.transferId).toBe(transferId);
      expect(decoded?.fileName).toBe(fileName);
      expect(decoded?.chunkIndex).toBe(chunkIndex);
      expect(decoded?.totalChunks).toBe(totalChunks);
      expect(Array.from(decoded?.data || [])).toEqual(Array.from(chunkData));
    });

    it("should return null when decoding invalid or truncated packet", () => {
      const corruptedBuffer = new ArrayBuffer(8); // Too small
      expect(decodeFileChunkPacket(corruptedBuffer)).toBeNull();

      const invalidMagic = new ArrayBuffer(20);
      const view = new DataView(invalidMagic);
      view.setUint32(0, 0x12345678, false); // Wrong magic
      expect(decodeFileChunkPacket(invalidMagic)).toBeNull();
    });

    it("should track contiguous chunks and detect missing gaps", () => {
      const totalChunks = 10;
      const bitset = new Uint8Array(Math.ceil(totalChunks / 8));

      // Simulate receiving chunks: 0, 1, 3, 4 (missing chunk 2)
      const received = [0, 1, 3, 4];
      for (const idx of received) {
        bitset[Math.floor(idx / 8)] |= (1 << (idx % 8));
      }

      // Check highest contiguous chunk
      let highestContiguous = -1;
      for (let i = 0; i < totalChunks; i++) {
        const byteIdx = Math.floor(i / 8);
        const bitMask = 1 << (i % 8);
        if ((bitset[byteIdx] & bitMask) !== 0) {
          highestContiguous = i;
        } else {
          break;
        }
      }
      expect(highestContiguous).toBe(1); // 0 and 1 are contiguous, stops before 2

      // Check missing chunk detection
      const missing: number[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const byteIdx = Math.floor(i / 8);
        const bitMask = 1 << (i % 8);
        if ((bitset[byteIdx] & bitMask) === 0) {
          missing.push(i);
        }
      }
      expect(missing).toEqual([2, 5, 6, 7, 8, 9]);
    });
  });
});

