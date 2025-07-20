import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter,
  ComposedChart, Area, AreaChart
} from 'recharts';
import { 
  Activity, TrendingUp, TrendingDown, AlertTriangle, Clock, 
  Wrench, DollarSign, Calendar, Zap, Target 
} from 'lucide-react';

interface EquipmentMetrics {
  id: string;
  name: string;
  assetNumber: string;
  category: string;
  status: string;
  mtbf: number; // Mean Time Between Failures (hours)
  mttr: number; // Mean Time To Repair (hours)
  availability: number; // Percentage
  utilizationRate: number; // Percentage
  totalWorkOrders: number;
  preventiveWorkOrders: number;
  correctiveWorkOrders: number;
  emergencyWorkOrders: number;
  totalDowntime: number; // Hours
  maintenanceCost: number;
  lastFailureDate?: string;
  nextPmDue?: string;
  criticalityScore: number; // 1-10
  healthScore: number; // 1-100
  trends: {
    mtbfTrend: 'improving' | 'declining' | 'stable';
    availabilityTrend: 'improving' | 'declining' | 'stable';
    costTrend: 'improving' | 'declining' | 'stable';
  };
}

interface PerformanceTrend {
  date: string;
  availability: number;
  mtbf: number;
  mttr: number;
  cost: number;
  workOrders: number;
}

const COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  purple: '#8b5cf6',
};

