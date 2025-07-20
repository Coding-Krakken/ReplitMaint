import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebSocketNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  data?: any;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  notifications: WebSocketNotification[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: Date | null;
  sendMessage: (event: string, data: any) => void;
  clearNotifications: () => void;
}

export const useWebSocket = (): UseWebSocketReturn => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<WebSocketNotification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    // Initialize WebSocket connection
    const initializeConnection = () => {
      try {
        setConnectionStatus('connecting');
        
        const newSocket = io({
          transports: ['websocket', 'polling'],
          timeout: 10000,
          forceNew: true,
        });

        // Connection event handlers
        newSocket.on('connect', () => {
          console.log('WebSocket connected');
          setSocket(newSocket);
          setIsConnected(true);
          setConnectionStatus('connected');
          setLastActivity(new Date());
          reconnectAttempts.current = 0;
        });

        newSocket.on('disconnect', (reason) => {
          console.log('WebSocket disconnected:', reason);
          setIsConnected(false);
          setConnectionStatus('disconnected');
          
          // Attempt to reconnect for certain disconnect reasons
          if (reason === 'io server disconnect') {
            // Server initiated disconnect, don't reconnect
            return;
          }
          
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttempts.current++;
              console.log(`Reconnection attempt ${reconnectAttempts.current}`);
              initializeConnection();
            }, Math.pow(2, reconnectAttempts.current) * 1000); // Exponential backoff
          }
        });

        newSocket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          setConnectionStatus('error');
          setIsConnected(false);
        });

        // Notification handlers
        newSocket.on('notification', (notification: WebSocketNotification) => {
          console.log('Received notification:', notification);
          setNotifications(prev => [...prev, {
            ...notification,
            id: notification.id || Date.now().toString(),
            timestamp: notification.timestamp || new Date().toISOString(),
          }].slice(-50)); // Keep only last 50 notifications
          setLastActivity(new Date());
        });

        // Real-time update handlers
        newSocket.on('work_order_updated', (data) => {
          console.log('Work order updated:', data);
          setLastActivity(new Date());
          // Notification will be added by the notification handler
        });

        newSocket.on('parts_consumed', (data) => {
          console.log('Parts consumed:', data);
          setLastActivity(new Date());
        });

        newSocket.on('stock_updated', (data) => {
          console.log('Stock updated:', data);
          setLastActivity(new Date());
        });

        newSocket.on('low_stock_alert', (data) => {
          console.log('Low stock alert:', data);
          setLastActivity(new Date());
        });

        newSocket.on('pm_scheduled', (data) => {
          console.log('PM scheduled:', data);
          setLastActivity(new Date());
        });

        newSocket.on('escalation_triggered', (data) => {
          console.log('Escalation triggered:', data);
          setLastActivity(new Date());
        });

        // Heartbeat to maintain connection
        const heartbeatInterval = setInterval(() => {
          if (newSocket.connected) {
            newSocket.emit('heartbeat');
          }
        }, 30000); // Every 30 seconds

        return () => {
          clearInterval(heartbeatInterval);
          newSocket.disconnect();
        };

      } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        setConnectionStatus('error');
      }
    };

    const cleanup = initializeConnection();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (cleanup) {
        cleanup();
      }
      setSocket(null);
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };
  }, []);

  const sendMessage = (event: string, data: any) => {
    if (socket && socket.connected) {
      socket.emit(event, data);
      setLastActivity(new Date());
    } else {
      console.warn('Cannot send message: WebSocket not connected');
    }
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return {
    socket,
    isConnected,
    notifications,
    connectionStatus,
    lastActivity,
    sendMessage,
    clearNotifications,
  };
};

export default useWebSocket;