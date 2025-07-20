import crypto from 'crypto';
import { storage } from '../storage';

export interface WebhookEvent {
  id: string;
  event: string;
  entity: string;
  entityId: string;
  data: any;
  timestamp: Date;
  warehouseId?: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  warehouseId?: string;
  retryCount: number;
  lastDelivery?: Date;
  createdAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  status: 'pending' | 'delivered' | 'failed';
  responseCode?: number;
  responseBody?: string;
  attempts: number;
  nextRetry?: Date;
  createdAt: Date;
}

class WebhookService {
  private static instance: WebhookService;
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  // Webhook endpoint management
  async registerWebhook(endpoint: Omit<WebhookEndpoint, 'id' | 'createdAt' | 'lastDelivery'>): Promise<WebhookEndpoint> {
    const webhook: WebhookEndpoint = {
      ...endpoint,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      secret: endpoint.secret || this.generateSecret()
    };

    this.endpoints.set(webhook.id, webhook);
    console.log(`Webhook registered: ${webhook.url} for events: ${webhook.events.join(', ')}`);
    
    return webhook;
  }

  async updateWebhook(id: string, updates: Partial<WebhookEndpoint>): Promise<WebhookEndpoint | null> {
    const existing = this.endpoints.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.endpoints.set(id, updated);
    return updated;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    return this.endpoints.delete(id);
  }

  async getWebhooks(warehouseId?: string): Promise<WebhookEndpoint[]> {
    return Array.from(this.endpoints.values()).filter(
      webhook => !warehouseId || webhook.warehouseId === warehouseId
    );
  }

  async getWebhook(id: string): Promise<WebhookEndpoint | null> {
    return this.endpoints.get(id) || null;
  }

  // Event emission
  async emitEvent(event: WebhookEvent): Promise<void> {
    console.log(`Emitting webhook event: ${event.event} for ${event.entity}:${event.entityId}`);
    
    const relevantEndpoints = Array.from(this.endpoints.values()).filter(endpoint => 
      endpoint.active && 
      endpoint.events.includes(event.event) &&
      (!endpoint.warehouseId || endpoint.warehouseId === event.warehouseId)
    );

    for (const endpoint of relevantEndpoints) {
      await this.deliverWebhook(endpoint, event);
    }
  }

  // Webhook delivery with retry logic
  private async deliverWebhook(endpoint: WebhookEndpoint, event: WebhookEvent): Promise<void> {
    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      webhookId: endpoint.id,
      eventId: event.id,
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    };

    this.deliveries.set(delivery.id, delivery);

    try {
      await this.attemptDelivery(endpoint, event, delivery);
    } catch (error) {
      console.error(`Webhook delivery failed for ${endpoint.url}:`, error);
      await this.scheduleRetry(endpoint, event, delivery);
    }
  }

  private async attemptDelivery(
    endpoint: WebhookEndpoint, 
    event: WebhookEvent, 
    delivery: WebhookDelivery
  ): Promise<void> {
    const payload = this.createPayload(event);
    const signature = this.signPayload(payload, endpoint.secret);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MaintainPro-Signature': signature,
          'X-MaintainPro-Event': event.event,
          'X-MaintainPro-Delivery': delivery.id,
          'User-Agent': 'MaintainPro-Webhook/1.0'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      delivery.attempts++;
      delivery.responseCode = response.status;
      delivery.responseBody = await response.text().catch(() => '');

      if (response.ok) {
        delivery.status = 'delivered';
        endpoint.lastDelivery = new Date();
        console.log(`Webhook delivered successfully to ${endpoint.url}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${delivery.responseBody}`);
      }
    } catch (error) {
      delivery.status = 'failed';
      throw error;
    } finally {
      this.deliveries.set(delivery.id, delivery);
    }
  }

  private async scheduleRetry(
    endpoint: WebhookEndpoint, 
    event: WebhookEvent, 
    delivery: WebhookDelivery
  ): Promise<void> {
    if (delivery.attempts >= 5) {
      console.error(`Max retry attempts reached for webhook ${endpoint.url}`);
      return;
    }

    // Exponential backoff: 1m, 5m, 30m, 2h, 6h
    const retryDelays = [60, 300, 1800, 7200, 21600];
    const delaySeconds = retryDelays[Math.min(delivery.attempts, retryDelays.length - 1)];
    delivery.nextRetry = new Date(Date.now() + delaySeconds * 1000);

    setTimeout(() => {
      this.attemptDelivery(endpoint, event, delivery).catch(error => {
        console.error(`Retry failed for webhook ${endpoint.url}:`, error);
        this.scheduleRetry(endpoint, event, delivery);
      });
    }, delaySeconds * 1000);
  }

  private createPayload(event: WebhookEvent): any {
    return {
      id: event.id,
      event: event.event,
      timestamp: event.timestamp.toISOString(),
      data: {
        entity: event.entity,
        entityId: event.entityId,
        warehouseId: event.warehouseId,
        payload: event.data
      }
    };
  }

  private signPayload(payload: any, secret: string): string {
    const body = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Webhook validation for incoming requests
  validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Analytics and monitoring
  async getDeliveryStats(webhookId?: string): Promise<{
    total: number;
    delivered: number;
    failed: number;
    pending: number;
    successRate: number;
  }> {
    const deliveries = Array.from(this.deliveries.values()).filter(
      delivery => !webhookId || delivery.webhookId === webhookId
    );

    const total = deliveries.length;
    const delivered = deliveries.filter(d => d.status === 'delivered').length;
    const failed = deliveries.filter(d => d.status === 'failed').length;
    const pending = deliveries.filter(d => d.status === 'pending').length;
    const successRate = total > 0 ? (delivered / total) * 100 : 0;

    return { total, delivered, failed, pending, successRate };
  }

  async getRecentDeliveries(webhookId?: string, limit = 50): Promise<WebhookDelivery[]> {
    return Array.from(this.deliveries.values())
      .filter(delivery => !webhookId || delivery.webhookId === webhookId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

export const webhookService = WebhookService.getInstance();

// Event helpers for common webhook events
export const WebhookEvents = {
  // Work Order Events
  WORK_ORDER_CREATED: 'work_order.created',
  WORK_ORDER_UPDATED: 'work_order.updated',
  WORK_ORDER_COMPLETED: 'work_order.completed',
  WORK_ORDER_ESCALATED: 'work_order.escalated',

  // Equipment Events
  EQUIPMENT_CREATED: 'equipment.created',
  EQUIPMENT_UPDATED: 'equipment.updated',
  EQUIPMENT_STATUS_CHANGED: 'equipment.status_changed',

  // Inventory Events
  INVENTORY_LOW_STOCK: 'inventory.low_stock',
  INVENTORY_REORDER: 'inventory.reorder',
  PARTS_CONSUMED: 'parts.consumed',

  // PM Events
  PM_SCHEDULED: 'pm.scheduled',
  PM_OVERDUE: 'pm.overdue',
  PM_COMPLETED: 'pm.completed'
} as const;

export type WebhookEventType = typeof WebhookEvents[keyof typeof WebhookEvents];