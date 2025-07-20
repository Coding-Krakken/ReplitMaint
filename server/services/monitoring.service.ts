import { performance } from 'perf_hooks';
import { storage } from '../storage';

export interface SystemMetrics {
  memory: {
    used: number;
    free: number;
    total: number;
    usage: number;
  };
  performance: {
    uptime: number;
    avgResponseTime: number;
    requestCount: number;
    errorCount: number;
  };
  business: {
    activeWorkOrders: number;
    overdueWorkOrders: number;
    equipmentCount: number;
    pmCompliance: number;
  };
}

export interface PerformanceAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

class MonitoringService {
  private static instance: MonitoringService;
  private responseTimeLog: number[] = [];
  private requestCount = 0;
  private errorCount = 0;
  private alerts: Map<string, PerformanceAlert> = new Map();
  private readonly MAX_LOG_SIZE = 1000;

  // Performance thresholds
  private readonly thresholds = {
    responseTime: 500, // ms
    memoryUsage: 80, // percentage
    errorRate: 5, // percentage
    overdueWorkOrdersRatio: 10, // percentage
  };

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Record API response time
   */
  recordResponseTime(responseTime: number): void {
    this.responseTimeLog.push(responseTime);
    
    // Keep log size manageable
    if (this.responseTimeLog.length > this.MAX_LOG_SIZE) {
      this.responseTimeLog.shift();
    }

    // Check for performance alerts
    this.checkResponseTimeAlert(responseTime);
  }

  /**
   * Increment request counter
   */
  incrementRequestCount(): void {
    this.requestCount++;
  }

  /**
   * Increment error counter
   */
  incrementErrorCount(): void {
    this.errorCount++;
    this.checkErrorRateAlert();
  }

  /**
   * Get current system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const memoryUsage = process.memoryUsage();
    const avgResponseTime = this.calculateAverageResponseTime();

    // Get business metrics
    try {
      const warehouses = await storage.getWarehouses();
      const allWorkOrders = warehouses.length > 0 
        ? await storage.getWorkOrders(warehouses[0].id) 
        : [];
      
      const allEquipment = warehouses.length > 0
        ? await storage.getEquipment(warehouses[0].id)
        : [];

      const activeWorkOrders = allWorkOrders.filter(wo => 
        wo.status !== 'completed' && wo.status !== 'closed'
      ).length;

      const overdueWorkOrders = allWorkOrders.filter(wo => 
        wo.status !== 'completed' && 
        wo.status !== 'closed' &&
        new Date(wo.dueDate) < new Date()
      ).length;

      // Calculate PM compliance (simplified)
      const pmWorkOrders = allWorkOrders.filter(wo => wo.type === 'preventive');
      const completedPMOrders = pmWorkOrders.filter(wo => wo.status === 'completed');
      const pmCompliance = pmWorkOrders.length > 0 
        ? Math.round((completedPMOrders.length / pmWorkOrders.length) * 100)
        : 100;

      return {
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          free: Math.round((memoryUsage.heapTotal - memoryUsage.heapUsed) / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
        },
        performance: {
          uptime: Math.round(process.uptime()),
          avgResponseTime,
          requestCount: this.requestCount,
          errorCount: this.errorCount,
        },
        business: {
          activeWorkOrders,
          overdueWorkOrders,
          equipmentCount: allEquipment.length,
          pmCompliance,
        }
      };
    } catch (error) {
      console.error('Error fetching business metrics:', error);
      
      return {
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          free: Math.round((memoryUsage.heapTotal - memoryUsage.heapUsed) / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
        },
        performance: {
          uptime: Math.round(process.uptime()),
          avgResponseTime,
          requestCount: this.requestCount,
          errorCount: this.errorCount,
        },
        business: {
          activeWorkOrders: 0,
          overdueWorkOrders: 0,
          equipmentCount: 0,
          pmCompliance: 0,
        }
      };
    }
  }

  /**
   * Get current performance alerts
   */
  getPerformanceAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 50); // Return latest 50 alerts
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(): number {
    if (this.responseTimeLog.length === 0) return 0;
    
    const sum = this.responseTimeLog.reduce((acc, time) => acc + time, 0);
    return Math.round(sum / this.responseTimeLog.length);
  }

  /**
   * Check for response time alerts
   */
  private checkResponseTimeAlert(responseTime: number): void {
    if (responseTime > this.thresholds.responseTime) {
      this.createAlert({
        type: responseTime > this.thresholds.responseTime * 2 ? 'critical' : 'warning',
        title: 'High Response Time',
        message: `API response time of ${responseTime}ms exceeds threshold`,
        metric: 'response_time',
        value: responseTime,
        threshold: this.thresholds.responseTime,
      });
    }
  }

  /**
   * Check for error rate alerts
   */
  private checkErrorRateAlert(): void {
    if (this.requestCount > 0) {
      const errorRate = (this.errorCount / this.requestCount) * 100;
      
      if (errorRate > this.thresholds.errorRate) {
        this.createAlert({
          type: 'warning',
          title: 'High Error Rate',
          message: `Error rate of ${errorRate.toFixed(2)}% exceeds threshold`,
          metric: 'error_rate',
          value: errorRate,
          threshold: this.thresholds.errorRate,
        });
      }
    }
  }

  /**
   * Create a new performance alert
   */
  private createAlert(alertData: Omit<PerformanceAlert, 'id' | 'timestamp'>): void {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: PerformanceAlert = {
      ...alertData,
      id,
      timestamp: new Date(),
    };

    this.alerts.set(id, alert);

    // Keep alerts manageable - remove old ones
    if (this.alerts.size > 100) {
      const oldestAlert = Array.from(this.alerts.values())
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
      
      this.alerts.delete(oldestAlert.id);
    }
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.responseTimeLog = [];
    this.requestCount = 0;
    this.errorCount = 0;
    this.alerts.clear();
  }
}

export const monitoringService = MonitoringService.getInstance();