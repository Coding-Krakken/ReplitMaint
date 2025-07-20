import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type { InsertNotification, Notification } from '../../shared/schema';
import { storage } from '../storage';

export interface NotificationService {
  initialize(httpServer: HTTPServer): void;
  sendNotification(notification: InsertNotification): Promise<void>;
  sendRealTimeUpdate(userId: string, data: any): Promise<void>;
  broadcastToWarehouse(warehouseId: string, data: any): Promise<void>;
  broadcastSystemAlert(data: any): Promise<void>;
}

class NotificationServiceImpl implements NotificationService {
  private io: SocketIOServer | null = null;
  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private warehouseSockets = new Map<string, Set<string>>(); // warehouseId -> Set of socketIds

  initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production' ? false : true,
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.io.on('connection', (socket) => {
      console.log(`Socket connected: ${socket.id}`);

      // Handle user authentication
      socket.on('authenticate', (data: { userId: string; warehouseId: string }) => {
        try {
          const { userId, warehouseId } = data;
          
          // Store user mapping
          if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
          }
          this.userSockets.get(userId)!.add(socket.id);

          // Store warehouse mapping
          if (!this.warehouseSockets.has(warehouseId)) {
            this.warehouseSockets.set(warehouseId, new Set());
          }
          this.warehouseSockets.get(warehouseId)!.add(socket.id);

          // Join user and warehouse rooms
          socket.join(`user:${userId}`);
          socket.join(`warehouse:${warehouseId}`);

          socket.emit('authenticated', { success: true });
          console.log(`User ${userId} authenticated on socket ${socket.id}`);
        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('authentication_error', { error: 'Invalid authentication data' });
        }
      });

      // Handle work order updates subscription
      socket.on('subscribe_work_orders', (warehouseId: string) => {
        socket.join(`work_orders:${warehouseId}`);
      });

      // Handle equipment updates subscription
      socket.on('subscribe_equipment', (warehouseId: string) => {
        socket.join(`equipment:${warehouseId}`);
      });

      // Handle PM updates subscription
      socket.on('subscribe_pm', (warehouseId: string) => {
        socket.join(`pm:${warehouseId}`);
      });

      // Handle inventory updates subscription
      socket.on('subscribe_inventory', (warehouseId: string) => {
        socket.join(`inventory:${warehouseId}`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        this.cleanupSocket(socket.id);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });

    console.log('Real-time notification service initialized');
  }

  private cleanupSocket(socketId: string): void {
    // Remove from user mappings
    for (const [userId, sockets] of this.userSockets.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    // Remove from warehouse mappings
    for (const [warehouseId, sockets] of this.warehouseSockets.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.warehouseSockets.delete(warehouseId);
      }
    }
  }

  async sendNotification(notificationData: any): Promise<void> {
    if (!this.io) {
      console.warn('Socket.IO not initialized, cannot send notification');
      return;
    }

    try {
      // Store notification in database
      const notification = await storage.createNotification(notificationData as InsertNotification);

      // Send real-time notification to user (userId is required in notifications table)
      if (notificationData.userId) {
        this.io.to(`user:${notificationData.userId}`).emit('notification', {
          type: 'notification',
          data: notification
        });

        // Send to warehouse if applicable (notifications are user-scoped, so get user's warehouse)
        const userProfile = await storage.getProfile(notificationData.userId);
        if (userProfile?.warehouseId) {
          this.io.to(`warehouse:${userProfile.warehouseId}`).emit('warehouse_notification', {
            type: 'warehouse_notification',
            data: notification
          });
        }
      }

      console.log('Notification sent:', notification.id);
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  }

  async sendRealTimeUpdate(userId: string, data: any): Promise<void> {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('real_time_update', {
      type: 'update',
      timestamp: new Date().toISOString(),
      data
    });
  }

  async broadcastToWarehouse(warehouseId: string, data: any): Promise<void> {
    if (!this.io) return;

    this.io.to(`warehouse:${warehouseId}`).emit('warehouse_update', {
      type: 'warehouse_update',
      timestamp: new Date().toISOString(),
      warehouseId,
      data
    });
  }

  async broadcastSystemAlert(data: any): Promise<void> {
    if (!this.io) return;

    this.io.emit('system_alert', {
      type: 'system_alert',
      timestamp: new Date().toISOString(),
      data
    });
  }

  // Helper methods for specific notification types
  async sendWorkOrderNotification(workOrderId: string, action: string, warehouseId: string): Promise<void> {
    await this.broadcastToWarehouse(warehouseId, {
      type: 'work_order',
      action,
      workOrderId
    });

    // Broadcast to specific room
    if (this.io) {
      this.io.to(`work_orders:${warehouseId}`).emit('work_order_update', {
        workOrderId,
        action,
        timestamp: new Date().toISOString()
      });
    }
  }

  async sendEquipmentNotification(equipmentId: string, action: string, warehouseId: string): Promise<void> {
    await this.broadcastToWarehouse(warehouseId, {
      type: 'equipment',
      action,
      equipmentId
    });

    if (this.io) {
      this.io.to(`equipment:${warehouseId}`).emit('equipment_update', {
        equipmentId,
        action,
        timestamp: new Date().toISOString()
      });
    }
  }

  async sendInventoryAlert(partId: string, action: string, warehouseId: string, stockLevel?: number): Promise<void> {
    await this.broadcastToWarehouse(warehouseId, {
      type: 'inventory',
      action,
      partId,
      stockLevel
    });

    if (this.io) {
      this.io.to(`inventory:${warehouseId}`).emit('inventory_update', {
        partId,
        action,
        stockLevel,
        timestamp: new Date().toISOString()
      });
    }
  }

  async sendPMNotification(pmTemplateId: string, action: string, warehouseId: string): Promise<void> {
    await this.broadcastToWarehouse(warehouseId, {
      type: 'pm',
      action,
      pmTemplateId
    });

    if (this.io) {
      this.io.to(`pm:${warehouseId}`).emit('pm_update', {
        pmTemplateId,
        action,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Get connection statistics
  getConnectionStats(): { 
    totalConnections: number; 
    userConnections: number; 
    warehouseConnections: number; 
  } {
    return {
      totalConnections: this.io ? this.io.sockets.sockets.size : 0,
      userConnections: this.userSockets.size,
      warehouseConnections: this.warehouseSockets.size
    };
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    const userSockets = this.userSockets.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  // Get online users for warehouse
  getOnlineUsersForWarehouse(warehouseId: string): string[] {
    const onlineUsers: string[] = [];
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.size > 0) {
        // Check if any of the user's sockets are in this warehouse
        for (const socketId of sockets) {
          const socket = this.io?.sockets.sockets.get(socketId);
          if (socket?.rooms.has(`warehouse:${warehouseId}`)) {
            onlineUsers.push(userId);
            break;
          }
        }
      }
    }
    return onlineUsers;
  }
}

// Create singleton instance
export const notificationService = new NotificationServiceImpl();