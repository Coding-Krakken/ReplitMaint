import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock, 
  Wrench, 
  DollarSign,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Download 
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface PerformanceMetrics {
  equipmentId: string;
  equipmentName: string;
  mtbf: number; // Mean Time Between Failures (hours)
  mttr: number; // Mean Time To Repair (hours)
  availability: number; // Percentage
  reliabilityScore: number; // 0-100
  maintenanceCost: number;
  failureFrequency: number; // failures per month
  performanceTrend: TrendData[];
  downtimeReasons: DowntimeReason[];
  maintenanceHistory: MaintenanceRecord[];
}

interface TrendData {
  date: string;
  availability: number;
  mtbf: number;
  mttr: number;
  cost: number;
}

interface DowntimeReason {
  reason: string;
  occurrences: number;
  totalHours: number;
  percentage: number;
}

interface MaintenanceRecord {
  date: string;
  type: 'preventive' | 'corrective' | 'emergency';
  duration: number;
  cost: number;
  status: 'completed' | 'in_progress';
}

interface EquipmentPerformanceMetricsProps {
  equipmentId?: string;
  timeRange?: '7d' | '30d' | '90d' | '1y';
}

const EquipmentPerformanceMetrics: React.FC<EquipmentPerformanceMetricsProps> = ({
  equipmentId = 'all',
  timeRange = '30d'
}) => {
  const [selectedEquipment, setSelectedEquipment] = useState(equipmentId);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [selectedMetric, setSelectedMetric] = useState<'availability' | 'mtbf' | 'mttr' | 'cost'>('availability');

  // Fetch equipment list
  const { data: equipmentList = [] } = useQuery({
    queryKey: ['equipment', 'list'],
    queryFn: async () => {
      const response = await fetch('/api/equipment');
      if (!response.ok) throw new Error('Failed to fetch equipment');
      return response.json();
    },
  });

  // Fetch performance metrics
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['equipment-performance', selectedEquipment, selectedTimeRange],
    queryFn: async () => {
      const params = new URLSearchParams({
        timeRange: selectedTimeRange,
        ...(selectedEquipment !== 'all' && { equipmentId: selectedEquipment })
      });
      const response = await fetch(`/api/analytics/equipment-performance?${params}`);
      if (!response.ok) throw new Error('Failed to fetch performance metrics');
      return (await response.json()) as PerformanceMetrics[];
    },
  });

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe'];

  const aggregatedMetrics = metrics?.length ? {
    avgAvailability: metrics.reduce((sum, m) => sum + m.availability, 0) / metrics.length,
    avgMTBF: metrics.reduce((sum, m) => sum + m.mtbf, 0) / metrics.length,
    avgMTTR: metrics.reduce((sum, m) => sum + m.mttr, 0) / metrics.length,
    totalCost: metrics.reduce((sum, m) => sum + m.maintenanceCost, 0),
    avgReliability: metrics.reduce((sum, m) => sum + m.reliabilityScore, 0) / metrics.length
  } : null;

  const getMetricColor = (value: number, type: 'availability' | 'reliability' | 'mtbf' | 'mttr') => {
    switch (type) {
      case 'availability':
      case 'reliability':
        if (value >= 95) return 'text-green-600';
        if (value >= 85) return 'text-yellow-600';
        return 'text-red-600';
      case 'mtbf':
        if (value >= 720) return 'text-green-600'; // 30+ days
        if (value >= 168) return 'text-yellow-600'; // 7+ days
        return 'text-red-600';
      case 'mttr':
        if (value <= 4) return 'text-green-600';
        if (value <= 24) return 'text-yellow-600';
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getMetricIcon = (type: 'availability' | 'reliability' | 'mtbf' | 'mttr') => {
    switch (type) {
      case 'availability':
        return <Activity className="w-5 h-5" />;
      case 'reliability':
        return <CheckCircle className="w-5 h-5" />;
      case 'mtbf':
        return <TrendingUp className="w-5 h-5" />;
      case 'mttr':
        return <Clock className="w-5 h-5" />;
      default:
        return <BarChart3 className="w-5 h-5" />;
    }
  };

  const formatDuration = (hours: number) => {
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours.toFixed(1)}h`;
  };

  const exportMetrics = () => {
    if (!metrics) return;
    
    const csvData = metrics.map(m => ({
      Equipment: m.equipmentName,
      'Availability (%)': m.availability.toFixed(2),
      'MTBF (hours)': m.mtbf.toFixed(2),
      'MTTR (hours)': m.mttr.toFixed(2),
      'Reliability Score': m.reliabilityScore.toFixed(2),
      'Maintenance Cost ($)': m.maintenanceCost.toFixed(2),
      'Failure Frequency': m.failureFrequency.toFixed(2)
    }));

    const csvContent = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equipment-performance-${selectedTimeRange}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-300 rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-gray-300 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-xl">Equipment Performance Analytics</CardTitle>
            <div className="flex items-center space-x-3">
              <Select value={selectedEquipment} onValueChange={setSelectedEquipment}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  {equipmentList.map((equipment: any) => (
                    <SelectItem key={equipment.id} value={equipment.id}>
                      {equipment.model}
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
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={exportMetrics}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Key Performance Indicators */}
      {aggregatedMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${getMetricColor(aggregatedMetrics.avgAvailability, 'availability')} bg-opacity-10`}>
                  {getMetricIcon('availability')}
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg Availability</p>
                  <p className={`text-2xl font-bold ${getMetricColor(aggregatedMetrics.avgAvailability, 'availability')}`}>
                    {aggregatedMetrics.avgAvailability.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${getMetricColor(aggregatedMetrics.avgMTBF, 'mtbf')} bg-opacity-10`}>
                  {getMetricIcon('mtbf')}
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg MTBF</p>
                  <p className={`text-2xl font-bold ${getMetricColor(aggregatedMetrics.avgMTBF, 'mtbf')}`}>
                    {formatDuration(aggregatedMetrics.avgMTBF)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${getMetricColor(aggregatedMetrics.avgMTTR, 'mttr')} bg-opacity-10`}>
                  {getMetricIcon('mttr')}
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg MTTR</p>
                  <p className={`text-2xl font-bold ${getMetricColor(aggregatedMetrics.avgMTTR, 'mttr')}`}>
                    {formatDuration(aggregatedMetrics.avgMTTR)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${getMetricColor(aggregatedMetrics.avgReliability, 'reliability')} bg-opacity-10`}>
                  {getMetricIcon('reliability')}
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg Reliability</p>
                  <p className={`text-2xl font-bold ${getMetricColor(aggregatedMetrics.avgReliability, 'reliability')}`}>
                    {aggregatedMetrics.avgReliability.toFixed(1)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg text-blue-600 bg-blue-50">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Cost</p>
                  <p className="text-2xl font-bold text-blue-600">
                    ${aggregatedMetrics.totalCost.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Performance Trend Chart */}
      {metrics && metrics.length > 0 && metrics[0].performanceTrend && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle>Performance Trends</CardTitle>
              <Select value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as typeof selectedMetric)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="availability">Availability</SelectItem>
                  <SelectItem value="mtbf">MTBF</SelectItem>
                  <SelectItem value="mttr">MTTR</SelectItem>
                  <SelectItem value="cost">Cost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metrics[0].performanceTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => {
                    if (selectedMetric === 'availability') return `${value.toFixed(1)}%`;
                    if (selectedMetric === 'cost') return `$${value.toFixed(2)}`;
                    return formatDuration(value);
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey={selectedMetric} 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  dot={{ fill: '#8884d8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equipment Ranking */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Equipment Performance Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics?.sort((a, b) => b.reliabilityScore - a.reliabilityScore).slice(0, 10).map((equipment, index) => (
                <div key={equipment.equipmentId} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index < 3 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{equipment.equipmentName}</p>
                      <p className="text-sm text-gray-500">
                        {equipment.availability.toFixed(1)}% availability
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${getMetricColor(equipment.reliabilityScore, 'reliability')}`}>
                      {equipment.reliabilityScore.toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-500">Reliability Score</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Downtime Analysis */}
        {metrics && metrics.length > 0 && metrics[0].downtimeReasons && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Downtime Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={metrics[0].downtimeReasons}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ reason, percentage }) => `${reason}: ${percentage.toFixed(1)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="percentage"
                  >
                    {metrics[0].downtimeReasons.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detailed Equipment Table */}
      {metrics && metrics.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Detailed Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Equipment</th>
                    <th className="text-right p-2">Availability</th>
                    <th className="text-right p-2">MTBF</th>
                    <th className="text-right p-2">MTTR</th>
                    <th className="text-right p-2">Reliability</th>
                    <th className="text-right p-2">Cost</th>
                    <th className="text-right p-2">Failures/Mo</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((equipment) => (
                    <tr key={equipment.equipmentId} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{equipment.equipmentName}</td>
                      <td className={`p-2 text-right ${getMetricColor(equipment.availability, 'availability')}`}>
                        {equipment.availability.toFixed(1)}%
                      </td>
                      <td className={`p-2 text-right ${getMetricColor(equipment.mtbf, 'mtbf')}`}>
                        {formatDuration(equipment.mtbf)}
                      </td>
                      <td className={`p-2 text-right ${getMetricColor(equipment.mttr, 'mttr')}`}>
                        {formatDuration(equipment.mttr)}
                      </td>
                      <td className={`p-2 text-right ${getMetricColor(equipment.reliabilityScore, 'reliability')}`}>
                        {equipment.reliabilityScore.toFixed(1)}
                      </td>
                      <td className="p-2 text-right">${equipment.maintenanceCost.toLocaleString()}</td>
                      <td className="p-2 text-right">{equipment.failureFrequency.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EquipmentPerformanceMetrics;