import { X, Pause, Play } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { TransferProgress } from "@/hooks/useWebRTC";

interface TransferProgressBarProps {
  transfer: TransferProgress;
  onCancel?: () => void;
  isPaused?: boolean;
  onPauseResume?: () => void;
}

export function TransferProgressBar({
  transfer,
  onCancel,
  isPaused = false,
  onPauseResume,
}: TransferProgressBarProps) {
  const progressPercent = (transfer.progress / transfer.total) * 100;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatSpeed = (speed: number) => {
    return speed.toFixed(2) + " MB/s";
  };

  const formatTime = (seconds: number) => {
    if (isPaused) return "Paused";
    if (progressPercent >= 100) return "Complete";
    if (!seconds || seconds <= 0 || !isFinite(seconds) || isNaN(seconds)) return "Calculating...";
    if (seconds < 1) return "< 1s";
    if (seconds < 60) return Math.round(seconds) + "s";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return minutes + "m " + secs + "s";
  };

  const formatElapsedTime = (seconds?: number) => {
    if (isPaused) return "Paused";
    if (!seconds || seconds <= 0 || !isFinite(seconds) || isNaN(seconds)) return "0s";
    if (seconds < 1) return "< 1s";
    if (seconds < 60) return Math.round(seconds) + "s";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return minutes + "m " + secs + "s";
  };

  const totalBytes = transfer.fileSizeBytes;
  const transferredBytes = transfer.transferredBytes;

  return (
    <div className="w-full space-y-3 p-4 bg-slate-950/80 rounded-2xl border border-indigo-800/40 shadow-xl animate-in fade-in duration-300">
      {/* File Name and Status */}
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">
            {transfer.fileName}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {formatBytes(transferredBytes)} of {formatBytes(totalBytes)}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <span className="text-lg font-black text-indigo-400 min-w-[3rem] text-right">
            {Math.round(progressPercent)}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="relative h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 rounded-full transition-all duration-500 ease-out shadow-lg shadow-indigo-500/30"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-400">
            {transfer.progress} / {transfer.total} chunks
          </span>
          <span className="text-indigo-400 font-semibold">
            {formatSpeed(transfer.speed)}
          </span>
        </div>
      </div>

      {/* Time Remaining and Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-300">
            Time remaining:{" "}
            <span className="text-indigo-400 font-semibold">
              {formatTime(transfer.timeRemaining)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onPauseResume && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPauseResume}
              className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
              title={isPaused ? "Resume transfer" : "Pause transfer"}
            >
              {isPaused ? (
                <Play className="w-4 h-4 text-indigo-400" />
              ) : (
                <Pause className="w-4 h-4 text-amber-400" />
              )}
            </Button>
          )}
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-8 w-8 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
              title="Cancel transfer"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2 pt-2 border-t border-slate-800/80 text-center">
        <div className="text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-slate-400 truncate">Transfer Speed</p>
          <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
            {formatSpeed(transfer.speed)}
          </p>
        </div>
        <div className="text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-slate-400 truncate">Time Elapsed</p>
          <p className="text-xs sm:text-sm font-semibold text-indigo-300 truncate">
            {formatElapsedTime(transfer.timeElapsed)}
          </p>
        </div>
        <div className="text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-slate-400 truncate">Progress</p>
          <p className="text-xs sm:text-sm font-semibold text-emerald-400 truncate">
            {Math.round(progressPercent)}%
          </p>
        </div>
      </div>
    </div>
  );
}
