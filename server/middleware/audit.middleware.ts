import type { Request, Response, NextFunction } from 'express';
import { auditTrailService } from '../services/audit-trail.service';

interface AuditRequest extends Request {
  user?: {
    id: string;
    sessionId?: string;
    warehouseId?: string;
    role: string;
  };
  startTime?: number;
}

export function auditMiddleware() {
  return async (req: AuditRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    req.startTime = startTime;

    // Skip audit for health checks and static files
    if (req.path === '/api/health' || 
        req.path.startsWith('/api/files/') || 
        req.path.startsWith('/api/thumbnails/') ||
        req.method === 'OPTIONS') {
      return next();
    }

    const originalSend = res.send;
    const originalJson = res.json;
    let responseBody: any;

    // Capture response data
    res.send = function(body: any) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.json = function(body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Wait for response to complete
    res.on('finish', async () => {
      try {
        const duration = Date.now() - startTime;
        const success = res.statusCode < 400;

        // Extract audit information
        const metadata = {
          ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
          userAgent: req.headers['user-agent'] || 'Unknown',
          requestId: req.headers['x-request-id'] as string,
          duration
        };

        // Determine event details based on request
        const auditDetails = extractAuditDetails(req, res, success, responseBody);

        if (auditDetails) {
          await auditTrailService.logEvent({
            userId: req.user?.id || 'anonymous',
            sessionId: req.user?.sessionId,
            warehouseId: req.user?.warehouseId,
            action: auditDetails.action,
            entityType: auditDetails.entityType,
            entityId: auditDetails.entityId,
            details: auditDetails.details,
            metadata,
            severity: auditDetails.severity,
            category: auditDetails.category,
            success,
            errorMessage: success ? undefined : extractErrorMessage(responseBody)
          });
        }
      } catch (error) {
        console.error('Audit logging error:', error);
        // Don't fail the request due to audit logging errors
      }
    });

    next();
  };
}

function extractAuditDetails(req: AuditRequest, res: Response, success: boolean, responseBody: any): {
  action: string;
  entityType: string;
  entityId?: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'authentication' | 'authorization' | 'data_access' | 'data_modification' | 'system' | 'security' | 'compliance';
} | null {
  const method = req.method;
  const path = req.path;
  const params = req.params;
  const body = req.body;
  const query = req.query;

  // Authentication events
  if (path === '/api/auth/login') {
    return {
      action: 'authentication_attempt',
      entityType: 'user',
      entityId: body?.email,
      details: { email: body?.email, mfaProvided: !!body?.mfaToken },
      severity: success ? 'low' : 'medium',
      category: 'authentication'
    };
  }

  if (path === '/api/auth/logout') {
    return {
      action: 'user_logout',
      entityType: 'user',
      entityId: req.user?.id,
      details: { sessionEnded: true },
      severity: 'low',
      category: 'authentication'
    };
  }

  if (path.includes('/api/auth/')) {
    return {
      action: `auth_${path.split('/').pop()}`,
      entityType: 'user',
      entityId: req.user?.id || body?.email,
      details: { method, path, success },
      severity: 'medium',
      category: 'authentication'
    };
  }

  // Work Order events
  if (path.includes('/api/work-orders')) {
    const entityId = params?.id || body?.id || extractIdFromResponse(responseBody);
    
    if (method === 'POST') {
      return {
        action: 'work_order_created',
        entityType: 'work_order',
        entityId,
        details: { title: body?.title, priority: body?.priority, assignedTo: body?.assignedTo },
        severity: 'medium',
        category: 'data_modification'
      };
    }
    
    if (method === 'PATCH' || method === 'PUT') {
      return {
        action: 'work_order_updated',
        entityType: 'work_order',
        entityId,
        details: { changes: body, statusChanged: !!body?.status },
        severity: body?.status === 'completed' ? 'medium' : 'low',
        category: 'data_modification'
      };
    }
    
    if (method === 'DELETE') {
      return {
        action: 'work_order_deleted',
        entityType: 'work_order',
        entityId,
        details: { deletedByUser: req.user?.id },
        severity: 'high',
        category: 'data_modification'
      };
    }
    
    if (method === 'GET') {
      return {
        action: 'work_order_accessed',
        entityType: 'work_order',
        entityId,
        details: { filters: query },
        severity: 'low',
        category: 'data_access'
      };
    }
  }

  // Equipment events
  if (path.includes('/api/equipment')) {
    const entityId = params?.id || body?.id || extractIdFromResponse(responseBody);
    
    if (method === 'POST') {
      return {
        action: 'equipment_created',
        entityType: 'equipment',
        entityId,
        details: { assetTag: body?.assetTag, model: body?.model },
        severity: 'medium',
        category: 'data_modification'
      };
    }
    
    if (method === 'PATCH' || method === 'PUT') {
      return {
        action: 'equipment_updated',
        entityType: 'equipment',
        entityId,
        details: { changes: body },
        severity: 'low',
        category: 'data_modification'
      };
    }
    
    if (method === 'GET') {
      return {
        action: 'equipment_accessed',
        entityType: 'equipment',
        entityId,
        details: { filters: query },
        severity: 'low',
        category: 'data_access'
      };
    }
  }

  // Parts/Inventory events
  if (path.includes('/api/parts')) {
    const entityId = params?.id || body?.id || extractIdFromResponse(responseBody);
    
    if (path.includes('/consume')) {
      return {
        action: 'parts_consumed',
        entityType: 'inventory',
        entityId: body?.workOrderId,
        details: { partsUsage: body?.partsUsage, workOrderId: body?.workOrderId },
        severity: 'medium',
        category: 'data_modification'
      };
    }
    
    if (method === 'POST') {
      return {
        action: 'part_created',
        entityType: 'part',
        entityId,
        details: { partNumber: body?.partNumber, description: body?.description },
        severity: 'low',
        category: 'data_modification'
      };
    }
    
    if (method === 'GET') {
      return {
        action: 'inventory_accessed',
        entityType: 'inventory',
        details: { filters: query },
        severity: 'low',
        category: 'data_access'
      };
    }
  }

  // User management events
  if (path.includes('/api/users')) {
    const entityId = params?.id || body?.id || extractIdFromResponse(responseBody);
    
    if (method === 'POST') {
      return {
        action: 'user_created',
        entityType: 'user',
        entityId,
        details: { email: body?.email, role: body?.role },
        severity: 'medium',
        category: 'data_modification'
      };
    }
    
    if (method === 'PATCH' || method === 'PUT') {
      return {
        action: 'user_updated',
        entityType: 'user',
        entityId,
        details: { changes: body, roleChanged: !!body?.role },
        severity: body?.role ? 'high' : 'medium',
        category: 'data_modification'
      };
    }
  }

  // Webhook events
  if (path.includes('/api/webhooks')) {
    const entityId = params?.id || body?.id || extractIdFromResponse(responseBody);
    
    if (method === 'POST') {
      return {
        action: 'webhook_created',
        entityType: 'webhook',
        entityId,
        details: { url: body?.url, events: body?.events },
        severity: 'medium',
        category: 'system'
      };
    }
    
    if (method === 'DELETE') {
      return {
        action: 'webhook_deleted',
        entityType: 'webhook',
        entityId,
        details: {},
        severity: 'medium',
        category: 'system'
      };
    }
  }

  // AI/ML events
  if (path.includes('/api/ai/')) {
    return {
      action: `ai_${path.split('/').pop()?.replace('-', '_')}`,
      entityType: 'ai_service',
      entityId: params?.id,
      details: { aiFunction: path.split('/').pop(), parameters: query },
      severity: 'low',
      category: 'data_access'
    };
  }

  // Admin/Performance events
  if (path.includes('/api/admin/')) {
    return {
      action: `admin_${path.split('/').pop()}`,
      entityType: 'system',
      details: { adminAction: path, parameters: query },
      severity: 'medium',
      category: 'system'
    };
  }

  // File upload events
  if (path.includes('/api/upload')) {
    return {
      action: 'file_uploaded',
      entityType: 'file',
      details: { fileCount: Array.isArray(body) ? body.length : 1 },
      severity: 'low',
      category: 'data_modification'
    };
  }

  // Security-related failed attempts
  if (!success && res.statusCode === 401) {
    return {
      action: 'unauthorized_access_attempt',
      entityType: 'security',
      details: { path, method, statusCode: res.statusCode },
      severity: 'high',
      category: 'security'
    };
  }

  if (!success && res.statusCode === 403) {
    return {
      action: 'forbidden_access_attempt',
      entityType: 'security',
      details: { path, method, statusCode: res.statusCode, userId: req.user?.id },
      severity: 'high',
      category: 'security'
    };
  }

  // Generic API access for unmatched patterns
  if (path.startsWith('/api/')) {
    return {
      action: `api_${method.toLowerCase()}`,
      entityType: 'api',
      details: { path, method, statusCode: res.statusCode },
      severity: success ? 'low' : 'medium',
      category: success ? 'data_access' : 'system'
    };
  }

  return null;
}

function extractIdFromResponse(responseBody: any): string | undefined {
  if (typeof responseBody === 'object' && responseBody !== null) {
    return responseBody.id || responseBody.entityId;
  }
  return undefined;
}

function extractErrorMessage(responseBody: any): string | undefined {
  if (typeof responseBody === 'object' && responseBody !== null) {
    return responseBody.message || responseBody.error;
  }
  if (typeof responseBody === 'string') {
    try {
      const parsed = JSON.parse(responseBody);
      return parsed.message || parsed.error;
    } catch {
      return responseBody;
    }
  }
  return undefined;
}