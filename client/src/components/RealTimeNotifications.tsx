import React, { useEffect, useState } from 'react';
import { webSocketService } from '@/services/websocket.service';
import { Bell, Wifi, WifiOff, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface NotificationData {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  createdAt: Date;
  data?: any;
}

interface ConnectionStatus {
  connected: boolean;
  socketId: string | null;
  reconnectAttempts: number;
}

export const RealTimeNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    socketId: null,
    reconnectAttempts: 0
  });
  const [stats, setStats] = useState({ totalConnections: 0, userConnections: 0 });

  useEffect(() => {
    // Subscribe to notifications
    const unsubscribeNotifications = webSocketService.subscribeToNotifications((notification) => {
      setNotifications(prev => [notification, ...prev.slice(0, 9)]); // Keep last 10
    });

    // Subscribe to work order updates
    const unsubscribeWorkOrders = webSocketService.subscribeToWorkOrders((update) => {
      console.log('Work order update:', update);
      // Handle work order updates in your work order components
    });

    // Subscribe to equipment updates
    const unsubscribeEquipment = webSocketService.subscribeToEquipment((update) => {
      console.log('Equipment update:', update);
      // Handle equipment updates in your equipment components
    });

    // Subscribe to inventory updates
    const unsubscribeInventory = webSocketService.subscribeToInventory((update) => {
      console.log('Inventory update:', update);
      // Handle inventory updates in your inventory components
    });

    // Monitor connection status
    const statusInterval = setInterval(() => {
      setConnectionStatus(webSocketService.getConnectionStatus());
    }, 2000);

    // Fetch connection stats
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/websocket/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch connection stats:', error);
      }
    };

    fetchStats();
    const statsInterval = setInterval(fetchStats, 10000);

    return () => {
      unsubscribeNotifications();
      unsubscribeWorkOrders();
      unsubscribeEquipment();
      unsubscribeInventory();
      clearInterval(statusInterval);
      clearInterval(statsInterval);
    };
  }, []);

  const handleSendTestNotification = () => {
    webSocketService.sendTestNotification();
  };

  const handleReconnect = () => {
    webSocketService.reconnect();
  };

  const getNotificationTypeColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString();
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            <CardTitle>Real-Time Notifications</CardTitle>
            <Badge variant="outline" className="ml-2">
              Phase 1 Implementation
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {connectionStatus.connected ? (
              <div className="flex items-center gap-1 text-green-600">
                <Wifi className="w-4 h-4" />
                <span className="text-sm">Connected</span>
                <Circle className="w-2 h-2 fill-current animate-pulse" />
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600">
                <WifiOff className="w-4 h-4" />
                <span className="text-sm">Disconnected</span>
              </div>
            )}
          </div>
        </div>
        <CardDescription>
          WebSocket-powered real-time notifications and live updates
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Connection Status</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReconnect}
              disabled={connectionStatus.connected}
            >
              Reconnect
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Socket ID:</span>
              <p className="font-mono text-xs break-all">
                {connectionStatus.socketId || 'Not connected'}
              </p>
            </div>
            <div>
              <span className="text-gray-600">Total Connections:</span>
              <p>{stats.totalConnections}</p>
            </div>
          </div>
        </div>

        {/* Test Controls */}
        <div className="flex gap-2">
          <Button 
            onClick={handleSendTestNotification}
            disabled={!connectionStatus.connected}
            size="sm"
          >
            Send Test Notification
          </Button>
        </div>

        <Separator />

        {/* Notifications List */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-medium">Recent Notifications</h4>
            <Badge variant="secondary">{notifications.length}</Badge>
          </div>
          
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No notifications received yet</p>
              <p className="text-xs mt-1">Send a test notification to see it appear here</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-3 rounded-lg border",
                    getNotificationTypeColor(notification.type)
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{notification.title}</p>
                      <p className="text-sm opacity-90 mt-1">{notification.message}</p>
                      {notification.data && (
                        <pre className="text-xs mt-2 opacity-70 font-mono">
                          {JSON.stringify(notification.data, null, 2)}
                        </pre>
                      )}
                    </div>
                    <span className="text-xs opacity-70 ml-2">
                      {formatTime(notification.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RealTimeNotifications;