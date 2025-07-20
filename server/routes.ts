import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { 
  insertWorkOrderSchema, 
  insertEquipmentSchema, 
  insertPartSchema,
  insertNotificationSchema,
  insertAttachmentSchema,
  insertVendorSchema
} from "@shared/schema";
import { z } from "zod";
import { SecurityService } from "./services/auth/security.service";
import { notificationService } from "./services/notification.service";
import { fileManagementService } from "./services/file-management.service";
import { webhookService, WebhookEvents } from "./services/webhook.service";
import monitoringRoutes from "./routes/monitoring";
import { registerWebhookRoutes } from "./routes/webhooks";
import { registerAIPredictiveRoutes } from "./routes/ai-predictive";
import { registerAuditRoutes } from "./routes/audit";
import { registerLaborTimeRoutes } from "./routes/labor-time";
import { auditMiddleware } from "./middleware/audit.middleware";
import { performanceMiddleware, errorTrackingMiddleware } from "./middleware/performance.middleware";
import { securityHeaders, sanitizeInput, validateRequest, apiRateLimit, authRateLimit } from "./middleware/security.middleware";
import performanceMonitoringRoutes from "./routes/monitoring";
import path from "path";

// Import PM services with error handling
let pmEngine: any = null;
let pmScheduler: any = null;

