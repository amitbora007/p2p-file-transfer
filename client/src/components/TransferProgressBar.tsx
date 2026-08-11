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

  const totalBytes = transfer.fileSizeBytes;
  const transferredBytes = transfer.transferredBytes;

  return (
    <div className="w-full space-y-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 animate-in fade-in duration-300">
      {/* File Name and Status */}
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {transfer.fileName}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {formatBytes(transferredBytes)} of {formatBytes(totalBytes)}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <span className="text-lg font-bold text-blue-600 min-w-[3rem] text-right">
            {Math.round(progressPercent)}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="relative h-3 bg-blue-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">
            {transfer.progress} / {transfer.total} chunks
          </span>
          <span className="text-gray-600">
            Speed: {formatSpeed(transfer.speed)}
          </span>
        </div>
      </div>

      {/* Time Remaining and Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-blue-200">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">
            Time remaining:{" "}
            <span className="text-blue-600 font-semibold">
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
              className="h-8 w-8 p-0"
              title={isPaused ? "Resume transfer" : "Pause transfer"}
            >
              {isPaused ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </Button>
          )}
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Cancel transfer"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2 pt-2 border-t border-blue-200 text-center">
        <div className="text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-gray-600 truncate">Upload Speed</p>
          <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
            {formatSpeed(transfer.speed)}
          </p>
        </div>
        <div className="text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-gray-600 truncate">Time Left</p>
          <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
            {formatTime(transfer.timeRemaining)}
          </p>
        </div>
        <div className="text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-gray-600 truncate">Progress</p>
          <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
            {Math.round(progressPercent)}%
          </p>
        </div>
      </div>
    </div>
  );
}
