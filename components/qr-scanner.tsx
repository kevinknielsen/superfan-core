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
  const scannerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  // Dynamic import for qr-scanner (browser-only)
  const [QrScannerLib, setQrScannerLib] = useState<any>(null);
  const [scannerInitialized, setScannerInitialized] = useState(false);

  // Ensure client-side rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && typeof window !== 'undefined' && isOpen && !scannerInitialized) {
      // Only load QR scanner when actually needed and not already initialized
      let mounted = true;
      
      const loadScanner = async () => {
        try {
          console.log('Loading QR scanner library...');
          const QrScannerModule = await import('qr-scanner');
          
          if (!mounted) return; // Component unmounted
          
          console.log('QR Scanner module loaded:', QrScannerModule);
          
          // Handle different export patterns safely
          let Scanner;
          if (QrScannerModule.default && typeof QrScannerModule.default === 'function') {
            Scanner = QrScannerModule.default;
          } else if (typeof QrScannerModule === 'function') {
            Scanner = QrScannerModule;
          } else if ((QrScannerModule as any).QrScanner && typeof (QrScannerModule as any).QrScanner === 'function') {
            Scanner = (QrScannerModule as any).QrScanner;
          } else {
            console.error('QR Scanner exports:', Object.keys(QrScannerModule));
            throw new Error('QR Scanner constructor not found in module exports');
          }
          
          // Test the constructor before setting it
          try {
            // Don't actually create an instance, just verify the constructor exists
            if (typeof Scanner !== 'function') {
              throw new Error('Scanner is not a constructor function');
            }
            
            setQrScannerLib(Scanner);
            setScannerInitialized(true);
            console.log('QR Scanner library successfully loaded');
          } catch (testError) {
            console.error('Scanner constructor test failed:', testError);
            throw new Error('QR scanner constructor validation failed');
          }
        } catch (error) {
          console.log('QR scanner disabled:', error instanceof Error ? error.message : 'Unknown error');
          if (mounted) {
            setError('QR scanner library not compatible with this environment');
          }
        }
      };
      
      loadScanner();
      
      return () => {
        mounted = false;
      };
    }
  }, [isClient, isOpen, scannerInitialized]);

  // Start camera when scanner opens
  useEffect(() => {
    if (isOpen && QrScannerLib) {
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isOpen, QrScannerLib]);

  const startScanning = async () => {
    if (!QrScannerLib || !videoRef.current) {
      console.log('QR Scanner not ready:', { QrScannerLib: !!QrScannerLib, videoRef: !!videoRef.current });
      return;
    }

    try {
      setError(null);
      setIsScanning(true);

      // Check if QrScannerLib has the required methods
      if (typeof QrScannerLib.hasCamera !== 'function') {
        throw new Error('QR Scanner library not properly loaded');
      }

      // Check camera permission
      const hasCamera = await QrScannerLib.hasCamera();
      if (!hasCamera) {
        throw new Error("No camera found on this device");
      }

      // Start QR scanner with error handling
      let qrScanner;
      try {
        console.log('Initializing QR scanner...');
        qrScanner = new QrScannerLib(
          videoRef.current,
          (result: any) => handleScanResult(result.data),
          {
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
          }
        );
        console.log('QR scanner initialized successfully');
      } catch (constructorError) {
        console.error('QR scanner constructor error:', constructorError);
        throw new Error('Failed to initialize QR scanner - library incompatible');
      }

      await qrScanner.start();
      setHasPermission(true);
      
      // Store scanner reference for cleanup
      scannerRef.current = qrScanner;

    } catch (err) {
      console.error("QR Scanner error:", err);
      setHasPermission(false);
      setError(err instanceof Error ? err.message : "Failed to start camera");
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    
    setIsScanning(false);
    setFlashEnabled(false);
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
        stopScanning();
        onClose();
        router.push(data);
        toast({
          title: "QR Code detected! 📱",
          description: "Processing your tap-in...",
        });
        return;
      }
      
      // Then check if it's an absolute URL
      const url = new URL(data);
      // Validate it's a trusted domain
      const trustedDomains = ['superfan.one', 'app.superfan.one', 'localhost'];
      const hostname = url.hostname.replace('www.', '');
      
      if (trustedDomains.includes(hostname) && url.pathname === '/tap') {
        // It's a tap-in QR code
        stopScanning();
        onClose();
        
        // Navigate to the tap-in URL safely
        window.location.href = url.toString();
        
        toast({
          title: "QR Code detected! 📱",
          description: "Processing your tap-in...",
        });
        
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
    if (!scannerRef.current) return;

    try {
      if (flashEnabled) {
        await scannerRef.current.turnFlashOff();
        setFlashEnabled(false);
      } else {
        await scannerRef.current.turnFlashOn();
        setFlashEnabled(true);
      }
    } catch (err) {
      console.error("Flash toggle error:", err);
      toast({
        title: "Flash unavailable",
        description: "This device doesn't support camera flash",
        variant: "destructive",
      });
    }
  };

  const requestPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      setHasPermission(true);
      startScanning();
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
            
            {hasPermission === false || error || !QrScannerLib ? (
              <div className="text-center max-w-sm">
                <div className="mb-6">
                  <Camera className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {error?.includes('not available') || !QrScannerLib ? 'QR Scanner Unavailable' : 'Camera Access Required'}
                  </h3>
                  <p className="text-gray-400">
                    {error || (!QrScannerLib ? "QR scanner is loading..." : "Please allow camera access to scan QR codes")}
                  </p>
                </div>
                
                {!error?.includes('not available') && !error?.includes('library') && QrScannerLib ? (
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
                </div>
                
                {/* Instructions */}
                <div className="mt-6 text-center max-w-sm">
                  <p className="text-gray-400 text-sm">
                    Position the QR code within the frame to scan
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    Look for QR codes at shows, events, or merch stands
                  </p>
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
