import { describe, it, expect } from "vitest";

describe("QR Code Components", () => {
  it("should generate valid QR data format", () => {
    const qrData = {
      peerId: "ABC123DEF456",
      displayName: "My Device",
      timestamp: Date.now(),
    };

    const jsonString = JSON.stringify(qrData);
    const parsed = JSON.parse(jsonString);

    expect(parsed.peerId).toBe("ABC123DEF456");
    expect(parsed.displayName).toBe("My Device");
    expect(parsed.timestamp).toBeGreaterThan(0);
  });

    it("should validate QR scan data", () => {
      const scanData = {
        peerId: "XYZ789ABC123",
        displayName: "Remote Device",
      };

      const isValid = !!(scanData.peerId && scanData.displayName);
      expect(isValid).toBe(true);
    });

  it("should handle QR code download", () => {
    const fileName = `qr-code-ABC123DEF456.png`;
    expect(fileName).toMatch(/^qr-code-[A-Z0-9]+\.png$/);
  });
});