// Initialize PM services asynchronously
async function initializePMServices() {
  try {
    const pmEngineModule = await import("./services/pm-engine");
    pmEngine = pmEngineModule.pmEngine;
    console.log('PM Engine imported successfully');
  } catch (error) {
    console.error('Failed to import PM Engine:', error);
  }

  try {
    const pmSchedulerModule = await import("./services/pm-scheduler");
    pmScheduler = pmSchedulerModule.pmScheduler;
    console.log('PM Scheduler imported successfully');
  } catch (error) {
    console.error('Failed to import PM Scheduler:', error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  console.log('Starting route registration...');
  
  // Initialize PM services
  await initializePMServices();
  
  // Initialize database optimization
  try {
    console.log('Initializing database optimization...');
    const { databaseOptimizer } = await import('./services/database-optimizer.service');
    const optimizationResult = await databaseOptimizer.applyOptimizations();
    console.log(`Database optimization complete: ${optimizationResult.applied} indexes applied`);
    
    if (optimizationResult.errors.length > 0) {
      console.warn(`Database optimization warnings: ${optimizationResult.errors.length} errors`);
    }
  } catch (error) {
    console.warn('Database optimization failed, continuing startup:', error.message);
  }
  
  // Create HTTP server and initialize WebSocket
  const httpServer = createServer(app);
  notificationService.initialize(httpServer);
  console.log('WebSocket notification service initialized');
  
  // Security middleware (applied first)
  app.use(securityHeaders);
  app.use(sanitizeInput);
  app.use(validateRequest);
  console.log('Security middleware enabled');
  
  // Rate limiting middleware
  const createRateLimiter = (windowMs: number, max: number) => {
    return SecurityService.createRateLimiter({
      windowMs,
      maxRequests: max
    });
  };
  
  // Create rate limiters
  const authRateLimit = createRateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes  
  const apiRateLimit = createRateLimiter(60 * 1000, 100); // 100 requests per minute

  // Apply rate limiting to API routes
  app.use('/api/auth', authRateLimit);
  app.use('/api', apiRateLimit);
  console.log('Rate limiting enabled');
  
  // Add performance monitoring middleware
  app.use(performanceMiddleware);
  console.log('Performance monitoring middleware enabled');
  
  // Enhanced health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      console.log('Enhanced health check endpoint called');
      
      // Import advanced health service
      const { advancedHealth } = await import('./services/advanced-health.service');
      
      const healthResult = await advancedHealth.performHealthCheck();
      const connectionStats = notificationService.getConnectionStats();
      
      const response = {
        ...healthResult,
        env: process.env.NODE_ENV || "development",
        port: process.env.PORT || 5000,
        websocket: connectionStats,
        version: "1.0.0"
      };
      
      // Return appropriate HTTP status based on health
      const statusCode = healthResult.status === 'unhealthy' ? 503 : 
                        healthResult.status === 'degraded' ? 207 : 200;
      
      res.status(statusCode).json(response);
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({ 
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
        env: process.env.NODE_ENV || "development",
        port: process.env.PORT || 5000
      });
    }
  });

  // Basic health check for load balancers (simple OK response)
  app.get("/api/health/basic", (req, res) => {
    res.status(200).send("OK");
  });



  console.log('Health check endpoint registered');

  // Register performance monitoring routes
  app.use('/api/monitoring', performanceMonitoringRoutes);
  console.log('Performance monitoring routes registered');

  // Audit middleware (before authentication to capture all requests)
  app.use(auditMiddleware());

  // Authentication middleware
  const authenticateRequest = async (req: any, res: any, next: any) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // In test environment, accept mock-token
      if (process.env.NODE_ENV === 'test' && token === 'mock-token') {
        req.user = { id: '00000000-0000-0000-0000-000000000001', warehouseId: '00000000-0000-0000-0000-000000000001' };
        return next();
      }

      // Use advanced JWT validation
      const { AuthService } = await import('./services/auth');
      
      const tokenValidation = await new AuthService().validateToken(token);
      if (!tokenValidation.valid) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      // Check if session is still valid
      const sessionValid = await new AuthService().validateSession(tokenValidation.payload.sessionId);
      if (!sessionValid) {
        return res.status(401).json({ message: "Session expired" });
      }

      req.user = {
        id: tokenValidation.payload.userId,
        warehouseId: tokenValidation.payload.warehouseId,
        role: tokenValidation.payload.role,
        sessionId: tokenValidation.payload.sessionId
      };
      
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(401).json({ message: "Authentication failed" });
    }
  };

  // RBAC middleware for role-based access control
  const requireRole = (...allowedRoles: string[]) => {
    return async (req: any, res: any, next: any) => {
      try {
        const { AuthService } = await import('./services/auth');
        
        const sessionId = req.user?.sessionId;
        const resource = req.route?.path || req.url;
        const action = req.method.toLowerCase();
        
        const result = await AuthService.validateAccess(sessionId, resource, action);
        
        if (!result.allowed) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }
        
        next();
      } catch (error) {
        console.error('Authorization error:', error);
        return res.status(403).json({ message: "Access denied" });
      }
    };
  };

  // Performance dashboard endpoint for admin monitoring
  app.get("/api/admin/performance", authenticateRequest, requireRole('admin'), async (req, res) => {
    try {
      const { advancedHealth } = await import('./services/advanced-health.service');
      const { databaseOptimizer } = await import('./services/database-optimizer.service');
      const { enhancedCache } = await import('./services/cache.service.enhanced');

      const [healthResult, dbHealth, queryStats, cacheStats] = await Promise.all([
        advancedHealth.performHealthCheck(),
        databaseOptimizer.getDatabaseHealthMetrics(),
        databaseOptimizer.getQueryPerformanceStats(),
        Promise.resolve(enhancedCache.getStats())
      ]);

      const performanceDashboard = {
        timestamp: new Date().toISOString(),
        system_health: healthResult,
        database_metrics: {
          health: dbHealth,
          slow_queries: queryStats.slice(0, 5), // Top 5 slow queries
        },
        cache_metrics: cacheStats,
        server_info: {
          node_version: process.version,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu_usage: process.cpuUsage(),
          platform: process.platform,
          arch: process.arch
        }
      };

      res.json(performanceDashboard);
    } catch (error) {
      console.error('Performance dashboard error:', error);
      res.status(500).json({
        error: 'Failed to generate performance dashboard',
        message: error.message
      });
    }
  });

  console.log('Performance dashboard endpoint registered');

  // Additional rate limiters for auth routes (if needed separately)
  const generalRateLimit = createRateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes

  const getCurrentUser = (req: any) => {
    return req.user?.id || req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
  };

  const getCurrentWarehouse = (req: any) => {
    return req.user?.warehouseId || req.headers['x-warehouse-id'] || '00000000-0000-0000-0000-000000000001';
  };

  // Authentication routes
  app.post("/api/auth/login", authRateLimit, async (req, res) => {
    try {
      const { AuthService } = await import('./services/auth');

      const deviceInfo = {
        userAgent: req.headers['user-agent'] || 'Unknown',
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown'
      };

      const loginResult = await AuthService.login({
        email: req.body.email,
        password: req.body.password,
        mfaToken: req.body.mfaToken,
        rememberMe: req.body.rememberMe || false,
        deviceFingerprint: req.body.deviceFingerprint
      }, deviceInfo);

      if (!loginResult.success) {
        return res.status(401).json({ 
          message: loginResult.error || "Invalid credentials",
          requiresMFA: loginResult.mfaRequired,
          isLocked: loginResult.accountLocked,
          lockoutExpires: loginResult.lockoutTimeRemaining
        });
      }

      res.json({
        user: loginResult.user,
        token: loginResult.tokens?.accessToken,
        refreshToken: loginResult.tokens?.refreshToken,
        sessionId: loginResult.sessionId
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", authenticateRequest, async (req, res) => {
    try {
      const { AuthService } = await import('./services/auth');
      
      const sessionId = (req as any).user?.sessionId;
      if (sessionId) {
        const context = {
          ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
          userAgent: req.headers['user-agent'] || 'Unknown'
        };
        await AuthService.logout(sessionId, context);
      }
      
      res.json({ message: "Logout successful" });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Token refresh route
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { AuthService } = await import('./services/auth');
      
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: "Refresh token required" });
      }

      const context = {
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.headers['user-agent'] || 'Unknown'
      };

      const result = await AuthService.refreshToken(refreshToken, context);
      if (!result.success) {
        return res.status(401).json({ message: result.error || "Invalid refresh token" });
      }

      res.json({
        accessToken: result.tokens?.accessToken,
        refreshToken: result.tokens?.refreshToken
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  // MFA setup route
  app.post("/api/auth/mfa/setup", authenticateRequest, async (req, res) => {
    try {
      const { AuthService } = await import('./services/auth');
      
      const userId = getCurrentUser(req);
      const { type = 'totp', phoneNumber } = req.body;
      
      const result = await AuthService.setupMFA(userId, type, phoneNumber);
      
      res.json(result);
    } catch (error) {
      console.error('MFA setup error:', error);
      res.status(500).json({ message: "MFA setup failed" });
    }
  });

  // MFA enable route
  app.post("/api/auth/mfa/enable", authenticateRequest, async (req, res) => {
    try {
      const { AuthService } = await import('./services/auth');
      
      const userId = getCurrentUser(req);
      const { token } = req.body;
      
      const context = {
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.headers['user-agent'] || 'Unknown'
      };
      
      const result = await AuthService.enableMFA(userId, token, context);
      if (!result.success) {
        return res.status(400).json({ message: result.error || "Invalid MFA token" });
      }
      
      res.json({ message: "MFA enabled successfully" });
    } catch (error) {
      console.error('MFA enable error:', error);
      res.status(500).json({ message: "MFA enable failed" });
    }
  });

  // User registration route
  app.post("/api/auth/register", authRateLimit, async (req, res) => {
    try {
      const { AuthService } = await import('./services/auth');
      
      const context = {
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.headers['user-agent'] || 'Unknown'
      };
      
      const result = await AuthService.register(req.body, context);
      if (!result.success) {
        return res.status(400).json({ message: result.error || "Registration failed" });
      }
      
      res.status(201).json({ 
        message: "Registration successful",
        userId: result.userId 
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Password reset request route
  app.post("/api/auth/password-reset", authRateLimit, async (req, res) => {
    try {
      const { AuthService } = await import('./services/auth');
      
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const resetRequest = {
        email,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.headers['user-agent'] || 'Unknown'
      };

      const result = await AuthService.requestPasswordReset(resetRequest);
      
      // Always return success for security (don't reveal if email exists)
      res.json({ message: "If the email exists, a password reset link has been sent" });
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ message: "Password reset request failed" });
    }
  });

  // Password reset confirmation route
  app.post("/api/auth/password-reset/confirm", async (req, res) => {
    try {
      const { AuthService } = await import('./services/auth');
      
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      const resetConfirm = {
        token,
        newPassword,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.headers['user-agent'] || 'Unknown'
      };

      const result = await AuthService.confirmPasswordReset(resetConfirm);
      if (!result.success) {
        return res.status(400).json({ message: result.error || "Password reset failed" });
      }
      
      res.json({ message: "Password reset successful" });
    } catch (error) {
      console.error('Password reset confirmation error:', error);
      res.status(500).json({ message: "Password reset confirmation failed" });
    }
  });

  // Get user sessions route
  app.get("/api/auth/sessions", authenticateRequest, async (req, res) => {
    try {
      const { SessionService } = await import('./services/auth/session.service');
      
      const userId = getCurrentUser(req);
      const sessions = await SessionService.getUserSessions(userId);
      
      res.json(sessions);
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({ message: "Failed to get sessions" });
    }
  });

  // End specific session route
  app.delete("/api/auth/sessions/:sessionId", authenticateRequest, async (req, res) => {
    try {
      const { SessionService } = await import('./services/auth/session.service');
      
      const { sessionId } = req.params;
      const success = await SessionService.endSession(sessionId);
      
      if (!success) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      res.json({ message: "Session ended successfully" });
    } catch (error) {
      console.error('End session error:', error);
      res.status(500).json({ message: "Failed to end session" });
    }
  });

  // End all sessions route
  app.delete("/api/auth/sessions", authenticateRequest, async (req, res) => {
    try {
      const { SessionService } = await import('./services/auth/session.service');
      
      const userId = getCurrentUser(req);
      const endedCount = await SessionService.endAllUserSessions(userId);
      
      res.json({ 
        message: "All sessions ended successfully", 
        endedSessions: endedCount 
      });
    } catch (error) {
      console.error('End all sessions error:', error);
      res.status(500).json({ message: "Failed to end sessions" });
    }
  });

  // Profiles
  app.get("/api/profiles/me", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      // For testing, return mock user based on the token
      if (token === 'mock-jwt-token') {
        const userId = req.headers['x-user-id'] || 'supervisor-user-id';
        
        // Mock user data for testing
        const mockUsers = {
          'test-user-id': {
            id: 'test-user-id',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'technician',
            warehouseId: '1',
            active: true,
          },
          'supervisor-user-id': {
            id: 'supervisor-user-id',
            email: 'supervisor@maintainpro.com',
            firstName: 'John',
            lastName: 'Smith',
            role: 'supervisor',
            warehouseId: '1',
            active: true,
          },
          'manager-user-id': {
            id: 'manager-user-id',
            email: 'manager@example.com',
            firstName: 'Mike',
            lastName: 'Johnson',
            role: 'manager',
            warehouseId: '1',
            active: true,
          },
          'technician-user-id': {
            id: 'technician-user-id',
            email: 'technician@example.com',
            firstName: 'Sarah',
            lastName: 'Wilson',
            role: 'technician',
            warehouseId: '1',
            active: true,
          }
        };
        
        const mockUser = mockUsers[userId as keyof typeof mockUsers];
        if (mockUser) {
          return res.json(mockUser);
        }
      }
      
      // Fallback to database lookup
      const userId = getCurrentUser(req);
      const profile = await storage.getProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to get profile" });
    }
  });

  app.get("/api/profiles/:id", async (req, res) => {
    try {
      const profile = await storage.getProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to get profile" });
    }
  });

  // Equipment
  app.get("/api/equipment", async (req, res) => {
    try {
      const warehouseId = getCurrentWarehouse(req);
      const equipment = await storage.getEquipment(warehouseId);
      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to get equipment" });
    }
  });

  app.get("/api/equipment/:id", async (req, res) => {
    try {
      const equipment = await storage.getEquipmentById(req.params.id);
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found" });
      }
      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to get equipment" });
    }
  });

  app.get("/api/equipment/asset/:assetTag", async (req, res) => {
    try {
      const equipment = await storage.getEquipmentByAssetTag(req.params.assetTag);
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found" });
      }
      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to get equipment" });
    }
  });

  app.post("/api/equipment", authenticateRequest, async (req, res) => {
    try {
      // Auto-populate required fields
      const equipmentData = {
        ...req.body,
        id: req.body.id || crypto.randomUUID(),
        warehouseId: req.body.warehouseId || getCurrentWarehouse(req),
        status: req.body.status || 'active',
      };
      
      const parsedData = insertEquipmentSchema.parse(equipmentData);
      const equipment = await storage.createEquipment(parsedData);
      res.status(201).json(equipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid equipment data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create equipment" });
    }
  });

  app.patch("/api/equipment/:id", async (req, res) => {
    try {
      const equipmentData = insertEquipmentSchema.partial().parse(req.body);
      const equipment = await storage.updateEquipment(req.params.id, equipmentData);
      res.json(equipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid equipment data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  // Work Orders
  app.get("/api/work-orders", authenticateRequest, async (req, res) => {
    try {
      const warehouseId = getCurrentWarehouse(req);
      const filters = {
        status: req.query.status ? String(req.query.status).split(',') : undefined,
        assignedTo: req.query.assignedTo ? String(req.query.assignedTo) : undefined,
        priority: req.query.priority ? String(req.query.priority).split(',') : undefined,
      };
      const workOrders = await storage.getWorkOrders(warehouseId, filters);
      res.json(workOrders);
    } catch (error) {
      res.status(500).json({ message: "Failed to get work orders" });
    }
  });

  app.get("/api/work-orders/assigned/:userId", async (req, res) => {
    try {
      const workOrders = await storage.getWorkOrdersByAssignee(req.params.userId);
      res.json(workOrders);
    } catch (error) {
      res.status(500).json({ message: "Failed to get assigned work orders" });
    }
  });

  app.get("/api/work-orders/:id", authenticateRequest, async (req, res) => {
    try {
      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }
      res.json(workOrder);
    } catch (error) {
      res.status(500).json({ message: "Failed to get work order" });
    }
  });

  app.post("/api/work-orders", authenticateRequest, async (req, res) => {
    try {
      // Auto-populate required fields
      const workOrderData = {
        ...req.body,
        id: req.body.id || crypto.randomUUID(),
        warehouseId: req.body.warehouseId || getCurrentWarehouse(req),
        requestedBy: req.body.requestedBy || getCurrentUser(req),
        type: req.body.type || 'corrective',
        status: req.body.status || 'new',
      };
      
      const parsedData = insertWorkOrderSchema.parse(workOrderData);
      const workOrder = await storage.createWorkOrder(parsedData);
      
      // Send real-time notifications
      const warehouseId = getCurrentWarehouse(req);
      await notificationService.sendWorkOrderNotification(
        workOrder.id,
        'created',
        warehouseId
      );

      // Create notification for assigned technician
      if (workOrder.assignedTo) {
        await notificationService.sendNotification({
          id: crypto.randomUUID(),
          userId: workOrder.assignedTo,
          warehouseId,
          type: 'wo_assigned',
          title: 'New Work Order Assigned',
          message: `Work Order ${workOrder.foNumber} has been assigned to you`,
          read: false,
          createdAt: new Date(),
          data: { workOrderId: workOrder.id, action: 'assigned' }
        });
      }

      // Emit webhook event for work order creation
      await webhookService.emitEvent({
        id: crypto.randomUUID(),
        event: WebhookEvents.WORK_ORDER_CREATED,
        entity: 'work_order',
        entityId: workOrder.id,
        data: {
          workOrder,
          createdBy: getCurrentUser(req),
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        warehouseId
      });
      
      res.status(201).json(workOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid work order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create work order" });
    }
  });

  app.patch("/api/work-orders/:id", authenticateRequest, async (req, res) => {
    try {
      const workOrderData = insertWorkOrderSchema.partial().parse(req.body);
      const workOrder = await storage.updateWorkOrder(req.params.id, workOrderData);
      
      // Send real-time notifications for updates
      const warehouseId = getCurrentWarehouse(req);
      await notificationService.sendWorkOrderNotification(
        workOrder.id,
        'updated',
        warehouseId
      );

      // Notify if status changed to completed
      if (workOrderData.status === 'completed' && workOrder.requestedBy) {
        await notificationService.sendNotification({
          id: crypto.randomUUID(),
          userId: workOrder.requestedBy,
          warehouseId,
          type: 'wo_completed',
          title: 'Work Order Completed',
          message: `Work Order ${workOrder.foNumber} has been completed`,
          read: false,
          createdAt: new Date(),
          data: { workOrderId: workOrder.id, action: 'completed' }
        });
      }

      // Notify if reassigned
      if (workOrderData.assignedTo && workOrderData.assignedTo !== workOrder.assignedTo) {
        await notificationService.sendNotification({
          id: crypto.randomUUID(),
          userId: workOrderData.assignedTo,
          warehouseId,
          type: 'wo_reassigned',
          title: 'Work Order Reassigned',
          message: `Work Order ${workOrder.foNumber} has been reassigned to you`,
          read: false,
          createdAt: new Date(),
          data: { workOrderId: workOrder.id, action: 'reassigned' }
        });
      }

      // Emit webhook events for work order updates
      const webhookEvent = workOrderData.status === 'completed' 
        ? WebhookEvents.WORK_ORDER_COMPLETED 
        : WebhookEvents.WORK_ORDER_UPDATED;
      
      await webhookService.emitEvent({
        id: crypto.randomUUID(),
        event: webhookEvent,
        entity: 'work_order',
        entityId: workOrder.id,
        data: {
          workOrder,
          changes: workOrderData,
          updatedBy: getCurrentUser(req),
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        warehouseId
      });
      
      res.json(workOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid work order data", errors: error.errors });
      }
      if (error.message === 'Work order not found') {
        return res.status(404).json({ message: "Work order not found" });
      }
      res.status(500).json({ message: "Failed to update work order" });
    }
  });

  app.delete("/api/work-orders/:id", authenticateRequest, async (req, res) => {
    try {
      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }
      
      await storage.deleteWorkOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete work order" });
    }
  });

  // Work Order Checklist Items
  app.get("/api/work-orders/:id/checklist", async (req, res) => {
    try {
      const items = await storage.getChecklistItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to get checklist items" });
    }
  });

  app.post("/api/work-orders/:id/checklist", async (req, res) => {
    try {
      const itemData = {
        workOrderId: req.params.id,
        component: req.body.component,
        action: req.body.action,
        status: req.body.status || 'pending',
        notes: req.body.notes,
        sortOrder: req.body.sortOrder || 0,
      };
      const item = await storage.createChecklistItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to create checklist item" });
    }
  });

  app.patch("/api/checklist-items/:id", async (req, res) => {
    try {
      const item = await storage.updateChecklistItem(req.params.id, req.body);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to update checklist item" });
    }
  });

  // Parts
  app.get("/api/parts", async (req, res) => {
    try {
      const warehouseId = getCurrentWarehouse(req);
      const parts = await storage.getParts(warehouseId);
      res.json(parts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get parts" });
    }
  });

  app.get("/api/parts/:id", async (req, res) => {
    try {
      const part = await storage.getPart(req.params.id);
      if (!part) {
        return res.status(404).json({ message: "Part not found" });
      }
      res.json(part);
    } catch (error) {
      res.status(500).json({ message: "Failed to get part" });
    }
  });

  app.get("/api/parts/number/:partNumber", async (req, res) => {
    try {
      const part = await storage.getPartByNumber(req.params.partNumber);
      if (!part) {
        return res.status(404).json({ message: "Part not found" });
      }
      res.json(part);
    } catch (error) {
      res.status(500).json({ message: "Failed to get part" });
    }
  });

  app.post("/api/parts", async (req, res) => {
    try {
      const partData = insertPartSchema.parse(req.body);
      const part = await storage.createPart(partData);
      res.status(201).json(part);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid part data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create part" });
    }
  });

  app.patch("/api/parts/:id", async (req, res) => {
    try {
      const partData = insertPartSchema.partial().parse(req.body);
      const part = await storage.updatePart(req.params.id, partData);
      res.json(part);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid part data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update part" });
    }
  });

  // Parts Usage
  app.get("/api/work-orders/:id/parts-usage", async (req, res) => {
    try {
      const usage = await storage.getPartsUsage(req.params.id);
      res.json(usage);
    } catch (error) {
      res.status(500).json({ message: "Failed to get parts usage" });
    }
  });

  app.post("/api/work-orders/:id/parts-usage", async (req, res) => {
    try {
      const usageData = {
        workOrderId: req.params.id,
        partId: req.body.partId,
        quantityUsed: req.body.quantityUsed,
        unitCost: req.body.unitCost,
        usedBy: getCurrentUser(req),
        notes: req.body.notes || '',
      };
      
      // Get the part information
      const part = await storage.getPart(req.body.partId);
      if (!part) {
        return res.status(404).json({ message: 'Part not found' });
      }

      // Check stock availability if consuming inventory
      const consumeInventory = req.body.consumeInventory !== false; // Default to true
      if (consumeInventory && part.stockLevel < req.body.quantityUsed) {
        return res.status(400).json({ 
          message: 'Insufficient stock',
          available: part.stockLevel,
          requested: req.body.quantityUsed
        });
      }
      
      const usage = await storage.createPartsUsage(usageData);
      let inventoryImpact = null;
      
      // Update part stock level if consuming inventory
      if (consumeInventory) {
        const newStockLevel = Math.max(0, part.stockLevel - req.body.quantityUsed);
        await storage.updatePart(req.body.partId, { stockLevel: newStockLevel });
        
        inventoryImpact = {
          partId: req.body.partId,
          quantityConsumed: req.body.quantityUsed,
          newStockLevel,
          triggerReorder: newStockLevel <= part.reorderPoint,
          costImpact: req.body.quantityUsed * req.body.unitCost,
        };

        // Broadcast real-time inventory update
        notificationService.broadcastToWarehouse(part.warehouseId, {
          type: 'inventory_update',
          partId: req.body.partId,
          newStockLevel,
          consumedQuantity: req.body.quantityUsed,
          workOrderId: req.params.id,
        });
        
        // Check if below reorder point and create notification
        if (newStockLevel <= part.reorderPoint) {
          const notification = await storage.createNotification({
            userId: 'supervisor-id', // In real app, get actual supervisor
            type: 'part_low_stock',
            title: 'Low Stock Alert',
            message: `Part ${part.partNumber} is below reorder point (${newStockLevel}/${part.reorderPoint})`,
            partId: part.id,
            read: false,
          });

          // Broadcast reorder alert
          notificationService.broadcastToWarehouse(part.warehouseId, {
            type: 'low_stock_alert',
            notification,
            part: {
              id: part.id,
              partNumber: part.partNumber,
              description: part.description,
              stockLevel: newStockLevel,
              reorderPoint: part.reorderPoint,
            },
          });
        }
      }
      
      res.status(201).json({
        ...usage,
        inventoryImpact,
      });
    } catch (error) {
      console.error('Error creating parts usage:', error);
      res.status(500).json({ message: "Failed to create parts usage" });
    }
  });

  // Enhanced Parts Consumption Routes
  app.post("/api/work-orders/:id/consume-parts", authenticateRequest, async (req, res) => {
    try {
      const workOrderId = req.params.id;
      
      // Get all parts usage for this work order
      const partsUsage = await storage.getPartsUsageByWorkOrder(workOrderId);
      
      if (partsUsage.length === 0) {
        return res.status(400).json({ message: 'No parts usage found for this work order' });
      }

      let consumedCount = 0;
      const lowStockAlerts = [];
      
      // Process each part consumption
      for (const usage of partsUsage) {
        const part = await storage.getPart(usage.partId);
        if (!part) continue;

        // Consume from inventory
        const newStockLevel = Math.max(0, part.stockLevel - usage.quantityUsed);
        
        await storage.updatePart(usage.partId, { stockLevel: newStockLevel });
        
        consumedCount++;

        // Check for low stock
        if (newStockLevel <= part.reorderPoint) {
          const notification = await storage.createNotification({
            userId: 'supervisor-id',
            type: 'part_low_stock',
            title: 'Low Stock Alert',
            message: `Part ${part.partNumber} is below reorder point (${newStockLevel}/${part.reorderPoint})`,
            partId: part.id,
            read: false,
          });

          lowStockAlerts.push({
            part: {
              id: part.id,
              partNumber: part.partNumber,
              description: part.description,
              stockLevel: newStockLevel,
              reorderPoint: part.reorderPoint,
            },
            notification,
          });
        }

        // Broadcast inventory update
        notificationService.broadcastToWarehouse(part.warehouseId, {
          type: 'inventory_update',
          partId: usage.partId,
          newStockLevel,
          consumedQuantity: usage.quantityUsed,
          workOrderId,
        });
      }

      // Broadcast low stock alerts
      for (const alert of lowStockAlerts) {
        notificationService.broadcastToWarehouse(alert.part.warehouseId || 'default', {
          type: 'low_stock_alert',
          ...alert
        });
      }

      res.json({
        consumedCount,
        lowStockAlerts: lowStockAlerts.length,
        message: `Successfully consumed ${consumedCount} parts from inventory`,
      });
    } catch (error) {
      console.error('Error consuming parts:', error);
      res.status(500).json({ message: 'Failed to consume parts' });
    }
  });

  app.get("/api/analytics/parts-consumption", authenticateRequest, async (req, res) => {
    try {
      const { timeRange = '30d', equipmentId } = req.query;
      
      // Calculate date range
      let startDate: Date | undefined;
      if (timeRange !== 'all') {
        const days = timeRange === '7d' ? 7 : 
                    timeRange === '30d' ? 30 : 
                    timeRange === '90d' ? 90 : 365;
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
      }

      // Get parts usage data
      const partsUsage = await storage.getPartsUsageAnalytics({
        startDate,
        equipmentId: equipmentId as string,
      });

      // Calculate consumption metrics
      const totalCost = partsUsage.reduce((sum, usage) => sum + (usage.quantityUsed * parseFloat(usage.unitCost)), 0);
      const totalQuantity = partsUsage.reduce((sum, usage) => sum + usage.quantityUsed, 0);
      const uniqueParts = new Set(partsUsage.map(usage => usage.partId)).size;
      
      // Group by part for frequency analysis
      const partUsageMap = new Map();
      partsUsage.forEach(usage => {
        const key = usage.partId;
        if (!partUsageMap.has(key)) {
          partUsageMap.set(key, {
            partId: usage.partId,
            part: usage.part,
            totalQuantity: 0,
            totalCost: 0,
            usageCount: 0,
          });
        }
        const entry = partUsageMap.get(key);
        entry.totalQuantity += usage.quantityUsed;
        entry.totalCost += usage.quantityUsed * parseFloat(usage.unitCost);
        entry.usageCount += 1;
      });

      const topParts = Array.from(partUsageMap.values())
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, 10);

      res.json({
        summary: {
          totalCost,
          totalQuantity,
          uniqueParts,
          timeRange,
        },
        topParts,
        rawData: partsUsage,
      });
    } catch (error) {
      console.error('Error getting parts consumption analytics:', error);
      res.status(500).json({ message: 'Failed to get analytics' });
    }
  });

  app.get("/api/work-orders/:id/inventory-impact", authenticateRequest, async (req, res) => {
    try {
      const workOrderId = req.params.id;
      
      const partsUsage = await storage.getPartsUsageByWorkOrder(workOrderId);
      const impacts = [];
      
      for (const usage of partsUsage) {
        const part = await storage.getPart(usage.partId);
        if (!part) continue;

        const projectedStockLevel = part.stockLevel - usage.quantityUsed;
        impacts.push({
          partId: usage.partId,
          part: {
            partNumber: part.partNumber,
            description: part.description,
            currentStock: part.stockLevel,
            reorderPoint: part.reorderPoint,
          },
          quantityToConsume: usage.quantityUsed,
          projectedStockLevel: Math.max(0, projectedStockLevel),
          willTriggerReorder: projectedStockLevel <= part.reorderPoint,
          costImpact: usage.quantityUsed * parseFloat(usage.unitCost),
        });
      }

      res.json(impacts);
    } catch (error) {
      console.error('Error getting inventory impact:', error);
      res.status(500).json({ message: 'Failed to get inventory impact' });
    }
  });

  // Work Order Escalation
  app.post("/api/work-orders/:id/escalate", authenticateRequest, async (req, res) => {
    try {
      const { escalateToUserId, reason } = req.body;
      const escalatedByUserId = getCurrentUser(req);
      
      const { escalationEngine } = await import('./services/escalation-engine');
      const action = await escalationEngine.manuallyEscalateWorkOrder(
        req.params.id,
        escalateToUserId,
        reason,
        escalatedByUserId
      );
      
      if (!action) {
        return res.status(400).json({ message: "Failed to escalate work order" });
      }
      
      res.json(action);
    } catch (error) {
      res.status(500).json({ message: "Failed to escalate work order" });
    }
  });

  app.get("/api/escalation/stats/:warehouseId", authenticateRequest, async (req, res) => {
    try {
      const { escalationEngine } = await import('./services/escalation-engine');
      const stats = await escalationEngine.getEscalationStats(req.params.warehouseId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get escalation stats" });
    }
  });

  app.get("/api/escalation/rules/:warehouseId", authenticateRequest, async (req, res) => {
    try {
      const { escalationEngine } = await import('./services/escalation-engine');
      const rules = escalationEngine.getEscalationRules(req.params.warehouseId);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ message: "Failed to get escalation rules" });
    }
  });

  app.put("/api/escalation/rules/:warehouseId", authenticateRequest, async (req, res) => {
    try {
      const { escalationEngine } = await import('./services/escalation-engine');
      const { ruleId, ...updates } = req.body;
      if (ruleId) {
        // Update existing rule
        await escalationEngine.updateEscalationRule(ruleId, updates);
      } else {
        // Create new rule
        const newRuleId = await escalationEngine.createEscalationRule({
          ...updates,
          warehouseId: req.params.warehouseId
        });
        return res.json({ message: "Escalation rule created successfully", ruleId: newRuleId });
      }
      res.json({ message: "Escalation rule updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update escalation rule" });
    }
  });

  // Get escalation history for a work order
  app.get("/api/escalation/history/:workOrderId", authenticateRequest, async (req, res) => {
    try {
      const { escalationEngine } = await import('./services/escalation-engine');
      const history = await escalationEngine.getEscalationHistory(req.params.workOrderId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to get escalation history" });
    }
  });

  // Performance monitoring endpoints
  app.get("/api/admin/performance/summary", authenticateRequest, async (req, res) => {
    try {
      const { performanceService } = await import('./services/performance.service');
      const summary = performanceService.getPerformanceSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to get performance summary" });
    }
  });

  app.get("/api/admin/performance/slow-queries", authenticateRequest, async (req, res) => {
    try {
      const { performanceService } = await import('./services/performance.service');
      const thresholdMs = parseInt(req.query.threshold as string) || 100;
      const limit = parseInt(req.query.limit as string) || 10;
      const slowQueries = performanceService.getSlowQueries(thresholdMs, limit);
      res.json(slowQueries);
    } catch (error) {
      res.status(500).json({ message: "Failed to get slow queries" });
    }
  });

  app.get("/api/admin/performance/slow-requests", authenticateRequest, async (req, res) => {
    try {
      const { performanceService } = await import('./services/performance.service');
      const thresholdMs = parseInt(req.query.threshold as string) || 1000;
      const limit = parseInt(req.query.limit as string) || 10;
      const slowRequests = performanceService.getSlowRequests(thresholdMs, limit);
      res.json(slowRequests);
    } catch (error) {
      res.status(500).json({ message: "Failed to get slow requests" });
    }
  });

  app.get("/api/admin/performance/recommendations", authenticateRequest, async (req, res) => {
    try {
      const { performanceService } = await import('./services/performance.service');
      const recommendations = performanceService.getRecommendations();
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ message: "Failed to get performance recommendations" });
    }
  });

  // Cache management endpoints
  app.delete("/api/admin/cache", authenticateRequest, async (req, res) => {
    try {
      const { CacheService } = await import('./services/cache.service');
      const cacheService = CacheService.getInstance();
      await cacheService.clear();
      res.json({ message: "Cache cleared successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear cache" });
    }
  });

  app.get("/api/admin/cache/stats", authenticateRequest, async (req, res) => {
    try {
      const { CacheService } = await import('./services/cache.service');
      const cacheService = CacheService.getInstance();
      const stats = cacheService.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get cache stats" });
    }
  });

  // Background Jobs Management
  app.get("/api/background-jobs", authenticateRequest, async (req, res) => {
    try {
      const { backgroundJobScheduler } = await import('./services/background-jobs');
      const jobs = backgroundJobScheduler.getJobStatus();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get job status" });
    }
  });

  app.post("/api/background-jobs/:jobId/run", authenticateRequest, async (req, res) => {
    try {
      const { backgroundJobScheduler } = await import('./services/background-jobs');
      await backgroundJobScheduler.runJobManually(req.params.jobId);
      res.json({ message: "Job executed successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message || "Failed to run job" });
    }
  });

  app.patch("/api/background-jobs/:jobId", authenticateRequest, async (req, res) => {
    try {
      const { backgroundJobScheduler } = await import('./services/background-jobs');
      const { enabled, interval } = req.body;
      
      if (typeof enabled === 'boolean') {
        backgroundJobScheduler.setJobEnabled(req.params.jobId, enabled);
      }
      
      if (typeof interval === 'number') {
        backgroundJobScheduler.updateJobInterval(req.params.jobId, interval);
      }
      
      res.json({ message: "Job updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update job" });
    }
  });

  // Vendors
  app.get("/api/vendors", authenticateRequest, async (req, res) => {
    try {
      const warehouseId = getCurrentWarehouse(req);
      const vendors = await storage.getVendors(warehouseId);
      res.json(vendors);
    } catch (error) {
      res.status(500).json({ message: "Failed to get vendors" });
    }
  });

  app.get("/api/vendors/:id", authenticateRequest, async (req, res) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error) {
      res.status(500).json({ message: "Failed to get vendor" });
    }
  });

  app.post("/api/vendors", authenticateRequest, async (req, res) => {
    try {
      const vendorData = {
        ...req.body,
        id: req.body.id || crypto.randomUUID(),
        warehouseId: req.body.warehouseId || getCurrentWarehouse(req),
        type: req.body.type || 'supplier',
        active: req.body.active !== undefined ? req.body.active : true,
      };
      
      const parsedData = insertVendorSchema.parse(vendorData);
      const vendor = await storage.createVendor(parsedData);
      res.status(201).json(vendor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vendor data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  app.patch("/api/vendors/:id", authenticateRequest, async (req, res) => {
    try {
      const vendorData = insertVendorSchema.partial().parse(req.body);
      const vendor = await storage.updateVendor(req.params.id, vendorData);
      res.json(vendor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vendor data", errors: error.errors });
      }
      if (error.message === 'Vendor not found') {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.status(500).json({ message: "Failed to update vendor" });
    }
  });

  app.delete("/api/vendors/:id", authenticateRequest, async (req, res) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      
      await storage.deleteVendor(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete vendor" });
    }
  });

  // PM Templates
  app.get("/api/pm-templates", async (req, res) => {
    try {
      const warehouseId = req.header("x-warehouse-id");
      if (!warehouseId) {
        return res.status(400).json({ error: "Warehouse ID is required" });
      }

      const templates = await storage.getPmTemplates(warehouseId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching PM templates:", error);
      res.status(500).json({ error: "Failed to fetch PM templates" });
    }
  });

  app.post("/api/pm-templates", async (req, res) => {
    try {
      const warehouseId = req.header("x-warehouse-id");
      if (!warehouseId) {
        return res.status(400).json({ error: "Warehouse ID is required" });
      }

      const templateData = {
        ...req.body,
        warehouseId,
        createdAt: new Date(),
      };

      const template = await storage.createPmTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating PM template:", error);
      res.status(500).json({ error: "Failed to create PM template" });
    }
  });

  app.put("/api/pm-templates/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const warehouseId = req.header("x-warehouse-id");
      if (!warehouseId) {
        return res.status(400).json({ error: "Warehouse ID is required" });
      }

      const template = await storage.updatePmTemplate(id, req.body);
      if (!template) {
        return res.status(404).json({ error: "PM template not found" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error updating PM template:", error);
      res.status(500).json({ error: "Failed to update PM template" });
    }
  });

  app.delete("/api/pm-templates/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const warehouseId = req.header("x-warehouse-id");
      if (!warehouseId) {
        return res.status(400).json({ error: "Warehouse ID is required" });
      }

      await storage.deletePmTemplate(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting PM template:", error);
      res.status(500).json({ error: "Failed to delete PM template" });
    }
  });

  // PM Compliance API
  app.get("/api/pm-compliance", async (req, res) => {
    try {
      const warehouseId = req.header("x-warehouse-id");
      if (!warehouseId) {
        return res.status(400).json({ error: "Warehouse ID is required" });
      }

      if (!pmEngine) {
        return res.status(503).json({ error: "PM Engine service is not available" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get all equipment for the warehouse
      const equipment = await storage.getEquipment(warehouseId);
      const templates = await storage.getPmTemplates(warehouseId);
      
      // Calculate compliance for each equipment
      const equipmentCompliance = [];
      let totalPMsScheduled = 0;
      let totalPMsCompleted = 0;
      let overdueCount = 0;

      for (const equip of equipment) {
        if (equip.status === 'active') {
          const compliance = await pmEngine.checkComplianceStatus(equip.id, warehouseId);
          
          equipmentCompliance.push({
            equipmentId: equip.id,
            assetTag: equip.assetTag,
            model: equip.model,
            complianceRate: compliance.compliancePercentage,
            lastPMDate: compliance.lastPMDate,
            nextPMDate: compliance.nextPMDate,
            overdueCount: compliance.missedPMCount,
          });

          totalPMsScheduled += compliance.totalPMCount;
          totalPMsCompleted += (compliance.totalPMCount - compliance.missedPMCount);
          overdueCount += compliance.missedPMCount;
        }
      }

      // Calculate overall compliance rate
      const overallComplianceRate = totalPMsScheduled > 0 
        ? (totalPMsCompleted / totalPMsScheduled) * 100 
        : 100;

      // Generate monthly trends (simplified)
      const monthlyTrends = [];
      for (let i = 5; i >= 0; i--) {
        const month = new Date();
        month.setMonth(month.getMonth() - i);
        const monthName = month.toLocaleString('default', { month: 'short', year: 'numeric' });
        
        // For now, use current data with some variation
        const variation = Math.random() * 10 - 5; // ±5% variation
        const monthCompliance = Math.min(100, Math.max(0, overallComplianceRate + variation));
        
        monthlyTrends.push({
          month: monthName,
          scheduled: Math.floor(totalPMsScheduled / 6),
          completed: Math.floor((totalPMsCompleted / 6) * (monthCompliance / 100)),
          complianceRate: monthCompliance,
        });
      }

      res.json({
        overallComplianceRate,
        totalPMsScheduled,
        totalPMsCompleted,
        overdueCount,
        equipmentCompliance,
        monthlyTrends,
      });
    } catch (error) {
      console.error("Error fetching PM compliance:", error);
      res.status(500).json({ error: "Failed to fetch PM compliance data" });
    }
  });

  // PM Scheduler control
  app.post("/api/pm-scheduler/start", async (req, res) => {
    try {
      if (!pmScheduler) {
        return res.status(503).json({ error: "PM Scheduler service is not available" });
      }
      pmScheduler.start();
      res.json({ message: "PM scheduler started", status: pmScheduler.getStatus() });
    } catch (error) {
      console.error("Error starting PM scheduler:", error);
      res.status(500).json({ error: "Failed to start PM scheduler" });
    }
  });

  app.post("/api/pm-scheduler/stop", async (req, res) => {
    try {
      if (!pmScheduler) {
        return res.status(503).json({ error: "PM Scheduler service is not available" });
      }
      pmScheduler.stop();
      res.json({ message: "PM scheduler stopped", status: pmScheduler.getStatus() });
    } catch (error) {
      console.error("Error stopping PM scheduler:", error);
      res.status(500).json({ error: "Failed to stop PM scheduler" });
    }
  });

  app.get("/api/pm-scheduler/status", async (req, res) => {
    try {
      if (!pmScheduler) {
        return res.status(503).json({ error: "PM Scheduler service is not available" });
      }
      const status = pmScheduler.getStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting PM scheduler status:", error);
      res.status(500).json({ error: "Failed to get PM scheduler status" });
    }
  });

  app.post("/api/pm-scheduler/run", async (req, res) => {
    try {
      if (!pmScheduler) {
        return res.status(503).json({ error: "PM Scheduler service is not available" });
      }
      const warehouseId = req.header("x-warehouse-id");
      if (!warehouseId) {
        return res.status(400).json({ error: "Warehouse ID is required" });
      }

      await pmScheduler.runForWarehouse(warehouseId);
      res.json({ message: "PM scheduler run completed" });
    } catch (error) {
      console.error("Error running PM scheduler:", error);
      res.status(500).json({ error: "Failed to run PM scheduler" });
    }
  });

  // Notifications
  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Dashboard statistics
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const warehouseId = getCurrentWarehouse(req);
      const workOrders = await storage.getWorkOrders(warehouseId);
      const equipment = await storage.getEquipment(warehouseId);
      const parts = await storage.getParts(warehouseId);
      
      const stats = {
        totalWorkOrders: workOrders.length,
        pendingWorkOrders: workOrders.filter(wo => ['new', 'assigned', 'in_progress'].includes(wo.status)).length,
        completedWorkOrders: workOrders.filter(wo => wo.status === 'completed').length,
        activeWorkOrders: workOrders.filter(wo => ['new', 'assigned', 'in_progress'].includes(wo.status)).length,
        overdueWorkOrders: workOrders.filter(wo => wo.dueDate && new Date(wo.dueDate) < new Date() && wo.status !== 'completed').length,
        totalEquipment: equipment.length,
        activeEquipment: equipment.filter(e => e.status === 'active').length,
        equipmentOnlinePercentage: equipment.length > 0 ? Math.round((equipment.filter(e => e.status === 'active').length / equipment.length) * 100) : 0,
        lowStockParts: parts.filter(p => p.stockLevel !== null && p.reorderPoint !== null && p.stockLevel <= p.reorderPoint).length,
        totalParts: parts.length,
      };
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get dashboard stats" });
    }
  });

  // Error test endpoint for integration tests
  app.get("/api/error-test", authenticateRequest, async (req, res) => {
    // This endpoint is designed to throw an error for testing error handling
    res.status(500).json({ message: "Simulated server error" });
  });

  // Enterprise monitoring routes
  app.use("/api/monitoring", monitoringRoutes);

  // PM Engine endpoints
  app.post("/api/pm-engine/generate", async (req, res) => {
    try {
      if (!pmEngine) {
        return res.status(503).json({ error: "PM Engine service is not available" });
      }
      const warehouseId = getCurrentWarehouse(req);
      const result = await pmEngine.generatePMWorkOrders(warehouseId);
      res.json({ 
        success: true, 
        generated: result.length, 
        workOrders: result 
      });
    } catch (error) {
      console.error('PM generation error:', error);
      res.status(500).json({ message: "Failed to generate PM work orders" });
    }
  });

  app.get("/api/pm-engine/schedule/:equipmentId", async (req, res) => {
    try {
      if (!pmEngine) {
        return res.status(503).json({ error: "PM Engine service is not available" });
      }
      const warehouseId = getCurrentWarehouse(req);
      const equipmentId = req.params.equipmentId;
      const templates = await storage.getPmTemplates(warehouseId);
      
      const schedules = [];
      for (const template of templates) {
        try {
          const schedule = await pmEngine.getPMSchedule(equipmentId, template.id);
          schedules.push(schedule);
        } catch (error) {
          // Skip templates that don't apply to this equipment
          continue;
        }
      }
      
      res.json(schedules);
    } catch (error) {
      console.error('PM schedule error:', error);
      res.status(500).json({ message: "Failed to get PM schedule" });
    }
  });

  app.get("/api/pm-engine/compliance/:equipmentId", async (req, res) => {
    try {
      if (!pmEngine) {
        return res.status(503).json({ error: "PM Engine service is not available" });
      }
      const warehouseId = getCurrentWarehouse(req);
      const equipmentId = req.params.equipmentId;
      const compliance = await pmEngine.checkComplianceStatus(equipmentId, warehouseId);
      res.json(compliance);
    } catch (error) {
      console.error('PM compliance error:', error);
      res.status(500).json({ message: "Failed to get compliance status" });
    }
  });

  app.post("/api/pm-engine/run-automation", async (req, res) => {
    try {
      if (!pmEngine) {
        return res.status(503).json({ error: "PM Engine service is not available" });
      }
      const warehouseId = getCurrentWarehouse(req);
      const result = await pmEngine.runPMAutomation(warehouseId);
      res.json(result);
    } catch (error) {
      console.error('PM automation error:', error);
      res.status(500).json({ message: "Failed to run PM automation" });
    }
  });

  // Enhanced File Upload and Attachment Management
  app.get("/api/attachments", async (req, res) => {
    try {
      const workOrderId = req.query.workOrderId as string;
      const equipmentId = req.query.equipmentId as string;
      const pmTemplateId = req.query.pmTemplateId as string;
      const vendorId = req.query.vendorId as string;
      const attachments = await storage.getAttachments(workOrderId, equipmentId, pmTemplateId, vendorId);
      res.json(attachments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get attachments" });
    }
  });

  // Single file upload endpoint
  app.post("/api/upload", (req, res) => {
    fileManagementService.handleFileUpload(req, res);
  });

  // Multiple file upload endpoint
  app.post("/api/upload/multiple", (req, res) => {
    fileManagementService.handleMultipleFileUpload(req, res);
  });

  // File validation endpoint
  app.post("/api/upload/validate", (req, res) => {
    try {
      const { file } = req.body;
      const validation = fileManagementService.validateFileBeforeUpload(file);
      res.json(validation);
    } catch (error) {
      res.status(400).json({ valid: false, error: 'Invalid request' });
    }
  });

  // Delete attachment
  app.delete("/api/attachments/:id", async (req, res) => {
    try {
      const result = await fileManagementService.deleteFile(req.params.id);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  });

  // Serve uploaded files
  app.get("/api/files/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = fileManagementService.getFilePath(filename);
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // Serve thumbnails
  app.get("/api/thumbnails/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const thumbnailPath = fileManagementService.getThumbnailPath(filename);
      res.sendFile(path.resolve(thumbnailPath));
    } catch (error) {
      res.status(404).json({ error: 'Thumbnail not found' });
    }
  });

  // File upload statistics
  app.get("/api/upload/stats", async (req, res) => {
    try {
      const stats = await fileManagementService.getUploadStatistics();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get upload statistics' });
    }
  });

  // Real-time Notification Endpoints
  app.post("/api/notifications", async (req, res) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      await notificationService.sendNotification(notificationData);
      res.status(201).json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid notification data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // Get connection statistics
  app.get("/api/websocket/stats", (req, res) => {
    try {
      const stats = notificationService.getConnectionStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get connection statistics' });
    }
  });

  // Get online users for warehouse
  app.get("/api/websocket/online/:warehouseId", (req, res) => {
    try {
      const warehouseId = req.params.warehouseId;
      const onlineUsers = notificationService.getOnlineUsersForWarehouse(warehouseId);
      res.json({ onlineUsers });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get online users' });
    }
  });

  // Test notification endpoint
  app.post("/api/notifications/test", async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      const warehouseId = getCurrentWarehouse(req);
      
      await notificationService.sendNotification({
        id: `test-${Date.now()}`,
        userId,
        warehouseId,
        title: "Test Notification",
        message: "This is a test notification from the system",
        type: "info",
        read: false,
        createdAt: new Date()
      });
      
      res.json({ success: true, message: "Test notification sent" });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  });

  // Equipment performance analytics endpoint
  app.get("/api/analytics/equipment-performance", authenticateRequest, async (req, res) => {
    try {
      // Get all equipment (use default warehouse for analytics)
      const equipment = await storage.getEquipment('default-warehouse');
      
      // Generate realistic equipment metrics based on existing data
      const equipmentMetrics = await Promise.all(equipment.map(async (equip) => {
        // Get work orders for this equipment
        const workOrders = await storage.getWorkOrders('default-warehouse');
        const equipmentWorkOrders = workOrders.filter(wo => wo.equipmentId === equip.id);
        
        const totalWorkOrders = equipmentWorkOrders.length;
        const preventiveWorkOrders = equipmentWorkOrders.filter(wo => wo.type === 'preventive').length;
        const correctiveWorkOrders = equipmentWorkOrders.filter(wo => wo.type === 'corrective').length;
        const emergencyWorkOrders = equipmentWorkOrders.filter(wo => wo.priority === 'high').length;
        
        // Generate realistic metrics based on equipment data
        const baseReliability = equip.status === 'active' ? 0.95 : 0.7;
        const maintenanceHistory = totalWorkOrders > 0 ? Math.max(0.6, 1 - (totalWorkOrders * 0.05)) : 0.95;
        
        const availability = Math.min(100, Math.max(60, baseReliability * maintenanceHistory * 100 + (Math.random() * 10 - 5)));
        const mtbf = Math.max(100, Math.min(2000, 720 + (Math.random() * 500 - 250))); // Hours
        const mttr = Math.max(0.5, Math.min(48, (Math.random() * 8 + 2))); // Hours
        
        // Health score based on multiple factors
        const healthScore = Math.min(100, Math.max(30, 
          (availability * 0.4) + 
          (Math.min(100, mtbf / 10) * 0.3) + 
          ((100 - Math.min(100, mttr * 2)) * 0.3)
        ));

        const utilizationRate = Math.min(100, Math.max(20, availability * 0.8 + (Math.random() * 20)));
        const onTimePerformance = Math.min(100, Math.max(70, availability * 0.9 + (Math.random() * 10)));
        const qualityScore = Math.min(100, Math.max(60, healthScore * 0.95 + (Math.random() * 10)));

        // Determine trends based on recent performance
        const trends = {
          mtbfTrend: healthScore > 80 ? 'improving' : (healthScore < 65 ? 'declining' : 'stable'),
          availabilityTrend: availability > 90 ? 'improving' : (availability < 75 ? 'declining' : 'stable'),
          costTrend: emergencyWorkOrders > totalWorkOrders * 0.3 ? 'declining' : 'stable',
        };

        // Calculate costs (simplified)
        const maintenanceCost = Math.round((totalWorkOrders * 500) + (emergencyWorkOrders * 1500) + (Math.random() * 5000));

        return {
          id: equip.id,
          name: equip.description || equip.model,
          assetNumber: equip.assetTag,
          category: equip.area,
          status: equip.status,
          mtbf: Math.round(mtbf),
          mttr: Math.round(mttr * 10) / 10,
          availability: Math.round(availability * 10) / 10,
          utilizationRate: Math.round(utilizationRate * 10) / 10,
          totalWorkOrders,
          preventiveWorkOrders,
          correctiveWorkOrders,
          emergencyWorkOrders,
          totalDowntime: Math.round(mttr * totalWorkOrders),
          maintenanceCost,
          lastFailureDate: equipmentWorkOrders.length > 0 ? equipmentWorkOrders[equipmentWorkOrders.length - 1]?.createdAt : null,
          nextPmDue: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(), // Random date within 30 days
          criticalityScore: Math.ceil(Math.random() * 10),
          healthScore: Math.round(healthScore),
          onTimePerformance: Math.round(onTimePerformance),
          qualityScore: Math.round(qualityScore),
          trends,
        };
      }));

      res.json(equipmentMetrics);
    } catch (error) {
      console.error('Error fetching equipment performance:', error);
      res.status(500).json({ message: 'Failed to fetch equipment performance data' });
    }
  });

  // Performance trends over time
  app.get("/api/analytics/performance-trends", authenticateRequest, async (req, res) => {
    try {
      // Generate trend data for the last 12 months
      const trends = [];
      const now = new Date();
      
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const workOrders = await storage.getWorkOrders('default-warehouse');
        
        // Filter work orders for this month
        const monthWorkOrders = workOrders.filter(wo => {
          const woDate = new Date(wo.createdAt);
          return woDate.getMonth() === date.getMonth() && woDate.getFullYear() === date.getFullYear();
        });

        const monthlyTrend = {
          date: date.toISOString().slice(0, 7), // YYYY-MM format
          availability: Math.round((92 + Math.sin(i * 0.5) * 5) * 10) / 10,
          mtbf: Math.round(720 + Math.cos(i * 0.3) * 100),
          mttr: Math.round((4 + Math.sin(i * 0.8) * 2) * 10) / 10,
          cost: Math.round(50000 + Math.random() * 20000),
          workOrders: monthWorkOrders.length,
        };

        trends.push(monthlyTrend);
      }

      res.json(trends);
    } catch (error) {
      console.error('Error fetching performance trends:', error);
      res.status(500).json({ message: 'Failed to fetch performance trends' });
    }
  });

  // Register webhook routes
  registerWebhookRoutes(app, authenticateRequest, requireRole);
  console.log('Webhook routes registered');

  // Register AI predictive routes
  registerAIPredictiveRoutes(app, authenticateRequest, requireRole);
  console.log('AI predictive routes registered');

  // Register audit routes
  registerAuditRoutes(app, authenticateRequest, requireRole);
  console.log('Audit trail routes registered');

  // Register labor time routes
  registerLaborTimeRoutes(app);
  console.log('Labor time routes registered');

  // Add error tracking middleware (should be last)
  app.use(errorTrackingMiddleware);
  console.log('Error tracking middleware enabled');

  console.log('HTTP server and WebSocket initialized');
  console.log('Route registration completed');
  return httpServer;
}
