/**
 * Offline service for managing data synchronization and offline capabilities
 */

interface OfflineAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
}

interface NetworkStatus {
  isOnline: boolean;
  lastOnline?: Date;
  connectionType?: string;
}

class OfflineService {
  private actions: OfflineAction[] = [];
  private networkStatus: NetworkStatus = { isOnline: navigator.onLine };
  private syncInProgress = false;
  private storageKey = 'maintainpro_offline_actions';

  constructor() {
    this.loadActionsFromStorage();
    this.setupNetworkListeners();
    this.setupPeriodicSync();
  }

  private setupNetworkListeners() {
    const updateNetworkStatus = () => {
      const wasOffline = !this.networkStatus.isOnline;
      this.networkStatus = {
        isOnline: navigator.onLine,
        lastOnline: navigator.onLine ? new Date() : this.networkStatus.lastOnline,
        connectionType: this.getConnectionType(),
      };

      // Broadcast network status change
      this.broadcastNetworkStatus();

      // Auto-sync when coming back online
      if (wasOffline && navigator.onLine && this.actions.length > 0) {
        setTimeout(() => this.syncActions(), 1000); // Delay to ensure connection is stable
      }
    };

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    // Update status immediately
    updateNetworkStatus();
  }

  private setupPeriodicSync() {
    // Attempt sync every 30 seconds when online
    setInterval(() => {
      if (this.networkStatus.isOnline && this.actions.length > 0 && !this.syncInProgress) {
        this.syncActions();
      }
    }, 30000);
  }

  private getConnectionType(): string {
    // @ts-ignore - experimental API
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return connection?.effectiveType || 'unknown';
  }

  private loadActionsFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.actions = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load offline actions:', error);
      this.actions = [];
    }
  }

  private saveActionsToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.actions));
    } catch (error) {
      console.error('Failed to save offline actions:', error);
    }
  }

  private broadcastNetworkStatus() {
    const event = new CustomEvent('networkStatusChange', {
      detail: this.networkStatus
    });
    window.dispatchEvent(event);
  }

  private async broadcastSyncComplete() {
    const event = new CustomEvent('offlineSyncComplete', {
      detail: { syncedActions: this.actions.length }
    });
    window.dispatchEvent(event);
  }

  /**
   * Queue an action to be performed when online
   */
  queueAction(action: Omit<OfflineAction, 'id' | 'timestamp'>) {
    const offlineAction: OfflineAction = {
      ...action,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.actions.push(offlineAction);
    this.saveActionsToStorage();

    // Try to sync immediately if online
    if (this.networkStatus.isOnline && !this.syncInProgress) {
      this.syncActions();
    }

    return offlineAction.id;
  }

  /**
   * Get current network status
   */
  getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }

  /**
   * Get number of pending actions
   */
  getPendingActionsCount(): number {
    return this.actions.length;
  }

  /**
   * Get all pending actions
   */
  getPendingActions(): OfflineAction[] {
    return [...this.actions];
  }

  /**
   * Force sync all pending actions
   */
  async forceSync(): Promise<boolean> {
    if (!this.networkStatus.isOnline) {
      throw new Error('Cannot sync while offline');
    }

    return this.syncActions();
  }

  /**
   * Clear all pending actions (use with caution)
   */
  clearPendingActions() {
    this.actions = [];
    this.saveActionsToStorage();
  }

  /**
   * Sync all pending actions with the server
   */
  private async syncActions(): Promise<boolean> {
    if (this.syncInProgress || !this.networkStatus.isOnline || this.actions.length === 0) {
      return false;
    }

    this.syncInProgress = true;
    let syncedCount = 0;
    const failedActions: OfflineAction[] = [];

    try {
      // Process actions in chronological order
      const sortedActions = [...this.actions].sort((a, b) => a.timestamp - b.timestamp);

      for (const action of sortedActions) {
        try {
          await this.performAction(action);
          syncedCount++;
        } catch (error) {
          console.error('Failed to sync action:', action, error);
          failedActions.push(action);
        }
      }

      // Keep only failed actions
      this.actions = failedActions;
      this.saveActionsToStorage();

      if (syncedCount > 0) {
        console.log(`Synced ${syncedCount} offline actions`);
        this.broadcastSyncComplete();
      }

      return failedActions.length === 0;
    } catch (error) {
      console.error('Sync process failed:', error);
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Perform a single action against the server
   */
  private async performAction(action: OfflineAction): Promise<void> {
    const { type, table, data } = action;
    let url = '';
    let method = '';
    let body: any = null;

    switch (type) {
      case 'create':
        if (table === 'work_order_checklist_items') {
          url = `/api/work-orders/${data.workOrderId}/checklist`;
          method = 'POST';
          body = data;
        } else if (table === 'parts_usage') {
          url = `/api/work-orders/${data.workOrderId}/parts-usage`;
          method = 'POST';
          body = data;
        } else {
          url = `/api/${table}`;
          method = 'POST';
          body = data;
        }
        break;

      case 'update':
        if (table === 'work_order_checklist_items') {
          url = `/api/work-orders/checklist/${data.id}`;
          method = 'PATCH';
          body = data;
        } else if (table === 'work_orders') {
          url = `/api/work-orders/${data.id}`;
          method = 'PATCH';
          body = data;
        } else {
          url = `/api/${table}/${data.id}`;
          method = 'PATCH';
          body = data;
        }
        break;

      case 'delete':
        url = `/api/${table}/${data.id}`;
        method = 'DELETE';
        break;

      default:
        throw new Error(`Unknown action type: ${type}`);
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
  }

  private generateId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const offlineService = new OfflineService();

// Export hook for React components
export function useOfflineService() {
  return {
    queueAction: offlineService.queueAction.bind(offlineService),
    getNetworkStatus: offlineService.getNetworkStatus.bind(offlineService),
    getPendingActionsCount: offlineService.getPendingActionsCount.bind(offlineService),
    getPendingActions: offlineService.getPendingActions.bind(offlineService),
    forceSync: offlineService.forceSync.bind(offlineService),
    clearPendingActions: offlineService.clearPendingActions.bind(offlineService),
  };
}