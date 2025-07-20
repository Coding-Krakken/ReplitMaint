import dotenv from 'dotenv';
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import compression from 'compression';
import helmet from 'helmet';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pmScheduler } from "./services/pm-scheduler";
import { backgroundJobScheduler } from "./services/background-jobs";
import { CacheService } from "./services/cache.service";
import { performanceService } from "./services/performance.service";

const app = express();

// Initialize services
const cacheService = CacheService.getInstance({
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0')
  },
  defaultTTL: 300, // 5 minutes
  enableMemoryCache: true,
  maxMemoryCacheSize: 1000
});

// Performance monitoring middleware
app.use(performanceService.createExpressMiddleware());

// Compression middleware for better performance
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024,
  memLevel: 8
}));

// Enhanced security with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Allow for development
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// HTTPS redirect in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Start PM scheduler
pmScheduler.start();

// Start background job scheduler
backgroundJobScheduler.startAll();

// Initialize the app
async function initializeApp() {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log error in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Server Error:', err);
    }

    res.status(status).json({ message });
    
    // Don't throw in test environment to avoid test failures
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
      throw err;
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  return server;
}

// Initialize app for testing
if (process.env.NODE_ENV === 'test') {
  initializeApp().catch(console.error);
}

// Export app for testing
export { app };

// Only run server if this file is being executed directly
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    const server = await initializeApp();
    // Log all environment variables for debugging
    console.log('ENVIRONMENT VARIABLES:', JSON.stringify(process.env, null, 2));
    // Serve the app on configured port (default 5000)
    const port = process.env.PORT || 5000;
    console.log('About to start server on port', port);
    const httpServer = server.listen({
      port: Number(port),
      host: process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost",
    }, () => {
      log(`serving on port ${port}`);
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      log('SIGTERM received, shutting down gracefully');
      backgroundJobScheduler.stopAll();
      httpServer.close(() => {
        log('HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      log('SIGINT received, shutting down gracefully');
      backgroundJobScheduler.stopAll();
      httpServer.close(() => {
        log('HTTP server closed');
        process.exit(0);
      });
    });
  })();
}
