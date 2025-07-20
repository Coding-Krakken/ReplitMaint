import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  AlertTriangle, 
  Activity,
  BarChart3,
  PieChart,
  Settings,
  Wrench,
  DollarSign,
  Calendar,
  Target,
  Zap
} from 'lucide-react';
import { formatDistanceToNow, parseISO, differenceInHours, differenceInDays } from 'date-fns';

interface Equipment {
  id: string;
  name: string;
  assetTag: string;
  model: string;
  manufacturer: string;
  status: string;
  criticality: string;
  location: string;
  category: string;
  installDate: string;
  createdAt: string;
}

interface WorkOrder {
  id: string;
  title: string;
  equipmentId: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
  completedAt?: string;
  assignedTo?: string;
  totalCost?: number;
}

interface PerformanceMetrics {
  equipmentId: string;
  mtbf: number; // Mean Time Between Failures (hours)
  mttr: number; // Mean Time To Repair (hours)
  availability: number; // Percentage
  reliabilityScore: number; // 0-100
  maintenanceCost: number;
  downtime: number; // Total hours
  failureCount: number;
  totalWorkOrders: number;
  preventiveMaintenanceCompliance: number; // Percentage
  criticalIssuesCount: number;
  lastFailureDate?: string;
  nextPMDueDate?: string;
}

interface EquipmentPerformanceAnalyticsProps {
  equipmentId?: string;
  timeRange?: '7d' | '30d' | '90d' | '1y' | 'all';
}

