import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HelpTooltip } from "@/components/HelpTooltip";

interface QRCodeScannerProps {
  onScan: (data: { peerId: string; displayName: string }) => void;
  onClose: () => void;
}

export function QRCodeScanner({ onScan, onClose }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>("");
  const [scanning, setScanning] = useState(true);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            scanQRCode();
          };
        }
      } catch (err) {
        setError("Unable to access camera. Please check permissions.");
        console.error("Camera access error:", err);
      }
    };

    const scanQRCode = () => {
      if (!videoRef.current || !canvasRef.current || !scanning) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const video = videoRef.current;

      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        try {
          // Use jsQR to decode the QR code
          const qrCode = jsQR(imageData.data, canvas.width, canvas.height);

          if (qrCode) {
            try {
              const parsed = JSON.parse(qrCode.data);
              if (parsed.peerId && parsed.displayName) {
                setScanning(false);
                onScan(parsed);
                return;
              }
            } catch (e) {
              // Not a valid JSON QR code, continue scanning
            }
          }
        } catch (err) {
          console.error("QR decode error:", err);
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanQRCode);
    };

    startCamera();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [scanning, onScan]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <CardTitle>Scan QR Code</CardTitle>
            <CardDescription>Point your camera at a QR code to connect</CardDescription>
          </div>
          <HelpTooltip content="Align the QR code within the green frame. The scanner will automatically detect and connect to the device." side="bottom" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* QR scanning overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-green-500 rounded-lg shadow-lg">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-600 text-center">
          {scanning ? "Scanning for QR code..." : "QR code detected!"}
        </p>
      </CardContent>
    </Card>
  );
}
