import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOfflineService } from '@/services/offline';
import { WifiOff, Wifi, RefreshCw, AlertCircle } from 'lucide-react';

const OfflineIndicator: React.FC = () => {
  const { getNetworkStatus, getPendingActionsCount, forceSync } = useOfflineService();
  const [networkStatus, setNetworkStatus] = useState(getNetworkStatus());
  const [pendingCount, setPendingCount] = useState(getPendingActionsCount());
  const [isSync, setIsSync] = useState(false);

  useEffect(() => {
    const handleNetworkChange = (event: any) => {
      setNetworkStatus(event.detail);
    };

    const handleSyncComplete = () => {
      setPendingCount(getPendingActionsCount());
      setIsSync(false);
    };

    window.addEventListener('networkStatusChange', handleNetworkChange);
    window.addEventListener('offlineSyncComplete', handleSyncComplete);

    // Update pending count periodically
    const interval = setInterval(() => {
      setPendingCount(getPendingActionsCount());
    }, 5000);

    return () => {
      window.removeEventListener('networkStatusChange', handleNetworkChange);
      window.removeEventListener('offlineSyncComplete', handleSyncComplete);
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    if (!networkStatus.isOnline) return;
    
    setIsSync(true);
    try {
      await forceSync();
    } catch (error) {
      console.error('Manual sync failed:', error);
    }
    setIsSync(false);
  };

  // Don't show if online and no pending actions
  if (networkStatus.isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className={`p-3 shadow-lg border-l-4 ${
        networkStatus.isOnline ? 'border-l-blue-500 bg-blue-50' : 'border-l-orange-500 bg-orange-50'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            {networkStatus.isOnline ? (
              <Wifi className="w-5 h-5 text-blue-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-orange-600" />
            )}
            <span className="text-sm font-medium">
              {networkStatus.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {pendingCount > 0 && (
            <>
              <Badge variant="outline" className="text-xs">
                {pendingCount} pending
              </Badge>
              
              {networkStatus.isOnline && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSync}
                  disabled={isSync}
                  className="h-6 px-2"
                >
                  <RefreshCw className={`w-3 h-3 ${isSync ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </>
          )}

          {!networkStatus.isOnline && pendingCount > 0 && (
            <div className="flex items-center space-x-1 text-orange-600">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs">Changes will sync when online</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default OfflineIndicator;