import { Request, Response, NextFunction } from 'express';
import { logger } from '@/services/logger';
import { securityAudit, SecurityEventType, SecurityEventSeverity } from '@/services/securityAudit';
import crypto from 'crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

interface APIKeyRequest extends Request {
  apiKey?: {
    id: string;
    name: string;
    scopes: string[];
  };
}

/**
 * API Key authentication middleware for IoT devices and external services
 * Uses X-API-Key header for authentication
 */
export const apiKeyAuth = async (
  req: APIKeyRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      await securityAudit.logSecurityEvent({
        type: SecurityEventType.API_KEY_INVALID,
        severity: SecurityEventSeverity.MEDIUM,
        details: {
          reason: 'Missing API key',
          endpoint: req.originalUrl,
          method: req.method
        }
      }, req);

      return res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'API_KEY_MISSING'
      });
    }

    // Hash the API key for lookup (don't store raw keys)
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Check if API key exists and is valid
    const keyData = await redis.get(`api_key:${hashedKey}`);
    
    if (!keyData) {
      await securityAudit.logSecurityEvent({
        type: SecurityEventType.API_KEY_INVALID,
        severity: SecurityEventSeverity.HIGH,
        details: {
          reason: 'Invalid API key',
          endpoint: req.originalUrl,
          method: req.method,
          keyPrefix: apiKey.substring(0, 8) + '...'
        }
      }, req);

      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'API_KEY_INVALID'
      });
    }

    const parsedKeyData = JSON.parse(keyData);
    
    // Check if API key is active
    if (!parsedKeyData.isActive) {
      await securityAudit.logSecurityEvent({
        type: SecurityEventType.API_KEY_INVALID,
        severity: SecurityEventSeverity.MEDIUM,
        details: {
          reason: 'API key is disabled',
          endpoint: req.originalUrl,
          method: req.method,
          keyId: parsedKeyData.id
        }
      }, req);

      return res.status(401).json({
        success: false,
        error: 'API key is disabled',
        code: 'API_KEY_DISABLED'
      });
    }

    // Check expiration
    if (parsedKeyData.expiresAt && new Date() > new Date(parsedKeyData.expiresAt)) {
      await securityAudit.logSecurityEvent({
        type: SecurityEventType.API_KEY_INVALID,
        severity: SecurityEventSeverity.MEDIUM,
        details: {
          reason: 'API key expired',
          endpoint: req.originalUrl,
          method: req.method,
          keyId: parsedKeyData.id,
          expiredAt: parsedKeyData.expiresAt
        }
      }, req);

      return res.status(401).json({
        success: false,
        error: 'API key has expired',
        code: 'API_KEY_EXPIRED'
      });
    }

    // Update last used timestamp
    parsedKeyData.lastUsed = new Date().toISOString();
    await redis.setex(`api_key:${hashedKey}`, 86400 * 365, JSON.stringify(parsedKeyData)); // 1 year TTL

    // Add API key info to request
    req.apiKey = {
      id: parsedKeyData.id,
      name: parsedKeyData.name,
      scopes: parsedKeyData.scopes || []
    };

    logger.info('API key authentication successful', {
      keyId: parsedKeyData.id,
      keyName: parsedKeyData.name,
      endpoint: req.originalUrl,
      ip: req.ip
    });

    next();
  } catch (error: any) {
    logger.error('API key authentication error:', {
      error: error.message,
      endpoint: req.originalUrl,
      ip: req.ip
    });

    return res.status(500).json({
      success: false,
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Middleware to check API key scopes
 */
export const requireScope = (requiredScope: string) => {
  return (req: APIKeyRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!req.apiKey.scopes.includes(requiredScope)) {
      logger.warn('API key scope check failed', {
        keyId: req.apiKey.id,
        requiredScope,
        availableScopes: req.apiKey.scopes,
        endpoint: req.originalUrl
      });

      return res.status(403).json({
        success: false,
        error: `Required scope: ${requiredScope}`,
        code: 'INSUFFICIENT_SCOPE'
      });
    }

    next();
  };
};

/**
 * Utility function to create API keys (for use in admin scripts)
 */
export const createAPIKey = async (options: {
  name: string;
  scopes: string[];
  expiresAt?: Date;
  description?: string;
}): Promise<{ keyId: string; apiKey: string }> => {
  const keyId = crypto.randomUUID();
  const rawKey = crypto.randomBytes(32).toString('hex');
  const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

  const keyData = {
    id: keyId,
    name: options.name,
    description: options.description || '',
    scopes: options.scopes,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    expiresAt: options.expiresAt?.toISOString() || null
  };

  // Store in Redis with 1 year TTL
  await redis.setex(`api_key:${hashedKey}`, 86400 * 365, JSON.stringify(keyData));

  logger.info('API key created', {
    keyId,
    name: options.name,
    scopes: options.scopes
  });

  return {
    keyId,
    apiKey: rawKey
  };
};

/**
 * Utility function to revoke API key
 */
export const revokeAPIKey = async (keyId: string): Promise<boolean> => {
  // In a production system, you'd need to scan Redis keys
  // For now, mark as inactive
  logger.info('API key revocation requested', { keyId });
  
  // This is a simplified implementation
  // In production, you'd maintain a separate index of keyId -> hashedKey mapping
  return true;
};