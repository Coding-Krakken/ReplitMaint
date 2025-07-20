# MaintainPro CMMS API Reference

## Overview

MaintainPro provides a comprehensive RESTful API for enterprise maintenance management system integration. This API enables external systems to interact with work orders, equipment, inventory, and receive real-time updates through webhooks.

**Base URL:** `https://your-maintainpro-instance.com/api`
**Authentication:** Bearer Token (JWT)
**Content-Type:** `application/json`

## Authentication

All API requests require authentication using a JWT Bearer token:

```http
Authorization: Bearer your-jwt-token-here
```

### Getting an Access Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@company.com",
  "password": "secure-password",
  "mfaToken": "123456"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@company.com",
    "role": "technician",
    "warehouseId": "warehouse-uuid"
  },
  "token": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "sessionId": "session-uuid"
}
```

---

## Work Orders API

### List Work Orders

```http
GET /api/work-orders?status=new,assigned&priority=high,medium
```

**Query Parameters:**
- `status` (string, optional): Comma-separated list of statuses to filter by
- `assignedTo` (string, optional): User ID to filter by assignee
- `priority` (string, optional): Comma-separated list of priorities

**Response:**
```json
[
  {
    "id": "work-order-uuid",
    "foNumber": "WO-2025-001",
    "title": "Pump Maintenance",
    "description": "Regular maintenance on pump P-101",
    "status": "assigned",
    "priority": "medium",
    "type": "preventive",
    "equipmentId": "equipment-uuid",
    "assignedTo": "user-uuid",
    "requestedBy": "user-uuid",
    "dueDate": "2025-01-25T10:00:00.000Z",
    "createdAt": "2025-01-20T09:00:00.000Z",
    "warehouseId": "warehouse-uuid"
  }
]
```

### Create Work Order

```http
POST /api/work-orders
Content-Type: application/json

{
  "title": "Emergency Repair - Motor M-205",
  "description": "Motor showing unusual vibration patterns",
  "priority": "high",
  "type": "corrective",
  "equipmentId": "equipment-uuid",
  "assignedTo": "technician-uuid",
  "dueDate": "2025-01-21T16:00:00.000Z"
}
```

**Response:** `201 Created` with work order object

### Update Work Order

```http
PATCH /api/work-orders/{id}
Content-Type: application/json

{
  "status": "completed",
  "completionNotes": "Replaced bearing, tested operation"
}
```

**Response:** `200 OK` with updated work order object

---

## Equipment API

### List Equipment

```http
GET /api/equipment
```

**Response:**
```json
[
  {
    "id": "equipment-uuid",
    "assetTag": "PUMP-001",
    "model": "Grundfos CR 64",
    "manufacturer": "Grundfos",
    "description": "Main circulation pump",
    "status": "active",
    "location": "Building A - Basement",
    "area": "Mechanical Room",
    "criticality": "high",
    "installDate": "2023-06-15T00:00:00.000Z",
    "warehouseId": "warehouse-uuid"
  }
]
```

### Create Equipment

```http
POST /api/equipment
Content-Type: application/json

{
  "assetTag": "MOTOR-205",
  "model": "ABB M3BP 160MLA4",
  "manufacturer": "ABB",
  "description": "Conveyor drive motor",
  "location": "Production Line 2",
  "area": "Assembly",
  "criticality": "medium"
}
```

---

## Inventory API

### List Parts

```http
GET /api/parts
```

**Response:**
```json
[
  {
    "id": "part-uuid",
    "partNumber": "BRG-6205-2RS",
    "description": "Ball Bearing 25x52x15mm",
    "category": "Bearings",
    "stockLevel": 45,
    "reorderPoint": 10,
    "unitCost": "12.50",
    "supplier": "SKF Industrial",
    "location": "Shelf A-12-B",
    "warehouseId": "warehouse-uuid"
  }
]
```

### Consume Parts

```http
POST /api/parts/consume
Content-Type: application/json

{
  "workOrderId": "work-order-uuid",
  "partsUsage": [
    {
      "partId": "part-uuid",
      "quantityUsed": 2,
      "unitCost": "12.50"
    }
  ]
}
```

---

## Webhooks API

### Register Webhook Endpoint

```http
POST /api/webhooks
Content-Type: application/json

