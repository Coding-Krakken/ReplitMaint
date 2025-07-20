import { Router } from 'express';
import { storage } from '../storage';
import { notificationService } from '../services/notification.service';
import { z } from 'zod';

// Helper function to get current user from request
function getCurrentUser(req: any): string {
  return req.user?.id || 'system';
}

const router = Router();

// Enhanced parts usage creation with inventory consumption
const createPartsUsageSchema = z.object({
  partId: z.string().uuid(),
  quantityUsed: z.number().positive(),
  unitCost: z.number().nonnegative(),
  notes: z.string().optional(),
  consumeInventory: z.boolean().default(true),
});

// Add parts usage with automatic inventory consumption
router.post('/work-orders/:id/parts-usage', async (req, res) => {
  try {
    const workOrderId = req.params.id;
    const validatedData = createPartsUsageSchema.parse(req.body);
    
    // Get the part information
    const part = await storage.getPart(validatedData.partId);
    if (!part) {
      return res.status(404).json({ message: 'Part not found' });
    }

    // Check stock availability if consuming inventory
    if (validatedData.consumeInventory && part.stockLevel < validatedData.quantityUsed) {
      return res.status(400).json({ 
        message: 'Insufficient stock',
        available: part.stockLevel,
        requested: validatedData.quantityUsed
      });
    }

    // Create parts usage record
    const partsUsage = await storage.createPartsUsage({
      workOrderId,
      partId: validatedData.partId,
      quantityUsed: validatedData.quantityUsed,
      unitCost: validatedData.unitCost.toString(),
      usedBy: getCurrentUser(req),
      notes: validatedData.notes,
    });

    let inventoryImpact = null;

    // Update inventory if requested
    if (validatedData.consumeInventory) {
      const newStockLevel = Math.max(0, part.stockLevel - validatedData.quantityUsed);
      
      await storage.updatePart(validatedData.partId, { 
        stockLevel: newStockLevel 
      });

      inventoryImpact = {
        partId: validatedData.partId,
        quantityConsumed: validatedData.quantityUsed,
        newStockLevel,
        triggerReorder: newStockLevel <= part.reorderPoint,
        costImpact: validatedData.quantityUsed * validatedData.unitCost,
      };

      // Broadcast real-time inventory update
      notificationService.broadcastToWarehouse(part.warehouseId, {
        type: 'inventory_update',
        partId: validatedData.partId,
        newStockLevel,
        consumedQuantity: validatedData.quantityUsed,
        workOrderId,
      });

      // Create reorder notification if needed
      if (newStockLevel <= part.reorderPoint) {
        const notification = await storage.createNotification({
          userId: 'supervisor-id', // In production, get actual supervisor
          type: 'part_low_stock',
          title: 'Low Stock Alert',
          message: `Part ${part.partNumber} is below reorder point (${newStockLevel}/${part.reorderPoint})`,
          partId: part.id,
          read: false,
        });

        // Broadcast reorder alert
        notificationService.broadcastToWarehouse(part.warehouseId, {
          type: 'low_stock_alert',
          notification,
          part: {
            id: part.id,
            partNumber: part.partNumber,
            description: part.description,
            stockLevel: newStockLevel,
            reorderPoint: part.reorderPoint,
          },
        });
      }
    }

    res.json({
      ...partsUsage,
      inventoryImpact,
    });
  } catch (error) {
    console.error('Error creating parts usage:', error);
    res.status(500).json({ message: 'Failed to create parts usage' });
  }
});

