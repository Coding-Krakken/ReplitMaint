import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  DollarSign,
  Calculator,
  Search,
  Barcode 
} from 'lucide-react';
import { Part, PartsUsage } from '@/types';

interface PartsUsageTrackerProps {
  workOrderId: string;
  isReadOnly?: boolean;
  onCostUpdate?: (totalCost: number) => void;
}

interface PartUsageEntry {
  id?: string;
  partId: string;
  part?: Part;
  quantityUsed: number;
  unitCost: number;
  totalCost: number;
  notes?: string;
}

const PartsUsageTracker: React.FC<PartsUsageTrackerProps> = ({
  workOrderId,
  isReadOnly = false,
  onCostUpdate
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [newEntry, setNewEntry] = useState<Partial<PartUsageEntry>>({
    quantityUsed: 1,
    unitCost: 0
  });
  const [isAddingPart, setIsAddingPart] = useState(false);

  // Fetch existing parts usage
  const { data: partsUsage = [], isLoading: isLoadingUsage } = useQuery({
    queryKey: ['partsUsage', workOrderId],
    queryFn: async () => {
      const response = await fetch(`/api/work-orders/${workOrderId}/parts-usage`);
      if (!response.ok) throw new Error('Failed to fetch parts usage');
      return (await response.json()) as PartUsageEntry[];
    },
  });

  // Fetch available parts for selection
  const { data: availableParts = [], isLoading: isLoadingParts } = useQuery({
    queryKey: ['parts', 'available'],
    queryFn: async () => {
      const response = await fetch('/api/parts?available=true');
      if (!response.ok) throw new Error('Failed to fetch parts');
      return (await response.json()) as Part[];
    },
  });

  // Add parts usage mutation
  const addPartsUsage = useMutation({
    mutationFn: async (usage: Partial<PartUsageEntry>) => {
      const response = await fetch(`/api/work-orders/${workOrderId}/parts-usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partId: usage.partId,
          quantityUsed: usage.quantityUsed,
          unitCost: usage.unitCost,
          notes: usage.notes
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add parts usage');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partsUsage', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['parts', 'available'] }); // Refresh available parts
      setNewEntry({ quantityUsed: 1, unitCost: 0 });
      setIsAddingPart(false);
      toast({
        title: 'Parts Usage Added',
        description: 'Part consumption recorded successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Add Parts Usage',
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
      queryClient.invalidateQueries({ queryKey: ['parts', 'available'] }); // Refresh available parts
      toast({
        title: 'Parts Usage Removed',
        description: 'Part consumption removed successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Remove Parts Usage',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Calculate total cost and notify parent
  useEffect(() => {
    const totalCost = partsUsage.reduce((sum, usage) => sum + usage.totalCost, 0);
    onCostUpdate?.(totalCost);
  }, [partsUsage, onCostUpdate]);

  const filteredParts = availableParts.filter(part =>
    part.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    part.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedPart = availableParts.find(part => part.id === newEntry.partId);

  const handlePartSelect = (partId: string) => {
    const part = availableParts.find(p => p.id === partId);
    if (part) {
      setNewEntry(prev => ({
        ...prev,
        partId: partId,
        unitCost: parseFloat(part.unitCost || '0')
      }));
    }
  };

  const handleQuantityChange = (quantity: number) => {
    setNewEntry(prev => ({
      ...prev,
      quantityUsed: quantity,
      totalCost: quantity * (prev.unitCost || 0)
    }));
  };

  const handleUnitCostChange = (unitCost: number) => {
    setNewEntry(prev => ({
      ...prev,
      unitCost: unitCost,
      totalCost: (prev.quantityUsed || 0) * unitCost
    }));
  };

  const handleAddPart = () => {
    if (!newEntry.partId || !newEntry.quantityUsed) {
      toast({
        title: 'Invalid Entry',
        description: 'Please select a part and enter quantity',
        variant: 'destructive',
      });
      return;
    }

    // Check if part has sufficient stock
    const part = availableParts.find(p => p.id === newEntry.partId);
    if (part && part.stockLevel < newEntry.quantityUsed) {
      toast({
        title: 'Insufficient Stock',
        description: `Only ${part.stockLevel} units available in stock`,
        variant: 'destructive',
      });
      return;
    }

    addPartsUsage.mutate(newEntry);
  };

  const totalCost = partsUsage.reduce((sum, usage) => sum + usage.totalCost, 0);
  const totalItems = partsUsage.reduce((sum, usage) => sum + usage.quantityUsed, 0);

  if (isLoadingUsage) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading parts usage...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg flex items-center">
              <Package className="w-5 h-5 mr-2" />
              Parts Usage
            </CardTitle>
            <div className="flex items-center space-x-4">
              <Badge variant="outline">
                {totalItems} Items
              </Badge>
              <Badge variant="outline" className="text-green-600">
                ${totalCost.toFixed(2)}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Add New Parts */}
      {!isReadOnly && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Add Parts</h3>
              {!isAddingPart && (
                <Button 
                  size="sm" 
                  onClick={() => setIsAddingPart(true)}
                  className="text-xs"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Part
                </Button>
              )}
            </div>
          </CardHeader>
          
          {isAddingPart && (
            <CardContent className="pt-0">
              <div className="space-y-4">
                {/* Part Search and Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search Parts</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search by part number or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Part</label>
                  <Select value={newEntry.partId || ''} onValueChange={handlePartSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a part..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredParts.map(part => (
                        <SelectItem key={part.id} value={part.id}>
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">{part.partNumber}</span>
                              <Badge variant="outline" className="text-xs">
                                Stock: {part.stockLevel}
                              </Badge>
                            </div>
                            <span className="text-sm text-gray-500">{part.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quantity and Cost */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quantity Used</label>
                    <Input
                      type="number"
                      min="1"
                      value={newEntry.quantityUsed || ''}
                      onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 0)}
                      placeholder="Quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Unit Cost</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newEntry.unitCost || ''}
                        onChange={(e) => handleUnitCostChange(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                {/* Total Cost Display */}
                {newEntry.quantityUsed && newEntry.unitCost && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <span className="text-sm font-medium">Total Cost:</span>
                    <span className="text-lg font-bold text-green-600">
                      ${((newEntry.quantityUsed || 0) * (newEntry.unitCost || 0)).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Stock Warning */}
                {selectedPart && newEntry.quantityUsed && selectedPart.stockLevel < newEntry.quantityUsed && (
                  <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-700">
                      Insufficient stock! Available: {selectedPart.stockLevel}
                    </span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setIsAddingPart(false);
                      setNewEntry({ quantityUsed: 1, unitCost: 0 });
                      setSearchQuery('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm"
                    onClick={handleAddPart}
                    disabled={!newEntry.partId || !newEntry.quantityUsed || addPartsUsage.isPending}
                  >
                    Add Part
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Parts Usage List */}
      <div className="space-y-3">
        {partsUsage.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-gray-500">
                No parts used yet for this work order
              </div>
            </CardContent>
          </Card>
        ) : (
          partsUsage.map((usage, index) => (
            <Card key={usage.id || index} className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Barcode className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{usage.part?.partNumber}</span>
                      <Badge variant="outline" className="text-xs">
                        {usage.part?.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {usage.part?.description}
                    </p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Quantity:</span>
                        <span className="ml-2 font-medium">{usage.quantityUsed}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Unit Cost:</span>
                        <span className="ml-2 font-medium">${usage.unitCost.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total:</span>
                        <span className="ml-2 font-medium text-green-600">
                          ${usage.totalCost.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => usage.id && removePartsUsage.mutate(usage.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Cost Summary */}
      {partsUsage.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Calculator className="w-5 h-5 text-gray-500" />
                <span className="font-medium">Total Parts Cost</span>
              </div>
              <div className="text-xl font-bold text-green-600">
                ${totalCost.toFixed(2)}
              </div>
            </div>
            <Separator className="my-2" />
            <div className="text-sm text-gray-500">
              {totalItems} items used • Average cost: ${(totalCost / totalItems).toFixed(2)} per item
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PartsUsageTracker;