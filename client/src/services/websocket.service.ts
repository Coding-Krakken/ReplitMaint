// @ts-ignore - socket.io-client import
import { io, Socket } from 'socket.io-client';
import { toast } from '@/hooks/use-toast';

export interface WebSocketNotification {
  type: string;
  data: any;
  timestamp: string;
}

export interface NotificationData {
  id: string;
  userId: string;
  warehouseId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  createdAt: Date;
  data?: any;
}

export class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions = new Map<string, (data: any) => void>();

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      // Check if socket.io is available
      if (typeof io === 'undefined') {
        console.warn('socket.io-client not available, WebSocket features disabled');
        return;
      }

      const wsUrl = process.env.NODE_ENV === 'production'
        ? `${window.location.protocol}//${window.location.host}`
        : 'http://localhost:5000';

      this.socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        timeout: 10000
      });

      this.setupEventListeners();
      console.log('WebSocket connection initiated');
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket?.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Authenticate with current user data
      this.authenticate();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;
      
      if (reason === 'io server disconnect') {
        // Reconnection will be handled automatically
        console.log('Server initiated disconnect, will retry...');
      }
    });

    this.socket.on('authenticated', (data) => {
      console.log('WebSocket authentication successful:', data);
      // Subscribe to relevant channels
      this.subscribeToDefaultChannels();
    });

    this.socket.on('authentication_error', (error) => {
      console.error('WebSocket authentication failed:', error);
    });

    this.socket.on('notification', (data: { type: string; data: NotificationData }) => {
      this.handleNotification(data.data);
    });

    this.socket.on('warehouse_notification', (data: { type: string; data: NotificationData }) => {
      this.handleWarehouseNotification(data.data);
    });

    this.socket.on('real_time_update', (data: WebSocketNotification) => {
      this.handleRealTimeUpdate(data);
    });

    this.socket.on('warehouse_update', (data: WebSocketNotification) => {
      this.handleWarehouseUpdate(data);
    });

    this.socket.on('system_alert', (data: WebSocketNotification) => {
      this.handleSystemAlert(data);
    });

    // Specific update handlers
    this.socket.on('work_order_update', (data) => {
      this.notifySubscribers('work_order_update', data);
    });

    this.socket.on('equipment_update', (data) => {
      this.notifySubscribers('equipment_update', data);
    });

    this.socket.on('inventory_update', (data) => {
      this.notifySubscribers('inventory_update', data);
    });

    this.socket.on('pm_update', (data) => {
      this.notifySubscribers('pm_update', data);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.isConnected = false;
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('WebSocket reconnection failed:', error);
    });
  }

  private authenticate(): void {
    const userId = localStorage.getItem('userId');
    const warehouseId = localStorage.getItem('warehouseId');

    if (userId && warehouseId && this.socket) {
      this.socket.emit('authenticate', { userId, warehouseId });
    } else {
      console.warn('Cannot authenticate WebSocket: missing user or warehouse ID');
    }
  }

  private subscribeToDefaultChannels(): void {
    const warehouseId = localStorage.getItem('warehouseId');
    if (!warehouseId || !this.socket) return;

    this.socket.emit('subscribe_work_orders', warehouseId);
    this.socket.emit('subscribe_equipment', warehouseId);
    this.socket.emit('subscribe_pm', warehouseId);
    this.socket.emit('subscribe_inventory', warehouseId);
  }

  private handleNotification(notification: NotificationData): void {
    console.log('Received notification:', notification);
    
    // Show toast notification
    toast({
      title: notification.title,
      description: notification.message,
      variant: notification.type === 'error' ? 'destructive' : 'default'
    });

    // Notify subscribers
    this.notifySubscribers('notification', notification);
  }

  private handleWarehouseNotification(notification: NotificationData): void {
    console.log('Received warehouse notification:', notification);
    this.notifySubscribers('warehouse_notification', notification);
  }

  private handleRealTimeUpdate(data: WebSocketNotification): void {
    console.log('Real-time update received:', data);
    this.notifySubscribers('real_time_update', data);
  }

  private handleWarehouseUpdate(data: WebSocketNotification): void {
    console.log('Warehouse update received:', data);
    this.notifySubscribers('warehouse_update', data);
  }

  private handleSystemAlert(data: WebSocketNotification): void {
    console.log('System alert received:', data);
    
    // Show important system alerts as persistent toasts
    toast({
      title: 'System Alert',
      description: data.data?.message || 'System notification received',
      variant: 'destructive'
    });

    this.notifySubscribers('system_alert', data);
  }

  private notifySubscribers(event: string, data: any): void {
    const callback = this.subscriptions.get(event);
    if (callback) {
      callback(data);
    }
  }

  // Public methods
  public isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  public subscribe(event: string, callback: (data: any) => void): () => void {
    this.subscriptions.set(event, callback);
    
    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(event);
    };
  }

  public sendTestNotification(): void {
    if (!this.socket) return;
    
    fetch('/api/notifications/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': localStorage.getItem('userId') || '',
        'x-warehouse-id': localStorage.getItem('warehouseId') || '',
      }
    }).catch(error => {
      console.error('Failed to send test notification:', error);
    });
  }

  public subscribeToWorkOrders(callback: (data: any) => void): () => void {
    return this.subscribe('work_order_update', callback);
  }

  public subscribeToEquipment(callback: (data: any) => void): () => void {
    return this.subscribe('equipment_update', callback);
  }

  public subscribeToInventory(callback: (data: any) => void): () => void {
    return this.subscribe('inventory_update', callback);
  }

  public subscribeToPM(callback: (data: any) => void): () => void {
    return this.subscribe('pm_update', callback);
  }

  public subscribeToNotifications(callback: (data: NotificationData) => void): () => void {
    return this.subscribe('notification', callback);
  }

  public getConnectionStatus(): {
    connected: boolean;
    socketId: string | null;
    reconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id || null,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  public reconnect(): void {
    if (this.socket) {
      this.socket.connect();
    } else {
      this.connect();
    }
  }

  // Force refresh authentication (useful when user/warehouse changes)
  public refreshAuthentication(): void {
    if (this.isConnected) {
      this.authenticate();
      this.subscribeToDefaultChannels();
    }
  }
}

// Create singleton instance
export const webSocketService = new WebSocketService();