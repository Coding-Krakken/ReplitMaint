import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/useWebSocket';
import { 
  Package, Plus, Minus, AlertTriangle, CheckCircle, Clock, 
  Scan, Search, TrendingDown, TrendingUp, DollarSign, Activity
} from 'lucide-react';

interface Part {
  id: string;
  partNumber: string;
  name: string;
  category: string;
  stockLevel: number;
  minStockLevel: number;
  maxStockLevel: number;
  unitCost: number;
  location: string;
  supplier: string;
  lastRestocked: string;
  averageUsage: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'on_order';
}

interface PartsUsage {
  id: string;
  workOrderId: string;
  partId: string;
  part: Part;
  quantityUsed: number;
  unitCost: string;
  totalCost: number;
  usedBy: string;
  usedAt: string;
  notes?: string;
  workOrder: {
    foNumber: string;
    description: string;
    equipment?: {
      name: string;
      assetNumber: string;
    };
  };
}

interface PartsConsumptionData {
  workOrderId: string;
  partId: string;
  quantityUsed: number;
  unitCost: number;
  notes?: string;
  consumeInventory: boolean;
}

interface RealTimeUpdate {
  type: 'parts_consumed' | 'stock_updated' | 'low_stock_alert';
  partId: string;
  data: any;
  timestamp: string;
}

