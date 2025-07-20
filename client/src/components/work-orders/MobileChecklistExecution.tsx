import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOfflineService } from '@/services/offline';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Mic, 
  Camera, 
  Save,
  WifiOff,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ImageIcon
} from 'lucide-react';
import { WorkOrderChecklistItem } from '@/types';
import FileUpload from '@/components/FileUploadEnhanced';

interface MobileChecklistExecutionProps {
  workOrderId: string;
  isReadOnly?: boolean;
  onProgress?: (completed: number, total: number) => void;
  onComplete?: () => void;
}

interface ChecklistItemWithActions extends WorkOrderChecklistItem {
  hasPhotoRequired?: boolean;
  hasSignoffRequired?: boolean;
  acceptableValues?: string[];
  warningThresholds?: { min?: number; max?: number; };
  valueType?: 'text' | 'number' | 'boolean' | 'choice';
  validationRules?: string[];
}

const MobileChecklistExecution: React.FC<MobileChecklistExecutionProps> = ({
  workOrderId,
  isReadOnly = false,
  onProgress,
  onComplete
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { queueAction, getNetworkStatus, getPendingActionsCount, forceSync } = useOfflineService();
  
  // Mobile-specific state
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [localUpdates, setLocalUpdates] = useState<Map<string, Partial<ChecklistItemWithActions>>>(new Map());
  const [photos, setPhotos] = useState<Map<string, File[]>>(new Map());
  const [networkStatus, setNetworkStatus] = useState(getNetworkStatus());
  const [pendingCount, setPendingCount] = useState(getPendingActionsCount());

  // Network status monitoring
  useEffect(() => {
    const handleNetworkChange = (event: any) => {
      setNetworkStatus(event.detail);
    };

    const handleSyncComplete = () => {
      setPendingCount(getPendingActionsCount());
      toast({
        title: 'Sync Complete',
        description: 'All offline changes have been synchronized',
      });
    };

    window.addEventListener('networkStatusChange', handleNetworkChange);
    window.addEventListener('offlineSyncComplete', handleSyncComplete);

    return () => {
      window.removeEventListener('networkStatusChange', handleNetworkChange);
      window.removeEventListener('offlineSyncComplete', handleSyncComplete);
    };
  }, [toast]);

  // Fetch checklist items with offline caching
  const { data: checklistItems = [], isLoading } = useQuery({
    queryKey: ['checklist', workOrderId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/work-orders/${workOrderId}/checklist`);
        if (!response.ok) throw new Error('Failed to fetch checklist');
        const items = (await response.json()) as ChecklistItemWithActions[];
        
        // Cache in localStorage for offline access
        localStorage.setItem(`checklist_${workOrderId}`, JSON.stringify(items));
        return items;
      } catch (error) {
        // Try to load from cache if offline
        if (!networkStatus.isOnline) {
          const cached = localStorage.getItem(`checklist_${workOrderId}`);
          if (cached) {
            return JSON.parse(cached) as ChecklistItemWithActions[];
          }
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Update checklist item with offline support
  const updateChecklistItem = useMutation({
    mutationFn: async ({ itemId, updates }: { itemId: string; updates: Partial<ChecklistItemWithActions> }) => {
      // Store local update immediately
      setLocalUpdates(prev => new Map(prev.set(itemId, { ...prev.get(itemId), ...updates })));

      if (networkStatus.isOnline) {
        const response = await fetch(`/api/work-orders/${workOrderId}/checklist/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to update checklist item');
        return response.json();
      } else {
        // Queue for offline sync
        queueAction({
          type: 'update',
          table: 'work_order_checklist_items',
          data: { id: itemId, ...updates },
        });
        setPendingCount(getPendingActionsCount());
        return { id: itemId, ...updates };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', workOrderId] });
      if (networkStatus.isOnline) {
        toast({
          title: 'Item Updated',
          description: 'Checklist item saved successfully',
        });
      } else {
        toast({
          title: 'Saved Offline',
          description: 'Changes will sync when connection is restored',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Voice-to-text with enhanced mobile support
  const startVoiceRecognition = useCallback((itemId: string) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Voice Recognition Not Available',
        description: 'Please type your notes manually',
        variant: 'destructive',
      });
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      // Provide haptic feedback on mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(100);
      }
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('');

      const currentItem = getCurrentItem();
      const existingNotes = localUpdates.get(itemId)?.notes || currentItem?.notes || '';
      
      updateChecklistItem.mutate({
        itemId,
        updates: { notes: existingNotes + transcript }
      });
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast({
        title: 'Voice Recognition Error',
        description: 'Please try again or type manually',
        variant: 'destructive',
      });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [updateChecklistItem, localUpdates, toast]);

  // Photo capture with mobile optimization
  const capturePhoto = useCallback((itemId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Use rear camera on mobile
    input.multiple = true;

    input.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        setPhotos(prev => new Map(prev.set(itemId, [...(prev.get(itemId) || []), ...files])));
        toast({
          title: 'Photos Captured',
          description: `${files.length} photo(s) added to checklist item`,
        });
      }
    };

    input.click();
  }, [toast]);

  // Navigation helpers
  const getCurrentItem = () => {
    const item = checklistItems[currentItemIndex];
    if (!item) return null;
    
    // Merge with local updates
    const localUpdate = localUpdates.get(item.id);
    return localUpdate ? { ...item, ...localUpdate } : item;
  };

  const getCompletionStats = () => {
    const total = checklistItems.length;
    const completed = checklistItems.filter(item => {
      const localUpdate = localUpdates.get(item.id);
      const status = localUpdate?.status || item.status;
      return status === 'done' || status === 'skipped';
    }).length;
    
    return { completed, total, percentage: total > 0 ? (completed / total) * 100 : 0 };
  };

  const canNavigateNext = () => currentItemIndex < checklistItems.length - 1;
  const canNavigatePrev = () => currentItemIndex > 0;

  const handleStatusChange = (status: 'done' | 'skipped' | 'issue') => {
    const currentItem = getCurrentItem();
    if (!currentItem || isReadOnly) return;

    updateChecklistItem.mutate({
      itemId: currentItem.id,
      updates: { status }
    });

    // Provide haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(status === 'done' ? [50, 50, 50] : 100);
    }

    // Auto-advance to next item if not at the end
    if (status === 'done' && canNavigateNext()) {
      setTimeout(() => setCurrentItemIndex(prev => prev + 1), 500);
    }
  };

  const handleNotesChange = (notes: string) => {
    const currentItem = getCurrentItem();
    if (!currentItem || isReadOnly) return;

    updateChecklistItem.mutate({
      itemId: currentItem.id,
      updates: { notes }
    });
  };

  const stats = getCompletionStats();
  const currentItem = getCurrentItem();

  // Progress tracking
  useEffect(() => {
    onProgress?.(stats.completed, stats.total);
    
    if (stats.completed === stats.total && stats.total > 0) {
      onComplete?.();
    }
  }, [stats.completed, stats.total, onProgress, onComplete]);

  if (isLoading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading checklist...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentItem) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-600" />
          <h3 className="text-lg font-semibold mb-2">Checklist Complete!</h3>
          <p className="text-muted-foreground">All items have been processed.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Network Status & Sync Indicator */}
      <div className="flex items-center justify-between p-2 bg-card rounded-lg border">
        <div className="flex items-center space-x-2">
          {networkStatus.isOnline ? (
            <div className="w-2 h-2 bg-green-500 rounded-full" />
          ) : (
            <WifiOff className="w-4 h-4 text-orange-500" />
          )}
          <span className="text-sm text-muted-foreground">
            {networkStatus.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              {pendingCount} pending
            </Badge>
            {networkStatus.isOnline && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => forceSync()}
                className="h-6 px-2"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Progress Header */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Item {currentItemIndex + 1} of {checklistItems.length}
            </CardTitle>
            <Badge variant={currentItem.status === 'done' ? 'default' : 'secondary'}>
              {currentItem.status || 'pending'}
            </Badge>
          </div>
          <Progress value={stats.percentage} className="w-full" />
          <p className="text-sm text-muted-foreground">
            {stats.completed} of {stats.total} completed ({Math.round(stats.percentage)}%)
          </p>
        </CardHeader>
      </Card>

      {/* Current Item */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            {currentItem.component}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {currentItem.action}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={currentItem.status === 'done' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStatusChange('done')}
              disabled={isReadOnly}
              className="flex items-center space-x-1"
            >
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs">Done</span>
            </Button>
            <Button
              variant={currentItem.status === 'skipped' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStatusChange('skipped')}
              disabled={isReadOnly}
              className="flex items-center space-x-1"
            >
              <XCircle className="w-4 h-4" />
              <span className="text-xs">Skip</span>
            </Button>
            <Button
              variant={currentItem.status === 'issue' ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => handleStatusChange('issue')}
              disabled={isReadOnly}
              className="flex items-center space-x-1"
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">Issue</span>
            </Button>
          </div>

          {/* Notes Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Notes</label>
              <div className="flex space-x-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startVoiceRecognition(currentItem.id)}
                  disabled={isReadOnly || isListening}
                  className="h-8 w-8 p-0"
                >
                  <Mic className={`w-4 h-4 ${isListening ? 'text-red-500' : ''}`} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => capturePhoto(currentItem.id)}
                  disabled={isReadOnly}
                  className="h-8 w-8 p-0"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Textarea
              value={currentItem.notes || ''}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add notes, observations, or issues..."
              className="min-h-[80px] text-base"
              disabled={isReadOnly}
            />
          </div>

          {/* Photo thumbnails */}
          {photos.get(currentItem.id) && photos.get(currentItem.id)!.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Attached Photos</label>
              <div className="grid grid-cols-3 gap-2">
                {photos.get(currentItem.id)!.map((photo, index) => (
                  <div key={index} className="relative aspect-square border rounded-lg overflow-hidden">
                    <img
                      src={URL.createObjectURL(photo)}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentItemIndex(prev => prev - 1)}
              disabled={!canNavigatePrev()}
              className="flex items-center space-x-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </Button>

            <span className="text-sm text-muted-foreground">
              {currentItemIndex + 1} / {checklistItems.length}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentItemIndex(prev => prev + 1)}
              disabled={!canNavigateNext()}
              className="flex items-center space-x-1"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentItemIndex(0)}
              className="flex items-center space-x-1"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restart</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const nextIssue = checklistItems.findIndex((item, index) => {
                  const localUpdate = localUpdates.get(item.id);
                  const status = localUpdate?.status || item.status;
                  return index > currentItemIndex && status === 'issue';
                });
                if (nextIssue !== -1) {
                  setCurrentItemIndex(nextIssue);
                }
              }}
              className="flex items-center space-x-1"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Next Issue</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MobileChecklistExecution;