const EquipmentPerformanceAnalytics: React.FC<EquipmentPerformanceAnalyticsProps> = ({
  equipmentId,
  timeRange = '30d'
}) => {
  const [selectedEquipment, setSelectedEquipment] = useState<string>(equipmentId || 'all');
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [selectedMetric, setSelectedMetric] = useState<'mtbf' | 'mttr' | 'availability' | 'cost'>('availability');

  // Fetch equipment list
  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment', 'analytics'],
    queryFn: async () => {
      const response = await fetch('/api/equipment');
      if (!response.ok) throw new Error('Failed to fetch equipment');
      return (await response.json()) as Equipment[];
    },
  });

  // Fetch work orders for analytics
  const { data: workOrders = [] } = useQuery({
    queryKey: ['work-orders', 'analytics', selectedTimeRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedTimeRange !== 'all') {
        const days = selectedTimeRange === '7d' ? 7 : 
                    selectedTimeRange === '30d' ? 30 : 
                    selectedTimeRange === '90d' ? 90 : 365;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        params.append('startDate', startDate.toISOString());
      }
      
      const response = await fetch(`/api/work-orders?${params}`);
      if (!response.ok) throw new Error('Failed to fetch work orders');
      return (await response.json()) as WorkOrder[];
    },
  });

  // Calculate performance metrics
  const performanceMetrics = useMemo(() => {
    const metrics: PerformanceMetrics[] = [];
    
    const equipmentList = selectedEquipment === 'all' ? equipment : equipment.filter(eq => eq.id === selectedEquipment);
    
    for (const eq of equipmentList) {
      const equipmentWorkOrders = workOrders.filter(wo => wo.equipmentId === eq.id);
      
      // Calculate MTBF (Mean Time Between Failures)
      const failures = equipmentWorkOrders.filter(wo => wo.type === 'corrective' && wo.status === 'completed');
      const mtbf = failures.length > 1 ? 
        differenceInHours(parseISO(failures[failures.length - 1].createdAt), parseISO(failures[0].createdAt)) / (failures.length - 1) : 
        8760; // Default to 1 year if no failures

      // Calculate MTTR (Mean Time To Repair)
      const completedWorkOrders = equipmentWorkOrders.filter(wo => wo.completedAt);
      const totalRepairTime = completedWorkOrders.reduce((sum, wo) => {
        return sum + differenceInHours(parseISO(wo.completedAt!), parseISO(wo.createdAt));
      }, 0);
      const mttr = completedWorkOrders.length > 0 ? totalRepairTime / completedWorkOrders.length : 0;

      // Calculate Availability
      const totalDowntime = completedWorkOrders.reduce((sum, wo) => {
        if (wo.type === 'corrective' && wo.completedAt) {
          return sum + differenceInHours(parseISO(wo.completedAt), parseISO(wo.createdAt));
        }
        return sum;
      }, 0);
      
      const operatingHours = differenceInHours(new Date(), parseISO(eq.installDate || eq.createdAt));
      const availability = operatingHours > 0 ? ((operatingHours - totalDowntime) / operatingHours) * 100 : 100;

      // Calculate Reliability Score (combination of multiple factors)
      const ageInDays = differenceInDays(new Date(), parseISO(eq.installDate || eq.createdAt));
      const failureRate = failures.length / Math.max(ageInDays / 365, 1); // failures per year
      const reliabilityScore = Math.max(0, Math.min(100, 100 - (failureRate * 10) - (100 - availability) / 2));

      // Calculate maintenance cost
      const maintenanceCost = equipmentWorkOrders.reduce((sum, wo) => sum + (wo.totalCost || 0), 0);

      // PM Compliance
      const pmWorkOrders = equipmentWorkOrders.filter(wo => wo.type === 'preventive');
      const expectedPMs = Math.max(1, Math.floor(ageInDays / 30)); // Assume monthly PMs
      const pmCompliance = Math.min(100, (pmWorkOrders.length / expectedPMs) * 100);

      // Critical issues
      const criticalIssues = equipmentWorkOrders.filter(wo => wo.priority === 'urgent' || wo.priority === 'emergency');

      metrics.push({
        equipmentId: eq.id,
        mtbf,
        mttr,
        availability,
        reliabilityScore,
        maintenanceCost,
        downtime: totalDowntime,
        failureCount: failures.length,
        totalWorkOrders: equipmentWorkOrders.length,
        preventiveMaintenanceCompliance: pmCompliance,
        criticalIssuesCount: criticalIssues.length,
        lastFailureDate: failures.length > 0 ? failures[failures.length - 1].createdAt : undefined,
        nextPMDueDate: undefined, // Would be calculated from PM schedule
      });
    }

    return metrics;
  }, [equipment, workOrders, selectedEquipment]);

  // Aggregate metrics for overview
  const aggregateMetrics = useMemo(() => {
    if (performanceMetrics.length === 0) return null;

    const totalEquipment = performanceMetrics.length;
    const avgAvailability = performanceMetrics.reduce((sum, m) => sum + m.availability, 0) / totalEquipment;
    const avgMTBF = performanceMetrics.reduce((sum, m) => sum + m.mtbf, 0) / totalEquipment;
    const avgMTTR = performanceMetrics.reduce((sum, m) => sum + m.mttr, 0) / totalEquipment;
    const totalCost = performanceMetrics.reduce((sum, m) => sum + m.maintenanceCost, 0);
    const totalDowntime = performanceMetrics.reduce((sum, m) => sum + m.downtime, 0);
    const avgReliability = performanceMetrics.reduce((sum, m) => sum + m.reliabilityScore, 0) / totalEquipment;
    const criticalEquipment = performanceMetrics.filter(m => m.reliabilityScore < 70).length;

    return {
      totalEquipment,
      avgAvailability,
      avgMTBF,
      avgMTTR,
      totalCost,
      totalDowntime,
      avgReliability,
      criticalEquipment,
    };
  }, [performanceMetrics]);

  const getAvailabilityColor = (availability: number) => {
    if (availability >= 95) return 'text-green-600';
    if (availability >= 90) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getReliabilityBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (score >= 80) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
    if (score >= 70) return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>;
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-2xl font-bold">Equipment Performance Analytics</h2>
        <div className="flex gap-2">
          <Select value={selectedEquipment} onValueChange={setSelectedEquipment}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select equipment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Equipment</SelectItem>
              {equipment.map((eq) => (
                <SelectItem key={eq.id} value={eq.id}>
                  {eq.name} ({eq.assetTag})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={selectedTimeRange} onValueChange={(value) => setSelectedTimeRange(value as typeof selectedTimeRange)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="90d">90 Days</SelectItem>
              <SelectItem value="1y">1 Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Aggregate Overview */}
      {aggregateMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Availability</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getAvailabilityColor(aggregateMetrics.avgAvailability)}`}>
                {aggregateMetrics.avgAvailability.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Across {aggregateMetrics.totalEquipment} equipment
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average MTBF</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(aggregateMetrics.avgMTBF)}h
              </div>
              <p className="text-xs text-muted-foreground">
                Mean time between failures
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Maintenance Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ${aggregateMetrics.totalCost.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedTimeRange} period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Equipment</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {aggregateMetrics.criticalEquipment}
              </div>
              <p className="text-xs text-muted-foreground">
                Reliability score &lt; 70%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Analytics */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reliability">Reliability</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {performanceMetrics.map((metrics) => {
              const eq = equipment.find(e => e.id === metrics.equipmentId);
              if (!eq) return null;

              return (
                <Card key={eq.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{eq.name}</CardTitle>
                      {getReliabilityBadge(metrics.reliabilityScore)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {eq.assetTag} • {eq.manufacturer} {eq.model}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Availability */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Availability</span>
                        <span className={`font-bold ${getAvailabilityColor(metrics.availability)}`}>
                          {metrics.availability.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={metrics.availability} className="h-2" />
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">MTBF</div>
                        <div className="font-bold">{Math.round(metrics.mtbf)}h</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">MTTR</div>
                        <div className="font-bold">{Math.round(metrics.mttr)}h</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Work Orders</div>
                        <div className="font-bold">{metrics.totalWorkOrders}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Failures</div>
                        <div className="font-bold text-red-600">{metrics.failureCount}</div>
                      </div>
                    </div>

                    {/* PM Compliance */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">PM Compliance</span>
                        <span className="font-bold">
                          {metrics.preventiveMaintenanceCompliance.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={metrics.preventiveMaintenanceCompliance} className="h-2" />
                    </div>

                    {/* Recent Activity */}
                    <div className="text-xs text-muted-foreground">
                      {metrics.lastFailureDate && (
                        <div className="flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>
                            Last failure: {formatDistanceToNow(parseISO(metrics.lastFailureDate))} ago
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="reliability" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reliability Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {performanceMetrics.map((metrics) => {
                  const eq = equipment.find(e => e.id === metrics.equipmentId);
                  if (!eq) return null;

                  return (
                    <div key={eq.id} className="border-b pb-4 last:border-b-0">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{eq.name}</h4>
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl font-bold">
                            {metrics.reliabilityScore.toFixed(0)}
                          </span>
                          {getReliabilityBadge(metrics.reliabilityScore)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="text-center p-3 bg-muted rounded">
                          <div className="text-lg font-bold text-blue-600">
                            {Math.round(metrics.mtbf)}h
                          </div>
                          <div className="text-muted-foreground">MTBF</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded">
                          <div className="text-lg font-bold text-orange-600">
                            {Math.round(metrics.mttr)}h
                          </div>
                          <div className="text-muted-foreground">MTTR</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded">
                          <div className="text-lg font-bold text-green-600">
                            {metrics.availability.toFixed(1)}%
                          </div>
                          <div className="text-muted-foreground">Availability</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded">
                          <div className="text-lg font-bold text-red-600">
                            {metrics.failureCount}
                          </div>
                          <div className="text-muted-foreground">Failures</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Maintenance Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {performanceMetrics.map((metrics) => {
                  const eq = equipment.find(e => e.id === metrics.equipmentId);
                  if (!eq) return null;

                  return (
                    <div key={eq.id} className="border-b pb-4 last:border-b-0">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{eq.name}</h4>
                        <Badge variant="outline">
                          {metrics.totalWorkOrders} work orders
                        </Badge>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm">PM Compliance</span>
                            <span className="font-medium">
                              {metrics.preventiveMaintenanceCompliance.toFixed(0)}%
                            </span>
                          </div>
                          <Progress value={metrics.preventiveMaintenanceCompliance} className="h-2" />
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Total Downtime</div>
                            <div className="font-bold">{Math.round(metrics.downtime)}h</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Critical Issues</div>
                            <div className="font-bold text-red-600">
                              {metrics.criticalIssuesCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Avg Repair Time</div>
                            <div className="font-bold">{Math.round(metrics.mttr)}h</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {performanceMetrics.map((metrics) => {
                  const eq = equipment.find(e => e.id === metrics.equipmentId);
                  if (!eq) return null;

                  const costPerWorkOrder = metrics.totalWorkOrders > 0 ? 
                    metrics.maintenanceCost / metrics.totalWorkOrders : 0;
                  const costPerHour = metrics.downtime > 0 ? 
                    metrics.maintenanceCost / metrics.downtime : 0;

                  return (
                    <div key={eq.id} className="border-b pb-4 last:border-b-0">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{eq.name}</h4>
                        <div className="text-2xl font-bold text-green-600">
                          ${metrics.maintenanceCost.toLocaleString()}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div className="text-center p-3 bg-muted rounded">
                          <div className="text-lg font-bold">
                            ${costPerWorkOrder.toFixed(0)}
                          </div>
                          <div className="text-muted-foreground">Cost per Work Order</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded">
                          <div className="text-lg font-bold">
                            ${costPerHour.toFixed(0)}
                          </div>
                          <div className="text-muted-foreground">Cost per Downtime Hour</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded">
                          <div className="text-lg font-bold">
                            {metrics.totalWorkOrders}
                          </div>
                          <div className="text-muted-foreground">Total Work Orders</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EquipmentPerformanceAnalytics;