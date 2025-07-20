import multer, { MulterError } from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response } from 'express';

// Define local multer types to avoid import issues
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}
import { storage } from '../storage';
import { notificationService } from './notification.service';

export interface FileUploadResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  fileType?: string;
  thumbnailPath?: string;
  error?: string;
}

export interface FileContext {
  workOrderId?: string;
  equipmentId?: string;
  pmTemplateId?: string;
  vendorId?: string;
  type: 'work_order' | 'equipment' | 'pm_template' | 'vendor_document';
  userId: string;
  warehouseId: string;
}

export class FileManagementService {
  private readonly uploadDir = process.env.UPLOAD_DIR || './uploads';
  private readonly thumbnailDir = path.join(this.uploadDir, 'thumbnails');
  private readonly maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'video/mp4',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  private multerStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        await this.ensureDirectoriesExist();
        cb(null, this.uploadDir);
      } catch (error) {
        cb(error as Error, '');
      }
    },
    filename: (req, file, cb) => {
      const uniqueId = uuidv4();
      const ext = path.extname(file.originalname);
      const filename = `${uniqueId}${ext}`;
      cb(null, filename);
    }
  });

  private upload = multer({
    storage: this.multerStorage,
    limits: {
      fileSize: this.maxFileSize,
      files: 10 // Max 10 files at once
    },
    fileFilter: (req, file, cb) => {
      if (this.allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} is not allowed`));
      }
    }
  });

  constructor() {
    this.initializeDirectories();
  }

  private async initializeDirectories(): Promise<void> {
    try {
      await this.ensureDirectoriesExist();
      console.log('File upload directories initialized');
    } catch (error) {
      console.error('Failed to initialize upload directories:', error);
    }
  }

  private async ensureDirectoriesExist(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.thumbnailDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create upload directories:', error);
      throw error;
    }
  }

  /**
   * Handle single file upload with compression and validation
   */
  async handleFileUpload(req: Request, res: Response): Promise<void> {
    const uploadMiddleware = this.upload.single('file');
    
    uploadMiddleware(req, res, async (error) => {
      try {
        if (error) {
          if (error instanceof MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({
                success: false,
                error: `File size exceeds ${Math.round(this.maxFileSize / 1024 / 1024)}MB limit`
              });
            }
          }
          return res.status(400).json({
            success: false,
            error: error.message || 'File upload failed'
          });
        }

        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'No file provided'
          });
        }

        const context = this.parseFileContext(req);
        if (!context) {
          return res.status(400).json({
            success: false,
            error: 'Invalid file context'
          });
        }

        const result = await this.processUploadedFile(req.file, context);
        
        if (result.success) {
          // Send real-time notification about new file
          await notificationService.sendNotification({
            id: uuidv4(),
            userId: context.userId,
            warehouseId: context.warehouseId,
            title: 'File Uploaded',
            message: `New file "${result.fileName}" has been uploaded`,
            type: 'info',
            read: false,
            createdAt: new Date(),
            data: {
              fileId: result.fileId,
              fileName: result.fileName,
              context: context.type
            }
          });

          res.status(201).json(result);
        } else {
          res.status(500).json(result);
        }
      } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error during file upload'
        });
      }
    });
  }

  /**
   * Handle multiple file uploads
   */
  async handleMultipleFileUpload(req: Request, res: Response): Promise<void> {
    const uploadMiddleware = this.upload.array('files', 10);
    
    uploadMiddleware(req, res, async (error) => {
      try {
        if (error) {
          return res.status(400).json({
            success: false,
            error: error.message || 'Multiple file upload failed'
          });
        }

        const files = req.files as MulterFile[];
        if (!files || files.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No files provided'
          });
        }

        const context = this.parseFileContext(req);
        if (!context) {
          return res.status(400).json({
            success: false,
            error: 'Invalid file context'
          });
        }

        const results: FileUploadResult[] = [];
        
        for (const file of files) {
          const result = await this.processUploadedFile(file, context);
          results.push(result);
        }

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        // Send notification for successful uploads
        if (successful.length > 0) {
          await notificationService.sendNotification({
            id: uuidv4(),
            userId: context.userId,
            warehouseId: context.warehouseId,
            title: 'Files Uploaded',
            message: `${successful.length} file(s) uploaded successfully${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
            type: failed.length > 0 ? 'warning' : 'info',
            read: false,
            createdAt: new Date(),
            data: {
              successful: successful.length,
              failed: failed.length,
              context: context.type
            }
          });
        }

        res.status(201).json({
          success: true,
          results,
          summary: {
            total: files.length,
            successful: successful.length,
            failed: failed.length
          }
        });
      } catch (error) {
        console.error('Multiple file upload error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error during multiple file upload'
        });
      }
    });
  }

  private parseFileContext(req: Request): FileContext | null {
    try {
      const contextString = req.body.context;
      const context = typeof contextString === 'string' ? JSON.parse(contextString) : contextString;
      
      const userId = req.headers['x-user-id'] as string;
      const warehouseId = req.headers['x-warehouse-id'] as string;

      if (!userId || !warehouseId) {
        throw new Error('Missing user or warehouse ID');
      }

      return {
        ...context,
        userId,
        warehouseId
      };
    } catch (error) {
      console.error('Failed to parse file context:', error);
      return null;
    }
  }

  private async processUploadedFile(file: MulterFile, context: FileContext): Promise<FileUploadResult> {
    try {
      let processedFilePath = file.path;
      let thumbnailPath: string | undefined;

      // Compress images
      if (file.mimetype.startsWith('image/')) {
        processedFilePath = await this.compressImage(file.path, file.mimetype);
        thumbnailPath = await this.generateThumbnail(processedFilePath, file.filename);
      }

      // Create attachment record in database
      const attachmentData = {
        id: uuidv4(),
        fileName: file.originalname,
        filePath: processedFilePath,
        fileSize: file.size,
        fileType: file.mimetype,
        thumbnailPath,
        workOrderId: context.workOrderId || null,
        equipmentId: context.equipmentId || null,
        pmTemplateId: context.pmTemplateId || null,
        vendorId: context.vendorId || null,
        uploadedBy: context.userId,
        warehouseId: context.warehouseId,
        createdAt: new Date()
      };

      const attachment = await storage.createAttachment(attachmentData);

      return {
        success: true,
        fileId: attachment.id,
        fileName: attachment.fileName,
        filePath: attachment.filePath,
        fileSize: attachment.fileSize,
        fileType: attachment.fileType,
        thumbnailPath: attachment.thumbnailPath
      };
    } catch (error) {
      console.error('Error processing uploaded file:', error);
      
      // Clean up file if processing failed
      try {
        await fs.unlink(file.path);
      } catch (cleanupError) {
        console.error('Failed to cleanup failed upload:', cleanupError);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'File processing failed'
      };
    }
  }

  private async compressImage(filePath: string, mimeType: string): Promise<string> {
    try {
      const outputPath = filePath.replace(/(\.[^.]+)$/, '_compressed$1');
      
      const sharpInstance = sharp(filePath);
      const metadata = await sharpInstance.metadata();
      
      // Compress based on image type and size
      let quality = 85;
      let maxWidth = 1920;
      let maxHeight = 1080;

      // Adjust compression based on file size and dimensions
      if (metadata.width && metadata.height) {
        const totalPixels = metadata.width * metadata.height;
        if (totalPixels > 2073600) { // > 1920x1080
          quality = 75;
          maxWidth = 1920;
          maxHeight = 1080;
        }
      }

      await sharpInstance
        .resize(maxWidth, maxHeight, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .jpeg({ quality })
        .toFile(outputPath);

      // Remove original file and rename compressed
      await fs.unlink(filePath);
      await fs.rename(outputPath, filePath);

      return filePath;
    } catch (error) {
      console.error('Image compression failed:', error);
      return filePath; // Return original path if compression fails
    }
  }

  private async generateThumbnail(filePath: string, filename: string): Promise<string> {
    try {
      const thumbnailFilename = `thumb_${filename}`;
      const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);

      await sharp(filePath)
        .resize(200, 200, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      return thumbnailPath;
    } catch (error) {
      console.error('Thumbnail generation failed:', error);
      return '';
    }
  }

  /**
   * Delete file and thumbnail
   */
  async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const attachment = await storage.getAttachmentById(fileId);
      if (!attachment) {
        return { success: false, error: 'File not found' };
      }

      // Delete physical files
      try {
        await fs.unlink(attachment.filePath);
      } catch (error) {
        console.warn('Failed to delete main file:', error);
      }

      if (attachment.thumbnailPath) {
        try {
          await fs.unlink(attachment.thumbnailPath);
        } catch (error) {
          console.warn('Failed to delete thumbnail:', error);
        }
      }

      // Delete database record
      await storage.deleteAttachment(fileId);

      return { success: true };
    } catch (error) {
      console.error('Failed to delete file:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'File deletion failed' 
      };
    }
  }

  /**
   * Get file serving path
   */
  getFilePath(filename: string): string {
    return path.join(this.uploadDir, filename);
  }

  /**
   * Get thumbnail serving path
   */
  getThumbnailPath(filename: string): string {
    return path.join(this.thumbnailDir, filename);
  }

  /**
   * Validate file before upload (client-side validation mirror)
   */
  validateFileBeforeUpload(file: { size: number; type: string; name: string }): { 
    valid: boolean; 
    error?: string; 
  } {
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File size exceeds ${Math.round(this.maxFileSize / 1024 / 1024)}MB limit`
      };
    }

    if (!this.allowedMimeTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not allowed`
      };
    }

    if (file.name.length > 255) {
      return {
        valid: false,
        error: 'File name is too long (max 255 characters)'
      };
    }

    return { valid: true };
  }

  /**
   * Get upload statistics
   */
  async getUploadStatistics(): Promise<{
    totalFiles: number;
    totalSize: number;
    averageSize: number;
    fileTypes: Record<string, number>;
  }> {
    try {
      const stats = await storage.getFileUploadStatistics();
      return stats;
    } catch (error) {
      console.error('Failed to get upload statistics:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        averageSize: 0,
        fileTypes: {}
      };
    }
  }
}

// Create singleton instance
export const fileManagementService = new FileManagementService();