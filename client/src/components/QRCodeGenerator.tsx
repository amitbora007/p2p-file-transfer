import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Check, Link, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/HelpTooltip";

interface QRCodeGeneratorProps {
  peerId: string;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
}

export function QRCodeGenerator({ peerId, displayName, onDisplayNameChange }: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const getOrigin = () => {
    if (typeof window === "undefined") return "";
    const envPublicUrl = (import.meta as any).env?.VITE_PUBLIC_URL;
    if (envPublicUrl) return envPublicUrl.replace(/\/$/, "");
    return window.location.origin;
  };

  const connectUrl = getOrigin()
    ? `${getOrigin()}/?peer=${peerId}&name=${encodeURIComponent(displayName)}`
    : "";

  useEffect(() => {
    if (!peerId || !canvasRef.current) return;

    // Compact 180px size optimized for mobile viewports
    QRCode.toCanvas(canvasRef.current, connectUrl || peerId, {
      width: 180,
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });
  }, [peerId, displayName, connectUrl]);

  const handleCopyPeerId = () => {
    navigator.clipboard.writeText(peerId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyUrl = () => {
    if (connectUrl) {
      navigator.clipboard.writeText(connectUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleDownload = () => {
    if (canvasRef.current) {
      const link = document.createElement("a");
      link.href = canvasRef.current.toDataURL("image/png");
      link.download = `p2p-qr-${peerId}.png`;
      link.click();
    }
  };

  return (
    <Card className="w-full border border-slate-800/80 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-black/40 rounded-2xl overflow-hidden">
      <CardHeader className="px-5 py-3 border-b border-slate-800/60">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
              Your Device Identity
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-400">
              Share QR code or pair using your unique Peer ID
            </CardDescription>
          </div>
          <HelpTooltip content="Scan this QR code or share your Peer ID to pair instantly across 5G, 4G, Wi-Fi, or Internet." />
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5 space-y-3.5">
        {/* Inline Device Name & Peer ID Bar */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
            Device Name & Peer ID (Select "My Device" to rename)
          </label>
          <div className="flex items-center gap-2.5 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 focus-within:border-indigo-500/60 transition-all">
            <input
              type="text"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="Enter device name"
              className="flex-1 bg-transparent text-xs font-semibold text-slate-100 placeholder:text-slate-500 outline-none"
            />
            <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/80 px-2.5 py-0.5 rounded-md border border-indigo-800/50 shrink-0">
              {peerId || "GENERATING..."}
            </span>
          </div>
        </div>

        {/* Compact QR Code Canvas Container */}
        <div className="flex flex-col items-center justify-center pt-1">
          <div className="p-2.5 bg-white rounded-xl shadow-lg border border-slate-700/50 w-44 h-44 flex items-center justify-center transition-transform hover:scale-[1.02]">
            <canvas ref={canvasRef} className="w-full h-full rounded-md" />
          </div>
        </div>

        {/* Action Button Grid */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            onClick={handleCopyPeerId}
            variant="outline"
            className="h-10 text-xs font-medium border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5"
          >
            {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            {copiedId ? "Copied" : "Copy ID"}
          </Button>

          <Button
            onClick={handleCopyUrl}
            variant="outline"
            className="h-10 text-xs font-medium border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link className="w-3.5 h-3.5 text-slate-400" />}
            {copiedLink ? "Copied" : "Copy Link"}
          </Button>

          <Button
            onClick={handleDownload}
            variant="outline"
            className="h-10 text-xs font-medium border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
