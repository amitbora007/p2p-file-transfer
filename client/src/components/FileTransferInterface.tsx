import { useState, useRef, useEffect } from "react";
import { Upload, Download, AlertCircle, CheckCircle, Loader } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TransferProgress } from "@/hooks/useWebRTC";

interface FileTransferInterfaceProps {
  connected: boolean;
  transferProgress: TransferProgress | null;
  onSendFile: (file: File) => void;
  onReceiveFile: (callback: (data: any) => void, onComplete: (data: any) => void) => void;
  error?: string;
}

export function FileTransferInterface({
  connected,
  transferProgress,
  onSendFile,
  onReceiveFile,
  error,
}: FileTransferInterfaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [receivedChunks, setReceivedChunks] = useState<Map<number, number[]>>(new Map());
  const [receivedFileName, setReceivedFileName] = useState<string>("");
  const [isReceiving, setIsReceiving] = useState(false);

  useEffect(() => {
    if (connected && !isReceiving) {
      setIsReceiving(true);
      onReceiveFile(
        (data) => {
          // Handle file chunk
          const chunks = new Map(receivedChunks);
          chunks.set(data.chunkIndex, data.data);
          setReceivedChunks(chunks);
          setReceivedFileName(data.fileName);
        },
        (data) => {
          // Handle file complete
          const chunks = new Map(receivedChunks);
          const sortedChunks: Uint8Array[] = [];

          // Reconstruct file from chunks in order
          for (let i = 0; i < chunks.size; i++) {
            if (chunks.has(i)) {
              const chunk = chunks.get(i)!;
              sortedChunks.push(new Uint8Array(chunk));
            }
          }

          const blob = new Blob(sortedChunks as BlobPart[]);
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = data.fileName;
          link.click();
          URL.revokeObjectURL(url);

          setReceivedChunks(new Map());
          setReceivedFileName("");
        }
      );
    }
  }, [connected, onReceiveFile, isReceiving, receivedChunks]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSendFile = () => {
    if (selectedFile) {
      onSendFile(selectedFile);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatSpeed = (speed: number) => {
    return speed.toFixed(2) + " MB/s";
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return Math.round(seconds) + "s";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return minutes + "m " + secs + "s";
  };

  return (
    <div className="space-y-4 w-full">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!connected && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Not connected to a peer. Generate or scan a QR code to connect.
          </AlertDescription>
        </Alert>
      )}

      {/* Send File Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Send File
          </CardTitle>
          <CardDescription>Select and send a file to the connected peer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              disabled={!connected}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!connected}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose File
            </Button>

            {selectedFile && (
              <div className="mt-4 text-left">
                <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-sm text-gray-600">{formatBytes(selectedFile.size)}</p>
              </div>
            )}
          </div>

          {selectedFile && (
            <Button
              onClick={handleSendFile}
              disabled={!connected || transferProgress !== null}
              className="w-full"
            >
              {transferProgress ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Send File
                </>
              )}
            </Button>
          )}

          {transferProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{transferProgress.fileName}</span>
                <span className="text-gray-600">
                  {Math.round((transferProgress.progress / transferProgress.total) * 100)}%
                </span>
              </div>
              <Progress
                value={(transferProgress.progress / transferProgress.total) * 100}
                className="h-2"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>Speed: {formatSpeed(transferProgress.speed)}</span>
                <span>Time remaining: {formatTime(transferProgress.timeRemaining)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receive File Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Receive File
          </CardTitle>
          <CardDescription>Waiting to receive files from the connected peer</CardDescription>
        </CardHeader>
        <CardContent>
          {receivedFileName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-900">{receivedFileName}</p>
                  <p className="text-sm text-green-700">File received and downloaded</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Download className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-600">Waiting for incoming files...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
