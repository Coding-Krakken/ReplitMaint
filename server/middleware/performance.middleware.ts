import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { monitoringService } from '../services/monitoring.service';

export interface PerformanceRequest extends Request {
  startTime?: number;
}

/**
 * Performance monitoring middleware
 * Tracks request response times and counts
 */
export function performanceMiddleware(req: PerformanceRequest, res: Response, next: NextFunction): void {
  // Record start time
  req.startTime = performance.now();
  
  // Increment request count
  monitoringService.incrementRequestCount();

  // Override res.json to capture response time
  const originalJson = res.json;
  res.json = function(body?: any) {
    if (req.startTime) {
      const responseTime = Math.round(performance.now() - req.startTime);
      monitoringService.recordResponseTime(responseTime);
      
      // Add performance headers
      res.set('X-Response-Time', `${responseTime}ms`);
    }
    
    return originalJson.call(this, body);
  };

  // Override res.send to capture response time for non-JSON responses
  const originalSend = res.send;
  res.send = function(body?: any) {
    if (req.startTime) {
      const responseTime = Math.round(performance.now() - req.startTime);
      monitoringService.recordResponseTime(responseTime);
      
      // Add performance headers
      res.set('X-Response-Time', `${responseTime}ms`);
    }
    
    return originalSend.call(this, body);
  };

  next();
}

/**
 * Error tracking middleware
 * Records error occurrences for monitoring
 */
export function errorTrackingMiddleware(err: any, req: Request, res: Response, next: NextFunction): void {
  // Increment error count
  monitoringService.incrementErrorCount();

  // Log error details
  console.error(`Error on ${req.method} ${req.path}:`, {
    error: err.message,
    stack: err.stack,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // Send error response
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;

  res.status(status).json({
    error: true,
    message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}