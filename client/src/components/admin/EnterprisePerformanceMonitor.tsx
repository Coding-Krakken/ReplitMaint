import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  ComposedChart, Scatter, ScatterChart, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import {
  Activity, TrendingUp, TrendingDown, Zap, AlertTriangle, 
  CheckCircle, Clock, DollarSign, Users, Database, Cpu, 
  HardDrive, Wifi, BarChart3, Download, RefreshCw
} from 'lucide-react';

interface SystemMetrics {
  timestamp: string;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  responseTime: number;
  throughput: number;
  errorRate: number;
  activeUsers: number;
}

interface KPIMetrics {
  equipmentUptime: number;
  mtbf: number;
  mttr: number;
  workOrderCompletion: number;
  pmCompliance: number;
  costEfficiency: number;
  userSatisfaction: number;
  systemAvailability: number;
}

interface AlertMetric {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  timestamp: string;
  resolved: boolean;
}

interface PerformanceHealth {
  overall: number;
  infrastructure: number;
  application: number;
  business: number;
  trends: {
    overall: 'improving' | 'stable' | 'declining';
    infrastructure: 'improving' | 'stable' | 'declining';
    application: 'improving' | 'stable' | 'declining';
    business: 'improving' | 'stable' | 'declining';
  };
}

const COLORS = {
  primary: '#3b82f6',
  success: '#10b981', 
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  purple: '#8b5cf6',
  pink: '#ec4899',
  green: '#22c55e'
};

