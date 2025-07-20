import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  QrCode, 
  Download, 
  Printer, 
  Copy,
  Settings,
  FileImage,
  Grid3X3,
  Zap
} from 'lucide-react';
import QRCode from 'qrcode';

interface QRCodeGeneratorProps {
  equipmentId?: string;
  assetTag?: string;
  onGenerate?: (qrData: string) => void;
}

interface QROptions {
  size: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  foregroundColor: string;
  backgroundColor: string;
  includeText: boolean;
  format: 'PNG' | 'SVG';
}

const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({
  equipmentId,
  assetTag,
  onGenerate
}) => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrData, setQrData] = useState(assetTag || '');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [options, setOptions] = useState<QROptions>({
    size: 256,
    errorCorrectionLevel: 'M',
    foregroundColor: '#000000',
    backgroundColor: '#FFFFFF',
    includeText: true,
    format: 'PNG'
  });

  const generateQRCode = async () => {
    if (!qrData.trim()) {
      toast({
        title: 'Missing Data',
        description: 'Please enter data to encode in the QR code',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Generate QR code options
      const qrOptions = {
        errorCorrectionLevel: options.errorCorrectionLevel,
        type: 'image/png' as const,
        quality: 0.92,
        margin: 2,
        color: {
          dark: options.foregroundColor,
          light: options.backgroundColor,
        },
        width: options.size,
      };

      if (options.format === 'PNG') {
        // Generate PNG format
        const dataUrl = await QRCode.toDataURL(qrData, qrOptions);
        setQrDataUrl(dataUrl);

        // Also draw to canvas for additional operations
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          img.onload = () => {
            canvas.width = options.size;
            canvas.height = options.includeText ? options.size + 40 : options.size;
            
            // Clear canvas
            ctx!.fillStyle = options.backgroundColor;
            ctx!.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw QR code
            ctx!.drawImage(img, 0, 0, options.size, options.size);
            
            // Add text label if enabled
            if (options.includeText) {
              ctx!.fillStyle = options.foregroundColor;
              ctx!.font = '14px Arial, sans-serif';
              ctx!.textAlign = 'center';
              ctx!.fillText(qrData, options.size / 2, options.size + 25);
            }
          };
          
          img.src = dataUrl;
        }
      } else {
        // Generate SVG format
        const svgString = await QRCode.toString(qrData, { 
          ...qrOptions, 
          type: 'svg',
          width: options.size 
        });
        
        // Create data URL for SVG
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
        setQrDataUrl(svgDataUrl);
      }

      onGenerate?.(qrData);
      
      toast({
        title: 'QR Code Generated',
        description: `Successfully generated ${options.format} QR code for ${qrData}`,
      });
    } catch (error) {
      console.error('QR Code generation error:', error);
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate QR code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadQRCode = () => {
    if (!qrDataUrl) return;

    const link = document.createElement('a');
    link.download = `qr-code-${qrData.replace(/[^a-zA-Z0-9]/g, '-')}.${options.format.toLowerCase()}`;
    link.href = qrDataUrl;
    link.click();

    toast({
      title: 'Download Started',
      description: 'QR code download initiated',
    });
  };

  const copyToClipboard = async () => {
    if (!qrDataUrl) return;

    try {
      // Convert data URL to blob
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      
      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);

      toast({
        title: 'Copied to Clipboard',
        description: 'QR code image copied to clipboard',
      });
    } catch (error) {
      console.error('Copy failed:', error);
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy QR code to clipboard',
        variant: 'destructive',
      });
    }
  };

  const printQRCode = () => {
    if (!qrDataUrl) return;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>QR Code - ${qrData}</title>
            <style>
              body { 
                margin: 0; 
                padding: 20px; 
                display: flex; 
                flex-direction: column;
                align-items: center; 
                font-family: Arial, sans-serif; 
              }
              img { 
                max-width: 100%; 
                height: auto; 
                border: 1px solid #ccc;
                margin-bottom: 10px;
              }
              .label {
                font-size: 14px;
                font-weight: bold;
                text-align: center;
              }
              @media print {
                body { margin: 0; padding: 10mm; }
              }
            </style>
          </head>
          <body>
            <img src="${qrDataUrl}" alt="QR Code for ${qrData}" />
            <div class="label">${qrData}</div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }

    toast({
      title: 'Print Dialog Opened',
      description: 'QR code sent to printer',
    });
  };

  const generateBatch = () => {
    // This could be extended to generate multiple QR codes for equipment in bulk
    toast({
      title: 'Batch Generation',
      description: 'Batch QR code generation feature coming soon',
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Code Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Data Input */}
          <div>
            <label className="text-sm font-medium">Data to Encode</label>
            <Input
              value={qrData}
              onChange={(e) => setQrData(e.target.value)}
              placeholder="Enter asset tag, equipment ID, or custom data..."
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This will be encoded in the QR code and displayed when scanned
            </p>
          </div>

          {/* Generation Options */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Size (pixels)</label>
              <Select value={options.size.toString()} onValueChange={(value) => 
                setOptions(prev => ({ ...prev, size: parseInt(value) }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="128">128x128</SelectItem>
                  <SelectItem value="256">256x256</SelectItem>
                  <SelectItem value="512">512x512</SelectItem>
                  <SelectItem value="1024">1024x1024</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Error Correction</label>
              <Select value={options.errorCorrectionLevel} onValueChange={(value: 'L' | 'M' | 'Q' | 'H') => 
                setOptions(prev => ({ ...prev, errorCorrectionLevel: value }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">Low (~7%)</SelectItem>
                  <SelectItem value="M">Medium (~15%)</SelectItem>
                  <SelectItem value="Q">Quartile (~25%)</SelectItem>
                  <SelectItem value="H">High (~30%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Foreground Color</label>
              <Input
                type="color"
                value={options.foregroundColor}
                onChange={(e) => setOptions(prev => ({ ...prev, foregroundColor: e.target.value }))}
                className="h-10"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Background Color</label>
              <Input
                type="color"
                value={options.backgroundColor}
                onChange={(e) => setOptions(prev => ({ ...prev, backgroundColor: e.target.value }))}
                className="h-10"
              />
            </div>
          </div>

          {/* Additional Options */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={options.includeText}
                onChange={(e) => setOptions(prev => ({ ...prev, includeText: e.target.checked }))}
                className="rounded"
              />
              Include text label
            </label>

            <Select value={options.format} onValueChange={(value: 'PNG' | 'SVG') => 
              setOptions(prev => ({ ...prev, format: value }))
            }>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PNG">PNG</SelectItem>
                <SelectItem value="SVG">SVG</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Generate Button */}
          <Button
            onClick={generateQRCode}
            disabled={isGenerating || !qrData.trim()}
            className="w-full"
          >
            <Zap className="h-4 w-4 mr-2" />
            {isGenerating ? 'Generating...' : 'Generate QR Code'}
          </Button>
        </CardContent>
      </Card>

      {/* Generated QR Code Display */}
      {qrDataUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Generated QR Code</span>
              <Badge variant="outline">{options.format}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Code Preview */}
            <div className="flex justify-center">
              <div className="border rounded-lg p-4 bg-white">
                <img 
                  src={qrDataUrl} 
                  alt={`QR Code for ${qrData}`}
                  className="max-w-full h-auto"
                  style={{ maxWidth: '300px' }}
                />
                {options.includeText && (
                  <p className="text-center mt-2 text-sm font-medium">{qrData}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                onClick={downloadQRCode}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>

              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>

              <Button
                onClick={printQRCode}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>

              <Button
                onClick={generateBatch}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <Grid3X3 className="h-4 w-4" />
                Batch
              </Button>
            </div>

            {/* Hidden canvas for additional operations */}
            <canvas
              ref={canvasRef}
              style={{ display: 'none' }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default QRCodeGenerator;