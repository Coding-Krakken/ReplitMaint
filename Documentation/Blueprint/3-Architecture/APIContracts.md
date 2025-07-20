# API Contracts & Endpoints

## 🔗 API Design Principles

### RESTful API Standards

- **HTTP Methods**: GET (read), POST (create), PUT (update), DELETE (remove)
- **Status Codes**: Standard HTTP status codes with consistent error responses
- **Resource Naming**: Plural nouns for collections, singular for resources
- **URL Structure**: Hierarchical resource representation
- **Versioning**: API versioning in URL path (`/api/v1/`)
- **Authentication**: JWT-based authentication with Bearer tokens
- **Rate Limiting**: 1000 requests per hour per user
- **Pagination**: Cursor-based pagination for large datasets

### Response Format Standards

```typescript
// Standard Success Response
interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    cursor?: string;
  };
}

// Standard Error Response
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId: string;
  };
}
```

## 🔐 Authentication Endpoints

### POST /api/v1/auth/login

**Description**: Authenticate user and return JWT token

```typescript
// Request
interface LoginRequest {
  email: string;
  password: string;
  warehouse_id?: string;
}

// Response
interface LoginResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
    warehouse_id: string;
    first_name: string;
    last_name: string;
  };
  token: string;
  refresh_token: string;
  expires_at: string;
}
```

### POST /api/v1/auth/refresh

**Description**: Refresh JWT token

```typescript
// Request
interface RefreshRequest {
  refresh_token: string;
}

// Response
interface RefreshResponse {
  token: string;
  expires_at: string;
}
```

### POST /api/v1/auth/logout

**Description**: Invalidate current session

```typescript
// Request
interface LogoutRequest {
  refresh_token: string;
}

// Response
interface LogoutResponse {
  message: string;
}
```

## 🔧 Work Order Management

### GET /api/v1/work-orders

**Description**: Get paginated list of work orders

```typescript
// Query Parameters
interface WorkOrderQuery {
  status?: WorkOrderStatus[];
  priority?: Priority[];
  assigned_to?: string[];
  equipment_id?: string;
  type?: WorkOrderType[];
  due_date_from?: string;
  due_date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: 'created_at' | 'due_date' | 'priority' | 'status';
  order?: 'asc' | 'desc';
}

// Response
interface WorkOrderListResponse {
  work_orders: WorkOrder[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
```

### GET /api/v1/work-orders/:id

**Description**: Get specific work order details

```typescript
// Response
interface WorkOrderDetailsResponse {
  work_order: WorkOrder & {
    checklist_items: ChecklistItem[];
    time_logs: TimeLog[];
    attachments: Attachment[];
    parts_used: PartUsed[];
    equipment: Equipment;
    assigned_users: User[];
    requested_by_user: User;
    verified_by_user?: User;
  };
}
```

### POST /api/v1/work-orders

**Description**: Create new work order

```typescript
// Request
interface CreateWorkOrderRequest {
  title: string;
  description: string;
  type: WorkOrderType;
  priority: Priority;
  equipment_id?: string;
  area?: string;
  due_date?: string;
  estimated_hours?: number;
  assigned_to?: string[];
  checklist_items?: {
    component: string;
    action: string;
    description?: string;
    is_mandatory?: boolean;
    sequence_number: number;
  }[];
}

// Response
interface CreateWorkOrderResponse {
  work_order: WorkOrder;
}
```

### PUT /api/v1/work-orders/:id

**Description**: Update work order

```typescript
// Request
interface UpdateWorkOrderRequest {
  title?: string;
  description?: string;
  priority?: Priority;
  status?: WorkOrderStatus;
  assigned_to?: string[];
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
}

// Response
interface UpdateWorkOrderResponse {
  work_order: WorkOrder;
}
```

### POST /api/v1/work-orders/:id/assign

**Description**: Assign work order to users

```typescript
// Request
interface AssignWorkOrderRequest {
  user_ids: string[];
  notify?: boolean;
}

// Response
interface AssignWorkOrderResponse {
  work_order: WorkOrder;
  assigned_users: User[];
}
```

### POST /api/v1/work-orders/:id/complete

**Description**: Complete work order

```typescript
// Request
interface CompleteWorkOrderRequest {
  completion_notes?: string;
  actual_hours?: number;
  parts_used?: {
    part_id: string;
    quantity: number;
    notes?: string;
  }[];
}

// Response
interface CompleteWorkOrderResponse {
  work_order: WorkOrder;
}
```

## 📋 Checklist Management

### PUT /api/v1/work-orders/:id/checklist/:item_id

**Description**: Update checklist item

```typescript
// Request
interface UpdateChecklistItemRequest {
  status: ChecklistStatus;
  notes?: string;
  custom_field_data?: Record<string, any>;
  actual_minutes?: number;
}

// Response
interface UpdateChecklistItemResponse {
  checklist_item: ChecklistItem;
}
```

