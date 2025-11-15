import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import Redis from 'ioredis';
import RedisStore from 'connect-redis';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Import middleware
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/logger';
import { authMiddleware } from '@/middleware/auth';
import { csrfMiddleware, provideCsrfToken, getCsrfToken, csrfErrorHandler } from '@/middleware/csrf';
import { logger } from '@/services/logger';

// Import routes
import authRoutes from '@/routes/auth';
import shiftsRoutes from '@/routes/shifts';
import vehiclesRoutes from '@/routes/vehicles';
import messagesRoutes from '@/routes/messages';
import dashboardRoutes from '@/routes/dashboard';
import employeesRoutes from '@/routes/employees';
import tasksRoutes from '@/routes/tasks';
import usersRoutes from '@/routes/users';
import analysisRoutes from '@/routes/analysis';
import warehouseRoutes from '@/routes/warehouse';
import routeOptimizationRoutes from '@/routes/routes';

// Import services
import { initializeWebSocket } from '@/services/websocket';
import { initializeMQTT } from '@/services/mqtt';
import { initializeStorage } from '@/services/fileStorage';

// Import utils
import { validateEnvironment } from '@/utils/envValidation';

// Load environment variables
dotenv.config();

// Validate environment configuration
validateEnvironment();

const app = express();
const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  },
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
}));

// Comprehensive Rate Limiting Configuration
const createRateLimiter = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks from internal monitoring
      return req.ip === '127.0.0.1' && req.path === '/health';
    },
  });
};

// Different rate limits for different endpoint types
const strictLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  parseInt(process.env.RATE_LIMIT_STRICT_MAX || '30'), // 30 requests per 15 min
  'Rate limit exceeded for sensitive operations. Please try again later.'
);

const standardLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per 15 min
  'Too many requests from this IP, please try again later.'
);

const healthCheckLimiter = createRateLimiter(
  60000, // 1 minute
  60, // 60 health checks per minute
  'Health check rate limit exceeded.'
);

// Note: Auth rate limiting is applied directly in auth routes, not globally
// This prevents double rate limiting

// Apply rate limiting to different endpoints
app.use('/health', healthCheckLimiter);
app.use('/api/shifts', strictLimiter); // Sensitive shift operations
app.use('/api/employees', strictLimiter); // Sensitive employee data
app.use('/api/', standardLimiter); // All other API routes

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration for CSRF protection
const redisClient = new Redis(process.env.REDIS_URL || "redis://redis:6379");

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 3600000, // 1 hour
    sameSite: 'strict'
  },
  name: 'sessionId', // Don't use default session name
}));

// Request logging
app.use(requestLogger);

// CSRF Protection (after session, before routes)
app.use(csrfMiddleware);
app.use(provideCsrfToken);

// CSRF token endpoint
app.get('/csrf-token', getCsrfToken);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Oltu Municipality Backend API',
    version: '1.0.0',
  });
});

// Development-only utility endpoints
if (process.env.NODE_ENV !== 'production') {
  // Rate limit reset endpoint (development only)
  app.post('/dev/reset-rate-limit', (req, res) => {
    logger.info('Rate limit reset requested (dev only)', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Note: express-rate-limit uses memory store by default
    // Restarting the server will clear all rate limits
    // This endpoint is informational - actual reset requires server restart
    res.json({
      success: true,
      message: 'Rate limits are stored in memory. Restart the server to reset them.',
      note: 'In development, rate limits reset automatically on server restart'
    });
  });
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/shifts', authMiddleware, shiftsRoutes);
app.use('/api/vehicles', authMiddleware, vehiclesRoutes);
app.use('/api/messages', authMiddleware, messagesRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/employees', authMiddleware, employeesRoutes);
app.use('/api/tasks', authMiddleware, tasksRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/analysis', authMiddleware, analysisRoutes);
app.use('/api/warehouse', authMiddleware, warehouseRoutes);
app.use('/api/routes', authMiddleware, routeOptimizationRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// CSRF error handler
app.use(csrfErrorHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize services
initializeWebSocket(io);
// MQTT initialization - non-blocking, app continues even if MQTT fails
initializeMQTT(io).catch(err => {
  logger.warn("MQTT connection failed - continuing without MQTT:", err.message);
  logger.info("Application will continue running, but vehicle telemetry features may be limited");
  // Don't exit - allow app to run without MQTT for development
});
initializeStorage().catch(err => {
  console.error("Storage initialization failed:", err);
  process.exit(1);
});

export { app, server, io };