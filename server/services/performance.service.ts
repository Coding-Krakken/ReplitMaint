/**
 * Performance Monitoring Service
 * Tracks application performance metrics and provides optimization insights
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  contentLength?: number;
  userAgent?: string;
  ip?: string;
}

interface DatabaseMetrics {
  queryTime: number;
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  tableName?: string;
  affectedRows?: number;
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  heapUsed: number;
  heapTotal: number;
  uptime: number;
  eventLoopLag: number;
}

export class PerformanceService {
  private static instance: PerformanceService;
  private metrics: PerformanceMetric[] = [];
  private requestMetrics: RequestMetrics[] = [];
  private databaseMetrics: DatabaseMetrics[] = [];
  private maxMetricsHistory = 10000;
  private metricsInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startSystemMetricsCollection();
  }

  public static getInstance(): PerformanceService {
    if (!PerformanceService.instance) {
      PerformanceService.instance = new PerformanceService();
    }
    return PerformanceService.instance;
  }

  /**
   * Record a custom performance metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags
    };

    this.metrics.push(metric);
    this.trimMetrics();
  }

  /**
   * Record HTTP request metrics
   */
  recordRequest(metrics: RequestMetrics): void {
    this.requestMetrics.push({
      ...metrics,
      timestamp: Date.now()
    } as any);
    
    this.trimRequestMetrics();

    // Record as general metric for aggregation
    this.recordMetric('http_request_duration', metrics.responseTime, {
      method: metrics.method,
      path: this.sanitizePath(metrics.path),
      status_code: metrics.statusCode.toString()
    });
  }

  /**
   * Record database query metrics
   */
  recordDatabaseQuery(metrics: DatabaseMetrics): void {
    this.databaseMetrics.push({
      ...metrics,
      timestamp: Date.now()
    } as any);

    this.trimDatabaseMetrics();

    // Record as general metric
    this.recordMetric('database_query_duration', metrics.queryTime, {
      query_type: metrics.queryType,
      table_name: metrics.tableName || 'unknown'
    });
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(timeRangeMs: number = 300000): {
    requests: any;
    database: any;
    system: SystemMetrics;
    cache: any;
  } {
    const now = Date.now();
    const cutoff = now - timeRangeMs;

    // Request metrics summary
    const recentRequests = this.requestMetrics.filter(r => (r as any).timestamp > cutoff);
    const requestsSummary = this.summarizeRequests(recentRequests);

    // Database metrics summary
    const recentDbQueries = this.databaseMetrics.filter(q => (q as any).timestamp > cutoff);
    const databaseSummary = this.summarizeDatabase(recentDbQueries);

    // Current system metrics
    const systemMetrics = this.getCurrentSystemMetrics();

    return {
      requests: requestsSummary,
      database: databaseSummary,
      system: systemMetrics,
      cache: this.getCacheMetrics()
    };
  }

  /**
   * Get slow queries (database queries taking longer than threshold)
   */
  getSlowQueries(thresholdMs: number = 100, limit: number = 10): DatabaseMetrics[] {
    return this.databaseMetrics
      .filter(q => q.queryTime > thresholdMs)
      .sort((a, b) => b.queryTime - a.queryTime)
      .slice(0, limit);
  }

  /**
   * Get slow requests (HTTP requests taking longer than threshold)
   */
  getSlowRequests(thresholdMs: number = 1000, limit: number = 10): RequestMetrics[] {
    return this.requestMetrics
      .filter(r => r.responseTime > thresholdMs)
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, limit);
  }

  /**
   * Get performance recommendations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const summary = this.getPerformanceSummary();

    // Check request performance
    if (summary.requests.averageResponseTime > 500) {
      recommendations.push('High average response time detected. Consider implementing response caching or optimizing slow endpoints.');
    }

    // Check database performance  
    if (summary.database.averageQueryTime > 50) {
      recommendations.push('Database queries are slow. Review indexes and optimize frequently used queries.');
    }

    // Check memory usage
    if (summary.system.memoryUsage > 0.8) {
      recommendations.push('High memory usage detected. Consider implementing garbage collection tuning or memory optimization.');
    }

    // Check error rates
    if (summary.requests.errorRate > 0.05) {
      recommendations.push('High error rate detected. Review application logs and fix error-prone endpoints.');
    }

    // Check cache performance
    if (summary.cache.hitRate < 0.7) {
      recommendations.push('Low cache hit rate. Review caching strategies and increase TTL for frequently accessed data.');
    }

    return recommendations;
  }

  /**
   * Express middleware for automatic request tracking
   */
  createExpressMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        this.recordRequest({
          method: req.method,
          path: req.route?.path || req.path,
          statusCode: res.statusCode,
          responseTime,
          contentLength: res.get('Content-Length'),
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });

      next();
    };
  }

  /**
   * Database query timing wrapper
   */
  async measureDatabaseQuery<T>(
    queryType: DatabaseMetrics['queryType'],
    tableName: string,
    queryFunction: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await queryFunction();
      const queryTime = Date.now() - startTime;
      
      this.recordDatabaseQuery({
        queryTime,
        queryType,
        tableName,
        affectedRows: Array.isArray(result) ? result.length : 1
      });
      
      return result;
    } catch (error) {
      const queryTime = Date.now() - startTime;
      
      this.recordDatabaseQuery({
        queryTime,
        queryType,
        tableName,
        affectedRows: 0
      });
      
      throw error;
    }
  }

  /**
   * Start collecting system metrics periodically
   */
  private startSystemMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getCurrentSystemMetrics();
      
      this.recordMetric('cpu_usage', metrics.cpuUsage);
      this.recordMetric('memory_usage', metrics.memoryUsage);
      this.recordMetric('heap_used', metrics.heapUsed);
      this.recordMetric('event_loop_lag', metrics.eventLoopLag);
      
    }, 30000); // Every 30 seconds
  }

  /**
   * Get current system metrics
   */
  private getCurrentSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: memUsage.rss / (1024 * 1024 * 1024), // Convert to GB
      heapUsed: memUsage.heapUsed / (1024 * 1024), // Convert to MB
      heapTotal: memUsage.heapTotal / (1024 * 1024), // Convert to MB
      uptime: process.uptime(),
      eventLoopLag: this.measureEventLoopLag()
    };
  }

  /**
   * Measure event loop lag
   */
  private measureEventLoopLag(): number {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      return lag;
    });
    return 0; // Simplified implementation
  }

  /**
   * Summarize request metrics
   */
  private summarizeRequests(requests: RequestMetrics[]): any {
    if (requests.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        errorRate: 0,
        throughput: 0
      };
    }

    const totalResponseTime = requests.reduce((sum, r) => sum + r.responseTime, 0);
    const errorCount = requests.filter(r => r.statusCode >= 400).length;
    const timespan = 300000; // 5 minutes in ms

    return {
      totalRequests: requests.length,
      averageResponseTime: totalResponseTime / requests.length,
      errorRate: errorCount / requests.length,
      throughput: requests.length / (timespan / 1000), // requests per second
      p95ResponseTime: this.calculatePercentile(requests.map(r => r.responseTime), 95),
      p99ResponseTime: this.calculatePercentile(requests.map(r => r.responseTime), 99)
    };
  }

  /**
   * Summarize database metrics
   */
  private summarizeDatabase(queries: DatabaseMetrics[]): any {
    if (queries.length === 0) {
      return {
        totalQueries: 0,
        averageQueryTime: 0
      };
    }

    const totalQueryTime = queries.reduce((sum, q) => sum + q.queryTime, 0);

    return {
      totalQueries: queries.length,
      averageQueryTime: totalQueryTime / queries.length,
      p95QueryTime: this.calculatePercentile(queries.map(q => q.queryTime), 95),
      p99QueryTime: this.calculatePercentile(queries.map(q => q.queryTime), 99),
      queryTypeBreakdown: this.getQueryTypeBreakdown(queries)
    };
  }

  /**
   * Get cache metrics (placeholder - would integrate with cache service)
   */
  private getCacheMetrics(): any {
    // This would integrate with the actual cache service
    return {
      hitRate: 0.85,
      missRate: 0.15,
      totalHits: 1000,
      totalMisses: 150
    };
  }

  /**
   * Calculate percentile of an array
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * Get query type breakdown
   */
  private getQueryTypeBreakdown(queries: DatabaseMetrics[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    queries.forEach(query => {
      breakdown[query.queryType] = (breakdown[query.queryType] || 0) + 1;
    });
    
    return breakdown;
  }

  /**
   * Sanitize path for metrics (remove dynamic segments)
   */
  private sanitizePath(path: string): string {
    return path
      .replace(/\/[0-9a-f-]{36}\b/g, '/:id') // UUIDs
      .replace(/\/\d+\b/g, '/:id') // Numeric IDs
      .replace(/\?.*$/, ''); // Query parameters
  }

  /**
   * Trim metrics arrays to prevent memory leaks
   */
  private trimMetrics(): void {
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  private trimRequestMetrics(): void {
    if (this.requestMetrics.length > this.maxMetricsHistory) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxMetricsHistory);
    }
  }

  private trimDatabaseMetrics(): void {
    if (this.databaseMetrics.length > this.maxMetricsHistory) {
      this.databaseMetrics = this.databaseMetrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.requestMetrics = [];
    this.databaseMetrics = [];
  }

  /**
   * Stop metrics collection and cleanup
   */
  destroy(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    this.clearMetrics();
  }
}

export const performanceService = PerformanceService.getInstance();