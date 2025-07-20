import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { 
  Clock, 
  Play, 
  Pause, 
  Square, 
  Plus, 
  Trash2,
  Users,
  Timer,
  Save,
  Calculator
} from 'lucide-react';
import { formatDistance } from 'date-fns';

interface LaborTimeTrackerProps {
  workOrderId: string;
  isReadOnly?: boolean;
  onTimeUpdate?: (totalHours: number) => void;
}

interface LaborEntry {
  id?: string;
  workOrderId: string;
  userId: string;
  userName?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in minutes
  description: string;
  isActive: boolean;
  createdAt?: Date;
}

interface TimeSession {
  startTime: Date;
  duration: number;
  description: string;
}

const LaborTimeTracker: React.FC<LaborTimeTrackerProps> = ({
  workOrderId,
  isReadOnly = false,
  onTimeUpdate
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [currentSession, setCurrentSession] = useState<TimeSession | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [newDescription, setNewDescription] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualDescription, setManualDescription] = useState('');

  // Fetch existing labor entries
  const { data: laborEntries = [], isLoading } = useQuery({
    queryKey: ['laborTime', workOrderId],
    queryFn: async () => {
      const response = await fetch(`/api/work-orders/${workOrderId}/labor-time`);
      if (!response.ok) throw new Error('Failed to fetch labor time');
      return (await response.json()) as LaborEntry[];
    },
  });

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking && currentSession) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - currentSession.startTime.getTime()) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking, currentSession]);

  // Calculate total hours
  const totalHours = laborEntries.reduce((total, entry) => {
    return total + (entry.duration || 0);
  }, 0) / 60;

  useEffect(() => {
    onTimeUpdate?.(totalHours);
  }, [totalHours, onTimeUpdate]);

  // Start time tracking mutation
  const startTracking = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/work-orders/${workOrderId}/labor-time/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newDescription || 'Work in progress'
        }),
      });
      if (!response.ok) throw new Error('Failed to start time tracking');
      return response.json();
    },
    onSuccess: (data) => {
      setIsTracking(true);
      setCurrentSession({
        startTime: new Date(),
        duration: 0,
        description: newDescription || 'Work in progress'
      });
      setElapsedTime(0);
      toast({
        title: 'Time Tracking Started',
        description: 'Timer started for this work order',
      });
    },
  });

  // Stop time tracking mutation
  const stopTracking = useMutation({
    mutationFn: async () => {
      if (!currentSession) throw new Error('No active session');
      
      const duration = Math.floor((new Date().getTime() - currentSession.startTime.getTime()) / 1000 / 60);
      
      const response = await fetch(`/api/work-orders/${workOrderId}/labor-time/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration,
          description: currentSession.description
        }),
      });
      if (!response.ok) throw new Error('Failed to stop time tracking');
      return response.json();
    },
    onSuccess: () => {
      setIsTracking(false);
      setCurrentSession(null);
      setElapsedTime(0);
      setNewDescription('');
      queryClient.invalidateQueries({ queryKey: ['laborTime', workOrderId] });
      toast({
        title: 'Time Tracking Stopped',
        description: 'Labor time recorded successfully',
      });
    },
  });

  // Add manual time entry mutation
  const addManualTime = useMutation({
    mutationFn: async () => {
      const hours = parseInt(manualHours) || 0;
      const minutes = parseInt(manualMinutes) || 0;
      const totalMinutes = (hours * 60) + minutes;
      
      if (totalMinutes === 0) throw new Error('Duration must be greater than 0');
      if (!manualDescription.trim()) throw new Error('Description is required');
      
      const response = await fetch(`/api/work-orders/${workOrderId}/labor-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: totalMinutes,
          description: manualDescription,
          isManual: true
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add labor time');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laborTime', workOrderId] });
      setManualHours('');
      setManualMinutes('');
      setManualDescription('');
      toast({
        title: 'Labor Time Added',
        description: 'Manual time entry recorded successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Add Labor Time',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete labor entry mutation
  const deleteLaborEntry = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await fetch(`/api/work-orders/${workOrderId}/labor-time/${entryId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete labor entry');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laborTime', workOrderId] });
      toast({
        title: 'Labor Entry Deleted',
        description: 'Time entry removed successfully',
      });
    },
  });

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-4"><Clock className="animate-spin h-6 w-6" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Current Session Timer */}
      {!isReadOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Time Tracker
              {isTracking && <Badge variant="destructive">TRACKING</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isTracking && currentSession ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-mono font-bold text-primary">
                    {formatTime(elapsedTime)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentSession.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Started {formatDistance(currentSession.startTime, new Date(), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button 
                    onClick={() => stopTracking.mutate()}
                    disabled={stopTracking.isPending}
                    variant="destructive"
                    size="sm"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop & Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Task Description</label>
                  <Textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Describe what you're working on..."
                    className="mt-1"
                  />
                </div>
                <Button 
                  onClick={() => startTracking.mutate()}
                  disabled={startTracking.isPending}
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Timer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual Time Entry */}
      {!isReadOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Manual Time
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Hours</label>
                <Input
                  type="number"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="0"
                  min="0"
                  max="24"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Minutes</label>
                <Input
                  type="number"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="0"
                  min="0"
                  max="59"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Describe the work performed..."
              />
            </div>
            <Button 
              onClick={() => addManualTime.mutate()}
              disabled={addManualTime.isPending}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              Add Time Entry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Time Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Labor Time Summary
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Calculator className="h-3 w-3" />
              Total: {totalHours.toFixed(2)}h
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {laborEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No labor time recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {laborEntries.map((entry, index) => (
                <div key={entry.id || index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{entry.userName || 'Unknown User'}</span>
                      <Badge variant="secondary">
                        {formatDuration(entry.duration || 0)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.description}</p>
                    {entry.createdAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {!isReadOnly && entry.userId === user?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => entry.id && deleteLaborEntry.mutate(entry.id)}
                      disabled={deleteLaborEntry.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LaborTimeTracker;