export function EnterprisePerformanceMonitor() {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch system metrics
  const { data: systemMetrics = [] } = useQuery<SystemMetrics[]>({
    queryKey: ['system-metrics', selectedTimeRange],
    queryFn: () => fetch(`/api/monitoring/system?range=${selectedTimeRange}`).then(res => res.json()),
    refetchInterval: autoRefresh ? 30000 : false, // 30 seconds
  });

  // Fetch KPI metrics
  const { data: kpiMetrics } = useQuery<KPIMetrics>({
    queryKey: ['kpi-metrics', selectedTimeRange],
    queryFn: () => fetch(`/api/monitoring/kpi?range=${selectedTimeRange}`).then(res => res.json()),
    refetchInterval: autoRefresh ? 60000 : false, // 1 minute
  });

  // Fetch performance health
  const { data: performanceHealth } = useQuery<PerformanceHealth>({
    queryKey: ['performance-health'],
    queryFn: () => fetch('/api/monitoring/health').then(res => res.json()),
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch alerts
  const { data: alerts = [] } = useQuery<AlertMetric[]>({
    queryKey: ['performance-alerts'],
    queryFn: () => fetch('/api/monitoring/alerts').then(res => res.json()),
    refetchInterval: autoRefresh ? 15000 : false, // 15 seconds
  });

  const latestMetrics = systemMetrics[systemMetrics.length - 1];
  const criticalAlerts = alerts.filter(a => a.type === 'critical' && !a.resolved);
  const warningAlerts = alerts.filter(a => a.type === 'warning' && !a.resolved);

  const getHealthColor = (health: number) => {
    if (health >= 90) return COLORS.success;
    if (health >= 70) return COLORS.warning;
    return COLORS.danger;
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const kpiData = kpiMetrics ? [
    { name: 'Equipment Uptime', value: kpiMetrics.equipmentUptime, target: 95 },
    { name: 'MTBF (hours)', value: kpiMetrics.mtbf, target: 720 },
    { name: 'MTTR (hours)', value: kpiMetrics.mttr, target: 4, inverse: true },
    { name: 'Work Order Completion', value: kpiMetrics.workOrderCompletion, target: 90 },
    { name: 'PM Compliance', value: kpiMetrics.pmCompliance, target: 95 },
    { name: 'Cost Efficiency', value: kpiMetrics.costEfficiency, target: 85 },
    { name: 'User Satisfaction', value: kpiMetrics.userSatisfaction, target: 85 },
    { name: 'System Availability', value: kpiMetrics.systemAvailability, target: 99 }
  ] : [];

  const exportReport = () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      timeRange: selectedTimeRange,
      systemMetrics: latestMetrics,
      kpiMetrics,
      performanceHealth,
      alerts: alerts.slice(0, 10)
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enterprise Performance Monitor</h1>
          <p className="text-muted-foreground">Real-time system and business metrics monitoring</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto Refresh' : 'Manual'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportReport}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {(criticalAlerts.length > 0 || warningAlerts.length > 0) && (
        <Alert variant={criticalAlerts.length > 0 ? "destructive" : "default"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {criticalAlerts.length > 0 ? 'Critical Issues Detected' : 'Warnings Active'}
          </AlertTitle>
          <AlertDescription>
            {criticalAlerts.length > 0 && `${criticalAlerts.length} critical alerts require immediate attention. `}
            {warningAlerts.length > 0 && `${warningAlerts.length} warnings need review.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Performance Health Overview */}
      {performanceHealth && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Overall Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold" style={{ color: getHealthColor(performanceHealth.overall) }}>
                  {performanceHealth.overall}%
                </div>
                {getTrendIcon(performanceHealth.trends.overall)}
              </div>
              <Progress value={performanceHealth.overall} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Infrastructure</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold" style={{ color: getHealthColor(performanceHealth.infrastructure) }}>
                  {performanceHealth.infrastructure}%
                </div>
                {getTrendIcon(performanceHealth.trends.infrastructure)}
              </div>
              <Progress value={performanceHealth.infrastructure} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Application</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold" style={{ color: getHealthColor(performanceHealth.application) }}>
                  {performanceHealth.application}%
                </div>
                {getTrendIcon(performanceHealth.trends.application)}
              </div>
              <Progress value={performanceHealth.application} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Business</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold" style={{ color: getHealthColor(performanceHealth.business) }}>
                  {performanceHealth.business}%
                </div>
                {getTrendIcon(performanceHealth.trends.business)}
              </div>
              <Progress value={performanceHealth.business} className="mt-2" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Real-time Metrics */}
      {latestMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Cpu className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">CPU Usage</p>
                  <p className="text-2xl font-bold">{latestMetrics.cpu}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <HardDrive className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Memory</p>
                  <p className="text-2xl font-bold">{latestMetrics.memory}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-sm font-medium">Response Time</p>
                  <p className="text-2xl font-bold">{latestMetrics.responseTime}ms</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium">Active Users</p>
                  <p className="text-2xl font-bold">{latestMetrics.activeUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="system" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="system">System Metrics</TabsTrigger>
          <TabsTrigger value="business">Business KPIs</TabsTrigger>
          <TabsTrigger value="alerts">Alerts & Events</TabsTrigger>
          <TabsTrigger value="analysis">Trend Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>System Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={systemMetrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="cpu" stroke={COLORS.primary} name="CPU %" />
                    <Line type="monotone" dataKey="memory" stroke={COLORS.success} name="Memory %" />
                    <Line type="monotone" dataKey="responseTime" stroke={COLORS.warning} name="Response Time (ms)" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Network & Throughput</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={systemMetrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="throughput" fill={COLORS.info} name="Throughput" />
                    <Line type="monotone" dataKey="errorRate" stroke={COLORS.danger} name="Error Rate %" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="business" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Business KPIs</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={kpiData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="name" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    <Radar
                      name="Current"
                      dataKey="value"
                      stroke={COLORS.primary}
                      fill={COLORS.primary}
                      fillOpacity={0.3}
                    />
                    <Radar
                      name="Target"
                      dataKey="target"
                      stroke={COLORS.success}
                      fill={COLORS.success}
                      fillOpacity={0.1}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>KPI Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {kpiData.map((kpi, index) => {
                  const isOnTarget = kpi.inverse ? kpi.value <= kpi.target : kpi.value >= kpi.target;
                  return (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{kpi.name}</span>
                        <Badge variant={isOnTarget ? "default" : "destructive"}>
                          {kpi.value}{kpi.name.includes('hours') ? 'h' : '%'}
                        </Badge>
                      </div>
                      <Progress 
                        value={kpi.inverse ? 100 - (kpi.value / kpi.target * 100) : (kpi.value / kpi.target * 100)} 
                        className="h-2"
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="space-y-4">
            {alerts.slice(0, 10).map((alert) => (
              <Alert key={alert.id} variant={alert.type === 'critical' ? 'destructive' : 'default'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center justify-between">
                  {alert.title}
                  <Badge variant={alert.resolved ? "default" : "destructive"}>
                    {alert.resolved ? 'Resolved' : alert.type}
                  </Badge>
                </AlertTitle>
                <AlertDescription>
                  {alert.description}
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(alert.timestamp).toLocaleString()}
                  </div>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trend Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={systemMetrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="cpu" stackId="1" stroke={COLORS.primary} fill={COLORS.primary} />
                  <Area type="monotone" dataKey="memory" stackId="1" stroke={COLORS.success} fill={COLORS.success} />
                  <Area type="monotone" dataKey="disk" stackId="1" stroke={COLORS.warning} fill={COLORS.warning} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}