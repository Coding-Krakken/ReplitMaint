import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, 
  Plus, 
  Minus, 
  AlertTriangle, 
  CheckCircle,
  Search,
  BarChart3,
  DollarSign,
  TrendingDown,
  History,
  ShoppingCart
} from 'lucide-react';

interface Part {
  id: string;
  partNumber: string;
  description: string;
  unitCost: number;
  stockLevel: number;
  reorderPoint: number;
  unitOfMeasure: string;
  location?: string;
  category?: string;
}

interface PartUsage {
  id: string;
  partId: string;
  quantityUsed: number;
  unitCost: number;
  totalCost: number;
  usedBy: string;
  notes?: string;
  createdAt: string;
  part?: Part;
}

interface PartsConsumptionManagerProps {
  workOrderId: string;
  onTotalCostChange?: (cost: number) => void;
  isReadOnly?: boolean;
}

interface InventoryConsumption {
  partId: string;
  quantityConsumed: number;
  newStockLevel: number;
  triggerReorder: boolean;
  costImpact: number;
}

const PartsConsumptionManager: React.FC<PartsConsumptionManagerProps> = ({
  workOrderId,
  onTotalCostChange,
  isReadOnly = false
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showPartSelector, setShowPartSelector] = useState(false);
  const [pendingConsumption, setPendingConsumption] = useState<InventoryConsumption[]>([]);
  const [isConsumingParts, setIsConsumingParts] = useState(false);

  // Fetch parts usage for this work order
  const { data: partsUsage = [], isLoading: usageLoading } = useQuery({
    queryKey: ['partsUsage', workOrderId],
    queryFn: async () => {
      const response = await fetch(`/api/work-orders/${workOrderId}/parts-usage`);
      if (!response.ok) throw new Error('Failed to fetch parts usage');
      return (await response.json()) as PartUsage[];
    },
  });

  // Fetch available parts for selection
  const { data: availableParts = [], isLoading: partsLoading } = useQuery({
    queryKey: ['parts', 'available'],
    queryFn: async () => {
      const response = await fetch('/api/parts');
      if (!response.ok) throw new Error('Failed to fetch parts');
      return (await response.json()) as Part[];
    },
  });

  // Calculate total cost and notify parent
  useEffect(() => {
    const totalCost = partsUsage.reduce((sum, usage) => sum + (usage.totalCost || 0), 0);
    onTotalCostChange?.(totalCost);
  }, [partsUsage, onTotalCostChange]);

  // Add parts usage mutation with inventory consumption
  const addPartsUsage = useMutation({
    mutationFn: async (usage: {
      partId: string;
      quantityUsed: number;
      unitCost: number;
      notes?: string;
      consumeInventory: boolean;
    }) => {
      const response = await fetch(`/api/work-orders/${workOrderId}/parts-usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usage),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add parts usage');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['partsUsage', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['parts', 'available'] });
      toast({
        title: 'Parts Usage Recorded',
        description: 'Part consumption and inventory updated successfully',
      });
      
      // Show inventory impact if provided
      if (data.inventoryImpact) {
        const impact = data.inventoryImpact;
        setPendingConsumption(prev => [...prev, impact]);
        
        if (impact.triggerReorder) {
          toast({
            title: 'Reorder Alert',
            description: `Part ${impact.partId} is below reorder point`,
            variant: 'destructive',
          });
        }
      }
    },
    onError: (error) => {
      toast({
        title: 'Failed to Record Usage',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Remove parts usage mutation
  const removePartsUsage = useMutation({
    mutationFn: async (usageId: string) => {
      const response = await fetch(`/api/work-orders/${workOrderId}/parts-usage/${usageId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove parts usage');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partsUsage', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['parts', 'available'] });
      toast({
        title: 'Parts Usage Removed',
        description: 'Item removed and inventory adjusted',
      });
    },
  });

  // Bulk inventory consumption for work order completion
  const consumeAllParts = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/work-orders/${workOrderId}/consume-parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to consume parts');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['parts', 'available'] });
      queryClient.invalidateQueries({ queryKey: ['partsUsage', workOrderId] });
      setIsConsumingParts(false);
      toast({
        title: 'Inventory Updated',
        description: `${data.consumedCount} parts consumed from inventory`,
      });
    },
    onError: (error) => {
      setIsConsumingParts(false);
      toast({
        title: 'Consumption Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleAddPart = (part: Part, quantity: number, notes?: string) => {
    if (quantity <= 0) {
      toast({
        title: 'Invalid Quantity',
        description: 'Quantity must be greater than 0',
        variant: 'destructive',
      });
      return;
    }

    if (quantity > part.stockLevel) {
      toast({
        title: 'Insufficient Stock',
        description: `Only ${part.stockLevel} ${part.unitOfMeasure} available`,
        variant: 'destructive',
      });
      return;
    }

    addPartsUsage.mutate({
      partId: part.id,
      quantityUsed: quantity,
      unitCost: part.unitCost,
      notes,
      consumeInventory: true,
    });

    setShowPartSelector(false);
  };

  const handleConsumeAllParts = () => {
    if (partsUsage.length === 0) {
      toast({
        title: 'No Parts to Consume',
        description: 'Add parts usage before consuming inventory',
        variant: 'destructive',
      });
      return;
    }

    setIsConsumingParts(true);
    consumeAllParts.mutate();
  };

  const filteredParts = availableParts.filter(part =>
    part.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    part.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalCost = partsUsage.reduce((sum, usage) => sum + (usage.totalCost || 0), 0);
  const totalQuantity = partsUsage.reduce((sum, usage) => sum + usage.quantityUsed, 0);

  if (usageLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="ml-2">Loading parts usage...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="w-5 h-5" />
            <span>Parts Consumption Summary</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{partsUsage.length}</div>
              <div className="text-sm text-muted-foreground">Parts Used</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{totalQuantity}</div>
              <div className="text-sm text-muted-foreground">Total Quantity</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">${totalCost.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Total Cost</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{pendingConsumption.length}</div>
              <div className="text-sm text-muted-foreground">Reorder Alerts</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parts Usage List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Parts Used</CardTitle>
          {!isReadOnly && (
            <div className="flex space-x-2">
              <Button
                onClick={() => setShowPartSelector(!showPartSelector)}
                size="sm"
                className="flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add Part</span>
              </Button>
              {partsUsage.length > 0 && (
                <Button
                  onClick={handleConsumeAllParts}
                  disabled={isConsumingParts}
                  size="sm"
                  variant="outline"
                  className="flex items-center space-x-1"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{isConsumingParts ? 'Processing...' : 'Consume All'}</span>
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {partsUsage.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No parts used yet</p>
              {!isReadOnly && (
                <Button
                  onClick={() => setShowPartSelector(true)}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  Add First Part
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {partsUsage.map((usage) => (
                <div key={usage.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="font-medium">{usage.part?.partNumber || 'Unknown Part'}</h4>
                        <Badge variant="outline">{usage.part?.category || 'General'}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {usage.part?.description || 'No description'}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Quantity:</span>
                          <span className="ml-1 font-medium">
                            {usage.quantityUsed} {usage.part?.unitOfMeasure || 'units'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Unit Cost:</span>
                          <span className="ml-1 font-medium">${usage.unitCost.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total:</span>
                          <span className="ml-1 font-medium text-green-600">
                            ${usage.totalCost.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Used:</span>
                          <span className="ml-1 font-medium">
                            {new Date(usage.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {usage.notes && (
                        <div className="mt-2 p-2 bg-muted rounded text-sm">
                          <span className="text-muted-foreground">Notes:</span>
                          <span className="ml-1">{usage.notes}</span>
                        </div>
                      )}
                    </div>
                    {!isReadOnly && (
                      <Button
                        onClick={() => removePartsUsage.mutate(usage.id)}
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Part Selector */}
      {showPartSelector && !isReadOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Search className="w-5 h-5" />
              <span>Add Part to Work Order</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="part-search">Search Parts</Label>
              <Input
                id="part-search"
                placeholder="Search by part number or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-1"
              />
            </div>

            {partsLoading ? (
              <div className="text-center py-4">Loading parts...</div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredParts.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    No parts found matching your search
                  </div>
                ) : (
                  filteredParts.map((part) => (
                    <PartSelectionItem
                      key={part.id}
                      part={part}
                      onAdd={handleAddPart}
                    />
                  ))
                )}
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowPartSelector(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Impact Alerts */}
      {pendingConsumption.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-orange-800">
              <AlertTriangle className="w-5 h-5" />
              <span>Inventory Impact</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingConsumption.map((impact, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                  <span className="text-sm">
                    Part {impact.partId}: {impact.quantityConsumed} consumed
                  </span>
                  <div className="flex items-center space-x-2">
                    <Badge variant={impact.triggerReorder ? 'destructive' : 'secondary'}>
                      Stock: {impact.newStockLevel}
                    </Badge>
                    {impact.triggerReorder && (
                      <Badge variant="destructive">Reorder Required</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Component for individual part selection
interface PartSelectionItemProps {
  part: Part;
  onAdd: (part: Part, quantity: number, notes?: string) => void;
}

const PartSelectionItem: React.FC<PartSelectionItemProps> = ({ part, onAdd }) => {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    setIsAdding(true);
    onAdd(part, quantity, notes);
    setIsAdding(false);
    setQuantity(1);
    setNotes('');
  };

  const isLowStock = part.stockLevel <= part.reorderPoint;
  const canAddQuantity = quantity <= part.stockLevel;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <h4 className="font-medium">{part.partNumber}</h4>
            <Badge variant={isLowStock ? 'destructive' : 'secondary'}>
              Stock: {part.stockLevel}
            </Badge>
            {part.category && (
              <Badge variant="outline">{part.category}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">{part.description}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Unit Cost:</span>
              <span className="ml-1 font-medium">${part.unitCost.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Location:</span>
              <span className="ml-1">{part.location || 'Not specified'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`quantity-${part.id}`}>Quantity</Label>
          <Input
            id={`quantity-${part.id}`}
            type="number"
            min="1"
            max={part.stockLevel}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            className={!canAddQuantity ? 'border-red-500' : ''}
          />
          {!canAddQuantity && (
            <p className="text-xs text-red-600 mt-1">
              Insufficient stock (available: {part.stockLevel})
            </p>
          )}
        </div>
        <div>
          <Label htmlFor={`notes-${part.id}`}>Notes (optional)</Label>
          <Input
            id={`notes-${part.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Usage notes..."
          />
        </div>
      </div>

      <div className="flex justify-between items-center pt-2">
        <div className="text-sm">
          <span className="text-muted-foreground">Total Cost:</span>
          <span className="ml-1 font-medium text-green-600">
            ${(quantity * part.unitCost).toFixed(2)}
          </span>
        </div>
        <Button
          onClick={handleAdd}
          disabled={!canAddQuantity || isAdding}
          size="sm"
          className="flex items-center space-x-1"
        >
          <Plus className="w-4 h-4" />
          <span>{isAdding ? 'Adding...' : 'Add Part'}</span>
        </Button>
      </div>
    </div>
  );
};

export default PartsConsumptionManager;