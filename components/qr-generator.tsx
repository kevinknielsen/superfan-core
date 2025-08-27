"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { QrCode, Download, Copy, Calendar, MapPin, Star, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import QRCodeLib from "qrcode";
import { getAccessToken } from "@privy-io/react-auth";

interface QRPayloadData {
  club_id: string;
  source: string;
  location?: string;
  points?: number;
  expires_at?: string;
  metadata?: {
    description?: string;
    generated_by?: string;
    club_name?: string;
  };
}

interface QRData {
  qr_id: string;
  qr_url: string;
  qr_data: QRPayloadData;
  tap_url: string;
  expires_at?: string;
  created_at: string;
}

interface QRGeneratorProps {
  clubId: string;
  clubName: string;
  onGenerated?: (qrData: QRData) => void;
}

const QR_SOURCES = [
  { value: 'show_entry', label: 'Show Entry', icon: Star, points: 100 },
  { value: 'merch_purchase', label: 'Merch Purchase', icon: Users, points: 50 },
  { value: 'event', label: 'Event Check-in', icon: Calendar, points: 40 },
  { value: 'location', label: 'Location Visit', icon: MapPin, points: 20 },
  { value: 'qr_code', label: 'General QR', icon: QrCode, points: 20 },
];

export default function QRGenerator({ clubId, clubName, onGenerated }: QRGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<QRData | null>(null);
  const [qrCodeImage, setQRCodeImage] = useState<string | null>(null);
  const { toast } = useToast();

  // Form state
  const [source, setSource] = useState('show_entry');
  const [location, setLocation] = useState('');
  const [customPoints, setCustomPoints] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [description, setDescription] = useState('');

  const generateQR = async () => {
    setIsGenerating(true);

    try {
      const qrPayload = {
        club_id: clubId,
        source,
        location: location || undefined,
        points: customPoints ? parseInt(customPoints) : undefined,
        expires_at: expiresAt || undefined,
        metadata: {
          description,
          generated_by: 'admin',
          club_name: clubName,
        }
      };

      // Get auth token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch('/api/qr/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(qrPayload),
      });

      if (!response.ok) {
        let errorData: { error?: string };
        try {
          errorData = await response.json() as { error?: string };
        } catch {
          errorData = { error: 'Invalid response from server' };
        }
        throw new Error(errorData.error || 'Failed to generate QR code');
      }

      let qrData: QRData;
      try {
        qrData = await response.json() as QRData;
      } catch {
        throw new Error('Invalid response format from server');
      }
      setGeneratedQR(qrData);

      // Generate QR code image
      const qrImageUrl = await QRCodeLib.toDataURL(qrData.qr_url, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      });
      setQRCodeImage(qrImageUrl);

      if (onGenerated) {
        onGenerated(qrData);
      }

      toast({
        title: "QR Code generated! 📱",
        description: `Created ${source.replace(/_/g, ' ')} QR for ${clubName}`,
      });

    } catch (error) {
      console.error("QR generation error:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
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

  const downloadQR = () => {
    if (!qrCodeImage) return;

    const link = document.createElement('a');
    link.download = `${clubName}-${source}-qr.png`;
    link.href = qrCodeImage;
    link.click();

    toast({
      title: "QR Code downloaded! 💾",
      description: "Image saved to your device",
    });
  };

  const getSourceInfo = (sourceValue: string) => {
    return QR_SOURCES.find(s => s.value === sourceValue) || QR_SOURCES[0];
  };

  return (
    <div className="space-y-6">
      
      {/* Generator Form */}
      <div className="bg-[#0F141E] rounded-xl p-6 border border-[#1E1E32]/20">
        <h3 className="text-lg font-semibold mb-4">Generate QR Code</h3>
        
        <div className="space-y-4">
          {/* Source Type */}
          <div>
            <Label htmlFor="source">QR Type</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select QR type" />
              </SelectTrigger>
              <SelectContent>
                {QR_SOURCES.map((sourceOption) => {
                  const IconComponent = sourceOption.icon;
                  return (
                    <SelectItem key={sourceOption.value} value={sourceOption.value}>
                      <div className="flex items-center">
                        <IconComponent className="h-4 w-4 mr-2" />
                        <span>{sourceOption.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          +{sourceOption.points}pts
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="location">Location (optional)</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., The Echo, Los Angeles"
            />
          </div>

          {/* Custom Points */}
          <div>
            <Label htmlFor="customPoints">Custom Points (optional)</Label>
            <Input
              id="customPoints"
              type="number"
              value={customPoints}
              onChange={(e) => setCustomPoints(e.target.value)}
              placeholder={`Default: ${getSourceInfo(source).points} points`}
            />
          </div>

          {/* Expiration */}
          <div>
            <Label htmlFor="expiresAt">Expires At (optional)</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal description for tracking"
              rows={2}
            />
          </div>

          <Button
            onClick={generateQR}
            disabled={isGenerating}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <QrCode className="h-4 w-4 mr-2" />
                Generate QR Code
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Generated QR Code */}
      {generatedQR && qrCodeImage && (
        <motion.div
          className="bg-[#0F141E] rounded-xl p-6 border border-[#1E1E32]/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="text-lg font-semibold mb-4">Generated QR Code</h3>
          
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* QR Code Image */}
            <div className="flex-shrink-0">
              <div className="bg-white p-4 rounded-lg inline-block">
                <img
                  src={qrCodeImage}
                  alt="Generated QR Code"
                  className="w-48 h-48"
                />
              </div>
              
              <div className="mt-4 space-y-2">
                <Button
                  onClick={downloadQR}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download QR
                </Button>
              </div>
            </div>
            
            {/* QR Code Details */}
            <div className="flex-1 space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <div className="font-medium capitalize">
                    {getSourceInfo(generatedQR.qr_data.source).label}
                  </div>
                </div>
                
                <div>
                  <span className="text-muted-foreground">Points:</span>
                  <div className="font-medium">
                    {generatedQR.qr_data.points || getSourceInfo(generatedQR.qr_data.source).points} points
                  </div>
                </div>
                
                {generatedQR.qr_data.location && (
                  <div>
                    <span className="text-muted-foreground">Location:</span>
                    <div className="font-medium">{generatedQR.qr_data.location}</div>
                  </div>
                )}
                
                {generatedQR.expires_at && (
                  <div>
                    <span className="text-muted-foreground">Expires:</span>
                    <div className="font-medium">
                      {new Date(generatedQR.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>

              {/* URLs */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Tap-in URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={generatedQR.tap_url}
                      readOnly
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(generatedQR.tap_url, "Tap-in URL")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Full QR URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={generatedQR.qr_url}
                      readOnly
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(generatedQR.qr_url, "QR URL")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-primary/10 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong>Usage:</strong> Place this QR code at your event, venue, or merchandise stand. 
                  Fans can scan it with their camera or the Superfan app to earn points and increase their status.
                </p>
              </div>
              
            </div>
          </div>
        </motion.div>
      )}
      
    </div>
  );
}
