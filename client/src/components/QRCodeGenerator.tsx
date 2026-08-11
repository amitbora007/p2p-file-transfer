import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/HelpTooltip";

interface QRCodeGeneratorProps {
  peerId: string;
  displayName: string;
  serverLanIp?: string;
}

export function QRCodeGenerator({ peerId, displayName, serverLanIp }: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getOrigin = () => {
    if (typeof window === "undefined") return "";
    const envPublicUrl = (import.meta as any).env?.VITE_PUBLIC_URL;
    if (envPublicUrl) return envPublicUrl.replace(/\/$/, "");
    const { protocol, hostname, port } = window.location;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const hostToUse = isLocalhost && serverLanIp ? serverLanIp : hostname;
    const portStr = port ? `:${port}` : "";
    return `${protocol}//${hostToUse}${portStr}`;
  };

  const connectUrl = getOrigin()
    ? `${getOrigin()}/?peer=${peerId}&name=${encodeURIComponent(displayName)}`
    : "";

  useEffect(() => {
    if (!peerId || !canvasRef.current) return;

    // Use full connection URL so native camera apps can open it directly
    QRCode.toCanvas(canvasRef.current, connectUrl || peerId, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  }, [peerId, displayName, connectUrl]);

  const handleCopyPeerId = () => {
    navigator.clipboard.writeText(peerId);
  };

  const handleCopyUrl = () => {
    if (connectUrl) {
      navigator.clipboard.writeText(connectUrl);
    }
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Your QR Code</CardTitle>
            <CardDescription>Share this QR code or link to connect</CardDescription>
          </div>
          <HelpTooltip content="Scan this QR code with a camera or click Copy Link to share. Connects directly across any network (5G, 4G, Wi-Fi, or Internet)." />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 flex justify-center max-w-full">
          <canvas ref={canvasRef} className="max-w-full h-auto" />
        </div>

        <div className="w-full space-y-2 text-center">
          <div>
            <p className="text-sm text-gray-600">Your Peer ID</p>
            <p className="text-xl font-mono font-bold text-blue-600 break-all">{peerId}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPeerId}
            className="flex-1 min-w-[110px] text-xs sm:text-sm"
          >
            <Copy className="w-4 h-4 mr-1.5" />
            Copy Peer ID
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyUrl}
            className="flex-1 min-w-[110px] text-xs sm:text-sm"
          >
            <Copy className="w-4 h-4 mr-1.5" />
            Copy Link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="flex-1 min-w-[110px] text-xs sm:text-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Download QR
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
