import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Mic, 
  Camera, 
  Save,
  ChevronUp,
  ChevronDown 
} from 'lucide-react';
import { WorkOrderChecklistItem } from '@/types';
import { FileUpload } from '@/components/FileUpload';

interface ChecklistExecutionProps {
  workOrderId: string;
  isReadOnly?: boolean;
  onProgress?: (completed: number, total: number) => void;
}

interface ChecklistItemWithActions extends WorkOrderChecklistItem {
  hasPhotoRequired?: boolean;
  hasSignoffRequired?: boolean;
  acceptableValues?: string[];
  warningThresholds?: { min?: number; max?: number; };
}

const ChecklistExecution: React.FC<ChecklistExecutionProps> = ({
  workOrderId,
  isReadOnly = false,
  onProgress
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isListening, setIsListening] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Fetch checklist items
  const { data: checklistItems = [], isLoading } = useQuery({
    queryKey: ['checklist', workOrderId],
    queryFn: async () => {
      const response = await fetch(`/api/work-orders/${workOrderId}/checklist`);
      if (!response.ok) throw new Error('Failed to fetch checklist');
      return (await response.json()) as ChecklistItemWithActions[];
    },
  });

  // Update checklist item mutation
  const updateChecklistItem = useMutation({
    mutationFn: async ({ itemId, updates }: { itemId: string; updates: Partial<ChecklistItemWithActions> }) => {
      const response = await fetch(`/api/work-orders/${workOrderId}/checklist/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update checklist item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', workOrderId] });
      toast({
        title: 'Checklist Updated',
        description: 'Item status updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Voice-to-text functionality (Web Speech API)
  const startVoiceRecognition = (itemId: string) => {
    if ('speechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).speechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setActiveItemId(itemId);
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');

        // Update the notes field for the current item
        const currentItem = checklistItems.find(item => item.id === itemId);
        if (currentItem) {
          updateChecklistItem.mutate({
            itemId,
            updates: { notes: transcript }
          });
        }
      };

      recognition.onerror = (event) => {
        toast({
          title: 'Voice Recognition Error',
          description: 'Please try again or type manually',
          variant: 'destructive',
        });
        setIsListening(false);
        setActiveItemId(null);
      };

      recognition.onend = () => {
        setIsListening(false);
        setActiveItemId(null);
      };

      recognition.start();
    } else {
      toast({
        title: 'Voice Recognition Not Supported',
        description: 'Please use manual input',
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'skipped': return <XCircle className="w-5 h-5 text-gray-500" />;
      case 'issue': return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default: return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'text-green-600 bg-green-50 border-green-200';
      case 'skipped': return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'issue': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const handleStatusChange = (itemId: string, status: 'done' | 'skipped' | 'issue') => {
    updateChecklistItem.mutate({
      itemId,
      updates: { status }
    });
  };

  const handleNotesChange = (itemId: string, notes: string) => {
    // Debounced update - you might want to implement proper debouncing
    updateChecklistItem.mutate({
      itemId,
      updates: { notes }
    });
  };

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  // Calculate progress
  useEffect(() => {
    const completed = checklistItems.filter(item => item.status === 'done').length;
    const total = checklistItems.length;
    onProgress?.(completed, total);
  }, [checklistItems, onProgress]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading checklist...</div>
        </CardContent>
      </Card>
    );
  }

  if (checklistItems.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            No checklist items found for this work order
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedCount = checklistItems.filter(item => item.status === 'done').length;
  const totalCount = checklistItems.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Checklist Progress</CardTitle>
            <Badge variant="outline">
              {completedCount} / {totalCount} Complete
            </Badge>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Checklist Items */}
      <div className="space-y-3">
        {checklistItems.map((item, index) => {
          const isExpanded = expandedItems.has(item.id);
          
          return (
            <Card key={item.id} className={`border ${getStatusColor(item.status)}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(item.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-500">
                          {index + 1}.
                        </span>
                        <h3 className="font-medium text-gray-900 truncate">
                          {item.component}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">
                        {item.action}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">
                      {item.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpanded(item.id)}
                      className="p-1"
                    >
                      {isExpanded ? 
                        <ChevronUp className="w-4 h-4" /> : 
                        <ChevronDown className="w-4 h-4" />
                      }
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0">
                  {!isReadOnly && (
                    <div className="space-y-4">
                      {/* Status Controls */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={item.status === 'done' ? 'default' : 'outline'}
                          onClick={() => handleStatusChange(item.id, 'done')}
                          className="text-xs"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant={item.status === 'skipped' ? 'default' : 'outline'}
                          onClick={() => handleStatusChange(item.id, 'skipped')}
                          className="text-xs"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Skip
                        </Button>
                        <Button
                          size="sm"
                          variant={item.status === 'issue' ? 'default' : 'outline'}
                          onClick={() => handleStatusChange(item.id, 'issue')}
                          className="text-xs"
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Issue
                        </Button>
                      </div>

                      {/* Notes Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-gray-700">
                            Notes
                          </label>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startVoiceRecognition(item.id)}
                              disabled={isListening && activeItemId !== item.id}
                              className="text-xs"
                            >
                              <Mic className={`w-3 h-3 mr-1 ${
                                isListening && activeItemId === item.id ? 'text-red-500' : ''
                              }`} />
                              {isListening && activeItemId === item.id ? 'Listening...' : 'Voice'}
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          placeholder="Add notes, measurements, or observations..."
                          value={item.notes || ''}
                          onChange={(e) => handleNotesChange(item.id, e.target.value)}
                          className="text-sm"
                          rows={3}
                        />
                      </div>

                      {/* Photo Attachment */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                          Attachments
                        </label>
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
                    </div>
                  )}

                  {/* Read-only mode - show notes only */}
                  {isReadOnly && item.notes && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-md">
                      <p className="text-sm text-gray-700">{item.notes}</p>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Quick Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{completedCount}</div>
              <div className="text-sm text-gray-500">Completed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-500">
                {checklistItems.filter(i => i.status === 'skipped').length}
              </div>
              <div className="text-sm text-gray-500">Skipped</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {checklistItems.filter(i => i.status === 'issue').length}
              </div>
              <div className="text-sm text-gray-500">Issues</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {checklistItems.filter(i => i.status === 'pending').length}
              </div>
              <div className="text-sm text-gray-500">Pending</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChecklistExecution;