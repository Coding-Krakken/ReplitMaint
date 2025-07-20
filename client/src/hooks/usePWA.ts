import { useState, useEffect } from 'react';
import { pwaService, PWAStatus } from '@/services/pwa.service';

export interface PWAActions {
  showInstallPrompt: () => Promise<boolean>;
  requestNotifications: () => Promise<NotificationPermission>;
  updateApp: () => Promise<void>;
  showNotification: (title: string, options?: NotificationOptions) => Promise<void>;
}

export function usePWA() {
  const [status, setStatus] = useState<PWAStatus>(() => pwaService.getStatus());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize PWA service after React is ready
    const initializePWA = async () => {
      try {
        await pwaService.initialize();
        setIsLoading(false);
        setStatus(pwaService.getStatus());
      } catch (error) {
        console.error('Failed to initialize PWA:', error);
        setIsLoading(false);
      }
    };

    initializePWA();

    // Setup event listeners
    const unsubscribeStatus = pwaService.addEventListener('statusChange', (newStatus) => {
      setStatus(newStatus);
    });

    const unsubscribeInstallable = pwaService.addEventListener('installable', () => {
      setStatus(pwaService.getStatus());
    });

    const unsubscribeInstalled = pwaService.addEventListener('installed', () => {
      setStatus(pwaService.getStatus());
    });

    const unsubscribeNetwork = pwaService.addEventListener('networkChange', (data) => {
      setStatus(prev => ({ ...prev, isOnline: data.isOnline }));
    });

    const unsubscribeUpdate = pwaService.addEventListener('updateAvailable', () => {
      setStatus(prev => ({ ...prev, hasUpdate: true }));
    });

    return () => {
      unsubscribeStatus();
      unsubscribeInstallable();
      unsubscribeInstalled();
      unsubscribeNetwork();
      unsubscribeUpdate();
    };
  }, []);

  const actions: PWAActions = {
    showInstallPrompt: () => pwaService.showInstallPrompt(),
    requestNotifications: () => pwaService.requestNotificationPermission(),
    updateApp: () => pwaService.updateServiceWorker(),
    showNotification: (title: string, options?: NotificationOptions) => 
      pwaService.showNotification(title, options)
  };

  return {
    ...status,
    isLoading,
    actions
  };
}