const AdvancedEquipmentAnalytics: React.FC = () => {
  // Fetch equipment metrics
  const { data: equipmentMetrics = [], isLoading } = useQuery<EquipmentMetrics[]>({
    queryKey: ['equipment-analytics'],
    queryFn: () => fetch('/api/analytics/equipment-performance').then(res => res.json()),
  });

  // Fetch performance trends
  const { data: performanceTrends = [] } = useQuery<PerformanceTrend[]>({
    queryKey: ['performance-trends'],
    queryFn: () => fetch('/api/analytics/performance-trends').then(res => res.json()),
  });

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    if (equipmentMetrics.length === 0) return null;

    const totalEquipment = equipmentMetrics.length;
    const activeEquipment = equipmentMetrics.filter(e => e.status === 'active').length;
    const criticalEquipment = equipmentMetrics.filter(e => e.criticalityScore >= 8).length;
    const lowPerformingEquipment = equipmentMetrics.filter(e => e.healthScore < 70).length;

    const avgMtbf = equipmentMetrics.reduce((sum, e) => sum + e.mtbf, 0) / totalEquipment;
    const avgMttr = equipmentMetrics.reduce((sum, e) => sum + e.mttr, 0) / totalEquipment;
    const avgAvailability = equipmentMetrics.reduce((sum, e) => sum + e.availability, 0) / totalEquipment;
    const totalMaintenanceCost = equipmentMetrics.reduce((sum, e) => sum + e.maintenanceCost, 0);

    return {
      totalEquipment,
      activeEquipment,
      criticalEquipment,
      lowPerformingEquipment,
      avgMtbf: Math.round(avgMtbf),
      avgMttr: Math.round(avgMttr * 10) / 10,
      avgAvailability: Math.round(avgAvailability * 10) / 10,
      totalMaintenanceCost: Math.round(totalMaintenanceCost),
    };
  }, [equipmentMetrics]);

  // Prepare chart data
  const availabilityDistribution = useMemo(() => {
    const ranges = [
      { name: '95-100%', min: 95, max: 100, color: COLORS.success },
      { name: '85-94%', min: 85, max: 94, color: COLORS.primary },
      { name: '70-84%', min: 70, max: 84, color: COLORS.warning },
      { name: '<70%', min: 0, max: 69, color: COLORS.danger },
    ];

    return ranges.map(range => ({
      ...range,
      value: equipmentMetrics.filter(e => 
        e.availability >= range.min && e.availability <= range.max
      ).length,
    }));
  }, [equipmentMetrics]);

  const mtbfvsHealth = useMemo(() => {
    return equipmentMetrics.map(e => ({
      name: e.name,
      mtbf: e.mtbf,
      healthScore: e.healthScore,
      criticalityScore: e.criticalityScore,
    }));
  }, [equipmentMetrics]);

  const getHealthBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (score >= 80) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
    if (score >= 70) return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>;
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>;
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'declining': return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  if (isLoading || !summaryMetrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Fleet Availability</p>
                <p className="text-2xl font-bold text-green-600">
                  {summaryMetrics.avgAvailability}%
                </p>
                <p className="text-xs text-gray-500">Target: 95%</p>
              </div>
              <Activity className="w-8 h-8 text-green-600" />
            </div>
            <Progress 
              value={summaryMetrics.avgAvailability} 
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Mean Time Between Failures</p>
                <p className="text-2xl font-bold text-blue-600">
                  {summaryMetrics.avgMtbf}h
                </p>
                <p className="text-xs text-gray-500">Industry avg: 720h</p>
              </div>
              <Clock className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Mean Time To Repair</p>
                <p className="text-2xl font-bold text-purple-600">
                  {summaryMetrics.avgMttr}h
                </p>
                <p className="text-xs text-gray-500">Target: &lt;4h</p>
              </div>
              <Wrench className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Maintenance Cost</p>
                <p className="text-2xl font-bold text-orange-600">
                  ${summaryMetrics.totalMaintenanceCost.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">This quarter</p>
              </div>
              <DollarSign className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance Trends</TabsTrigger>
          <TabsTrigger value="health">Equipment Health</TabsTrigger>
          <TabsTrigger value="predictive">Predictive Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Availability Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Equipment Availability Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={availabilityDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {availabilityDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* MTBF vs Health Score */}
            <Card>
              <CardHeader>
                <CardTitle>MTBF vs Health Score</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="healthScore" 
                      type="number" 
                      domain={[0, 100]}
                      label={{ value: 'Health Score', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      dataKey="mtbf"
                      type="number"
                      label={{ value: 'MTBF (hours)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 shadow-lg rounded-lg border">
                              <p className="font-medium">{data.name}</p>
                              <p>Health Score: {data.healthScore}%</p>
                              <p>MTBF: {data.mtbf} hours</p>
                              <p>Criticality: {data.criticalityScore}/10</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter 
                      data={mtbfvsHealth} 
                      fill={COLORS.primary}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Fleet Status Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Fleet Status Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{summaryMetrics.totalEquipment}</div>
                  <div className="text-sm text-gray-600">Total Equipment</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{summaryMetrics.activeEquipment}</div>
                  <div className="text-sm text-gray-600">Active</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">{summaryMetrics.criticalEquipment}</div>
                  <div className="text-sm text-gray-600">Critical Assets</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600">{summaryMetrics.lowPerformingEquipment}</div>
                  <div className="text-sm text-gray-600">Needs Attention</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={performanceTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="availability" 
                    stackId="1"
                    stroke={COLORS.success}
                    fill={COLORS.success}
                    fillOpacity={0.6}
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="workOrders" 
                    fill={COLORS.primary}
                    fillOpacity={0.8}
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="mtbf" 
                    stroke={COLORS.purple}
                    strokeWidth={3}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <div className="grid gap-4">
            {equipmentMetrics
              .sort((a, b) => b.criticalityScore - a.criticalityScore)
              .slice(0, 10)
              .map((equipment) => (
                <Card key={equipment.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div>
                          <h4 className="font-medium">{equipment.name}</h4>
                          <p className="text-sm text-gray-600">{equipment.assetNumber}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">Health Score</p>
                          {getHealthBadge(equipment.healthScore)}
                        </div>
                        
                        <div className="text-right">
                          <p className="text-sm font-medium">MTBF Trend</p>
                          <div className="flex items-center space-x-1">
                            {getTrendIcon(equipment.trends.mtbfTrend)}
                            <span className="text-sm">{equipment.mtbf}h</span>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-sm font-medium">Availability</p>
                          <div className="flex items-center space-x-1">
                            {getTrendIcon(equipment.trends.availabilityTrend)}
                            <span className="text-sm">{equipment.availability}%</span>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-sm font-medium">Criticality</p>
                          <Badge variant={equipment.criticalityScore >= 8 ? 'destructive' : 'secondary'}>
                            {equipment.criticalityScore}/10
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 grid grid-cols-4 gap-4 text-center text-sm">
                      <div>
                        <div className="font-medium text-blue-600">{equipment.totalWorkOrders}</div>
                        <div className="text-gray-600">Total WOs</div>
                      </div>
                      <div>
                        <div className="font-medium text-green-600">{equipment.preventiveWorkOrders}</div>
                        <div className="text-gray-600">Preventive</div>
                      </div>
                      <div>
                        <div className="font-medium text-yellow-600">{equipment.correctiveWorkOrders}</div>
                        <div className="text-gray-600">Corrective</div>
                      </div>
                      <div>
                        <div className="font-medium text-red-600">{equipment.emergencyWorkOrders}</div>
                        <div className="text-gray-600">Emergency</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="predictive" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="w-5 h-5" />
                <span>Predictive Maintenance Insights</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {equipmentMetrics
                  .filter(e => e.healthScore < 80 || e.trends.availabilityTrend === 'declining')
                  .slice(0, 5)
                  .map((equipment) => (
                    <div key={equipment.id} className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        <div>
                          <h4 className="font-medium">{equipment.name}</h4>
                          <p className="text-sm text-gray-600">
                            {equipment.healthScore < 70 ? 'Low health score detected' : 
                             equipment.trends.availabilityTrend === 'declining' ? 'Declining availability trend' :
                             'Requires attention'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-yellow-700 border-yellow-300">
                          Action Recommended
                        </Badge>
                      </div>
                    </div>
                  ))}
                
                {equipmentMetrics.filter(e => e.healthScore < 80 || e.trends.availabilityTrend === 'declining').length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Target className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">All Equipment Performing Well</h3>
                    <p>No immediate maintenance actions recommended based on current analytics.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedEquipmentAnalytics;