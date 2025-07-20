import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EquipmentPerformanceAnalytics from '@/components/analytics/EquipmentPerformanceAnalytics';
import AdvancedEquipmentAnalytics from '@/components/analytics/AdvancedEquipmentAnalytics';
import { BarChart3, TrendingUp, DollarSign, Package } from 'lucide-react';

const Analytics: React.FC = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Analytics & Reporting</h1>
      </div>

      <Tabs defaultValue="equipment" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="equipment" className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4" />
            <span>Equipment Performance</span>
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4" />
            <span>Maintenance Trends</span>
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4" />
            <span>Cost Analysis</span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center space-x-2">
            <Package className="w-4 h-4" />
            <span>Inventory Analytics</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipment" className="space-y-6">
          <AdvancedEquipmentAnalytics />
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Maintenance Trends Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Maintenance Trends</h3>
                <p>Advanced maintenance trend analysis coming soon...</p>
                <p className="text-sm mt-2">
                  This will include PM compliance trends, failure patterns, and seasonal analysis.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cost Analysis Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Cost Analysis</h3>
                <p>Comprehensive cost analysis dashboard coming soon...</p>
                <p className="text-sm mt-2">
                  This will include maintenance costs by equipment, labor vs parts costs, and budget tracking.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Inventory Analytics</h3>
                <p>Advanced inventory analytics dashboard coming soon...</p>
                <p className="text-sm mt-2">
                  This will include turnover rates, usage patterns, and optimization recommendations.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analytics;