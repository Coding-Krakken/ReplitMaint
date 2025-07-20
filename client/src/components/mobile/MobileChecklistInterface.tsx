import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, AlertTriangle, Clock, Camera, Mic, Zap } from 'lucide-react';
import { WorkOrderChecklistItem } from '@/types';
import { FileUpload } from '@/components/FileUpload';
import { useMobile } from '@/hooks/useMobile';

interface MobileChecklistInterfaceProps {
  workOrderId: string;
  isReadOnly?: boolean;
  onProgress?: (completed: number, total: number) => void;
}

interface ChecklistItemWithMobile extends WorkOrderChecklistItem {
  hasPhotoRequired?: boolean;
  hasSignoffRequired?: boolean;
  acceptableValues?: string[];
  warningThresholds?: { min?: number; max?: number; };
  priority: 'low' | 'medium' | 'high' | 'critical';
}

const MobileChecklistInterface: React.FC<MobileChecklistInterfaceProps> = ({
  workOrderId,
  isReadOnly = false,
  onProgress
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isMobile, isTablet, isTouchDevice } = useMobile();
  
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [tempNotes, setTempNotes] = useState<Record<string, string>>({});

  // Fetch checklist items
  const { data: checklistItems = [], isLoading } = useQuery({
    queryKey: ['work-order-checklist', workOrderId],
    queryFn: () => fetch(`/api/work-orders/${workOrderId}/checklist`).then(res => res.json()),
  });

  // Update checklist item
  const updateItemMutation = useMutation({
    mutationFn: (data: { itemId: string; status: string; notes?: string; result?: string }) =>
      fetch(`/api/work-orders/${workOrderId}/checklist/${data.itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-order-checklist', workOrderId] });
      toast({
        title: 'Item Updated',
        description: 'Checklist item updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update checklist item',
        variant: 'destructive',
      });
    },
  });

  const currentItem: ChecklistItemWithMobile | undefined = checklistItems[currentItemIndex];
  const completedCount = checklistItems.filter((item: any) => item.status === 'done').length;
  const totalCount = checklistItems.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Voice recognition handlers
  const startVoiceRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Voice Recognition Not Supported',
        description: 'Your browser does not support voice recognition',
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
      setIsVoiceMode(true);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript && currentItem) {
        const currentNotes = tempNotes[currentItem.id] || '';
        setTempNotes(prev => ({
          ...prev,
          [currentItem.id]: currentNotes + ' ' + finalTranscript
        }));
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast({
        title: 'Voice Recognition Error',
        description: 'Failed to recognize speech. Please try again.',
        variant: 'destructive',
      });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopVoiceRecognition = () => {
    setIsListening(false);
    setIsVoiceMode(false);
  };

  const handleStatusUpdate = (status: string, result?: string) => {
    if (!currentItem) return;
    
    const notes = tempNotes[currentItem.id] || currentItem.notes || '';
    
    updateItemMutation.mutate({
      itemId: currentItem.id,
      status,
      notes,
      result
    });

    // Auto-advance to next item if not completed
    if (currentItemIndex < checklistItems.length - 1 && status === 'done') {
      setTimeout(() => setCurrentItemIndex(prev => prev + 1), 500);
    }
  };

  const navigateToItem = (index: number) => {
    if (index >= 0 && index < checklistItems.length) {
      setCurrentItemIndex(index);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'border-green-500 bg-green-50';
      case 'issue': return 'border-red-500 bg-red-50';
      case 'skipped': return 'border-gray-500 bg-gray-50';
      default: return 'border-blue-500 bg-blue-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  // Update progress
  useEffect(() => {
    onProgress?.(completedCount, totalCount);
  }, [completedCount, totalCount, onProgress]);

  if (isLoading) {
    return (
      <Card className="h-screen flex items-center justify-center">
        <CardContent>
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p>Loading mobile checklist...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (checklistItems.length === 0) {
    return (
      <Card className="h-screen flex items-center justify-center">
        <CardContent className="text-center space-y-4">
          <AlertTriangle className="w-16 h-16 mx-auto text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold">No Checklist Items</h3>
            <p className="text-gray-500">This work order has no checklist items.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Mobile Header with Progress */}
      <Card className="rounded-none border-x-0 border-t-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Mobile Checklist</CardTitle>
            <Badge variant="outline" className="text-sm">
              {currentItemIndex + 1} of {totalCount}
            </Badge>
          </div>
          <div className="space-y-2">
            <Progress value={progressPercentage} className="h-3" />
            <div className="flex justify-between text-sm text-gray-600">
              <span>{completedCount} completed</span>
              <span>{progressPercentage.toFixed(0)}% done</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Current Item Display */}
      <div className="flex-1 p-4 overflow-y-auto">
        {currentItem && (
          <Card className={`h-full ${getStatusColor(currentItem.status)}`}>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className={getPriorityColor(currentItem.priority || 'medium')}>
                      {(currentItem.priority || 'medium').toUpperCase()}
                    </Badge>
                    {currentItem.hasPhotoRequired && (
                      <Badge variant="outline">
                        <Camera className="w-3 h-3 mr-1" />
                        Photo Required
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl font-semibold">
                    {currentItem.component}
                  </CardTitle>
                  <p className="text-gray-700 text-base leading-relaxed">
                    {currentItem.action}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Action Buttons - Large and Touch-Friendly */}
              {!isReadOnly && (
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="h-16 text-green-700 border-green-300 hover:bg-green-50"
                    onClick={() => handleStatusUpdate('done')}
                    disabled={updateItemMutation.isPending}
                  >
                    <CheckCircle className="w-6 h-6 mr-2" />
                    Complete
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="h-16 text-red-700 border-red-300 hover:bg-red-50"
                    onClick={() => handleStatusUpdate('issue')}
                    disabled={updateItemMutation.isPending}
                  >
                    <XCircle className="w-6 h-6 mr-2" />
                    Issue
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="h-16 text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                    onClick={() => handleStatusUpdate('skipped')}
                    disabled={updateItemMutation.isPending}
                  >
                    <AlertTriangle className="w-6 h-6 mr-2" />
                    Skip
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="h-16 text-blue-700 border-blue-300 hover:bg-blue-50"
                    onClick={() => handleStatusUpdate('pending')}
                    disabled={updateItemMutation.isPending}
                  >
                    <Clock className="w-6 h-6 mr-2" />
                    Pending
                  </Button>
                </div>
              )}

              {/* Notes Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Notes & Observations</label>
                  {!isReadOnly && isTouchDevice && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
                      className={isListening ? 'bg-red-50 border-red-300' : ''}
                    >
                      <Mic className={`w-4 h-4 mr-1 ${isListening ? 'text-red-600' : ''}`} />
                      {isListening ? 'Stop' : 'Voice'}
                    </Button>
                  )}
                </div>
                
                <Textarea
                  placeholder="Add notes, measurements, or observations..."
                  value={tempNotes[currentItem.id] || currentItem.notes || ''}
                  onChange={(e) => setTempNotes(prev => ({
                    ...prev,
                    [currentItem.id]: e.target.value
                  }))}
                  className="min-h-24 text-base"
                  disabled={isReadOnly}
                />
              </div>

              {/* Photo Attachment */}
              {!isReadOnly && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Attachments</label>
                  <FileUpload
                    workOrderId={workOrderId}
                    onUploadSuccess={(url, fileName) => {
                      toast({
                        title: 'Photo Added',
                        description: `${fileName} uploaded successfully`,
                      });
                    }}
                    onUploadError={(error) => {
                      toast({
                        title: 'Upload Failed',
                        description: error,
                        variant: 'destructive',
                      });
                    }}
                  />
                </div>
              )}

              {/* Quick Actions for Mobile */}
              {!isReadOnly && (
                <div className="flex space-x-2 pt-4 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateToItem(currentItemIndex - 1)}
                    disabled={currentItemIndex === 0}
                  >
                    ← Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateToItem(currentItemIndex + 1)}
                    disabled={currentItemIndex === checklistItems.length - 1}
                    className="ml-auto"
                  >
                    Next →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Navigation Footer */}
      <Card className="rounded-none border-x-0 border-b-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2 overflow-x-auto">
            {checklistItems.map((item: any, index: number) => (
              <Button
                key={item.id}
                variant={index === currentItemIndex ? "default" : "outline"}
                size="sm"
                className={`flex-shrink-0 w-10 h-10 p-0 ${getStatusColor(item.status).split(' ')[0]}`}
                onClick={() => navigateToItem(index)}
              >
                {index + 1}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MobileChecklistInterface;