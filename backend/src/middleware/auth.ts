import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { logger } from '@/services/logger';
import { securityAudit, SecurityEventType, SecurityEventSeverity } from '@/services/securityAudit';
import Redis from 'ioredis';
import crypto from 'crypto';
import prisma from '@/db';

// Create Redis client with error handling
const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  retryStrategy: (times) => {
    // Retry with exponential backoff, max 3 times
    if (times > 3) {
      logger.warn('Redis connection failed after 3 retries - continuing without Redis');
      return null; // Stop retrying
    }
    return Math.min(times * 200, 2000);
  },
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false, // Don't queue commands when offline
});

// Handle Redis connection errors gracefully
redis.on('error', (error) => {
  logger.warn('Redis connection error (non-critical - login will still work):', { 
    error: error.message 
  });
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

// Token interface
interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  tokenVersion: number;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

interface RefreshTokenData {
  userId: string;
  sessionId: string;
  tokenVersion: number;
  createdAt: Date;
  lastUsed: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    firstName: string;
    lastName: string;
  };
}

// Enhanced auth middleware with token validation and revoke list checking
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      await securityAudit.logSecurityEvent({
        type: SecurityEventType.UNAUTHORIZED_API_ACCESS,
        severity: SecurityEventSeverity.MEDIUM,
        details: {
          reason: 'Missing authorization token',
          endpoint: req.originalUrl
        }
      }, req);
      
      return res.status(401).json({ 
        success: false,
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    // Check if token is revoked
    const isRevoked = await isTokenRevoked(token);
    if (isRevoked) {
      await securityAudit.logSecurityEvent({
        type: SecurityEventType.UNAUTHORIZED_API_ACCESS,
        severity: SecurityEventSeverity.HIGH,
        details: {
          reason: 'Attempted use of revoked token',
          tokenPrefix: token.substring(0, 10) + '...',
          endpoint: req.originalUrl
        }
      }, req);
      
      return res.status(401).json({ 
        success: false,
        error: 'Token has been revoked',
        code: 'TOKEN_REVOKED'
      });
    }

    let decoded: TokenPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false,
          error: 'Access token expired',
          code: 'TOKEN_EXPIRED',
          expiredAt: jwtError.expiredAt
        });
      }
      throw jwtError;
    }

    // Validate token type
    if (decoded.type !== 'access') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // Get user and validate
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive) {
      logger.warn('Token for inactive or non-existent user', { 
        userId: decoded.userId,
        ip: req.ip 
      });
      return res.status(401).json({ 
        success: false,
        error: 'User not found or inactive',
        code: 'USER_INACTIVE'
      });
    }

    // Check token version for forced logout scenarios
    if (user.tokenVersion !== decoded.tokenVersion) {
      logger.info('Token version mismatch - forced logout', {
        userId: user.id,
        currentVersion: user.tokenVersion,
        tokenVersion: decoded.tokenVersion
      });
      return res.status(401).json({ 
        success: false,
        error: 'Token version invalid',
        code: 'TOKEN_VERSION_MISMATCH'
      });
    }

    // Check session validity
    const isSessionValid = await validateSession(decoded.sessionId, decoded.userId);
    if (!isSessionValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Session invalid or expired',
        code: 'SESSION_INVALID'
      });
    }

    // Update session last activity
    await updateSessionActivity(decoded.sessionId, req.ip, req.get('User-Agent'));

    // Add user to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    // Check for token rotation (optional - rotate tokens that are close to expiry)
    const timeToExpiry = decoded.exp - Math.floor(Date.now() / 1000);
    if (timeToExpiry < 300) { // 5 minutes before expiry
      const newTokens = await generateTokenPair(user, decoded.sessionId);
      res.setHeader('X-New-Access-Token', newTokens.accessToken);
      res.setHeader('X-New-Refresh-Token', newTokens.refreshToken);
    }

    next();
  } catch (error: any) {
    logger.error('Auth middleware error:', { 
      error: error.message, 
      stack: error.stack, 
      ip: req.ip,
      url: req.originalUrl 
    });
    return res.status(401).json({ 
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Generate token pair (access + refresh)
export const generateTokenPair = async (
  user: { id: string; email: string; role: UserRole; tokenVersion?: number },
  sessionId?: string
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> => {
  const currentSessionId = sessionId || crypto.randomUUID();
  const tokenVersion = user.tokenVersion || 1;

  const accessTokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId: currentSessionId,
    tokenVersion,
    type: 'access',
  };

  const refreshTokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId: currentSessionId,
    tokenVersion,
    type: 'refresh',
  };

  const accessToken = jwt.sign(accessTokenPayload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  });

  const refreshToken = jwt.sign(refreshTokenPayload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  // Store refresh token in Redis
  const refreshTokenData: RefreshTokenData = {
    userId: user.id,
    sessionId: currentSessionId,
    tokenVersion,
    createdAt: new Date(),
    lastUsed: new Date(),
  };

  try {
    await redis.setex(
      `refresh_token:${currentSessionId}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify(refreshTokenData)
    );
  } catch (error) {
    // Log Redis error but don't fail login - tokens will still work
    logger.warn('Failed to store refresh token in Redis', { 
      error: error instanceof Error ? error.message : String(error),
      sessionId: currentSessionId,
      userId: user.id 
    });
    // Continue - JWT tokens don't require Redis to work
  }

  logger.info('Token pair generated', {
    userId: user.id,
    sessionId: currentSessionId,
    tokenVersion
  });

  return { accessToken, refreshToken, sessionId: currentSessionId };
};

// Refresh access token
export const refreshAccessToken = async (refreshToken: string, ipAddress?: string, userAgent?: string) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as TokenPayload;

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type for refresh');
    }

    // Get refresh token data from Redis
    const storedTokenData = await redis.get(`refresh_token:${decoded.sessionId}`);
    if (!storedTokenData) {
      throw new Error('Refresh token not found or expired');
    }

    const tokenData: RefreshTokenData = JSON.parse(storedTokenData);

    // Validate token version and user
    if (tokenData.tokenVersion !== decoded.tokenVersion || tokenData.userId !== decoded.userId) {
      throw new Error('Token validation failed');
    }

    // Get fresh user data
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      throw new Error('Token version mismatch');
    }

    // Generate new token pair
    const newTokens = await generateTokenPair(user, decoded.sessionId);

    // Update session activity
    await updateSessionActivity(decoded.sessionId, ipAddress, userAgent);

    logger.info('Access token refreshed', {
      userId: user.id,
      sessionId: decoded.sessionId,
      ipAddress
    });

    return newTokens;
  } catch (error: any) {
    logger.warn('Token refresh failed', { error: error.message });
    throw error;
  }
};

// Revoke token/session
export const revokeToken = async (token: string, sessionId?: string) => {
  try {
    // Add token to revoke list
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await redis.setex(`revoked_token:${tokenHash}`, 86400, 'revoked'); // 24 hours

    // If sessionId provided, revoke all tokens for that session
    if (sessionId) {
      await redis.del(`refresh_token:${sessionId}`);
      await redis.setex(`revoked_session:${sessionId}`, 86400, 'revoked');
    }

    logger.info('Token revoked', { sessionId, tokenHash: tokenHash.substring(0, 16) });
  } catch (error) {
    logger.error('Failed to revoke token', { error, sessionId });
    throw error;
  }
};

// Check if token is revoked
const isTokenRevoked = async (token: string): Promise<boolean> => {
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const isRevoked = await redis.get(`revoked_token:${tokenHash}`);
    return !!isRevoked;
  } catch (error) {
    logger.error('Failed to check token revocation status', { error });
    return false; // Fail open for Redis errors
  }
};

// Validate session
const validateSession = async (sessionId: string, userId: string): Promise<boolean> => {
  try {
    // Check if session is revoked
    const isSessionRevoked = await redis.get(`revoked_session:${sessionId}`);
    if (isSessionRevoked) {
      return false;
    }

    // Check if refresh token exists
    const refreshTokenData = await redis.get(`refresh_token:${sessionId}`);
    if (!refreshTokenData) {
      return false;
    }

    const tokenData: RefreshTokenData = JSON.parse(refreshTokenData);
    return tokenData.userId === userId;
  } catch (error) {
    logger.error('Failed to validate session', { error, sessionId });
    return false;
  }
};

// Update session activity
const updateSessionActivity = async (sessionId: string, ipAddress?: string, userAgent?: string) => {
  try {
    const refreshTokenData = await redis.get(`refresh_token:${sessionId}`);
    if (refreshTokenData) {
      const tokenData: RefreshTokenData = JSON.parse(refreshTokenData);
      tokenData.lastUsed = new Date();
      if (ipAddress) tokenData.ipAddress = ipAddress;
      if (userAgent) tokenData.userAgent = userAgent;

      await redis.setex(
        `refresh_token:${sessionId}`,
        7 * 24 * 60 * 60, // 7 days
        JSON.stringify(tokenData)
      );
    }
  } catch (error) {
    logger.warn('Failed to update session activity', { error, sessionId });
  }
};

// Revoke all sessions for user (force logout)
export const revokeAllUserSessions = async (userId: string) => {
  try {
    // Increment user's token version to invalidate all existing tokens
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } }
    });

    // Could also scan Redis for user's sessions and revoke them individually
    // This is a more efficient approach for forcing logout
    
    logger.info('All user sessions revoked', { userId });
  } catch (error) {
    logger.error('Failed to revoke all user sessions', { error, userId });
    throw error;
  }
};

// Clean up expired tokens (should be run as a cron job)
export const cleanupExpiredTokens = async () => {
  // This would typically be implemented as a separate background job
  // For now, just log the intention
  logger.info('Token cleanup job would run here');
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      await securityAudit.logAuthorizationFailure(
        req.user.id,
        req.user.role,
        req.path,
        req.method,
        req
      );
      
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

// Role-based access control helpers
export const requirePresident = requireRole([UserRole.PRESIDENT]);
export const requireAdmin = requireRole([UserRole.PRESIDENT, UserRole.ADMIN]);
export const requireSupervisorOrAbove = requireRole([UserRole.PRESIDENT, UserRole.ADMIN, UserRole.SUPERVISOR]);
export const requireOperatorOrAbove = requireRole([UserRole.PRESIDENT, UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR]);
export const requireMessengerOrAbove = requireRole([UserRole.PRESIDENT, UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.MESSENGER]);
export const requireWarehouseAccess = requireRole([UserRole.DEPO_KULLANICISI, UserRole.ADMIN, UserRole.PRESIDENT]);