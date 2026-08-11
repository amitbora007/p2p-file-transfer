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
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex justify-center max-w-full">
          <canvas ref={canvasRef} className="max-w-full h-auto rounded-lg" />
        </div>

        <div className="w-full space-y-1.5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your Peer ID</p>
          <div className="inline-flex items-center justify-center bg-blue-50/80 border border-blue-200/60 rounded-xl px-4 py-1.5">
            <span className="text-lg font-mono font-bold text-blue-700 break-all">{peerId || "Generating..."}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
          <Button
            variant="outline"
            onClick={handleCopyPeerId}
            className="h-10 w-full text-sm font-medium rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-all flex items-center justify-center gap-2 shadow-2xs active:scale-[0.98]"
          >
            <Copy className="w-4 h-4 text-slate-500" />
            Copy ID
          </Button>
          <Button
            variant="outline"
            onClick={handleCopyUrl}
            className="h-10 w-full text-sm font-medium rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-all flex items-center justify-center gap-2 shadow-2xs active:scale-[0.98]"
          >
            <Copy className="w-4 h-4 text-slate-500" />
            Copy Link
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            className="h-10 w-full text-sm font-medium rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-all flex items-center justify-center gap-2 shadow-2xs active:scale-[0.98]"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Download QR
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
