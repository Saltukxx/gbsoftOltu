import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from '@/services/logger';

/**
 * Input sanitization middleware
 * Prevents XSS attacks by sanitizing user input
 * Addresses Critical Issue #3 from lastcheck.md
 */

interface SanitizationOptions {
  allowedTags?: string[];
  allowedAttributes?: { [key: string]: string[] };
  stripTags?: boolean;
}

/**
 * Default sanitization configuration
 * Very restrictive - strips all HTML tags
 */
const DEFAULT_CONFIG: SanitizationOptions = {
  stripTags: true,
  allowedTags: [], // No HTML tags allowed by default
  allowedAttributes: {}
};

/**
 * Configuration for message content
 * Allows basic formatting but nothing dangerous
 */
const MESSAGE_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'],
  ALLOWED_ATTR: {}
};

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any, config: SanitizationOptions = DEFAULT_CONFIG): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj, config);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, config));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Sanitize the value
        sanitized[key] = sanitizeObject(obj[key], config);
      }
    }
    return sanitized;
  }

  // Return primitives as-is (numbers, booleans, etc.)
  return obj;
}

/**
 * Sanitize a string value
 */
function sanitizeString(value: string, config: SanitizationOptions = DEFAULT_CONFIG): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // Use DOMPurify to sanitize
  const purifyConfig = config.stripTags 
    ? { ALLOWED_TAGS: config.allowedTags || [] }
    : { ALLOWED_TAGS: config.allowedTags, ALLOWED_ATTR: config.allowedAttributes };

  const sanitized = DOMPurify.sanitize(value, purifyConfig);

  // Log if content was modified (potential XSS attempt)
  if (sanitized !== value) {
    logger.warn('Input sanitization modified content', {
      original: value.substring(0, 100),
      sanitized: sanitized.substring(0, 100),
      removed: value.length - sanitized.length
    });
  }

  return sanitized;
}

/**
 * General input sanitization middleware
 * Sanitizes all string fields in request body
 * Strips all HTML tags by default
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body, DEFAULT_CONFIG);
    }

    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query, DEFAULT_CONFIG);
    }

    next();
  } catch (error) {
    logger.error('Error during input sanitization', { error });
    next(error);
  }
};

/**
 * Sanitization middleware for message content
 * Allows basic formatting tags but removes dangerous content
 */
export const sanitizeMessageInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.body) {
      // Sanitize content field with message-specific config
      if (req.body.content) {
        req.body.content = DOMPurify.sanitize(req.body.content, {
          ALLOWED_TAGS: MESSAGE_CONFIG.ALLOWED_TAGS,
          ALLOWED_ATTR: MESSAGE_CONFIG.ALLOWED_ATTR
        });
      }

      // Sanitize notes field (if present)
      if (req.body.notes) {
        req.body.notes = DOMPurify.sanitize(req.body.notes, {
          ALLOWED_TAGS: MESSAGE_CONFIG.ALLOWED_TAGS,
          ALLOWED_ATTR: MESSAGE_CONFIG.ALLOWED_ATTR
        });
      }

      // Strip all HTML from other fields
      const fieldsToStrip = ['subject', 'title', 'name', 'description'];
      fieldsToStrip.forEach(field => {
        if (req.body[field]) {
          req.body[field] = sanitizeString(req.body[field], { stripTags: true });
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Error during message sanitization', { error });
    next(error);
  }
};

/**
 * Sanitization middleware for shift/employee data
 * Very strict - no HTML allowed
 */
export const sanitizeShiftInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.body && typeof req.body === 'object') {
      // Strip all HTML tags from all string fields
      req.body = sanitizeObject(req.body, {
        stripTags: true,
        allowedTags: [],
        allowedAttributes: {}
      });
    }

    next();
  } catch (error) {
    logger.error('Error during shift data sanitization', { error });
    next(error);
  }
};

/**
 * SQL injection prevention (additional layer)
 * Note: Prisma already prevents SQL injection, but this adds extra validation
 */
export const validateSqlInjection = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi,
    /(--|;|\/\*|\*\/|xp_|sp_)/gi,
    /('|"|`)/gi
  ];

  const checkForSqlInjection = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(v => checkForSqlInjection(v));
    }
    return false;
  };

  try {
    // Check query parameters
    if (req.query && checkForSqlInjection(req.query)) {
      logger.warn('Potential SQL injection attempt detected in query', {
        ip: req.ip,
        query: req.query,
        path: req.path
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        code: 'INVALID_INPUT'
      });
    }

    // Check body
    if (req.body && checkForSqlInjection(req.body)) {
      logger.warn('Potential SQL injection attempt detected in body', {
        ip: req.ip,
        path: req.path,
        userId: (req as any).user?.id
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        code: 'INVALID_INPUT'
      });
    }

    next();
  } catch (error) {
    logger.error('Error during SQL injection validation', { error });
    next(error);
  }
};

export default {
  sanitizeInput,
  sanitizeMessageInput,
  sanitizeShiftInput,
  validateSqlInjection
};

