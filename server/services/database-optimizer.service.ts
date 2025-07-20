import { db } from '../db';

/**
 * Database Optimization Service
 * Handles database indexing, query optimization, and performance monitoring
 */
export class DatabaseOptimizerService {
  private static instance: DatabaseOptimizerService;
  private indexCreationQueries: string[] = [];

  constructor() {
    this.initializeOptimalIndexes();
  }

  static getInstance(): DatabaseOptimizerService {
    if (!DatabaseOptimizerService.instance) {
      DatabaseOptimizerService.instance = new DatabaseOptimizerService();
    }
    return DatabaseOptimizerService.instance;
  }

  /**
   * Initialize critical database indexes for performance
   */
  private initializeOptimalIndexes(): void {
    this.indexCreationQueries = [
      // Work Orders - frequently queried fields
      'CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status)',
      'CREATE INDEX IF NOT EXISTS idx_work_orders_priority ON work_orders(priority)',
      'CREATE INDEX IF NOT EXISTS idx_work_orders_due_date ON work_orders(due_date)',
      'CREATE INDEX IF NOT EXISTS idx_work_orders_warehouse_id ON work_orders(warehouse_id)',
      'CREATE INDEX IF NOT EXISTS idx_work_orders_equipment_id ON work_orders(equipment_id)',
      'CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to)',
      'CREATE INDEX IF NOT EXISTS idx_work_orders_created_at ON work_orders(created_at)',
      
      // Equipment - asset tracking performance
      'CREATE INDEX IF NOT EXISTS idx_equipment_warehouse_id ON equipment(warehouse_id)',
      'CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status)',
      'CREATE INDEX IF NOT EXISTS idx_equipment_criticality ON equipment(criticality)',
      'CREATE INDEX IF NOT EXISTS idx_equipment_qr_code ON equipment(qr_code)',
      
      // Parts - inventory lookups
      'CREATE INDEX IF NOT EXISTS idx_parts_warehouse_id ON parts(warehouse_id)',
      'CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category)',
      'CREATE INDEX IF NOT EXISTS idx_parts_stock_level ON parts(stock_level)',
      'CREATE INDEX IF NOT EXISTS idx_parts_reorder_point ON parts(reorder_point)',
      
      // PM Templates - scheduling optimization
      'CREATE INDEX IF NOT EXISTS idx_pm_templates_warehouse_id ON pm_templates(warehouse_id)',
      'CREATE INDEX IF NOT EXISTS idx_pm_templates_frequency ON pm_templates(frequency)',
      'CREATE INDEX IF NOT EXISTS idx_pm_templates_enabled ON pm_templates(enabled)',
      
      // User Sessions - authentication performance
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions(session_token)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active)',
      
      // Audit Trail - compliance reporting
      'CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON audit_trail(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_trail_entity_type ON audit_trail(entity_type)',
      'CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action)',
      'CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp)',
      
      // Notifications - real-time performance
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)',
      
