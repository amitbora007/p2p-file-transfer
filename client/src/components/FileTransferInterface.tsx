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

  // Reset received state when disconnected
  useEffect(() => {
    if (!connected) {
      setIsReceiving(false);
      setReceivedFileName("");
      setReceivedChunks(new Map());
    }
  }, [connected]);

  // Track previous transferProgress to log completed/failed transfers
  const prevProgressRef = useRef<TransferProgress | null>(null);

  useEffect(() => {
    // If transfer was active and suddenly cleared without error, log completion for sender
    if (prevProgressRef.current && !transferProgress && !error) {
      const prev = prevProgressRef.current;
      if (prev.direction === "send" && prev.progress >= prev.total) {
        addHistoryRecord({
          fileName: prev.fileName,
          fileSize: prev.fileSizeBytes,
          direction: "send",
          status: "completed",
        });
      } else if (!connected) {
        addHistoryRecord({
          fileName: prev.fileName,
          fileSize: prev.fileSizeBytes,
          direction: prev.direction || "send",
          status: "cancelled",
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
  }, [transferProgress, error, connected, addHistoryRecord]);

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
        <Alert variant="destructive" className="rounded-2xl border-rose-900/50 bg-rose-950/40 text-rose-200">
          <AlertCircle className="h-4 w-4 text-rose-400" />
          <AlertDescription className="text-rose-200 text-xs sm:text-sm font-medium">{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="transfer" className="w-full">
        <TabsList className="grid w-full grid-cols-2 p-1 h-12 bg-slate-950/80 border border-slate-800/80 rounded-xl">
          <TabsTrigger
            value="transfer"
            className="rounded-lg h-10 text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-indigo-500/25 text-slate-400"
          >
            Transfer Files
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-lg h-10 text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-indigo-500/25 text-slate-400 flex items-center justify-center gap-1.5"
          >
            Session History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 font-semibold border border-indigo-500/30">
                {history.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transfer" className="space-y-4 mt-4">
          {/* Send File Section */}
          <Card className="rounded-2xl border border-slate-800/80 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            <CardHeader className="px-5 py-3 border-b border-slate-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-indigo-400" />
                    Send File
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-400">Stream files directly to the paired device</CardDescription>
                </div>
                <HelpTooltip content="Choose a file from your device and stream it directly to the paired peer. Transferred via end-to-end WebRTC transport." />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-4">
              {(() => {
                const isTransferring = transferProgress !== null;

                return (
                  <>
                    <div
                      onDragOver={(e) => { if (connected && !isTransferring) handleDragOver(e); }}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => { if (connected && !isTransferring) handleDrop(e); }}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                        !connected || isTransferring
                          ? "opacity-50 cursor-not-allowed border-slate-800 bg-slate-950/40"
                          : isDragging
                          ? "border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-500/10"
                          : "border-slate-800 hover:border-indigo-500/50 bg-slate-950/60 hover:bg-slate-950/80 cursor-pointer"
                      }`}
                      onClick={() => {
                        if (connected && !isTransferring) fileInputRef.current?.click();
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={!connected || isTransferring}
                      />
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 bg-indigo-950/80 rounded-2xl text-indigo-400 border border-indigo-800/50 shadow-inner">
                          <Upload className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-medium text-slate-300">
                          {isTransferring
                            ? "Transfer in progress... Please wait for current transfer to complete"
                            : connected
                            ? "Click or drag & drop a file here to select"
                            : "Connect to a peer to select and stream files"}
                        </p>
                        <Button
                          variant="outline"
                          type="button"
                          disabled={!connected || isTransferring}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (connected && !isTransferring) fileInputRef.current?.click();
                          }}
                          className="h-10 px-5 rounded-xl border border-slate-800 bg-slate-900 text-sm font-medium hover:bg-slate-800 text-slate-200 transition-all shadow-sm disabled:opacity-40"
                        >
                          Choose File
                        </Button>
                      </div>

                      {selectedFile && (
                        <div className="mt-4 p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 text-left shadow-sm">
                          <p className="text-sm font-semibold text-slate-100 truncate">{selectedFile.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{formatBytes(selectedFile.size)}</p>
                        </div>
                      )}
                    </div>

                    {selectedFile && (
                      <Button
                        onClick={handleSendFile}
                        disabled={!connected || isTransferring}
                        className="h-11 w-full rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 border-0"
                      >
                        {isTransferring ? (
                          <>
                            <Loader className="w-4 h-4 mr-2 animate-spin" />
                            {isPaused ? "Transfer Paused" : "Transfering..."}
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
                  </>
                );
              })()}

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
                  <p className="text-xs text-slate-500">No file selected for streaming</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receive File Section */}
          <Card className="rounded-2xl border border-slate-800/80 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            <CardHeader className="px-5 py-3 border-b border-slate-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                    <Download className="w-4 h-4 text-indigo-400" />
                    Receive File
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-400">Incoming transfers automatically download to your browser</CardDescription>
                </div>
                <HelpTooltip content="Files sent by the connected peer will automatically stream and download to your device." />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
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
                  <div className="flex items-center gap-2.5 p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm text-emerald-200">{receivedFileName}</p>
                      <p className="text-xs text-emerald-400">File received and saved to downloads</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-2">
                  <Download className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-400">Waiting for incoming transfers...</p>
                  <p className="text-xs text-slate-600">Files sent by the paired device will appear here automatically</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="rounded-2xl border border-slate-800/80 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            <CardHeader className="px-5 py-3 border-b border-slate-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-400" />
                    Session History
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-400">File transmission log for active pairing</CardDescription>
                </div>
                {history.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearHistory}
                    className="text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border-slate-800 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear History
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {history.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <History className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-slate-300 font-semibold text-sm">No transfer history yet</p>
                  <p className="text-xs text-slate-500">Transferred files in this session will be recorded here with status details.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 hover:bg-slate-950/90 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                        <div className={`p-2 rounded-xl shrink-0 ${item.direction === "send" ? "bg-indigo-950/80 text-indigo-400 border border-indigo-800/50" : "bg-purple-950/80 text-purple-400 border border-purple-800/50"}`}>
                          {item.direction === "send" ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : (
                            <ArrowDownLeft className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-slate-100 truncate">{item.fileName}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <span>{formatBytes(item.fileSize)}</span>
                            <span>•</span>
                            <span>{item.timestamp}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 border-slate-800/60 pt-2 sm:pt-0">
                        <Badge
                          variant="outline"
                          className={
                            item.direction === "send"
                              ? "bg-indigo-950/60 text-indigo-300 border-indigo-800/50"
                              : "bg-purple-950/60 text-purple-300 border-purple-800/50"
                          }
                        >
                          {item.direction === "send" ? "Sent" : "Received"}
                        </Badge>

                        {item.status === "completed" && (
                          <Badge variant="outline" className="bg-emerald-950/60 text-emerald-300 border-emerald-800/50 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Completed
                          </Badge>
                        )}
                        {item.status === "failed" && (
                          <Badge variant="outline" className="bg-rose-950/60 text-rose-300 border-rose-800/50 flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-rose-400" />
                            Failed
                          </Badge>
                        )}
                        {item.status === "cancelled" && (
                          <Badge variant="outline" className="bg-amber-950/60 text-amber-300 border-amber-800/50 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-400" />
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
