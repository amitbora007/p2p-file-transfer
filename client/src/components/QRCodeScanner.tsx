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
        setError("Unable to access camera. Browsers require HTTPS or localhost for camera access on mobile devices. You can use the 'Connect via Peer ID' option to connect directly.");
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

          if (qrCode && qrCode.data) {
            const rawData = qrCode.data.trim();
            let scannedPeerId = "";
            let scannedName = "Remote Device";

            // 1. Try URL format (http://.../?peer=ABCDEF&name=...)
            if (rawData.startsWith("http://") || rawData.startsWith("https://")) {
              try {
                const url = new URL(rawData);
                scannedPeerId = url.searchParams.get("peer") || url.searchParams.get("peerId") || "";
                scannedName = url.searchParams.get("name") || url.searchParams.get("displayName") || "Remote Device";
              } catch (_) {}
            }

            // 2. Try JSON format
            if (!scannedPeerId && rawData.startsWith("{")) {
              try {
                const parsed = JSON.parse(rawData);
                if (parsed.peerId) {
                  scannedPeerId = parsed.peerId;
                  scannedName = parsed.displayName || "Remote Device";
                }
              } catch (_) {}
            }

            // 3. Try plain Peer ID string
            if (!scannedPeerId && /^[A-Za-z0-9_-]{6,16}$/.test(rawData)) {
              scannedPeerId = rawData;
            }

            if (scannedPeerId) {
              setScanning(false);
              onScan({ peerId: scannedPeerId, displayName: scannedName });
              return;
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
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-48 h-48 sm:w-64 sm:h-64 max-w-[80%] max-h-[80%] border-2 border-green-500 rounded-lg shadow-lg relative">
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
