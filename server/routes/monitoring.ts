import { Router } from 'express';
import { monitoringService } from '../services/monitoring.service';

const router = Router();

/**
 * Get system performance metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await monitoringService.getSystemMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch system metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get performance alerts
 */
router.get('/alerts', (req, res) => {
  try {
    const alerts = monitoringService.getPerformanceAlerts();
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch performance alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Resolve a performance alert
 */
router.post('/alerts/:id/resolve', (req, res) => {
  try {
    const { id } = req.params;
    const resolved = monitoringService.resolveAlert(id);
    
    if (resolved) {
      res.json({ message: 'Alert resolved successfully' });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ 
      error: 'Failed to resolve alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Health check with detailed system status
 */
router.get('/health', async (req, res) => {
  try {
    const metrics = await monitoringService.getSystemMetrics();
    const alerts = monitoringService.getPerformanceAlerts().filter(a => !a.resolved);
    
    const health = {
      status: alerts.some(a => a.type === 'critical') ? 'critical' : 
              alerts.some(a => a.type === 'warning') ? 'warning' : 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      metrics: {
        memoryUsage: metrics.memory.usage,
        avgResponseTime: metrics.performance.avgResponseTime,
        requestCount: metrics.performance.requestCount,
        errorCount: metrics.performance.errorCount,
      },
      activeAlerts: alerts.length,
    };

    const statusCode = health.status === 'critical' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Error in health check:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;