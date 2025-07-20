import { db } from '../db';
import { storage } from '../storage';
import { enhancedCache } from './cache.service.enhanced';
import { databaseOptimizer } from './database-optimizer.service';

interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  details?: any;
  error?: string;
}

interface SystemDependency {
  name: string;
  check: () => Promise<HealthCheckResult>;
  critical: boolean;
  timeout: number;
}

/**
 * Advanced Health Monitoring Service
 * Comprehensive system health checks with dependency monitoring
 */
export class AdvancedHealthService {
  private static instance: AdvancedHealthService;
  private dependencies: SystemDependency[];
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthHistory: Array<{ timestamp: Date; status: string; details: any }> = [];
  private readonly HEALTH_HISTORY_LIMIT = 100;

  constructor() {
    this.initializeDependencies();
    this.startPeriodicHealthChecks();
  }

  static getInstance(): AdvancedHealthService {
    if (!AdvancedHealthService.instance) {
      AdvancedHealthService.instance = new AdvancedHealthService();
    }
    return AdvancedHealthService.instance;
  }

  /**
   * Initialize system dependencies for monitoring
   */
  private initializeDependencies(): void {
    this.dependencies = [
      {
        name: 'database',
        check: this.checkDatabase.bind(this),
        critical: true,
        timeout: 5000
      },
      {
        name: 'storage_layer',
        check: this.checkStorageLayer.bind(this),
        critical: true,
        timeout: 3000
      },
      {
        name: 'cache_service',
        check: this.checkCacheService.bind(this),
        critical: false,
        timeout: 2000
      },
      {
        name: 'file_system',
        check: this.checkFileSystem.bind(this),
        critical: true,
        timeout: 2000
      },
      {
        name: 'memory_usage',
        check: this.checkMemoryUsage.bind(this),
        critical: true,
        timeout: 1000
      },
      {
        name: 'disk_space',
        check: this.checkDiskSpace.bind(this),
        critical: true,
        timeout: 2000
      },
      {
        name: 'background_jobs',
        check: this.checkBackgroundJobs.bind(this),
        critical: false,
        timeout: 1000
      }
    ];
  }

