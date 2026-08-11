import { useState, useEffect } from "react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { QRCodeGenerator } from "@/components/QRCodeGenerator";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { FileTransferInterface } from "@/components/FileTransferInterface";
import { HelpTooltip } from "@/components/HelpTooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Home() {
  const [displayNameInput, setDisplayNameInput] = useState("My Device");
  const [displayName, setDisplayName] = useState("My Device");
  const [mode, setMode] = useState<"sender" | "receiver" | null>(null);
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
    isInitiator: mode === "sender",
  });

  const handleDisconnect = () => {
    disconnectPeer();
    setMode(null);
  };

  // Auto-connect if URL contains ?peer=XYZ
  // IMPORTANT: wait until isRegistered=true so the socket is registered on
  // the server before sending any WebRTC signals.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPeer = params.get("peer") || params.get("peerId");
    if (targetPeer && isRegistered && !connected) {
      if (!mode) setMode("receiver");
      connectToPeer(targetPeer);
    }
  }, [isRegistered, connected, mode, connectToPeer]);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">P2P File Transfer</h1>
              <p className="text-gray-600 mt-1">Fast, secure file sharing on local networks</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {connected ? (
                  <Badge variant="default" className="bg-green-600">
                    <Wifi className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <WifiOff className="w-3 h-3 mr-1" />
                    Disconnected
                  </Badge>
                )}
              </div>
              <HelpTooltip content={connected ? "You are connected to a peer. You can now send or receive files." : "Not connected to a peer yet. Generate or scan a QR code, or enter a Peer ID to connect."} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Device Setup Section */}
        {!mode && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: QR Code Generator */}
            <QRCodeGenerator peerId={peerId} displayName={displayName} serverLanIp={serverLanIp} />

            {/* Right Column: Setup, Role & Connect Cards */}
            <div className="space-y-6">
              {/* Device Name Setup */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Setup Your Device</CardTitle>
                      <CardDescription>Give your device a name for easy identification</CardDescription>
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
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="text-sm text-gray-600">Your Peer ID: <span className="font-mono font-bold text-blue-600">{peerId || "Generating..."}</span></p>
                </CardContent>
              </Card>

              {/* Mode Selection */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Choose Your Role</CardTitle>
                      <CardDescription>
                        Select whether you want to send or receive files
                      </CardDescription>
                    </div>
                    <HelpTooltip content="Sender: You initiate the file transfer. Receiver: You wait for files from another device. Works across any network (5G, 4G cellular, Wi-Fi, or Internet)." />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={() => setMode("sender")}
                    size="lg"
                    className="h-24 flex flex-col items-center justify-center gap-2"
                  >
                    <span className="text-2xl">📤</span>
                    <span>Send Files</span>
                  </Button>
                  <Button
                    onClick={() => setMode("receiver")}
                    size="lg"
                    variant="outline"
                    className="h-24 flex flex-col items-center justify-center gap-2"
                  >
                    <span className="text-2xl">📥</span>
                    <span>Receive Files</span>
                  </Button>
                </CardContent>
              </Card>

              {/* Connect Card on Home Screen */}
              {!connected && (
                <Card>
                  <CardHeader>
                    <CardTitle>Connect to Remote Device</CardTitle>
                    <CardDescription>Scan a QR code or enter the remote Peer ID manually</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={handleManualConnect} className="flex gap-2">
                      <input
                        type="text"
                        value={manualPeerInput}
                        onChange={(e) => setManualPeerInput(e.target.value)}
                        placeholder="Enter Peer ID (e.g., 3F9A12)"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <Button type="submit" disabled={!manualPeerInput.trim()}>
                        Connect
                      </Button>
                    </form>
                    <div className="relative flex items-center justify-center border-t pt-4">
                      <span className="bg-white px-2 text-xs text-gray-500 absolute -top-3">OR</span>
                    </div>
                    <Button onClick={() => setShowScanner(true)} variant="outline" className="w-full">
                      Scan QR Code via Camera
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Sender Mode */}
        {mode === "sender" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Send Files</h2>
                <p className="text-gray-600">Share your QR code or connect to another device</p>
              </div>
              <Button variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* QR Code Generator */}
              <QRCodeGenerator peerId={peerId} displayName={displayName} serverLanIp={serverLanIp} />

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
            </div>

            {/* Connect Card */}
            {!connected && (
              <Card>
                <CardHeader>
                  <CardTitle>Connect to Remote Device</CardTitle>
                  <CardDescription>Scan a QR code or enter the remote Peer ID manually</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleManualConnect} className="flex gap-2">
                    <input
                      type="text"
                      value={manualPeerInput}
                      onChange={(e) => setManualPeerInput(e.target.value)}
                      placeholder="Enter Peer ID (e.g., 3F9A12)"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <Button type="submit" disabled={!manualPeerInput.trim()}>
                      Connect
                    </Button>
                  </form>
                  <div className="relative flex items-center justify-center border-t pt-4">
                    <span className="bg-white px-2 text-xs text-gray-500 absolute -top-3">OR</span>
                  </div>
                  <Button onClick={() => setShowScanner(true)} variant="outline" className="w-full">
                    Scan QR Code via Camera
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Connected Peer Info */}
            {connected && remotePeerInfo && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="text-green-900">Connected Device</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className="font-medium">Device:</span> {remotePeerInfo.displayName}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Peer ID:</span> <span className="font-mono">{remotePeerInfo.peerId}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Receiver Mode */}
        {mode === "receiver" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Receive Files</h2>
                <p className="text-gray-600">Share your QR code or connect to sender</p>
              </div>
              <Button variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* QR Code Generator */}
              <QRCodeGenerator peerId={peerId} displayName={displayName} serverLanIp={serverLanIp} />

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
            </div>

            {/* Connect Card */}
            {!connected && (
              <Card>
                <CardHeader>
                  <CardTitle>Connect to Remote Device</CardTitle>
                  <CardDescription>Scan a QR code or enter the remote Peer ID manually</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleManualConnect} className="flex gap-2">
                    <input
                      type="text"
                      value={manualPeerInput}
                      onChange={(e) => setManualPeerInput(e.target.value)}
                      placeholder="Enter Peer ID (e.g., 3F9A12)"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <Button type="submit" disabled={!manualPeerInput.trim()}>
                      Connect
                    </Button>
                  </form>
                  <div className="relative flex items-center justify-center border-t pt-4">
                    <span className="bg-white px-2 text-xs text-gray-500 absolute -top-3">OR</span>
                  </div>
                  <Button onClick={() => setShowScanner(true)} variant="outline" className="w-full">
                    Scan QR Code via Camera
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Connected Peer Info */}
            {connected && remotePeerInfo && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="text-green-900">Connected Device</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className="font-medium">Device:</span> {remotePeerInfo.displayName}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Peer ID:</span> <span className="font-mono">{remotePeerInfo.peerId}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* QR Scanner Modal */}
        {showScanner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-md">
              <QRCodeScanner onScan={handleScanQR} onClose={() => setShowScanner(false)} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-gray-600 text-sm">
          <p>P2P File Transfer • Direct peer-to-peer connections • No server required</p>
        </div>
      </footer>
    </div>
  );
}
