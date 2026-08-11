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
    serverLanIp,
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
      connectToPeer(targetPeer);
    }
  }, [isRegistered, connected, connectToPeer]);

  const handleScanQR = (data: { peerId: string; displayName: string }) => {
    setShowScanner(false);
    connectToPeer(data.peerId);
  };

  const handleManualConnect = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = manualPeerInput.trim();
    if (cleanId) {
      connectToPeer(cleanId);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans text-slate-900 antialiased selection:bg-blue-500 selection:text-white">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3.5 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 text-white p-2.5 rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 bg-clip-text text-transparent tracking-tight">
                  P2P File Transfer
                </h1>
                <p className="text-xs text-slate-500 font-medium">Direct & Encrypted Cross-Network Sharing</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-2.5">
                {connected ? (
                  <div className="h-9 px-4 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-2xs">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Connected
                  </div>
                ) : (
                  <div className="h-9 px-4 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs sm:text-sm font-medium inline-flex items-center gap-2">
                    <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                    Disconnected
                  </div>
                )}
              </div>

              {/* Red Highlighted Professional Disconnect Pill Control */}
              {connected && (
                <Button
                  onClick={handleDisconnect}
                  className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm shadow-sm transition-all duration-150 inline-flex items-center justify-center gap-1.5 border border-red-700"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </Button>
              )}

              <HelpTooltip
                content={
                  connected
                    ? "You are connected to a peer. You can now send or receive files."
                    : "Not connected to a peer yet. Scan a QR code or enter a Peer ID to connect."
                }
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6 rounded-2xl border-red-200 bg-red-50 text-red-900">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="font-medium text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: QR Code Generator */}
          <QRCodeGenerator peerId={peerId} displayName={displayName} serverLanIp={serverLanIp} />

          {/* Right Column: Setup, Transfer & Connect Cards */}
          <div className="space-y-6">
            {/* Device Name Setup */}
            <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-xs hover:shadow-md transition-all duration-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-slate-900">Setup Your Device</CardTitle>
                    <CardDescription className="text-xs text-slate-500">Give your device a name for easy identification</CardDescription>
                  </div>
                  <HelpTooltip content="Choose a memorable name for your device. This name will be visible to other devices when they connect to you." />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    onBlur={() => {
                      if (displayNameInput.trim()) setDisplayName(displayNameInput.trim());
                    }}
                    placeholder="Enter device name"
                    className="flex-1 h-11 px-4 text-sm font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="font-medium">Device Identity Badge</span>
                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/60">
                    {peerId || "Generating..."}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* File Transfer Interface */}
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

            {/* Connect Card */}
            {!connected && (
              <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-xs hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold text-slate-900">Connect to Remote Device</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Scan a QR code or enter the remote Peer ID manually</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleManualConnect} className="flex gap-2.5">
                    <input
                      type="text"
                      value={manualPeerInput}
                      onChange={(e) => setManualPeerInput(e.target.value)}
                      placeholder="Enter Peer ID (e.g., 3F9A12)"
                      className="flex-1 h-11 px-4 font-mono text-sm font-semibold tracking-wider rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                    />
                    <Button
                      type="submit"
                      disabled={!manualPeerInput.trim()}
                      className="h-11 px-6 rounded-xl font-medium text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                    >
                      Connect
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </form>
                  <div className="relative flex items-center justify-center border-t border-slate-200/80 pt-4">
                    <span className="bg-white px-3 text-xs font-semibold text-slate-400 absolute -top-3">OR</span>
                  </div>
                  <Button
                    onClick={() => setShowScanner(true)}
                    variant="outline"
                    className="h-11 w-full rounded-xl font-medium text-sm border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 shadow-2xs transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4 text-slate-500" />
                    Scan QR Code via Camera
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Connected Peer Info */}
            {connected && remotePeerInfo && (
              <Card className="rounded-2xl border border-emerald-200 bg-emerald-50/70 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <CardTitle className="text-base font-bold text-emerald-950">Active P2P Session</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm bg-white/80 p-3.5 rounded-xl border border-emerald-200/60">
                    <div>
                      <p className="text-xs text-emerald-700 font-medium">Remote Device</p>
                      <p className="font-semibold text-emerald-950 mt-0.5">{remotePeerInfo.displayName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700 font-medium">Peer ID</p>
                      <p className="font-mono font-bold text-emerald-800 mt-0.5">{remotePeerInfo.peerId}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* QR Scanner Modal */}
        {showScanner && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
              <QRCodeScanner onScan={handleScanQR} onClose={() => setShowScanner(false)} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-slate-500 text-xs sm:text-sm font-medium">
          <p>P2P File Transfer • End-to-End Encrypted WebRTC Transport • Zero Cloud Storage</p>
        </div>
      </footer>
    </div>
  );
}