const RealTimePartsConsumption: React.FC<{ workOrderId?: string }> = ({ workOrderId }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, notifications } = useWebSocket();

  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [consumptionQuantity, setConsumptionQuantity] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [recentUpdates, setRecentUpdates] = useState<RealTimeUpdate[]>([]);

  // Fetch parts inventory
  const { data: parts = [], isLoading } = useQuery<Part[]>({
    queryKey: ['parts-inventory'],
    queryFn: () => fetch('/api/parts').then(res => res.json()),
  });

  // Fetch parts usage for work order
  const { data: partsUsage = [] } = useQuery<PartsUsage[]>({
    queryKey: ['parts-usage', workOrderId],
    queryFn: () => workOrderId ? fetch(`/api/work-orders/${workOrderId}/parts-usage`).then(res => res.json()) : Promise.resolve([]),
    enabled: !!workOrderId,
  });

  // Parts consumption mutation
  const consumePartMutation = useMutation({
    mutationFn: (data: PartsConsumptionData) =>
      fetch(`/api/work-orders/${workOrderId}/parts-usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['parts-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['parts-usage', workOrderId] });
      setIsDialogOpen(false);
      setSelectedPart(null);
      setConsumptionQuantity(1);
      toast({
        title: 'Parts Consumed',
        description: 'Parts consumption recorded and inventory updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Consumption Failed',
        description: error.message || 'Failed to record parts consumption',
        variant: 'destructive',
      });
    },
  });

  // Handle real-time updates
  useEffect(() => {
    const latestNotifications = notifications
      .filter(n => ['parts_consumed', 'stock_updated', 'low_stock_alert'].includes(n.type))
      .slice(-5)
      .map(n => ({
        ...n,
        partId: n.data?.partId || 'unknown'
      })) as RealTimeUpdate[];
    
    setRecentUpdates(latestNotifications);

    // Show toast for low stock alerts
    latestNotifications.forEach(update => {
      if (update.type === 'low_stock_alert' && !recentUpdates.some(r => r.partId === update.partId)) {
        toast({
          title: 'Low Stock Alert',
          description: `${update.data.partName} is running low (${update.data.currentStock} remaining)`,
          variant: 'destructive',
        });
      }
    });
  }, [notifications]);

  const handleConsumePart = () => {
    if (!selectedPart || !workOrderId) return;

    const consumptionData: PartsConsumptionData = {
      workOrderId,
      partId: selectedPart.id,
      quantityUsed: consumptionQuantity,
      unitCost: selectedPart.unitCost,
      consumeInventory: true,
    };

    consumePartMutation.mutate(consumptionData);
  };

  const filteredParts = parts.filter(part =>
    part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockStatusBadge = (part: Part) => {
    const { stockLevel, minStockLevel, status } = part;
    
    switch (status) {
      case 'out_of_stock':
        return <Badge className="bg-red-100 text-red-800">Out of Stock</Badge>;
      case 'low_stock':
        return <Badge className="bg-yellow-100 text-yellow-800">Low Stock</Badge>;
      case 'on_order':
        return <Badge className="bg-blue-100 text-blue-800">On Order</Badge>;
      default:
        return stockLevel > minStockLevel * 2 ? 
          <Badge className="bg-green-100 text-green-800">Good Stock</Badge> :
          <Badge className="bg-yellow-100 text-yellow-800">Monitor</Badge>;
    }
  };

  const getStockIcon = (part: Part) => {
    if (part.status === 'out_of_stock') return <AlertTriangle className="w-4 h-4 text-red-600" />;
    if (part.status === 'low_stock') return <TrendingDown className="w-4 h-4 text-yellow-600" />;
    return <Package className="w-4 h-4 text-green-600" />;
  };

  const calculateTotalCost = () => {
    return partsUsage.reduce((sum, usage) => sum + usage.totalCost, 0);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
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
      {/* Real-time Connection Status */}
      <Card className={`border-2 ${isConnected ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className={`w-5 h-5 ${isConnected ? 'text-green-600' : 'text-yellow-600'}`} />
              <span className="font-medium">
                Real-time Inventory {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              {recentUpdates.length} recent updates
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Parts Used</p>
                <p className="text-2xl font-bold text-blue-600">{partsUsage.length}</p>
              </div>
              <Package className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold text-green-600">
                  ${calculateTotalCost().toFixed(2)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                <p className="text-2xl font-bold text-red-600">
                  {parts.filter(p => p.status === 'low_stock' || p.status === 'out_of_stock').length}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Parts Consumption Interface */}
      {workOrderId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Parts Consumption</CardTitle>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Parts
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Select Parts to Consume</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Search parts by name, number, or category..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    {/* Parts List */}
                    <div className="grid gap-4 max-h-96 overflow-y-auto">
                      {filteredParts.map((part) => (
                        <Card 
                          key={part.id} 
                          className={`cursor-pointer transition-all ${
                            selectedPart?.id === part.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'
                          }`}
                          onClick={() => setSelectedPart(part)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                {getStockIcon(part)}
                                <div>
                                  <h4 className="font-medium">{part.name}</h4>
                                  <p className="text-sm text-gray-600">
                                    #{part.partNumber} | {part.category}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    Location: {part.location} | ${part.unitCost}/unit
                                  </p>
                                </div>
                              </div>
                              
                              <div className="text-right space-y-1">
                                {getStockStatusBadge(part)}
                                <div className="text-lg font-semibold">
                                  {part.stockLevel} units
                                </div>
                                <div className="text-xs text-gray-500">
                                  Min: {part.minStockLevel}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Consumption Details */}
                    {selectedPart && (
                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium">Selected: {selectedPart.name}</h4>
                              <p className="text-sm text-gray-600">
                                Available: {selectedPart.stockLevel} units
                              </p>
                            </div>
                            
                            <div className="flex items-center space-x-3">
                              <label className="text-sm font-medium">Quantity:</label>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConsumptionQuantity(Math.max(1, consumptionQuantity - 1))}
                                >
                                  <Minus className="w-4 h-4" />
                                </Button>
                                
                                <Input
                                  type="number"
                                  value={consumptionQuantity}
                                  onChange={(e) => setConsumptionQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-20 text-center"
                                  min="1"
                                  max={selectedPart.stockLevel}
                                />
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConsumptionQuantity(Math.min(selectedPart.stockLevel, consumptionQuantity + 1))}
                                  disabled={consumptionQuantity >= selectedPart.stockLevel}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                              
                              <div className="text-right">
                                <div className="font-medium">
                                  Total: ${(selectedPart.unitCost * consumptionQuantity).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {consumptionQuantity > selectedPart.stockLevel && (
                            <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-lg">
                              <div className="flex items-center space-x-2 text-red-700">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-sm">Insufficient stock! Available: {selectedPart.stockLevel} units</span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-4 pt-4 border-t">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleConsumePart}
                        disabled={!selectedPart || consumptionQuantity > (selectedPart?.stockLevel || 0) || consumePartMutation.isPending}
                      >
                        {consumePartMutation.isPending ? 'Recording...' : 'Consume Parts'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>

          <CardContent>
            {/* Current Parts Usage */}
            <div className="space-y-4">
              {partsUsage.map((usage) => (
                <Card key={usage.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Package className="w-8 h-8 text-blue-600" />
                        <div>
                          <h4 className="font-medium">{usage.part.name}</h4>
                          <p className="text-sm text-gray-600">
                            #{usage.part.partNumber} | Used: {usage.quantityUsed} units
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(usage.usedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="font-semibold text-lg">
                          ${usage.totalCost.toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-600">
                          ${usage.unitCost} × {usage.quantityUsed}
                        </div>
                      </div>
                    </div>
                    
                    {usage.notes && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                        <strong>Notes:</strong> {usage.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {partsUsage.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Parts Used</h3>
                  <p>Parts consumption will be tracked here as they are added.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Real-time Updates */}
      {recentUpdates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="w-5 h-5" />
              <span>Recent Updates</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentUpdates.map((update, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <div className="flex-1">
                    <p className="text-sm">
                      {update.type === 'parts_consumed' && 'Parts consumed in real-time'}
                      {update.type === 'stock_updated' && 'Inventory levels updated'}
                      {update.type === 'low_stock_alert' && 'Low stock alert triggered'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(update.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {update.type === 'low_stock_alert' && (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RealTimePartsConsumption;