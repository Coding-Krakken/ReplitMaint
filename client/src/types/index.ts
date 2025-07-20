// Re-export shared types for convenience
export * from '@shared/schema';

// Additional client-specific types
export interface WorkOrderChecklistItem {
  id: string;
  workOrderId: string;
  component: string;
  action: string;
  status: 'pending' | 'done' | 'skipped' | 'issue';
  notes?: string;
  sortOrder: number;
  createdAt: string;
  // Enhanced fields for mobile execution
  hasPhotoRequired?: boolean;
  hasSignoffRequired?: boolean;
  acceptableValues?: string[];
  warningThresholds?: { min?: number; max?: number; };
  valueType?: 'text' | 'number' | 'boolean' | 'choice';
  validationRules?: string[];
}

export interface WorkOrderFilters {
  status?: string[];
  priority?: string[];
  assignedTo?: string;
  equipmentId?: string;
  startDate?: string;
  endDate?: string;
}

export interface NetworkStatus {
  isOnline: boolean;
  lastOnline?: Date;
  connectionType?: string;
}

export interface OfflineAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
}

export interface InventoryConsumption {
  partId: string;
  quantityConsumed: number;
  newStockLevel: number;
  triggerReorder: boolean;
  costImpact: number;
}

export interface PerformanceMetrics {
  equipmentId: string;
  mtbf: number; // Mean Time Between Failures (hours)
  mttr: number; // Mean Time To Repair (hours)
  availability: number; // Percentage
  reliabilityScore: number; // 0-100
  maintenanceCost: number;
  downtime: number; // Total hours
  failureCount: number;
  totalWorkOrders: number;
  preventiveMaintenanceCompliance: number; // Percentage
  criticalIssuesCount: number;
  lastFailureDate?: string;
  nextPMDueDate?: string;
}

export interface MobileFeatures {
  hasCamera: boolean;
  hasGeolocation: boolean;
  hasVibration: boolean;
  hasDeviceMotion: boolean;
  hasTouchScreen: boolean;
  hasServiceWorker: boolean;
}

export interface VoiceRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
  maxAlternatives?: number;
}

export interface AttachmentUpload {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  url?: string;
}

export interface QRScanResult {
  text: string;
  format?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  warehouseId?: string;
  active?: boolean;
}

export interface FileUploadOptions {
  workOrderId?: string;
  equipmentId?: string;
  pmTemplateId?: string;
  vendorId?: string;
}

export interface DashboardStats {
  totalWorkOrders: number;
  completedWorkOrders: number;
  pendingWorkOrders: number;
  overduePMs: number;
  criticalEquipment: number;
  lowStockItems: number;
  totalEquipment: number;
  activeEquipment: number;
  uptime: number;
}