### POST /api/v1/work-orders/:id/checklist/:item_id/attachments

**Description**: Add attachment to checklist item

```typescript
// Request: FormData with file
interface AddAttachmentRequest {
  file: File;
  description?: string;
}

// Response
interface AddAttachmentResponse {
  attachment: Attachment;
}
```

## 🏭 Equipment Management

### GET /api/v1/equipment

**Description**: Get paginated list of equipment

```typescript
// Query Parameters
interface EquipmentQuery {
  status?: EquipmentStatus[];
  criticality?: Criticality[];
  manufacturer?: string;
  model?: string;
  area?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: 'asset_tag' | 'model' | 'criticality' | 'status';
  order?: 'asc' | 'desc';
}

// Response
interface EquipmentListResponse {
  equipment: Equipment[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
```

### GET /api/v1/equipment/:id

**Description**: Get specific equipment details

```typescript
// Response
interface EquipmentDetailsResponse {
  equipment: Equipment & {
    work_orders: WorkOrder[];
    maintenance_history: MaintenanceHistory[];
    pm_schedules: PMSchedule[];
    parent_equipment?: Equipment;
    child_equipment: Equipment[];
    compatible_parts: Part[];
  };
}
```

### POST /api/v1/equipment

**Description**: Create new equipment

```typescript
// Request
interface CreateEquipmentRequest {
  asset_tag: string;
  fo_number?: string;
  model: string;
  manufacturer?: string;
  serial_number?: string;
  description?: string;
  area?: string;
  location?: string;
  criticality: Criticality;
  installation_date?: string;
  warranty_expiry?: string;
  parent_equipment_id?: string;
  specifications?: Record<string, any>;
}

// Response
interface CreateEquipmentResponse {
  equipment: Equipment;
}
```

### GET /api/v1/equipment/:id/qr-code

**Description**: Generate QR code for equipment

```typescript
// Response
interface QRCodeResponse {
  qr_code_url: string;
  qr_code_data: string;
}
```

## 📦 Parts & Inventory Management

### GET /api/v1/parts

**Description**: Get paginated list of parts

```typescript
// Query Parameters
interface PartsQuery {
  category?: string;
  manufacturer?: string;
  vendor_id?: string;
  low_stock?: boolean;
  model_compatibility?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: 'part_number' | 'description' | 'quantity_on_hand';
  order?: 'asc' | 'desc';
}

// Response
interface PartsListResponse {
  parts: Part[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
```

### GET /api/v1/parts/:id

**Description**: Get specific part details

```typescript
// Response
interface PartDetailsResponse {
  part: Part & {
    vendor: Vendor;
    transactions: PartTransaction[];
    work_orders_used: WorkOrder[];
    compatible_equipment: Equipment[];
  };
}
```

### POST /api/v1/parts/:id/transactions

**Description**: Create inventory transaction

```typescript
// Request
interface CreateTransactionRequest {
  type: TransactionType;
  quantity: number;
  unit_cost?: number;
  reference_number?: string;
  notes?: string;
  work_order_id?: string;
}

// Response
interface CreateTransactionResponse {
  transaction: PartTransaction;
  updated_part: Part;
}
```

### GET /api/v1/inventory/low-stock

**Description**: Get parts below reorder point

```typescript
// Response
interface LowStockResponse {
  parts: (Part & {
    vendor: Vendor;
    shortage_quantity: number;
    days_until_stockout: number;
  })[];
}
```

## 🔄 Preventive Maintenance

### GET /api/v1/pm/templates

**Description**: Get PM templates

```typescript
// Query Parameters
interface PMTemplateQuery {
  model?: string;
  frequency?: Frequency;
  active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// Response
interface PMTemplateListResponse {
  templates: PMTemplate[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
```

### POST /api/v1/pm/templates

**Description**: Create PM template

```typescript
// Request
interface CreatePMTemplateRequest {
  name: string;
  model: string;
  frequency: Frequency;
  interval_value: number;
  interval_unit: IntervalUnit;
  description?: string;
  instructions?: string;
  estimated_duration_hours?: number;
  required_skills?: string[];
  checklist_items: {
    component: string;
    action: string;
    description?: string;
    is_mandatory?: boolean;
    sequence_number: number;
  }[];
}

// Response
interface CreatePMTemplateResponse {
  template: PMTemplate;
}
```

### GET /api/v1/pm/schedules

**Description**: Get PM schedules

```typescript
// Query Parameters
interface PMScheduleQuery {
  equipment_id?: string;
  due_date_from?: string;
  due_date_to?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

// Response
interface PMScheduleListResponse {
  schedules: (PMSchedule & {
    equipment: Equipment;
    template: PMTemplate;
    days_until_due: number;
  })[];
}
```

