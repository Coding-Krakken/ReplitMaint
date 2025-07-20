import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Cpu, 
  Database, 
  HardDrive, 
  Server, 
  Zap,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SystemMetrics {
  memory: {
    used: number;
    free: number;
    total: number;
    usage: number;
  };
  performance: {
    uptime: number;
    avgResponseTime: number;
    requestCount: number;
    errorCount: number;
  };
  business: {
    activeWorkOrders: number;
    overdueWorkOrders: number;
    equipmentCount: number;
    pmCompliance: number;
  };
}

interface PerformanceAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: string;
  resolved?: boolean;
  resolvedAt?: string;
}

function SystemDashboard() {
  const { toast } = useToast();

  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError
  } = useQuery<SystemMetrics>({
    queryKey: ['/api/monitoring/metrics'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const {
    data: alerts,
    isLoading: alertsLoading,
    refetch: refetchAlerts
  } = useQuery<PerformanceAlert[]>({
    queryKey: ['/api/monitoring/alerts'],
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  const resolveAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/monitoring/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        toast({ title: "Alert resolved successfully" });
        refetchAlerts();
      } else {
        throw new Error('Failed to resolve alert');
      }
    } catch (error) {
      toast({ 
        title: "Failed to resolve alert",
        description: "Please try again later",
        variant: "destructive"
      });
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <CheckCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return "text-green-600";
    if (value <= thresholds.warning) return "text-yellow-600";
    return "text-red-600";
  };

  if (metricsLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold">System Monitoring</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (metricsError) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load system metrics. Please refresh the page or contact support.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const activeAlerts = alerts?.filter(alert => !alert.resolved) || [];
  const errorRate = metrics?.performance.requestCount > 0 
    ? ((metrics.performance.errorCount / metrics.performance.requestCount) * 100).toFixed(2)
    : '0';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">System Monitoring</h1>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">Live</span>
          </div>
        </div>
      </div>

      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Server className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">System Uptime</p>
              <p className="text-2xl font-bold">{formatUptime(metrics?.performance.uptime || 0)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
              <p className={`text-2xl font-bold ${getStatusColor(metrics?.performance.avgResponseTime || 0, { good: 100, warning: 300 })}`}>
                {metrics?.performance.avgResponseTime || 0}ms
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Cpu className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Memory Usage</p>
              <p className={`text-2xl font-bold ${getStatusColor(metrics?.memory.usage || 0, { good: 60, warning: 80 })}`}>
                {metrics?.memory.usage || 0}%
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Active Alerts</p>
              <p className="text-2xl font-bold text-red-600">{activeAlerts.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Database className="h-5 w-5 mr-2" />
            System Performance
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Memory Usage</span>
                <span>{metrics?.memory.used || 0}MB / {metrics?.memory.total || 0}MB</span>
              </div>
              <Progress value={metrics?.memory.usage || 0} className="h-2" />
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{metrics?.performance.requestCount || 0}</p>
                <p className="text-sm text-gray-600">Total Requests</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${parseFloat(errorRate) > 5 ? 'text-red-600' : 'text-green-600'}`}>
                  {errorRate}%
                </p>
                <p className="text-sm text-gray-600">Error Rate</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <HardDrive className="h-5 w-5 mr-2" />
            Business Metrics
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{metrics?.business.activeWorkOrders || 0}</p>
                <p className="text-sm text-gray-600">Active Work Orders</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${(metrics?.business.overdueWorkOrders || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {metrics?.business.overdueWorkOrders || 0}
                </p>
                <p className="text-sm text-gray-600">Overdue Orders</p>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>PM Compliance</span>
                <span>{metrics?.business.pmCompliance || 0}%</span>
              </div>
              <Progress value={metrics?.business.pmCompliance || 0} className="h-2" />
            </div>
            
            <div className="text-center pt-2">
              <p className="text-2xl font-bold text-purple-600">{metrics?.business.equipmentCount || 0}</p>
              <p className="text-sm text-gray-600">Equipment Tracked</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Alerts */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Zap className="h-5 w-5 mr-2" />
          Performance Alerts
          {activeAlerts.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {activeAlerts.length} Active
            </Badge>
          )}
        </h3>
        
        {alertsLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : activeAlerts.length > 0 ? (
          <div className="space-y-3">
            {activeAlerts.slice(0, 5).map((alert) => (
              <Alert key={alert.id} variant={alert.type === 'critical' ? 'destructive' : 'default'}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getAlertIcon(alert.type)}
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm text-gray-600">{alert.message}</p>
                      <p className="text-xs text-gray-500">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolveAlert(alert.id)}
                  >
                    Resolve
                  </Button>
                </div>
              </Alert>
            ))}
            {activeAlerts.length > 5 && (
              <p className="text-sm text-gray-500 text-center">
                And {activeAlerts.length - 5} more alerts...
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">All systems operational</p>
            <p className="text-gray-500">No active performance alerts</p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default SystemDashboard;