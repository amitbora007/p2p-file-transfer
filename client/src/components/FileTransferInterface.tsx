import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Download, AlertCircle, CheckCircle, Loader, History, CheckCircle2, XCircle, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { HelpTooltip } from "@/components/HelpTooltip";
import { TransferProgressBar } from "@/components/TransferProgressBar";
import { TransferProgress } from "@/hooks/useWebRTC";

export interface HistoryRecord {
  id: string;
  fileName: string;
  fileSize: number;
  direction: "send" | "receive";
  status: "completed" | "failed" | "cancelled";
  timestamp: string;
}

interface FileTransferInterfaceProps {
  connected: boolean;
  transferProgress: TransferProgress | null;
  isPaused?: boolean;
  onSendFile: (file: File) => void;
  onReceiveFile: (callback: (data: any) => void, onComplete: (data: any) => void) => void;
  onPauseResume?: () => void;
  onCancelTransfer?: () => void;
  error?: string;
}

export function FileTransferInterface({
  connected,
  transferProgress,
  isPaused = false,
  onSendFile,
  onReceiveFile,
  onPauseResume,
  onCancelTransfer,
  error,
}: FileTransferInterfaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [receivedChunks, setReceivedChunks] = useState<Map<number, number[]>>(new Map());
  const [receivedFileName, setReceivedFileName] = useState<string>("");
  const [isReceiving, setIsReceiving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Session history state persisted in sessionStorage
  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const saved = sessionStorage.getItem("p2p_transfer_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem("p2p_transfer_history", JSON.stringify(history));
    } catch (e) {}
  }, [history]);

  const addHistoryRecord = useCallback((record: Omit<HistoryRecord, "id" | "timestamp">) => {
    const newRecord: HistoryRecord = {
      ...record,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setHistory((prev) => [newRecord, ...prev]);
  }, []);

  const clearHistory = () => {
    setHistory([]);
    try {
      sessionStorage.removeItem("p2p_transfer_history");
    } catch (e) {}
  };

  // Track previous transferProgress to log completed/failed transfers
  const prevProgressRef = useRef<TransferProgress | null>(null);

  useEffect(() => {
    // If transfer was active and suddenly cleared without error, log completion for sender
    if (prevProgressRef.current && !transferProgress && !error) {
      const prev = prevProgressRef.current;
      if (prev.direction === "send" && prev.progress >= prev.total - 1) {
        addHistoryRecord({
          fileName: prev.fileName,
          fileSize: prev.fileSizeBytes,
          direction: "send",
          status: "completed",
        });
      }
    }

    // If an error occurred while a transfer was active
    if (error && prevProgressRef.current && !transferProgress) {
      const prev = prevProgressRef.current;
      addHistoryRecord({
        fileName: prev.fileName,
        fileSize: prev.fileSizeBytes,
        direction: prev.direction || "send",
        status: "failed",
      });
    }

    prevProgressRef.current = transferProgress;
  }, [transferProgress, error, addHistoryRecord]);

  useEffect(() => {
    if (connected && !isReceiving) {
      setIsReceiving(true);
      onReceiveFile(
        (data) => {
          // Handle file chunk
          setReceivedChunks((prev) => {
            const chunks = new Map(prev);
            chunks.set(data.chunkIndex, data.data);
            return chunks;
          });
          setReceivedFileName(data.fileName);
        },
        (data) => {
          // Handle file complete
          setReceivedChunks((prev) => {
            const total = data.totalChunks || prev.size;
            const sortedChunks: Uint8Array[] = [];
            for (let i = 0; i < total; i++) {
              const chunk = prev.get(i);
              if (chunk) {
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

            // Log completion in session history
            addHistoryRecord({
              fileName: data.fileName,
              fileSize: blob.size || data.fileSize || 0,
              direction: "receive",
              status: "completed",
            });

            setReceivedFileName("");
            return new Map();
          });
        }
      );
    }
  }, [connected, onReceiveFile, isReceiving, addHistoryRecord]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSendFile = () => {
    if (selectedFile && connected) {
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
            Not connected to a peer yet. You can select a file now, then generate or scan a QR code to connect and send it.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="transfer" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="transfer" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            File Transfer
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Session History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {history.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transfer" className="space-y-4">
          {/* Send File Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Send File
                  </CardTitle>
                  <CardDescription>Select a file to share with the connected peer</CardDescription>
                </div>
                <HelpTooltip content="Choose a file from your device and send it directly to the connected peer. The transfer happens peer-to-peer without using a server." />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => { if (connected) handleDragOver(e); }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => { if (connected) handleDrop(e); }}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition ${
                  !connected
                    ? "opacity-60 cursor-not-allowed border-gray-200 bg-gray-50"
                    : isDragging
                    ? "border-blue-500 bg-blue-50 cursor-pointer"
                    : "border-gray-300 hover:border-gray-400 bg-gray-50/50 cursor-pointer"
                }`}
                onClick={() => {
                  if (connected) fileInputRef.current?.click();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={!connected}
                />
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-gray-400" />
                  <p className="text-sm font-medium text-gray-700">
                    {connected
                      ? "Click or drag & drop a file here to select"
                      : "Connect to a peer to select and send files"}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={!connected}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connected) fileInputRef.current?.click();
                    }}
                  >
                    Choose File
                  </Button>
                </div>

                {selectedFile && (
                  <div className="mt-4 p-3 bg-white rounded border border-gray-200 text-left">
                    <p className="text-sm font-semibold text-gray-900 truncate">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(selectedFile.size)}</p>
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
                      {isPaused ? "Paused" : "Sending..."}
                    </>
                  ) : !connected ? (
                    "Connect to Peer to Send File"
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Send File
                    </>
                  )}
                </Button>
              )}

              {transferProgress && transferProgress.direction === "send" && (
                <TransferProgressBar
                  transfer={transferProgress}
                  isPaused={isPaused}
                  onPauseResume={onPauseResume}
                  onCancel={() => {
                    if (onCancelTransfer) {
                      onCancelTransfer();
                    }
                    if (transferProgress) {
                      addHistoryRecord({
                        fileName: transferProgress.fileName,
                        fileSize: transferProgress.fileSizeBytes,
                        direction: "send",
                        status: "cancelled",
                      });
                    }
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                />
              )}

              {(!transferProgress || transferProgress.direction !== "send") && !selectedFile && (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-500">No file selected</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receive File Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    Receive File
                  </CardTitle>
                  <CardDescription>Waiting to receive files from the connected peer</CardDescription>
                </div>
                <HelpTooltip content="Files sent by the connected peer will automatically download to your device. No action needed—just wait for incoming transfers." />
              </div>
            </CardHeader>
            <CardContent>
              {transferProgress && transferProgress.direction === "receive" ? (
                <div className="space-y-3">
                  <TransferProgressBar
                    transfer={transferProgress}
                    isPaused={isPaused}
                    onPauseResume={onPauseResume}
                    onCancel={() => {
                      if (onCancelTransfer) {
                        onCancelTransfer();
                      }
                      if (transferProgress) {
                        addHistoryRecord({
                          fileName: transferProgress.fileName,
                          fileSize: transferProgress.fileSizeBytes,
                          direction: "receive",
                          status: "cancelled",
                        });
                      }
                    }}
                  />
                </div>
              ) : receivedFileName ? (
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
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Session History
                  </CardTitle>
                  <CardDescription>File transmissions performed during this session</CardDescription>
                </div>
                {history.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearHistory}
                    className="text-gray-600 hover:text-red-600 hover:bg-red-50 border-gray-200 flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-600" />
                    Clear History
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-600 font-medium">No transfer history yet</p>
                  <p className="text-sm text-gray-400 mt-1">Transferred files in this session will appear here with their status.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3.5 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100/80 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-full ${item.direction === "send" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                          {item.direction === "send" ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : (
                            <ArrowDownLeft className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{item.fileName}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            <span>{formatBytes(item.fileSize)}</span>
                            <span>•</span>
                            <span>{item.timestamp}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={
                            item.direction === "send"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-purple-50 text-purple-700 border-purple-200"
                          }
                        >
                          {item.direction === "send" ? "Sent" : "Received"}
                        </Badge>

                        {item.status === "completed" && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-600" />
                            Completed
                          </Badge>
                        )}
                        {item.status === "failed" && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-red-600" />
                            Failed
                          </Badge>
                        )}
                        {item.status === "cancelled" && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            Cancelled
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