### POST /api/v1/pm/generate-work-orders

**Description**: Generate work orders from PM schedules

```typescript
// Request
interface GeneratePMWorkOrdersRequest {
  schedule_ids?: string[];
  due_date_through?: string;
  auto_assign?: boolean;
}

// Response
interface GeneratePMWorkOrdersResponse {
  work_orders: WorkOrder[];
  generated_count: number;
}
```

## 👥 User Management

### GET /api/v1/users

**Description**: Get paginated list of users

```typescript
// Query Parameters
interface UserQuery {
  role?: UserRole[];
  warehouse_id?: string;
  active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// Response
interface UserListResponse {
  users: User[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
```

### GET /api/v1/users/profile

**Description**: Get current user profile

```typescript
// Response
interface UserProfileResponse {
  user: User & {
    warehouse: Warehouse;
    permissions: Permission[];
    notification_settings: NotificationSettings[];
  };
}
```

### PUT /api/v1/users/profile

**Description**: Update user profile

```typescript
// Request
interface UpdateProfileRequest {
  first_name?: string;
  last_name?: string;
  phone?: string;
  skills?: string[];
  notification_preferences?: Record<string, any>;
}

// Response
interface UpdateProfileResponse {
  user: User;
}
```

## 🏢 Vendor Management

### GET /api/v1/vendors

**Description**: Get paginated list of vendors

```typescript
// Query Parameters
interface VendorQuery {
  type?: VendorType[];
  active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// Response
interface VendorListResponse {
  vendors: Vendor[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
```

### GET /api/v1/vendors/:id/performance

**Description**: Get vendor performance metrics

```typescript
// Response
interface VendorPerformanceResponse {
  vendor: Vendor;
  metrics: {
    total_orders: number;
    on_time_delivery_rate: number;
    average_delivery_days: number;
    quality_rating: number;
    total_spend: number;
    active_contracts: number;
  };
}
```

## 📊 Reporting & Analytics

### GET /api/v1/reports/dashboard

**Description**: Get dashboard data for user role

```typescript
// Response
interface DashboardResponse {
  kpis: {
    total_work_orders: number;
    completed_work_orders: number;
    overdue_work_orders: number;
    average_completion_time: number;
    pm_compliance_rate: number;
    low_stock_parts: number;
  };
  charts: {
    work_order_trends: ChartData[];
    equipment_downtime: ChartData[];
    parts_usage: ChartData[];
  };
  alerts: Alert[];
}
```

### GET /api/v1/reports/work-orders/performance

**Description**: Get work order performance analytics

```typescript
// Query Parameters
interface WorkOrderReportQuery {
  date_from: string;
  date_to: string;
  equipment_id?: string;
  technician_id?: string;
  type?: WorkOrderType[];
  group_by?: 'day' | 'week' | 'month';
}

// Response
interface WorkOrderPerformanceResponse {
  summary: {
    total_work_orders: number;
    completed_work_orders: number;
    average_completion_time: number;
    total_labor_hours: number;
    total_cost: number;
  };
  trends: ChartData[];
  by_technician: TechnicianPerformance[];
  by_equipment: EquipmentPerformance[];
}
```

## 🔔 Notifications

### GET /api/v1/notifications

**Description**: Get user notifications

```typescript
// Query Parameters
interface NotificationQuery {
  unread?: boolean;
  type?: NotificationType[];
  page?: number;
  limit?: number;
}

// Response
interface NotificationListResponse {
  notifications: Notification[];
  unread_count: number;
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
```

### PUT /api/v1/notifications/:id/read

**Description**: Mark notification as read

```typescript
// Response
interface MarkNotificationReadResponse {
  notification: Notification;
}
```

## 🔧 System Configuration

### GET /api/v1/config/settings

**Description**: Get system settings

```typescript
// Response
interface SystemSettingsResponse {
  settings: Record<string, any>;
}
```

### PUT /api/v1/config/settings

**Description**: Update system settings

```typescript
// Request
interface UpdateSettingsRequest {
  settings: Record<string, any>;
}

// Response
interface UpdateSettingsResponse {
  settings: Record<string, any>;
}
```

## 📈 Performance & Monitoring

### Response Times

- **Authentication**: < 500ms
- **List Endpoints**: < 2 seconds
- **Detail Endpoints**: < 1 second
- **Create/Update**: < 3 seconds
- **File Uploads**: < 10 seconds
- **Reports**: < 5 seconds

### Error Handling

```typescript
// Common Error Codes
enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
}

// Error Response Examples
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "message": "Must be a valid email address"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_123456"
  }
}
```

This comprehensive API specification ensures consistent, secure, and efficient communication between
the frontend and backend systems, supporting all the features outlined in the MaintAInPro CMMS
blueprint.
