import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface QRCodeGeneratorProps {
  peerId: string;
  displayName: string;
}

export function QRCodeGenerator({ peerId, displayName }: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!peerId || !canvasRef.current) return;

    const qrData = JSON.stringify({
      peerId,
      displayName,
      timestamp: Date.now(),
    });

    QRCode.toCanvas(canvasRef.current, qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  }, [peerId, displayName]);

  const handleCopy = () => {
    const qrData = JSON.stringify({ peerId, displayName });
    navigator.clipboard.writeText(qrData);
  };

  const handleDownload = () => {
    if (canvasRef.current) {
      const link = document.createElement("a");
      link.href = canvasRef.current.toDataURL("image/png");
      link.download = `qr-code-${peerId}.png`;
      link.click();
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Your QR Code</CardTitle>
        <CardDescription>Share this QR code with others to connect</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <canvas ref={canvasRef} />
        </div>

        <div className="w-full space-y-2">
          <div className="text-center">
            <p className="text-sm text-gray-600">Your Peer ID</p>
            <p className="text-lg font-mono font-bold text-gray-900">{peerId}</p>
          </div>
        </div>

        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="flex-1"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="flex-1"
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
