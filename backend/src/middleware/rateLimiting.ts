import rateLimit from 'express-rate-limit';
import { logger } from '@/services/logger';

/**
 * Rate limiter for authentication endpoints
 * Prevents brute force attacks on login/refresh endpoints
 * Addresses Critical Issue #1 from lastcheck.md
 * 
 * More lenient in development mode to allow testing
 */
const isDevelopment = process.env.NODE_ENV !== 'production';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 20 : 5, // 20 attempts in dev, 5 in production
  message: {
    success: false,
    error: 'Too many login attempts, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
      environment: process.env.NODE_ENV
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many login attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes'
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
  // Note: Uses default memory store which resets on server restart
  // In production with multiple servers, consider using Redis store
});

/**
 * General API rate limiter
 * Prevents API abuse and DoS attacks
 * Applied to all /api endpoints
 */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP (for 30 users, ~3 req/sec per user)
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    code: 'API_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('API rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
      code: 'API_RATE_LIMIT_EXCEEDED'
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks and metrics
    return req.path === '/health' || req.path === '/metrics';
  }
});

/**
 * Stricter rate limiter for password reset endpoints (when implemented)
 * Lower limit to prevent abuse of password reset functionality
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: {
    success: false,
    error: 'Too many password reset attempts, please try again later',
    code: 'RESET_RATE_LIMIT_EXCEEDED',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Password reset rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many password reset attempts, please try again later',
      code: 'RESET_RATE_LIMIT_EXCEEDED',
      retryAfter: '1 hour'
    });
  }
});

/**
 * Rate limiter for file uploads (voice messages)
 * Prevents storage exhaustion attacks
 */
export const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 uploads per 5 minutes per user (4 per minute)
  message: {
    success: false,
    error: 'Too many file uploads, please try again later',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      userId: (req as any).user?.id,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many file uploads, please try again later',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
    });
  }
});

/**
 * Rate limiter for AI service calls (shift generation, predictions)
 * Prevents expensive AI operations from overwhelming the service
 */
export const aiServiceLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 AI operations per 5 minutes per user
  message: {
    success: false,
    error: 'Too many AI service requests, please try again later',
    code: 'AI_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('AI service rate limit exceeded', {
      ip: req.ip,
      userId: (req as any).user?.id,
      endpoint: req.path,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many AI service requests, please try again later',
      code: 'AI_RATE_LIMIT_EXCEEDED'
    });
  }
});

export default {
  authLimiter,
  apiLimiter,
  passwordResetLimiter,
  uploadLimiter,
  aiServiceLimiter
};

