import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * Rate limiting configuration for different API endpoints
 */
export const createRateLimit = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
    windowMs,
    max,
    message: message || 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Different rate limits for different endpoints
export const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  10, // limit each IP to 10 requests per windowMs
  'Too many authentication attempts from this IP, please try again after 15 minutes.'
);

export const apiRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  100, // limit each IP to 100 requests per minute
  'API rate limit exceeded, please slow down.'
);

export const uploadRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  20, // limit each IP to 20 uploads per 15 minutes
  'Upload rate limit exceeded, please try again later.'
);

/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  // CORS headers for API endpoints
  if (req.path.startsWith('/api')) {
    res.set({
      'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    });
  }

  next();
}

/**
 * Input sanitization middleware
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Sanitize common injection patterns
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  // Only sanitize for POST, PUT, PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    req.body = sanitize(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitize(req.query);
  }

  next();
}

/**
 * Request validation middleware
 */
export function validateRequest(req: Request, res: Response, next: NextFunction) {
  // Check for suspiciously large payloads
  const contentLength = req.get('Content-Length');
  if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) { // 50MB limit
    res.status(413).json({ 
      error: 'Payload too large',
      message: 'Request payload exceeds maximum allowed size'
    });
    return;
  }

  // Check for suspicious user agents
  const userAgent = req.get('User-Agent');
  if (userAgent) {
    const suspiciousPatterns = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /nessus/i,
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
      console.warn(`Suspicious user agent detected: ${userAgent} from IP: ${req.ip}`);
      res.status(403).json({ 
        error: 'Forbidden',
        message: 'Request blocked by security policy'
      });
      return;
    }
  }

  // Check for SQL injection patterns in query parameters
  const queryString = JSON.stringify(req.query);
  const sqlInjectionPatterns = [
    /union\s+select/i,
    /drop\s+table/i,
    /exec\s*\(/i,
    /script\s*>/i,
    /1\s*=\s*1/,
    /1\s*'\s*or\s*'1'\s*=\s*'1/i,
  ];
  
  if (sqlInjectionPatterns.some(pattern => pattern.test(queryString))) {
    console.warn(`Potential SQL injection attempt from IP: ${req.ip}, Query: ${queryString}`);
    res.status(400).json({ 
      error: 'Bad Request',
      message: 'Invalid query parameters'
    });
    return;
  }

  next();
}

/**
 * IP whitelist middleware (for admin endpoints)
 */
export function createIPWhitelist(allowedIPs: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Always allow localhost in development
    if (process.env.NODE_ENV === 'development') {
      const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
      if (localhostIPs.includes(clientIP)) {
        return next();
      }
    }
    
    if (!allowedIPs.includes(clientIP)) {
      console.warn(`Access denied for IP: ${clientIP}`);
      res.status(403).json({ 
        error: 'Forbidden',
        message: 'Access denied from this IP address'
      });
      return;
    }
    
    next();
  };
}

/**
 * Session validation middleware
 */
export async function validateSession(req: any, res: Response, next: NextFunction): Promise<void> {
  try {
    // Skip session validation for health checks and public endpoints
    const publicPaths = ['/api/health', '/api/monitoring', '/login', '/register'];
    if (publicPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const sessionId = req.headers['x-session-id'] || req.user?.sessionId;
    if (!sessionId) {
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Session ID required'
      });
      return;
    }

    // Import AuthService dynamically to avoid circular dependencies
    const { AuthService } = await import('../services/auth');
    const authService = new AuthService();
    
    const isValid = await authService.validateSession(sessionId);
    if (!isValid) {
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired session'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Session validation failed'
    });
  }
}