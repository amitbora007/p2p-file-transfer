import { useState, useEffect } from "react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { QRCodeGenerator } from "@/components/QRCodeGenerator";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { FileTransferInterface } from "@/components/FileTransferInterface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Home() {
  const [displayName, setDisplayName] = useState("My Device");
  const [mode, setMode] = useState<"sender" | "receiver" | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const { peerId, connected, remotePeerInfo, error, transferProgress, connectToPeer, sendFile, receiveFile } =
    useWebRTC({
      displayName,
      isInitiator: mode === "sender",
    });

  const handleScanQR = (data: { peerId: string; displayName: string }) => {
    setShowScanner(false);
    connectToPeer(data.peerId);
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
          <div className="space-y-6">
            {/* Device Name Setup */}
            <Card>
              <CardHeader>
                <CardTitle>Setup Your Device</CardTitle>
                <CardDescription>Give your device a name for easy identification</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter device name"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-sm text-gray-600">Your Peer ID: <span className="font-mono font-bold">{peerId}</span></p>
              </CardContent>
            </Card>

            {/* Mode Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Choose Your Role</CardTitle>
                <CardDescription>Select whether you want to send or receive files</CardDescription>
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
              <Button variant="outline" onClick={() => setMode(null)}>
                Change Mode
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* QR Code Generator */}
              <QRCodeGenerator peerId={peerId} displayName={displayName} />

              {/* File Transfer Interface */}
              <FileTransferInterface
                connected={connected}
                transferProgress={transferProgress}
                onSendFile={sendFile}
                onReceiveFile={receiveFile}
                error={error}
              />
            </div>

            {/* Connect to Receiver */}
            {!connected && (
              <Card>
                <CardHeader>
                  <CardTitle>Connect to Receiver</CardTitle>
                  <CardDescription>Scan the receiver's QR code to establish connection</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setShowScanner(true)} className="w-full">
                    Scan QR Code
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Connected Peer Info */}
            {connected && remotePeerInfo && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="text-green-900">Connected</CardTitle>
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
                <p className="text-gray-600">Share your QR code or scan sender's code</p>
              </div>
              <Button variant="outline" onClick={() => setMode(null)}>
                Change Mode
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* QR Code Generator */}
              <QRCodeGenerator peerId={peerId} displayName={displayName} />

              {/* File Transfer Interface */}
              <FileTransferInterface
                connected={connected}
                transferProgress={transferProgress}
                onSendFile={sendFile}
                onReceiveFile={receiveFile}
                error={error}
              />
            </div>

            {/* Scan Sender's QR */}
            {!connected && (
              <Card>
                <CardHeader>
                  <CardTitle>Connect to Sender</CardTitle>
                  <CardDescription>Scan the sender's QR code to establish connection</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setShowScanner(true)} className="w-full">
                    Scan QR Code
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Connected Peer Info */}
            {connected && remotePeerInfo && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="text-green-900">Connected</CardTitle>
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