// Bulk consume all parts for work order completion
router.post('/work-orders/:id/consume-parts', async (req, res) => {
  try {
    const workOrderId = req.params.id;
    
    // Get all parts usage for this work order
    const partsUsage = await storage.getPartsUsageByWorkOrder(workOrderId);
    
    if (partsUsage.length === 0) {
      return res.status(400).json({ message: 'No parts usage found for this work order' });
    }

    let consumedCount = 0;
    const lowStockAlerts = [];
    
    // Process each part consumption
    for (const usage of partsUsage) {
      const part = await storage.getPart(usage.partId);
      if (!part) continue;

      // Skip consumption for already processed items
      // Note: consumed field would need to be added to schema in future enhancement

      // Consume from inventory
      const newStockLevel = Math.max(0, part.stockLevel - usage.quantityUsed);
      
      await storage.updatePart(usage.partId, { stockLevel: newStockLevel });
      // Mark as consumed in future schema enhancement
      // await storage.updatePartsUsage(usage.id, { consumed: true });
      
      consumedCount++;

      // Check for low stock
      if (newStockLevel <= part.reorderPoint) {
        const notification = await storage.createNotification({
          userId: 'supervisor-id',
          type: 'part_low_stock',
          title: 'Low Stock Alert',
          message: `Part ${part.partNumber} is below reorder point (${newStockLevel}/${part.reorderPoint})`,
          partId: part.id,
          read: false,
        });

        lowStockAlerts.push({
          part: {
            id: part.id,
            partNumber: part.partNumber,
            description: part.description,
            stockLevel: newStockLevel,
            reorderPoint: part.reorderPoint,
          },
          notification,
        });
      }

      // Broadcast inventory update
      notificationService.broadcastToWarehouse(part.warehouseId, {
        type: 'inventory_update',
        partId: usage.partId,
        newStockLevel,
        consumedQuantity: usage.quantityUsed,
        workOrderId,
      });
    }

    // Broadcast low stock alerts
    for (const alert of lowStockAlerts) {
      notificationService.broadcastToWarehouse(alert.part.warehouseId || 'default', {
        type: 'low_stock_alert',
        ...alert
      });
    }

    res.json({
      consumedCount,
      lowStockAlerts: lowStockAlerts.length,
      message: `Successfully consumed ${consumedCount} parts from inventory`,
    });
  } catch (error) {
    console.error('Error consuming parts:', error);
    res.status(500).json({ message: 'Failed to consume parts' });
  }
});

// Get parts consumption analytics
router.get('/analytics/parts-consumption', async (req, res) => {
  try {
    const { timeRange = '30d', equipmentId } = req.query;
    
    // Calculate date range
    let startDate: Date | undefined;
    if (timeRange !== 'all') {
      const days = timeRange === '7d' ? 7 : 
                  timeRange === '30d' ? 30 : 
                  timeRange === '90d' ? 90 : 365;
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
    }

    // Get parts usage data
    const partsUsage = await storage.getPartsUsageAnalytics({
      startDate,
      equipmentId: equipmentId as string,
    });

    // Calculate consumption metrics
    const totalCost = partsUsage.reduce((sum, usage) => sum + (usage.quantityUsed * parseFloat(usage.unitCost)), 0);
    const totalQuantity = partsUsage.reduce((sum, usage) => sum + usage.quantityUsed, 0);
    const uniqueParts = new Set(partsUsage.map(usage => usage.partId)).size;
    
    // Group by part for frequency analysis
    const partUsageMap = new Map();
    partsUsage.forEach(usage => {
      const key = usage.partId;
      if (!partUsageMap.has(key)) {
        partUsageMap.set(key, {
          partId: usage.partId,
          part: usage.part,
          totalQuantity: 0,
          totalCost: 0,
          usageCount: 0,
        });
      }
      const entry = partUsageMap.get(key);
      entry.totalQuantity += usage.quantityUsed;
      entry.totalCost += usage.quantityUsed * parseFloat(usage.unitCost);
      entry.usageCount += 1;
    });

    const topParts = Array.from(partUsageMap.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);

    res.json({
      summary: {
        totalCost,
        totalQuantity,
        uniqueParts,
        timeRange,
      },
      topParts,
      rawData: partsUsage,
    });
  } catch (error) {
    console.error('Error getting parts consumption analytics:', error);
    res.status(500).json({ message: 'Failed to get analytics' });
  }
});

// Get inventory impact for a specific work order
router.get('/work-orders/:id/inventory-impact', async (req, res) => {
  try {
    const workOrderId = req.params.id;
    
    const partsUsage = await storage.getPartsUsageByWorkOrder(workOrderId);
    const impacts = [];
    
    for (const usage of partsUsage) {
      const part = await storage.getPart(usage.partId);
      if (!part) continue;

      const projectedStockLevel = part.stockLevel - usage.quantityUsed;
      impacts.push({
        partId: usage.partId,
        part: {
          partNumber: part.partNumber,
          description: part.description,
          currentStock: part.stockLevel,
          reorderPoint: part.reorderPoint,
        },
        quantityToConsume: usage.quantityUsed,
        projectedStockLevel: Math.max(0, projectedStockLevel),
        willTriggerReorder: projectedStockLevel <= part.reorderPoint,
        costImpact: usage.quantityUsed * parseFloat(usage.unitCost),
      });
    }

    res.json(impacts);
  } catch (error) {
    console.error('Error getting inventory impact:', error);
    res.status(500).json({ message: 'Failed to get inventory impact' });
  }
});

export default router;