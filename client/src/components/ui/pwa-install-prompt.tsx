import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, Smartphone, X, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { PWAService } from '@/services/pwa.service';
import { useToast } from '@/hooks/use-toast';

export function PWAInstallPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [pwaService] = useState(() => PWAService.getInstance());
  const { toast } = useToast();

  useEffect(() => {
    const handleInstallable = () => setIsVisible(true);
    const handleInstalled = () => setIsVisible(false);

    pwaService.addEventListener('installable', handleInstallable);
    pwaService.addEventListener('installed', handleInstalled);

    // Initialize PWA service
    pwaService.initialize();

    return () => {
      pwaService.removeEventListener('installable', handleInstallable);
      pwaService.removeEventListener('installed', handleInstalled);
    };
  }, [pwaService]);

  const handleInstall = async () => {
    try {
      const success = await pwaService.installApp();
      if (success) {
        toast({
          title: 'App Installed',
          description: 'MaintainPro has been installed on your device',
        });
        setIsVisible(false);
      }
    } catch (error) {
      toast({
        title: 'Installation Failed',
        description: 'Failed to install the app. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (!isVisible) return null;

  return (
    <Card className="fixed bottom-4 right-4 w-80 z-50 shadow-lg border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Smartphone className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-sm">Install MaintainPro</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsVisible(false)}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Install this app on your device for offline access and enhanced performance
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-xs">Offline Access</Badge>
            <Badge variant="secondary" className="text-xs">Push Notifications</Badge>
            <Badge variant="secondary" className="text-xs">Faster Loading</Badge>
          </div>
          <Button onClick={handleInstall} className="w-full" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Install App
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PWAUpdatePrompt() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [pwaService] = useState(() => PWAService.getInstance());
  const { toast } = useToast();

  useEffect(() => {
    const handleUpdateAvailable = () => setHasUpdate(true);

    pwaService.addEventListener('updateAvailable', handleUpdateAvailable);

    return () => {
      pwaService.removeEventListener('updateAvailable', handleUpdateAvailable);
    };
  }, [pwaService]);

  const handleUpdate = async () => {
    try {
      await pwaService.updateApp();
      toast({
        title: 'Update Applied',
        description: 'The app has been updated. Reloading...',
      });
      // Reload will happen automatically
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: 'Failed to update the app. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (!hasUpdate) return null;

  return (
    <Card className="fixed top-4 right-4 w-80 z-50 shadow-lg border-green-200 bg-green-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-5 w-5 text-green-600" />
            <CardTitle className="text-sm">Update Available</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHasUpdate(false)}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          A new version of MaintainPro is available with improvements and bug fixes
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button onClick={handleUpdate} className="w-full" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Update Now
        </Button>
      </CardContent>
    </Card>
  );
}

export function PWAOfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingActions, setPendingActions] = useState(0);

  useEffect(() => {
    const handleNetworkChange = (event: any) => {
      setIsOnline(event.detail.isOnline);
    };

    const handleSyncProgress = (event: any) => {
      setPendingActions(event.detail.pendingCount || 0);
    };

    window.addEventListener('networkStatusChange', handleNetworkChange);
    window.addEventListener('syncProgress', handleSyncProgress);

    return () => {
      window.removeEventListener('networkStatusChange', handleNetworkChange);
      window.removeEventListener('syncProgress', handleSyncProgress);
    };
  }, []);

  if (isOnline && pendingActions === 0) return null;

  return (
    <Card className="fixed top-4 left-4 z-50 shadow-lg">
      <CardContent className="p-3">
        <div className="flex items-center space-x-2">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-green-600" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-600" />
          )}
          <div className="text-sm">
            {isOnline ? (
              pendingActions > 0 ? (
                <span className="text-amber-600">
                  Syncing {pendingActions} changes...
                </span>
              ) : (
                <span className="text-green-600">Online</span>
              )
            ) : (
              <span className="text-red-600">Working Offline</span>
            )}
          </div>
          {pendingActions > 0 && (
            <Badge variant="secondary" className="text-xs">
              {pendingActions}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}