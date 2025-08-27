"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Zap, QrCode, Flashlight, FlashlightOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan?: (data: string) => void;
}

// QR Scanner using device camera
export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  // Use native browser APIs instead of qr-scanner library
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Ensure client-side rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Start camera when scanner opens
  useEffect(() => {
    if (isOpen && isClient) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, isClient]);

  const startCamera = async () => {
    if (!videoRef.current) {
      console.log('Video element not ready');
      return;
    }

    try {
      setError(null);
      setIsScanning(true);

      // Request camera access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      // Set up video stream
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play();
      
      setStream(mediaStream);
      streamRef.current = mediaStream;
      setHasPermission(true);
      setIsScanning(true);

      console.log('Camera started successfully');

      // Start QR detection after camera is ready
      setTimeout(() => {
        startQRDetection();
      }, 1000);

    } catch (err) {
      console.error("Camera error:", err);
      setHasPermission(false);
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError("Camera permission denied. Please allow camera access to scan QR codes.");
        } else if (err.name === 'NotFoundError') {
          setError("No camera found on this device");
        } else {
          setError("Failed to start camera: " + err.message);
        }
      } else {
        setError("Failed to start camera");
      }
      setIsScanning(false);
    }
  };

  const startQRDetection = async () => {
    if (!videoRef.current || !canvasRef.current || !streamRef.current) {
      console.log('QR Detection failed: missing refs or stream', {
        video: !!videoRef.current,
        canvas: !!canvasRef.current,
        stream: !!streamRef.current
      });
      return;
    }

    console.log('Starting QR detection...');

    try {
      // Try BarcodeDetector first (Chrome/Edge)
      if ('BarcodeDetector' in window) {
        console.log('Using BarcodeDetector API');
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        
        const scanFrame = async () => {
          if (!videoRef.current || !canvasRef.current || !streamRef.current) return;
          
          try {
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            const video = videoRef.current;
            
            if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
              console.log('Video not ready:', {
                context: !!context,
                readyState: video?.readyState,
                HAVE_ENOUGH_DATA: video?.HAVE_ENOUGH_DATA
              });
              return;
            }

            // Set canvas size to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Draw current video frame to canvas
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Detect QR codes in the frame
            const barcodes = await detector.detect(canvas);
            
            if (barcodes.length > 0 && !isProcessing) {
              const qrData = barcodes[0].rawValue;
              console.log('QR Code detected with BarcodeDetector:', qrData);
              setIsProcessing(true);
              handleScanResult(qrData);
              return; // Stop scanning after detection
            }
          } catch (detectError) {
            console.warn('BarcodeDetector error:', detectError);
          }
        };

        // Start continuous scanning
        console.log('Starting BarcodeDetector scanning interval');
        scanIntervalRef.current = setInterval(scanFrame, 500); // Scan every 500ms
        
      } else {
        // Fallback to jsQR for Safari/Firefox and other browsers
        console.log('BarcodeDetector not supported, using jsQR fallback');
        const jsQR = (await import('jsqr')).default;
        
        const scanFrame = async () => {
          if (!videoRef.current || !canvasRef.current || !streamRef.current) return;
          
          try {
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            const video = videoRef.current;
            
            if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
              console.log('jsQR: Video not ready:', {
                context: !!context,
                readyState: video?.readyState,
                HAVE_ENOUGH_DATA: video?.HAVE_ENOUGH_DATA
              });
              return;
            }

            // Set canvas size to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Draw current video frame to canvas
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Get image data for jsQR
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            // Detect QR codes using jsQR
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });
            
            if (code && !isProcessing) {
              console.log('QR Code detected with jsQR:', code.data);
              setIsProcessing(true);
              handleScanResult(code.data);
              return; // Stop scanning after detection
            }
          } catch (detectError) {
            console.warn('jsQR detection error:', detectError);
          }
        };

        // Start continuous scanning
        console.log('Starting jsQR scanning interval');
        scanIntervalRef.current = setInterval(scanFrame, 300); // Scan every 300ms for better responsiveness
        
        toast({
          title: "QR Scanner Active",
          description: "Position QR code within the frame to scan",
          variant: "default",
        });
      }
    } catch (error) {
      console.error('Failed to start QR detection:', error);
      toast({
        title: "Scanner Error",
        description: "Unable to start QR detection. Try refreshing the page.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    setIsScanning(false);
    setFlashEnabled(false);
    setIsProcessing(false);
  };

  const handleScanResult = (data: string) => {
    // Prevent duplicate scans
    if (data === lastScannedCode) return;
    setLastScannedCode(data);

    console.log("QR Code scanned:", data);

    // Check if it's a Superfan tap-in URL
    try {
      // First check if it's a relative path
      if (data.startsWith('/tap')) {
        console.log("Navigating to tap-in URL:", data);
        stopCamera();
        onClose();
        
        // Use setTimeout to prevent any race conditions with camera cleanup
        setTimeout(() => {
          try {
            router.push(data);
            toast({
              title: "QR Code detected! 📱",
              description: "Processing your tap-in...",
            });
          } catch (navError) {
            console.error("Navigation error:", navError);
            toast({
              title: "Navigation failed",
              description: "Please try again",
              variant: "destructive",
            });
          }
        }, 100);
        return;
      }
      
      // Then check if it's an absolute URL
      const url = new URL(data);
      // Validate it's a trusted domain
      const trustedDomains = ['superfan.one', 'app.superfan.one', 'localhost'];
      const hostname = url.hostname.replace('www.', '');
      
      if (trustedDomains.includes(hostname) && url.pathname === '/tap') {
        // It's a tap-in QR code
        console.log("Navigating to external tap-in URL:", url.toString());
        stopCamera();
        onClose();
        
        // Navigate to the tap-in URL safely with error handling
        setTimeout(() => {
          try {
            window.location.href = url.toString();
            toast({
              title: "QR Code detected! 📱",
              description: "Processing your tap-in...",
            });
          } catch (navError) {
            console.error("External navigation error:", navError);
            toast({
              title: "Navigation failed",
              description: "Please try again",
              variant: "destructive",
            });
          }
        }, 100);
        
        return;
      }
    } catch (e) {
      // Not a valid URL, continue to check if custom handler exists
      console.warn("Invalid URL in QR code:", data);
    }

    // Handle other QR codes or call custom handler
    if (onScan) {
      onScan(data);
    } else {
      toast({
        title: "QR Code scanned",
        description: "This doesn't appear to be a Superfan tap-in code",
        variant: "destructive",
      });
    }

    // Prevent re-scanning the same code for 3 seconds
    scanTimeoutRef.current = setTimeout(() => {
      setLastScannedCode(null);
    }, 3000);
  };

  const toggleFlash = async () => {
    if (!stream) return;

    try {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;

      if (!capabilities.torch) {
        toast({
          title: "Flash unavailable",
          description: "This device doesn't support camera flash",
          variant: "destructive",
        });
        return;
      }

      await track.applyConstraints({
        advanced: [{ torch: !flashEnabled } as any]
      });
      
      setFlashEnabled(!flashEnabled);
    } catch (err) {
      console.error("Flash toggle error:", err);
      toast({
        title: "Flash unavailable",
        description: "Failed to toggle camera flash",
        variant: "destructive",
      });
    }
  };

  const requestPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      setHasPermission(true);
      startCamera();
    } catch (err) {
      setHasPermission(false);
      setError("Camera permission denied. Please allow camera access to scan QR codes.");
    }
  };

  // Don't render during SSR to prevent hydration mismatches
  if (!isClient) return null;
  
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="fixed inset-0 bg-black"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <QrCode className="h-6 w-6 text-white mr-2" />
                <h2 className="text-lg font-semibold text-white">Scan QR Code</h2>
              </div>
              
              <div className="flex items-center space-x-2">
                {isScanning && (
                  <button
                    onClick={toggleFlash}
                    className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  >
                    {flashEnabled ? (
                      <FlashlightOff className="h-5 w-5" />
                    ) : (
                      <Flashlight className="h-5 w-5" />
                    )}
                  </button>
                )}
                
                <button
                  onClick={onClose}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Scanner Content */}
          <div className="flex flex-col items-center justify-center h-full p-4">
            
            {hasPermission === false || error ? (
              <div className="text-center max-w-sm">
                <div className="mb-6">
                  <Camera className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {error?.includes('not available') ? 'QR Scanner Unavailable' : 'Camera Access Required'}
                  </h3>
                  <p className="text-gray-400">
                    {error || "Please allow camera access to scan QR codes"}
                  </p>
                </div>
                
                {!error?.includes('not available') && !error?.includes('library') ? (
                  <button
                    onClick={requestPermission}
                    className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Enable Camera
                  </button>
                ) : (
                  <div className="text-sm text-gray-500">
                    <p>Camera QR scanning is temporarily unavailable.</p>
                    <p>Look for QR codes at events and tap them directly.</p>
                    <p className="mt-2 text-xs">QR codes will redirect to the tap-in page automatically.</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Camera Feed */}
                <div className="relative w-full max-w-sm aspect-square">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover rounded-lg"
                    playsInline
                    muted
                  />
                  
                  {/* Scanning Overlay */}
                  <div className="absolute inset-0 border-2 border-white/30 rounded-lg">
                    {/* Corner markers */}
                    <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-primary"></div>
                    <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-primary"></div>
                    <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-primary"></div>
                    <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-primary"></div>
                    
                    {/* Scanning line animation */}
                    {isScanning && (
                      <motion.div
                        className="absolute left-0 right-0 h-0.5 bg-primary shadow-lg shadow-primary/50"
                        animate={{ y: ['0%', '100%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      />
                    )}
                  </div>
                  
                  {!isScanning && hasPermission === true && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                      <div className="text-center">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        >
                          <Zap className="h-8 w-8 text-primary mx-auto mb-2" />
                        </motion.div>
                        <p className="text-white text-sm">Starting camera...</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Hidden canvas for QR detection */}
                  <canvas
                    ref={canvasRef}
                    className="hidden"
                    width="640"
                    height="480"
                  />
                </div>
                
                {/* Instructions */}
                <div className="mt-6 text-center max-w-sm">
                  <p className="text-gray-400 text-sm">
                    {isProcessing ? "Processing QR code..." : "Position the QR code within the frame"}
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    Automatic detection is active - hold steady for best results
                  </p>
                  <div className="mt-4 p-3 bg-green-500/20 rounded-lg border border-green-500/30">
                    <p className="text-green-400 text-xs">
                      ✨ QR codes will be detected automatically and award points instantly
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="text-center">
              <p className="text-gray-400 text-xs">
                Scan Superfan QR codes to earn points and unlock perks
              </p>
            </div>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