      // Composite indexes for common query patterns
      'CREATE INDEX IF NOT EXISTS idx_work_orders_status_warehouse ON work_orders(status, warehouse_id)',
      'CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_status ON work_orders(assigned_to, status)',
      'CREATE INDEX IF NOT EXISTS idx_equipment_warehouse_status ON equipment(warehouse_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_parts_warehouse_stock ON parts(warehouse_id, stock_level)',
    ];
  }

  /**
   * Apply all performance indexes
   */
  async applyOptimizations(): Promise<{ success: boolean; applied: number; errors: string[] }> {
    const results = {
      success: true,
      applied: 0,
      errors: [] as string[]
    };

    console.log('🚀 Starting database optimization...');

    for (const query of this.indexCreationQueries) {
      try {
        await db.execute(query);
        results.applied++;
        console.log(`✅ Applied: ${query.substring(0, 50)}...`);
      } catch (error) {
        const errorMessage = `Failed to apply index: ${query} - Error: ${error.message}`;
        results.errors.push(errorMessage);
        console.error(`❌ ${errorMessage}`);
        results.success = false;
      }
    }

    // Analyze table statistics for query planner
    try {
      await db.execute('ANALYZE');
      console.log('✅ Database statistics updated');
    } catch (error) {
      results.errors.push(`Failed to analyze tables: ${error.message}`);
    }

    console.log(`🎯 Database optimization complete: ${results.applied} indexes applied`);
    if (results.errors.length > 0) {
      console.log(`⚠️  ${results.errors.length} errors encountered`);
    }

    return results;
  }

  /**
   * Get query performance statistics
   */
  async getQueryPerformanceStats(): Promise<any[]> {
    try {
      // Get slow query information (PostgreSQL specific)
      const slowQueries = await db.execute(`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          stddev_time,
          rows
        FROM pg_stat_statements 
        ORDER BY total_time DESC 
        LIMIT 10
      `);
      
      return slowQueries || [];
    } catch (error) {
      console.log('Query performance stats not available (pg_stat_statements extension required)');
      return [];
    }
  }

  /**
   * Get index usage statistics
   */
  async getIndexUsageStats(): Promise<any[]> {
    try {
      const indexStats = await db.execute(`
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE schemaname = 'public'
        ORDER BY tablename, attname
      `);
      
      return indexStats || [];
    } catch (error) {
      console.log('Index usage stats not available');
      return [];
    }
  }

  /**
   * Optimize table maintenance (VACUUM, REINDEX)
   */
  async performMaintenance(): Promise<void> {
    console.log('🔧 Starting database maintenance...');
    
    const tables = [
      'work_orders', 'equipment', 'parts', 'pm_templates', 
      'user_sessions', 'audit_trail', 'notifications'
    ];

    for (const table of tables) {
      try {
        // VACUUM ANALYZE for each table
        await db.execute(`VACUUM ANALYZE ${table}`);
        console.log(`✅ Maintained table: ${table}`);
      } catch (error) {
        console.error(`❌ Failed to maintain table ${table}: ${error.message}`);
      }
    }

    console.log('🎯 Database maintenance complete');
  }

  /**
   * Check database health and performance metrics
   */
  async getDatabaseHealthMetrics(): Promise<{
    connections: number;
    cacheHitRatio: number;
    indexUsage: number;
    tableSize: any[];
    performance: string;
  }> {
    try {
      const [connections, cacheStats, indexUsage, tableSizes] = await Promise.all([
        this.getConnectionCount(),
        this.getCacheHitRatio(),
        this.getIndexUsageRatio(),
        this.getTableSizes()
      ]);

      const performance = this.calculatePerformanceGrade(cacheStats, indexUsage);

      return {
        connections,
        cacheHitRatio: cacheStats,
        indexUsage,
        tableSize: tableSizes,
        performance
      };
    } catch (error) {
      console.error('Error getting database health metrics:', error);
      return {
        connections: 0,
        cacheHitRatio: 0,
        indexUsage: 0,
        tableSize: [],
        performance: 'unknown'
      };
    }
  }

  private async getConnectionCount(): Promise<number> {
    try {
      const result = await db.execute('SELECT count(*) FROM pg_stat_activity');
      return result[0]?.count || 0;
    } catch {
      return 0;
    }
  }

  private async getCacheHitRatio(): Promise<number> {
    try {
      const result = await db.execute(`
        SELECT 
          round(
            (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))) * 100, 
            2
          ) as cache_hit_ratio
        FROM pg_statio_user_tables
      `);
      return result[0]?.cache_hit_ratio || 0;
    } catch {
      return 0;
    }
  }

  private async getIndexUsageRatio(): Promise<number> {
    try {
      const result = await db.execute(`
        SELECT 
          round(
            (sum(idx_scan) / (sum(seq_scan) + sum(idx_scan))) * 100, 
            2
          ) as index_usage_ratio
        FROM pg_stat_user_tables
      `);
      return result[0]?.index_usage_ratio || 0;
    } catch {
      return 0;
    }
  }

  private async getTableSizes(): Promise<any[]> {
    try {
      const result = await db.execute(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `);
      return result || [];
    } catch {
      return [];
    }
  }

  private calculatePerformanceGrade(cacheHit: number, indexUsage: number): string {
    const score = (cacheHit * 0.6) + (indexUsage * 0.4);
    
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    return 'needs improvement';
  }
}

export const databaseOptimizer = DatabaseOptimizerService.getInstance();