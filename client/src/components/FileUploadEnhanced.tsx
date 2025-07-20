import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  Camera, 
  FileImage, 
  X, 
  CheckCircle,
  AlertCircle,
  File
} from 'lucide-react';

interface FileUploadEnhancedProps {
  onFilesSelected?: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  maxSize?: number; // in bytes
  maxFiles?: number;
  showCamera?: boolean;
  className?: string;
}

interface UploadedFile {
  file: File;
  id: string;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  preview?: string;
}

const FileUploadEnhanced: React.FC<FileUploadEnhancedProps> = ({
  onFilesSelected,
  multiple = true,
  accept = 'image/*,application/pdf,.doc,.docx',
  maxSize = 10 * 1024 * 1024, // 10MB
  maxFiles = 10,
  showCamera = true,
  className = ''
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize) {
      return `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`;
    }
    return null;
  };

  const createFilePreview = (file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      } else {
        resolve(undefined);
      }
    });
  };

  const processFiles = async (files: File[]) => {
    const validFiles: File[] = [];
    const newUploadedFiles: UploadedFile[] = [];

    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        toast({
          title: 'File Error',
          description: `${file.name}: ${error}`,
          variant: 'destructive',
        });
        continue;
      }

      if (uploadedFiles.length + validFiles.length >= maxFiles) {
        toast({
          title: 'Too Many Files',
          description: `Maximum ${maxFiles} files allowed`,
          variant: 'destructive',
        });
        break;
      }

      validFiles.push(file);
      const preview = await createFilePreview(file);
      
      newUploadedFiles.push({
        file,
        id: generateId(),
        status: 'uploading',
        progress: 0,
        preview,
      });
    }

    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...newUploadedFiles]);
      
      // Simulate upload progress
      newUploadedFiles.forEach((uploadedFile, index) => {
        simulateUpload(uploadedFile.id, index * 200);
      });

      onFilesSelected?.(validFiles);
    }
  };

  const simulateUpload = (fileId: string, delay: number = 0) => {
    setTimeout(() => {
      const interval = setInterval(() => {
        setUploadedFiles(prev => 
          prev.map(file => {
            if (file.id === fileId && file.status === 'uploading') {
              const newProgress = Math.min(file.progress + Math.random() * 30, 100);
              if (newProgress >= 100) {
                clearInterval(interval);
                return { ...file, status: 'success', progress: 100 };
              }
              return { ...file, progress: newProgress };
            }
            return file;
          })
        );
      }, 100);
    }, delay);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processFiles(files);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return FileImage;
    return File;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload Area */}
      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          isDragOver 
            ? 'border-primary bg-primary/5' 
            : 'border-muted hover:border-primary/50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            
            <div>
              <h3 className="font-medium">Drop files here or click to upload</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Support for images, PDFs, and documents up to {Math.round(maxSize / 1024 / 1024)}MB
              </p>
            </div>

            <div className="flex justify-center space-x-2">
              <Button variant="outline" size="sm" type="button">
                <Upload className="w-4 h-4 mr-2" />
                Choose Files
              </Button>
              
              {showCamera && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraInputRef.current?.click();
                  }}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Camera
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={handleFileInput}
        className="hidden"
      />
      
      {showCamera && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
          className="hidden"
        />
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Uploaded Files ({uploadedFiles.length})</h4>
          <div className="space-y-2">
            {uploadedFiles.map((uploadedFile) => {
              const Icon = getFileIcon(uploadedFile.file);
              
              return (
                <div key={uploadedFile.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                  {/* File Preview/Icon */}
                  <div className="flex-shrink-0">
                    {uploadedFile.preview ? (
                      <img 
                        src={uploadedFile.preview} 
                        alt="Preview" 
                        className="w-10 h-10 object-cover rounded"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadedFile.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(uploadedFile.file.size / 1024).toFixed(1)} KB
                    </p>
                    
                    {/* Progress Bar */}
                    {uploadedFile.status === 'uploading' && (
                      <div className="mt-1">
                        <Progress value={uploadedFile.progress} className="h-1" />
                      </div>
                    )}
                  </div>

                  {/* Status Icon */}
                  <div className="flex-shrink-0 flex items-center space-x-2">
                    {uploadedFile.status === 'uploading' && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    )}
                    {uploadedFile.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    )}
                    {uploadedFile.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadedFile.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploadEnhanced;