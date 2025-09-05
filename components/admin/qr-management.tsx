"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { QrCode, Plus, Download, Copy, Eye, Calendar, MapPin, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useClubs } from "@/hooks/use-clubs";
import QRGenerator from "@/components/qr-generator";
import type { Club } from "@/types/club.types";
import { getAccessToken } from "@privy-io/react-auth";

interface QRCode {
  qr_id: string;
  qr_url: string;
  qr_data: any;
  tap_url: string;
  expires_at?: string;
  created_at: string;
  club_name: string;
}

export default function QRManagement() {
  const { toast } = useToast();
  const [selectedClub, setSelectedClub] = useState<string>("");
  const [generatedQRs, setGeneratedQRs] = useState<QRCode[]>([]);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [isLoadingQRs, setIsLoadingQRs] = useState(false);
  
  // Load clubs for selection
  const { data: clubs = [], isLoading: clubsLoading } = useClubs();
  const activeClubs = clubs.filter(club => club.is_active);

  useEffect(() => {
    // Auto-select first club if available and none selected
    if (activeClubs.length > 0 && !selectedClub) {
      setSelectedClub(activeClubs[0].id);
    }
  }, [activeClubs, selectedClub]);

  // Load QR codes when club changes
  useEffect(() => {
    if (selectedClub) {
      loadQRCodes();
    }
  }, [selectedClub]);

  const loadQRCodes = async () => {
    if (!selectedClub) return;

    setIsLoadingQRs(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`/api/qr/generate?club_id=${selectedClub}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load QR codes');
      }

      const data = await response.json();
      
      // Safely validate the response structure
      if (data && typeof data === 'object' && Array.isArray(data.qr_codes)) {
        // Filter and validate QR codes
        const validQRs = data.qr_codes.filter((qr: any) => 
          qr && 
          typeof qr === 'object' && 
          qr.qr_id && 
          qr.qr_url && 
          qr.tap_url &&
          qr.club_name
        );
        setGeneratedQRs(validQRs);
      } else {
        console.warn('Invalid QR codes response format:', data);
        setGeneratedQRs([]);
      }
      
    } catch (error) {
      console.error('Error loading QR codes:', error);
      setGeneratedQRs([]); // Fallback to empty array on error
      toast({
        title: "Failed to load QR codes",
        description: "Please try refreshing the page",
        variant: "destructive",
      });
    } finally {
      setIsLoadingQRs(false);
    }
  };

  const handleQRGenerated = (qrData: any) => {
    // Refresh the QR codes list from database
    loadQRCodes();
    
    const selectedClubData = activeClubs.find(c => c.id === selectedClub);
    toast({
      title: "QR Code Generated! 📱",
      description: `New QR code created for ${selectedClubData?.name}`,
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the text manually",
        variant: "destructive",
      });
    }
  };

  const downloadQR = async (qrUrl: string, qrId: string) => {
    try {
      // Generate QR code image and download
      const QR = await import('qrcode');
      const toDataURL = (QR as any).toDataURL ?? (QR as any).default?.toDataURL;
      if (!toDataURL) throw new Error('QR code library not loaded');
      const qrImageUrl = await toDataURL(qrUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      });

      const link = document.createElement('a');
      link.download = `superfan-qr-${qrId}.png`;
      link.href = qrImageUrl;
      link.click();

      toast({
        title: "QR Code downloaded! 💾",
        description: "Image saved to your device",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Unable to generate QR image",
        variant: "destructive",
      });
    }
  };

  if (clubsLoading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
            <div className="h-32 bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeClubs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <QrCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Active Clubs</h3>
          <p className="text-muted-foreground">
            Create or activate clubs first to generate QR codes
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">QR Code Management</h2>
          <p className="text-muted-foreground">
            Generate and manage QR codes for club events and tap-ins
          </p>
        </div>
      </div>

      {/* Club Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Generate New QR Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <label className="text-sm font-medium mb-2 block">Select Club</label>
            <Select value={selectedClub} onValueChange={setSelectedClub}>
              <SelectTrigger className="w-full md:w-96">
                <SelectValue placeholder="Choose a club..." />
              </SelectTrigger>
              <SelectContent>
                {activeClubs.map((club, index) => (
                  <SelectItem key={club.id || `club-${index}`} value={club.id}>
                    <div className="flex items-center gap-2">
                      <span>{club.name}</span>
                      {club.city && (
                        <Badge variant="outline" className="text-xs">
                          {club.city}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClub && (
            <QRGenerator
              clubId={selectedClub}
              clubName={activeClubs.find(c => c.id === selectedClub)?.name || ''}
              onGenerated={handleQRGenerated}
            />
          )}
        </CardContent>
      </Card>

      {/* Generated QR Codes History */}
      {(generatedQRs.length > 0 || isLoadingQRs) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent QR Codes</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={loadQRCodes}
                disabled={isLoadingQRs}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingQRs ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingQRs ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="border rounded-lg p-4 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                      <div className="flex gap-2">
                        <div className="h-8 w-20 bg-muted rounded"></div>
                        <div className="h-8 w-20 bg-muted rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {generatedQRs.map((qr, index) => (
                <motion.div
                  key={qr.qr_id || `qr-${index}`}
                  className="border rounded-lg p-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {/* Mobile-first responsive layout */}
                  <div className="space-y-4">
                    {/* Header with badges */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <h4 className="font-medium text-lg uppercase">
                        {String(qr.qr_data?.source ?? 'QR').replace(/_/g, ' ')}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
                          {qr.club_name}
                        </Badge>
                        {qr.qr_data?.points != null && (
                          <Badge variant="secondary" className="text-xs">
                            +{qr.qr_data.points} points
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Details - stack on mobile */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                      {qr.qr_data?.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {qr.qr_data.location}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Created {new Date(qr.created_at).toLocaleDateString()}
                      </div>
                      {qr.expires_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Expires {new Date(qr.expires_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    
                    {/* Actions - full width on mobile, inline on desktop */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(qr.qr_url, "QR URL")}
                        className="flex-1 sm:flex-none justify-center"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy URL
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadQR(qr.qr_url, qr.qr_id)}
                        className="flex-1 sm:flex-none justify-center"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use QR Codes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</div>
            <div>
              <strong>Generate QR codes</strong> for specific events, locations, or merchandise stands
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</div>
            <div>
              <strong>Download and print</strong> the QR codes to place at venues or events
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</div>
            <div>
              <strong>Fans scan or tap</strong> the QR codes to earn points and progress their status
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">4</div>
            <div>
              <strong>Track engagement</strong> through the analytics dashboard
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