{
  "url": "https://your-system.com/webhooks/maintainpro",
  "events": [
    "work_order.created",
    "work_order.completed",
    "equipment.status_changed",
    "inventory.low_stock"
  ],
  "secret": "your-webhook-secret-key",
  "active": true
}
```

**Response:**
```json
{
  "id": "webhook-uuid",
  "url": "https://your-system.com/webhooks/maintainpro",
  "events": ["work_order.created", "work_order.completed"],
  "active": true,
  "secret": "generated-secret-if-not-provided",
  "createdAt": "2025-01-20T10:00:00.000Z"
}
```

### List Webhook Endpoints

```http
GET /api/webhooks
```

### Get Webhook Statistics

```http
GET /api/webhooks/{id}/stats
```

**Response:**
```json
{
  "total": 150,
  "delivered": 145,
  "failed": 5,
  "pending": 0,
  "successRate": 96.67
}
```

### Test Webhook

```http
POST /api/webhooks/{id}/test
```

---

## Webhook Events

### Event Types

| Event | Description | Payload |
|-------|-------------|---------|
| `work_order.created` | New work order created | Work order object with creator info |
| `work_order.updated` | Work order modified | Work order with changes |
| `work_order.completed` | Work order completed | Completed work order with metrics |
| `work_order.escalated` | Work order escalated | Escalation details and new assignee |
| `equipment.created` | New equipment added | Equipment object |
| `equipment.updated` | Equipment modified | Equipment with changes |
| `equipment.status_changed` | Equipment status change | Status change details |
| `inventory.low_stock` | Stock below reorder point | Part details and stock levels |
| `inventory.reorder` | Automatic reorder triggered | Reorder details |
| `parts.consumed` | Parts used in work order | Consumption details |
| `pm.scheduled` | PM work order created | PM details |
| `pm.overdue` | PM becomes overdue | Overdue PM information |
| `pm.completed` | PM completed | PM completion data |

### Webhook Payload Structure

```json
{
  "id": "event-uuid",
  "event": "work_order.created",
  "timestamp": "2025-01-20T10:30:00.000Z",
  "data": {
    "entity": "work_order",
    "entityId": "work-order-uuid",
    "warehouseId": "warehouse-uuid",
    "payload": {
      "workOrder": { /* work order object */ },
      "createdBy": "user-uuid",
      "timestamp": "2025-01-20T10:30:00.000Z"
    }
  }
}
```

### Webhook Security

All webhook requests include:
- `X-MaintainPro-Signature`: HMAC-SHA256 signature of payload
- `X-MaintainPro-Event`: Event type
- `X-MaintainPro-Delivery`: Unique delivery ID

**Signature Verification (Node.js example):**
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

---

## Preventive Maintenance API

### List PM Templates

```http
GET /api/pm-templates
```

### Create PM Template

```http
POST /api/pm-templates
Content-Type: application/json

{
  "name": "Monthly Motor Inspection",
  "description": "Monthly preventive maintenance for motors",
  "frequencyType": "calendar",
  "frequency": 30,
  "estimatedDuration": 120,
  "equipmentIds": ["equipment-uuid-1", "equipment-uuid-2"],
  "checklist": [
    {
      "id": "check-1",
      "description": "Check motor temperature",
      "type": "measurement",
      "required": true
    }
  ]
}
```

### Get PM Compliance

```http
GET /api/pm-compliance?days=30
```

---

## Performance Monitoring API

### Get Performance Summary

```http
GET /api/admin/performance/summary
```

**Response:**
```json
{
  "timestamp": "2025-01-20T10:00:00.000Z",
  "uptime": 86400,
  "requestCount": 1250,
  "averageResponseTime": 125,
  "errorRate": 0.02,
  "cacheHitRate": 85,
  "systemMetrics": {
    "cpuUsage": 45.2,
    "memoryUsage": 68.5,
    "diskUsage": 32.1
  }
}
```

---

## Error Handling

### HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

### Error Response Format

```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "title",
      "message": "Title is required"
    }
  ]
}
```

---

## Rate Limiting

- Authentication endpoints: 5 requests per minute per IP
- General API endpoints: 1000 requests per hour per authenticated user
- Webhook endpoints: 100 requests per minute per endpoint

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642694400
```

---

## SDKs and Examples

### cURL Examples

**Create a work order:**
```bash
curl -X POST https://api.maintainpro.com/api/work-orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Bearing Replacement",
    "priority": "high",
    "equipmentId": "equipment-123"
  }'
```

### JavaScript SDK

```javascript
const MaintainProAPI = require('@maintainpro/api-sdk');

const client = new MaintainProAPI({
  baseUrl: 'https://your-instance.maintainpro.com/api',
  token: 'your-jwt-token'
});

// Create work order
const workOrder = await client.workOrders.create({
  title: 'Emergency Repair',
  priority: 'high',
  equipmentId: 'equipment-123'
});

// Set up webhook
await client.webhooks.create({
  url: 'https://your-app.com/webhooks',
  events: ['work_order.created', 'work_order.completed']
});
```

---

## Support

For API support and integration assistance:
- Documentation: https://docs.maintainpro.com
- Support: api-support@maintainpro.com
- Status Page: https://status.maintainpro.com

Last Updated: January 2025
API Version: 1.0