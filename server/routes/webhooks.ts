import type { Express } from "express";
import { z } from "zod";
import crypto from "crypto";
import { webhookService } from "../services/webhook.service";

const webhookEndpointSchema = z.object({
  url: z.string().url("Invalid URL format"),
  events: z.array(z.string()).min(1, "At least one event must be selected"),
  secret: z.string().optional(),
  active: z.boolean().default(true),
  retryCount: z.number().min(0).max(5).default(3)
});

const webhookUpdateSchema = webhookEndpointSchema.partial();

export function registerWebhookRoutes(app: Express, authenticateRequest: any, requireRole: any): void {
  // List all webhooks for the current warehouse
  app.get("/api/webhooks", authenticateRequest, async (req, res) => {
    try {
      const user = (req as any).user;
      const webhooks = await webhookService.getWebhooks(user.warehouseId);
      res.json(webhooks);
    } catch (error) {
      console.error('List webhooks error:', error);
      res.status(500).json({ message: "Failed to retrieve webhooks" });
    }
  });

  // Get a specific webhook
  app.get("/api/webhooks/:id", authenticateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      const webhook = await webhookService.getWebhook(id);
      
      if (!webhook) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      // Check warehouse access
      const user = (req as any).user;
      if (webhook.warehouseId && webhook.warehouseId !== user.warehouseId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(webhook);
    } catch (error) {
      console.error('Get webhook error:', error);
      res.status(500).json({ message: "Failed to retrieve webhook" });
    }
  });

  // Create a new webhook endpoint
  app.post("/api/webhooks", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const validation = webhookEndpointSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid webhook data",
          errors: validation.error.errors
        });
      }

      const user = (req as any).user;
      const webhookData = {
        url: validation.data.url,
        events: validation.data.events,
        secret: validation.data.secret,
        active: validation.data.active,
        retryCount: validation.data.retryCount,
        warehouseId: user.warehouseId
      };

      const webhook = await webhookService.registerWebhook(webhookData);
      res.status(201).json(webhook);
    } catch (error) {
      console.error('Create webhook error:', error);
      res.status(500).json({ message: "Failed to create webhook" });
    }
  });

  // Update an existing webhook
  app.put("/api/webhooks/:id", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { id } = req.params;
      const validation = webhookUpdateSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid webhook data",
          errors: validation.error.errors
        });
      }

      // Check if webhook exists and user has access
      const existing = await webhookService.getWebhook(id);
      if (!existing) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      const user = (req as any).user;
      if (existing.warehouseId && existing.warehouseId !== user.warehouseId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updated = await webhookService.updateWebhook(id, validation.data);
      res.json(updated);
    } catch (error) {
      console.error('Update webhook error:', error);
      res.status(500).json({ message: "Failed to update webhook" });
    }
  });

  // Delete a webhook
  app.delete("/api/webhooks/:id", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if webhook exists and user has access
      const existing = await webhookService.getWebhook(id);
      if (!existing) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      const user = (req as any).user;
      if (existing.warehouseId && existing.warehouseId !== user.warehouseId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const deleted = await webhookService.deleteWebhook(id);
      if (!deleted) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      res.json({ message: "Webhook deleted successfully" });
    } catch (error) {
      console.error('Delete webhook error:', error);
      res.status(500).json({ message: "Failed to delete webhook" });
    }
  });

  // Get webhook delivery statistics
  app.get("/api/webhooks/:id/stats", authenticateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if webhook exists and user has access
      const webhook = await webhookService.getWebhook(id);
      if (!webhook) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      const user = (req as any).user;
      if (webhook.warehouseId && webhook.warehouseId !== user.warehouseId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const stats = await webhookService.getDeliveryStats(id);
      res.json(stats);
    } catch (error) {
      console.error('Get webhook stats error:', error);
      res.status(500).json({ message: "Failed to retrieve webhook statistics" });
    }
  });

  // Get recent webhook deliveries
  app.get("/api/webhooks/:id/deliveries", authenticateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Check if webhook exists and user has access
      const webhook = await webhookService.getWebhook(id);
      if (!webhook) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      const user = (req as any).user;
      if (webhook.warehouseId && webhook.warehouseId !== user.warehouseId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const deliveries = await webhookService.getRecentDeliveries(id, limit);
      res.json(deliveries);
    } catch (error) {
      console.error('Get webhook deliveries error:', error);
      res.status(500).json({ message: "Failed to retrieve webhook deliveries" });
    }
  });

  // Test webhook endpoint
  app.post("/api/webhooks/:id/test", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if webhook exists and user has access
      const webhook = await webhookService.getWebhook(id);
      if (!webhook) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      const user = (req as any).user;
      if (webhook.warehouseId && webhook.warehouseId !== user.warehouseId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Send test event
      const testEvent = {
        id: crypto.randomUUID(),
        event: 'webhook.test',
        entity: 'test',
        entityId: 'test-entity',
        data: {
          message: 'This is a test webhook event',
          timestamp: new Date().toISOString(),
          triggeredBy: user.id
        },
        timestamp: new Date(),
        warehouseId: user.warehouseId
      };

      await webhookService.emitEvent(testEvent);
      res.json({ message: "Test webhook sent successfully" });
    } catch (error) {
      console.error('Test webhook error:', error);
      res.status(500).json({ message: "Failed to send test webhook" });
    }
  });

  // Get all available webhook events
  app.get("/api/webhooks/events/available", authenticateRequest, async (req, res) => {
    try {
      const events = [
        {
          category: "Work Orders",
          events: [
            { name: "work_order.created", description: "A new work order is created" },
            { name: "work_order.updated", description: "A work order is updated" },
            { name: "work_order.completed", description: "A work order is completed" },
            { name: "work_order.escalated", description: "A work order is escalated" }
          ]
        },
        {
          category: "Equipment",
          events: [
            { name: "equipment.created", description: "New equipment is added" },
            { name: "equipment.updated", description: "Equipment information is updated" },
            { name: "equipment.status_changed", description: "Equipment status changes" }
          ]
        },
        {
          category: "Inventory",
          events: [
            { name: "inventory.low_stock", description: "Part stock falls below reorder point" },
            { name: "inventory.reorder", description: "Automatic reorder is triggered" },
            { name: "parts.consumed", description: "Parts are consumed in a work order" }
          ]
        },
        {
          category: "Preventive Maintenance",
          events: [
            { name: "pm.scheduled", description: "A new PM is scheduled" },
            { name: "pm.overdue", description: "A PM becomes overdue" },
            { name: "pm.completed", description: "A PM is completed" }
          ]
        }
      ];

      res.json(events);
    } catch (error) {
      console.error('Get webhook events error:', error);
      res.status(500).json({ message: "Failed to retrieve webhook events" });
    }
  });
}