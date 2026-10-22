import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Check, Link, Smartphone, Loader2, QrCode } from "lucide-react";
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
  const [localName, setLocalName] = useState(displayName);
  const [isGenerating, setIsGenerating] = useState(!peerId);

  useEffect(() => {
    setLocalName(displayName);
  }, [displayName]);

  // 800ms Debounce timer to notify parent only when user stops typing
  useEffect(() => {
    if (localName === displayName) return;
    const timer = setTimeout(() => {
      if (localName.trim()) {
        onDisplayNameChange(localName.trim());
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [localName, displayName, onDisplayNameChange]);

  const handleCommitName = () => {
    if (localName.trim() && localName.trim() !== displayName) {
      onDisplayNameChange(localName.trim());
    }
  };

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
    if (!peerId) {
      setIsGenerating(true);
      return;
    }

    if (!canvasRef.current) return;

    setIsGenerating(true);
    let isCancelled = false;

    // Compact 180px size optimized for mobile viewports
    QRCode.toCanvas(canvasRef.current, connectUrl || peerId, {
      width: 180,
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then(() => {
        if (!isCancelled) {
          setIsGenerating(false);
        }
      })
      .catch((err) => {
        console.error("QR generation error:", err);
        if (!isCancelled) {
          setIsGenerating(false);
        }
      });

    return () => {
      isCancelled = true;
    };
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
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleCommitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCommitName();
              }}
              placeholder="Enter device name"
              className="flex-1 bg-transparent text-xs font-semibold text-slate-100 placeholder:text-slate-500 outline-none"
            />
            <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/80 px-2.5 py-1 rounded-md border border-indigo-800/50 shrink-0 inline-flex items-center gap-1.5">
              {!peerId ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                  <span>GENERATING...</span>
                </>
              ) : (
                peerId
              )}
            </span>
          </div>
        </div>

        {/* Compact QR Code Canvas Container with Active Barcode Loader */}
        <div className="flex flex-col items-center justify-center pt-1">
          <div className="relative p-2.5 bg-white rounded-xl shadow-lg border border-slate-700/50 w-44 h-44 flex items-center justify-center transition-transform hover:scale-[1.02] overflow-hidden">
            <canvas
              ref={canvasRef}
              className={`w-full h-full rounded-md transition-opacity duration-300 ${
                isGenerating || !peerId ? "opacity-0 invisible absolute" : "opacity-100 visible"
              }`}
            />
            {(isGenerating || !peerId) && (
              <div className="flex flex-col items-center justify-center gap-2 p-3 text-center animate-in fade-in duration-200">
                <div className="relative flex items-center justify-center">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-inner">
                    <QrCode className="w-6 h-6 text-indigo-600 animate-pulse" />
                  </div>
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin absolute -top-1 -right-1" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] font-bold text-slate-800">Generating QR Code</p>
                  <p className="text-[10px] text-slate-500 font-medium">Setting up secure key...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Button Grid */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            onClick={handleCopyPeerId}
            disabled={!peerId || isGenerating}
            variant="outline"
            className="h-10 text-xs font-medium border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            {copiedId ? "Copied" : "Copy ID"}
          </Button>

          <Button
            onClick={handleCopyUrl}
            disabled={!peerId || isGenerating}
            variant="outline"
            className="h-10 text-xs font-medium border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link className="w-3.5 h-3.5 text-slate-400" />}
            {copiedLink ? "Copied" : "Copy Link"}
          </Button>

          <Button
            onClick={handleDownload}
            disabled={!peerId || isGenerating}
            variant="outline"
            className="h-10 text-xs font-medium border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