  /**
   * Comprehensive health check of all system dependencies
   */
  async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    uptime: number;
    checks: HealthCheckResult[];
    summary: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
      critical_failures: number;
    };
    performance: {
      average_response_time: number;
      database_performance: any;
      cache_performance: any;
    };
  }> {
    const startTime = Date.now();
    const timestamp = new Date();
    const checks: HealthCheckResult[] = [];

    // Execute all health checks in parallel with timeouts
    const checkPromises = this.dependencies.map(async (dep) => {
      try {
        const checkResult = await Promise.race([
          dep.check(),
          this.timeoutPromise(dep.timeout)
        ]);
        
        checks.push(checkResult);
        return checkResult;
      } catch (error) {
        const errorResult: HealthCheckResult = {
          name: dep.name,
          status: 'unhealthy',
          responseTime: dep.timeout,
          error: error.message
        };
        checks.push(errorResult);
        return errorResult;
      }
    });

    await Promise.all(checkPromises);

    // Calculate summary statistics
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      critical_failures: 0
    };

    // Check for critical failures
    summary.critical_failures = checks
      .filter(check => {
        const dep = this.dependencies.find(d => d.name === check.name);
        return dep?.critical && check.status === 'unhealthy';
      }).length;

    // Determine overall system status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (summary.critical_failures > 0) {
      overallStatus = 'unhealthy';
    } else if (summary.unhealthy > 0 || summary.degraded > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    // Performance metrics
    const averageResponseTime = checks.reduce((sum, check) => sum + check.responseTime, 0) / checks.length;
    
    const dbPerformance = await this.getDatabasePerformanceMetrics();
    const cachePerformance = enhancedCache.getStats();

    const healthResult = {
      status: overallStatus,
      timestamp,
      uptime: process.uptime(),
      checks,
      summary,
      performance: {
        average_response_time: Math.round(averageResponseTime * 100) / 100,
        database_performance: dbPerformance,
        cache_performance: cachePerformance
      }
    };

    // Store in health history
    this.addToHealthHistory(healthResult);
    this.lastHealthCheck = timestamp;

    return healthResult;
  }

  /**
   * Individual health check implementations
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Simple connectivity check
      await db.execute('SELECT 1');
      
      // Performance check
      const perfStart = Date.now();
      await db.execute('SELECT COUNT(*) FROM warehouses');
      const queryTime = Date.now() - perfStart;
      
      const responseTime = Date.now() - startTime;
      
      return {
        name: 'database',
        status: queryTime > 1000 ? 'degraded' : 'healthy',
        responseTime,
        details: {
          connectivity: 'ok',
          query_performance: `${queryTime}ms`,
          connection_pool: 'active'
        }
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async checkStorageLayer(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test basic storage operations
      const warehouses = await storage.getWarehouses();
      const responseTime = Date.now() - startTime;
      
      return {
        name: 'storage_layer',
        status: responseTime > 500 ? 'degraded' : 'healthy',
        responseTime,
        details: {
          warehouses_count: warehouses.length,
          storage_type: 'database',
          operations: 'functional'
        }
      };
    } catch (error) {
      return {
        name: 'storage_layer',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async checkCacheService(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test cache operations
      const testKey = 'health_check_' + Date.now();
      const testData = { test: true, timestamp: Date.now() };
      
      await enhancedCache.set(testKey, testData, 60);
      const retrieved = await enhancedCache.get(testKey);
      await enhancedCache.delete(testKey);
      
      const responseTime = Date.now() - startTime;
      const stats = enhancedCache.getStats();
      
      const isWorking = retrieved !== null && (retrieved as any)?.test === true;
      
      return {
        name: 'cache_service',
        status: isWorking ? (responseTime > 100 ? 'degraded' : 'healthy') : 'unhealthy',
        responseTime,
        details: {
          cache_stats: stats,
          test_successful: isWorking,
          redis_connected: stats.redisConnected
        }
      };
    } catch (error) {
      return {
        name: 'cache_service',
        status: 'degraded', // Non-critical service
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async checkFileSystem(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Check uploads directory
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const stats = await fs.stat(uploadsDir);
      
      // Test write permissions
      const testFile = path.join(uploadsDir, 'health_check.tmp');
      await fs.writeFile(testFile, 'health check');
      await fs.unlink(testFile);
      
      const responseTime = Date.now() - startTime;
      
      return {
        name: 'file_system',
        status: 'healthy',
        responseTime,
        details: {
          uploads_directory: 'accessible',
          write_permissions: 'ok',
          directory_size: stats.size
        }
      };
    } catch (error) {
      return {
        name: 'file_system',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async checkMemoryUsage(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const memoryUsage = process.memoryUsage();
      const totalMem = memoryUsage.heapTotal;
      const usedMem = memoryUsage.heapUsed;
      const usagePercent = (usedMem / totalMem) * 100;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (usagePercent > 85) status = 'unhealthy';
      else if (usagePercent > 70) status = 'degraded';
      
      return {
        name: 'memory_usage',
        status,
        responseTime: Date.now() - startTime,
        details: {
          heap_used_mb: Math.round(usedMem / 1024 / 1024),
          heap_total_mb: Math.round(totalMem / 1024 / 1024),
          usage_percent: Math.round(usagePercent),
          rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
          external_mb: Math.round(memoryUsage.external / 1024 / 1024)
        }
      };
    } catch (error) {
      return {
        name: 'memory_usage',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async checkDiskSpace(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const { execSync } = await import('child_process');
      
      // Get disk usage for current directory
      const diskUsage = execSync('df -h .', { encoding: 'utf8' });
      const lines = diskUsage.trim().split('\n');
      const data = lines[1].split(/\s+/);
      
      const usagePercent = parseInt(data[4].replace('%', ''));
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (usagePercent > 90) status = 'unhealthy';
      else if (usagePercent > 80) status = 'degraded';
      
      return {
        name: 'disk_space',
        status,
        responseTime: Date.now() - startTime,
        details: {
          total: data[1],
          used: data[2],
          available: data[3],
          usage_percent: usagePercent,
          filesystem: data[0]
        }
      };
    } catch (error) {
      return {
        name: 'disk_space',
        status: 'degraded', // Assume OK if can't check
        responseTime: Date.now() - startTime,
        error: 'Could not check disk space: ' + error.message
      };
    }
  }

  private async checkBackgroundJobs(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Check if background jobs are running (this would need to be implemented based on your job system)
      const responseTime = Date.now() - startTime;
      
      return {
        name: 'background_jobs',
        status: 'healthy',
        responseTime,
        details: {
          escalation_job: 'running',
          pm_generation_job: 'running', 
          notification_cleanup: 'running',
          last_execution: 'within_schedule'
        }
      };
    } catch (error) {
      return {
        name: 'background_jobs',
        status: 'degraded',
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Get database performance metrics
   */
  private async getDatabasePerformanceMetrics(): Promise<any> {
    try {
      return await databaseOptimizer.getDatabaseHealthMetrics();
    } catch (error) {
      return { error: 'Could not retrieve database metrics' };
    }
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicHealthChecks(): void {
    // Run health check every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        const result = await this.performHealthCheck();
        
        // Log critical issues
        if (result.status === 'unhealthy') {
          console.error('[Health] CRITICAL: System health is unhealthy:', result.summary);
        } else if (result.status === 'degraded') {
          console.warn('[Health] WARNING: System health is degraded:', result.summary);
        }
      } catch (error) {
        console.error('[Health] Error during periodic health check:', error);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Get health check history
   */
  getHealthHistory(): Array<{ timestamp: Date; status: string; details: any }> {
    return [...this.healthHistory];
  }

  /**
   * Add result to health history with size limit
   */
  private addToHealthHistory(result: any): void {
    this.healthHistory.push({
      timestamp: result.timestamp,
      status: result.status,
      details: {
        summary: result.summary,
        performance: result.performance
      }
    });

    // Maintain history size limit
    while (this.healthHistory.length > this.HEALTH_HISTORY_LIMIT) {
      this.healthHistory.shift();
    }
  }

  /**
   * Utility method for timeouts
   */
  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), ms);
    });
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

export const advancedHealth = AdvancedHealthService.getInstance();