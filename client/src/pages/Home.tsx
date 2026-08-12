import { useState, useEffect } from "react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { QRCodeGenerator } from "@/components/QRCodeGenerator";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { FileTransferInterface } from "@/components/FileTransferInterface";
import { HelpTooltip } from "@/components/HelpTooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Wifi, WifiOff, LogOut, Share2, Camera, ArrowRight, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Home() {
  const [displayNameInput, setDisplayNameInput] = useState("My Device");
  const [displayName, setDisplayName] = useState("My Device");
  const [showScanner, setShowScanner] = useState(false);
  const [manualPeerInput, setManualPeerInput] = useState("");

  // Debounce display name updates to prevent firing socket emissions on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      if (displayNameInput.trim()) {
        setDisplayName(displayNameInput.trim());
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [displayNameInput]);

  const {
    isRegistered,
    peerId,
    connected,
    remotePeerInfo,
    error,
    transferProgress,
    isPaused,
    connectToPeer,
    disconnectPeer,
    sendFile,
    receiveFile,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
  } = useWebRTC({
    displayName,
    isInitiator: false,
  });

  const handleDisconnect = () => {
    disconnectPeer();
  };

  // Auto-connect if URL contains ?peer=XYZ
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPeer = params.get("peer") || params.get("peerId");
    if (targetPeer && isRegistered && !connected) {
      if (typeof window !== "undefined" && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      connectToPeer(targetPeer);
    }
  }, [isRegistered, connected, connectToPeer]);

  const handleScanQR = (data: { peerId: string; displayName: string }) => {
    setShowScanner(false);
    if (typeof window !== "undefined" && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    connectToPeer(data.peerId);
  };

  const handleManualConnect = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = manualPeerInput.trim().toUpperCase();
    if (cleanId) {
      connectToPeer(cleanId);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl shadow-black/50">
        <div className="max-w-6xl mx-auto px-4 py-3.5 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-tr from-indigo-600 via-purple-600 to-blue-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-500/25 flex items-center justify-center">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-300 bg-clip-text text-transparent tracking-tight">
                  P2P Secure Transfer
                </h1>
                <p className="text-xs text-slate-400 font-medium">Direct Encrypted WebRTC Transport • Zero Server Storage</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-2.5">
                {connected ? (
                  <div className="h-8 px-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold inline-flex items-center gap-1.5 shadow-inner">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Connected
                  </div>
                ) : (
                  <div className="h-8 px-3 rounded-full bg-slate-900/90 text-slate-400 border border-slate-800 text-xs font-medium inline-flex items-center gap-1.5">
                    <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                    Disconnected
                  </div>
                )}
              </div>

              {/* Red Highlighted Professional Disconnect Pill Control */}
              {connected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="h-8 px-3 rounded-full bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] text-rose-400 font-semibold text-xs border border-rose-500/40 shadow-inner transition-all duration-150 inline-flex items-center justify-center gap-1.5 cursor-pointer outline-none"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  Disconnect
                </button>
              )}

              <HelpTooltip
                content={
                  connected
                    ? "You are paired in an active session. Ready to stream files securely."
                    : "Not connected to a peer. Scan QR code or enter Peer ID to establish a session."
                }
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6 rounded-2xl border-rose-900/50 bg-rose-950/40 text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            <AlertDescription className="font-medium text-sm text-rose-200">{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: QR Code Generator & Identity, Connect Card & Active P2P Session */}
          <div className="space-y-6">
            <QRCodeGenerator
              peerId={peerId}
              displayName={displayNameInput}
              onDisplayNameChange={(name) => {
                setDisplayNameInput(name);
                setDisplayName(name);
              }}
            />

            {/* Connect Card (Shown when Disconnected) */}
            {!connected && (
              <Card className="rounded-2xl border border-slate-800/80 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
                <CardHeader className="pb-3 border-b border-slate-800/60">
                  <CardTitle className="text-base sm:text-lg font-bold text-slate-100">Connect to Remote Device</CardTitle>
                  <CardDescription className="text-xs text-slate-400">Scan QR code or enter peer ID manually</CardDescription>
                </CardHeader>
                <CardContent className="pt-5 space-y-4">
                  <form onSubmit={handleManualConnect} className="flex flex-col sm:flex-row gap-2.5 w-full">
                    <input
                      type="text"
                      value={manualPeerInput}
                      onChange={(e) => setManualPeerInput(e.target.value.toUpperCase())}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck="false"
                      placeholder="ENTER PEER ID (E.G. 3F9A12)"
                      className="uppercase w-full sm:flex-1 h-11 px-4 font-mono text-sm font-semibold tracking-wider rounded-xl border border-slate-800 bg-slate-950/70 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
                    />
                    <Button
                      type="submit"
                      disabled={!manualPeerInput.trim()}
                      className="w-full sm:w-auto h-11 px-6 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shrink-0 border-0"
                    >
                      Connect
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </form>
                  <div className="relative flex items-center justify-center border-t border-slate-800/80 pt-4">
                    <span className="bg-slate-900 px-3 text-xs font-semibold text-slate-500 absolute -top-3">OR</span>
                  </div>
                  <Button
                    onClick={() => setShowScanner(true)}
                    variant="outline"
                    className="h-11 w-full rounded-xl font-medium text-sm border border-slate-800 bg-slate-950/60 hover:bg-slate-800/60 text-slate-200 shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4 text-indigo-400" />
                    Scan QR Code via Camera
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Connected Peer Info (Shown on Left Side when Connected) */}
            {connected && remotePeerInfo && (
              <Card className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
                <CardHeader className="pb-2 border-b border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <CardTitle className="text-base font-bold text-emerald-200">Active P2P Session</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm bg-slate-950/60 p-3.5 rounded-xl border border-emerald-500/20">
                    <div>
                      <p className="text-xs text-emerald-400 font-medium">Remote Device</p>
                      <p className="font-semibold text-slate-100 mt-0.5">{remotePeerInfo.displayName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-400 font-medium">Peer ID</p>
                      <p className="font-mono font-bold text-emerald-300 mt-0.5">{remotePeerInfo.peerId}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: File Stream Hub & Transfer Interface (Aligned with Left Column Top) */}
          <div>
            <FileTransferInterface
              connected={connected}
              transferProgress={transferProgress}
              isPaused={isPaused}
              onSendFile={sendFile}
              onReceiveFile={receiveFile}
              onPauseResume={isPaused ? resumeTransfer : pauseTransfer}
              onCancelTransfer={cancelTransfer}
              error={error}
            />
          </div>
        </div>

        {/* QR Scanner Modal */}
        {showScanner && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
              <QRCodeScanner onScan={handleScanQR} onClose={() => setShowScanner(false)} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 mt-16 bg-slate-950/60">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-slate-500 text-xs sm:text-sm font-medium">
          <p>P2P Secure Transfer • End-to-End Encrypted WebRTC Transport • Zero Server Storage</p>
        </div>
      </footer>
    </div>
  );
}
