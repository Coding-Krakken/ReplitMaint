import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp, Database, Server, Globe, RefreshCw } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface PerformanceData {
  requests: {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  database: {
    totalQueries: number;
    averageQueryTime: number;
    p95QueryTime: number;
    p99QueryTime: number;
    queryTypeBreakdown: Record<string, number>;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    heapUsed: number;
    heapTotal: number;
    uptime: number;
    eventLoopLag: number;
  };
  cache: {
    hitRate: number;
    missRate: number;
    totalHits: number;
    totalMisses: number;
  };
}

interface SlowQuery {
  queryTime: number;
  queryType: string;
  tableName?: string;
  timestamp: number;
}

interface SlowRequest {
  method: string;
  path: string;
  responseTime: number;
  statusCode: number;
  timestamp: number;
}

export function PerformanceDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: performanceData, refetch: refetchPerformance, isLoading } = useQuery<PerformanceData>({
    queryKey: ['/api/admin/performance/summary'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: slowQueries } = useQuery<SlowQuery[]>({
    queryKey: ['/api/admin/performance/slow-queries'],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: slowRequests } = useQuery<SlowRequest[]>({
    queryKey: ['/api/admin/performance/slow-requests'],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: recommendations } = useQuery<string[]>({
    queryKey: ['/api/admin/performance/recommendations'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchPerformance();
    setIsRefreshing(false);
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getPerformanceStatus = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.warning) return 'warning';
    return 'critical';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading performance data...</span>
      </div>
    );
  }

  if (!performanceData) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
        <p className="text-gray-600">Unable to load performance data</p>
      </div>
    );
  }

  const requestStatus = getPerformanceStatus(performanceData.requests.averageResponseTime, { good: 200, warning: 500 });
  const databaseStatus = getPerformanceStatus(performanceData.database.averageQueryTime, { good: 50, warning: 100 });
  const memoryStatus = getPerformanceStatus(performanceData.system.memoryUsage, { good: 0.5, warning: 0.8 });
  const errorStatus = getPerformanceStatus(performanceData.requests.errorRate, { good: 0.01, warning: 0.05 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance Dashboard</h1>
          <p className="text-muted-foreground">Monitor system performance and optimization metrics</p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className={getStatusColor(requestStatus)}>
                {performanceData.requests.averageResponseTime.toFixed(0)}ms
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              P95: {performanceData.requests.p95ResponseTime.toFixed(0)}ms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Performance</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className={getStatusColor(databaseStatus)}>
                {performanceData.database.averageQueryTime.toFixed(0)}ms
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {performanceData.database.totalQueries} queries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className={getStatusColor(memoryStatus)}>
                {(performanceData.system.memoryUsage * 100).toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={performanceData.system.memoryUsage * 100} 
              className="mt-2" 
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className="text-green-600">
                {(performanceData.cache.hitRate * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {performanceData.cache.totalHits.toLocaleString()} hits
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Current system resource utilization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">CPU Usage</span>
                    <span className="text-sm text-muted-foreground">
                      {performanceData.system.cpuUsage.toFixed(2)}%
                    </span>
                  </div>
                  <Progress value={performanceData.system.cpuUsage} />
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Memory Usage</span>
                    <span className="text-sm text-muted-foreground">
                      {performanceData.system.heapUsed.toFixed(0)}MB / {performanceData.system.heapTotal.toFixed(0)}MB
                    </span>
                  </div>
                  <Progress value={(performanceData.system.heapUsed / performanceData.system.heapTotal) * 100} />
                </div>

                <div className="pt-4 border-t">
                  <div className="text-sm">
                    <span className="font-medium">Uptime:</span> {formatUptime(performanceData.system.uptime)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Request Metrics</CardTitle>
                <CardDescription>HTTP request performance statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold">{performanceData.requests.totalRequests.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      <span className={getStatusColor(errorStatus)}>
                        {(performanceData.requests.errorRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Error Rate</p>
                  </div>
                </div>
                
                <div>
                  <div className="text-lg font-semibold">{performanceData.requests.throughput.toFixed(1)} req/s</div>
                  <p className="text-xs text-muted-foreground">Throughput</p>
                </div>

                <div className="pt-4 border-t">
                  <div className="text-sm space-y-1">
                    <div>P95 Response Time: {performanceData.requests.p95ResponseTime.toFixed(0)}ms</div>
                    <div>P99 Response Time: {performanceData.requests.p99ResponseTime.toFixed(0)}ms</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Slow Requests</CardTitle>
              <CardDescription>Requests taking longer than 1 second</CardDescription>
            </CardHeader>
            <CardContent>
              {slowRequests && slowRequests.length > 0 ? (
                <div className="space-y-2">
                  {slowRequests.map((request, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center space-x-2">
                        <Badge variant={request.statusCode >= 400 ? 'destructive' : 'secondary'}>
                          {request.method}
                        </Badge>
                        <code className="text-sm">{request.path}</code>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{request.responseTime.toFixed(0)}ms</div>
                        <div className="text-xs text-muted-foreground">
                          Status: {request.statusCode}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No slow requests detected</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Query Type Distribution</CardTitle>
                <CardDescription>Breakdown by query type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={Object.entries(performanceData.database.queryTypeBreakdown).map(([type, count]) => ({
                    type,
                    count
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Slow Queries</CardTitle>
                <CardDescription>Queries taking longer than 100ms</CardDescription>
              </CardHeader>
              <CardContent>
                {slowQueries && slowQueries.length > 0 ? (
                  <div className="space-y-2">
                    {slowQueries.slice(0, 5).map((query, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{query.queryType}</Badge>
                          {query.tableName && (
                            <code className="text-sm">{query.tableName}</code>
                          )}
                        </div>
                        <div className="font-medium text-red-600">
                          {query.queryTime.toFixed(0)}ms
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No slow queries detected</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Resources</CardTitle>
              <CardDescription>Real-time system resource monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {performanceData.system.cpuUsage.toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">CPU Usage</div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {(performanceData.system.memoryUsage * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Memory Usage</div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {performanceData.system.eventLoopLag.toFixed(1)}ms
                  </div>
                  <div className="text-sm text-muted-foreground">Event Loop Lag</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Recommendations</CardTitle>
              <CardDescription>Automated optimization suggestions</CardDescription>
            </CardHeader>
            <CardContent>
              {recommendations && recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((recommendation, index) => (
                    <div key={index} className="flex items-start space-x-3 p-4 border rounded">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">{recommendation}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <p className="text-green-600 font-medium">System performance looks good!</p>
                  <p className="text-muted-foreground text-sm">No optimization recommendations at this time.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}