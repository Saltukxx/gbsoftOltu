import { Request, Response, NextFunction } from 'express';
import { logger } from '@/services/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
  details?: any;
  service?: string;
}

export class ValidationError extends Error {
  public statusCode = 400;
  public isOperational = true;
  public errors: any[];

  constructor(message: string, errors: any[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class ConflictError extends Error {
  public statusCode = 409;
  public isOperational = true;

  constructor(message: string = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ExternalServiceError extends Error {
  public statusCode = 503;
  public isOperational = true;
  public service: string;

  constructor(service: string, message: string = 'External service unavailable') {
    super(message);
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let isOperational = err.isOperational || false;
  let details = err.details || null;

  // Enhanced error context for logging
  const errorContext = {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      service: err.service
    },
    request: {
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
      body: process.env.NODE_ENV === 'development' ? req.body : undefined,
      params: req.params,
      query: req.query,
      headers: {
        'content-type': req.get('Content-Type'),
        'authorization': req.get('Authorization') ? '[REDACTED]' : undefined
      }
    },
    timestamp: new Date().toISOString()
  };

  // Prisma database errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    isOperational = true;
    switch (prismaErr.code) {
      case 'P2002':
        statusCode = 409;
        message = 'Data already exists (unique constraint violation)';
        details = { field: prismaErr.meta?.target };
        break;
      case 'P2025':
        statusCode = 404;
        message = 'Record not found';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Invalid reference (foreign key constraint violation)';
        break;
      case 'P2014':
        statusCode = 400;
        message = 'Invalid operation for this record';
        break;
      case 'P2021':
        statusCode = 500;
        message = 'Database schema error';
        isOperational = false;
        break;
      default:
        statusCode = 500;
        message = 'Database operation failed';
        isOperational = false;
    }
  }

  // Prisma connection errors
  if (err.name === 'PrismaClientInitializationError') {
    statusCode = 503;
    message = 'Database connection failed';
    isOperational = false;
  }

  // JWT authentication errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
    isOperational = true;
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired';
    isOperational = true;
  }

  if (err.name === 'NotBeforeError') {
    statusCode = 401;
    message = 'Authentication token not yet valid';
    isOperational = true;
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File size exceeds limit (10MB)';
    isOperational = true;
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    statusCode = 400;
    message = 'Too many files uploaded';
    isOperational = true;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Unexpected file field';
    isOperational = true;
  }

  // System errors
  if (err.code === 'ENOENT') {
    statusCode = 404;
    message = 'Resource not found';
    isOperational = true;
  }

  if (err.code === 'EACCES') {
    statusCode = 403;
    message = 'Access denied';
    isOperational = true;
  }

  if (err.code === 'EMFILE' || err.code === 'ENFILE') {
    statusCode = 503;
    message = 'Server temporarily unavailable (too many open files)';
    isOperational = false;
  }

  if (err.code === 'ETIMEDOUT') {
    statusCode = 408;
    message = 'Request timeout';
    isOperational = true;
  }

  if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'External service unavailable';
    isOperational = true;
  }

  // Custom application errors
  if (err instanceof ValidationError) {
    statusCode = 400;
    message = err.message;
    details = err.errors;
    isOperational = true;
  }

  if (err instanceof ConflictError) {
    statusCode = 409;
    message = err.message;
    isOperational = true;
  }

  if (err instanceof ExternalServiceError) {
    statusCode = 503;
    message = `${err.service} service unavailable: ${err.message}`;
    details = { service: err.service };
    isOperational = true;
  }

  // MQTT/WebSocket connection errors
  if (err.message?.includes('MQTT') || err.message?.includes('WebSocket')) {
    statusCode = 503;
    message = 'Real-time service temporarily unavailable';
    isOperational = true;
  }

  // AI Service specific errors
  if (err.message?.includes('AI Service') || err.service === 'ai-service') {
    statusCode = 503;
    message = 'AI optimization service temporarily unavailable';
    details = { service: 'ai-service', fallback: 'Using basic algorithms' };
    isOperational = true;
  }

  // Rate limiting errors
  if (err.message?.includes('Too many requests')) {
    statusCode = 429;
    message = 'Rate limit exceeded';
    details = { retryAfter: 60 };
    isOperational = true;
  }

  // Business logic errors
  if (err.message?.includes('shift conflict')) {
    statusCode = 409;
    message = 'Shift scheduling conflict detected';
    isOperational = true;
  }

  if (err.message?.includes('vehicle unavailable')) {
    statusCode = 409;
    message = 'Vehicle is not available for the specified time';
    isOperational = true;
  }

  // Log errors with appropriate level
  if (statusCode >= 500 || !isOperational) {
    logger.error('Critical error occurred:', errorContext);
  } else if (statusCode >= 400) {
    logger.warn('Client error occurred:', errorContext);
  } else {
    logger.info('Handled error:', errorContext);
  }

  // Enhanced production error sanitization to prevent information leakage
  if (process.env.NODE_ENV === 'production') {
    // Sanitize error messages to prevent information disclosure
    message = sanitizeErrorMessage(message, statusCode, isOperational);
    
    // Remove sensitive details in production
    if (statusCode >= 500 || !isOperational) {
      details = null;
    }
    
    // Sanitize remaining details
    if (details) {
      details = sanitizeErrorDetails(details);
    }
  }

  // Build error response
  const errorResponse: any = {
    success: false,
    error: message,
    statusCode,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || generateRequestId()
  };

  // Add details if available
  if (details) {
    errorResponse.details = details;
  }

  // Add development-specific information
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.debug = {
      originalError: err.name,
      code: err.code,
      service: err.service
    };
  }

  // Add retry information for certain errors
  if (statusCode === 429 && details?.retryAfter) {
    res.setHeader('Retry-After', details.retryAfter);
    errorResponse.retryAfter = details.retryAfter;
  }

  if (statusCode === 503) {
    res.setHeader('Retry-After', 30);
    errorResponse.retryAfter = 30;
  }

  res.status(statusCode).json(errorResponse);
};

// Generate unique request ID
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const createAppError = (message: string, statusCode: number = 500): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Sanitize error messages for production to prevent information leakage
 */
const sanitizeErrorMessage = (message: string, statusCode: number, isOperational: boolean): string => {
  // List of sensitive patterns that should be sanitized
  const sensitivePatterns = [
    /password/gi,
    /token/gi,
    /secret/gi,
    /key/gi,
    /credential/gi,
    /authorization/gi,
    /session/gi,
    /cookie/gi,
    /database.*error/gi,
    /sql.*error/gi,
    /connection.*string/gi,
    /env.*variable/gi,
    /file.*path/gi,
    /directory.*not.*found/gi,
    /permission.*denied/gi,
    /access.*denied/gi,
    /stack.*trace/gi,
    /prisma.*client/gi,
    /mongoose.*error/gi,
    /redis.*connection/gi,
    /mongodb.*connection/gi,
    /postgres.*connection/gi,
    /mysql.*connection/gi,
  ];

  // Generic error messages for different status codes
  const genericMessages = {
    400: 'Bad Request - The request could not be processed',
    401: 'Authentication required',
    403: 'Access denied - Insufficient permissions',
    404: 'Resource not found',
    409: 'Conflict - The request conflicts with current state',
    413: 'Request payload too large',
    429: 'Rate limit exceeded - Please try again later',
    500: 'Internal Server Error',
    502: 'Bad Gateway - Service temporarily unavailable',
    503: 'Service Temporarily Unavailable',
    504: 'Gateway Timeout',
  };

  // If error contains sensitive information, use generic message
  for (const pattern of sensitivePatterns) {
    if (pattern.test(message)) {
      return genericMessages[statusCode] || 'An error occurred while processing your request';
    }
  }

  // For non-operational errors (system errors), always use generic messages
  if (!isOperational && statusCode >= 500) {
    return 'Internal Server Error';
  }

  // Sanitize specific common error messages
  const sanitizedMessage = message
    .replace(/Path `.*?` \((.*?)\) is required/g, 'Required field is missing')
    .replace(/Cast to ObjectId failed for value .* at path ".*?"/g, 'Invalid ID format')
    .replace(/E11000 duplicate key error.*?dup key: { .*?: "(.*?)" }/g, 'Duplicate value detected')
    .replace(/ValidationError: .*?: (.*?)$/g, 'Validation failed')
    .replace(/Cannot read prop.*? of (null|undefined)/g, 'Required data is missing')
    .replace(/Cannot access before initialization/g, 'Service initialization error')
    .replace(/Maximum call stack size exceeded/g, 'Request too complex')
    .replace(/Out of memory/g, 'Service temporarily unavailable')
    .replace(/ENOENT: no such file or directory/g, 'Resource not found')
    .replace(/EACCES: permission denied/g, 'Access denied')
    .replace(/ETIMEDOUT/g, 'Request timeout')
    .replace(/ECONNREFUSED/g, 'Service unavailable')
    .replace(/getaddrinfo ENOTFOUND/g, 'Service unavailable')
    .replace(/connect ECONNREFUSED .*?:\d+/g, 'External service unavailable')
    .replace(/Invalid input: (.*)$/g, 'Invalid input provided')
    .replace(/SyntaxError: (.*)$/g, 'Invalid request format')
    .replace(/ReferenceError: (.*)$/g, 'Internal processing error')
    .replace(/TypeError: (.*)$/g, 'Data format error');

  return sanitizedMessage;
};

/**
 * Sanitize error details object for production
 */
const sanitizeErrorDetails = (details: any): any => {
  if (!details || typeof details !== 'object') {
    return details;
  }

  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'credential', 'auth',
    'session', 'cookie', 'connectionString', 'url', 'path',
    'env', 'config', 'stack', 'trace', 'file', 'directory'
  ];

  const sanitized: any = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    
    // Skip sensitive keys entirely
    if (sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey))) {
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeErrorDetails(value);
    } 
    // Sanitize string values
    else if (typeof value === 'string') {
      // Remove potential file paths, URLs, or other sensitive info
      sanitized[key] = value
        .replace(/\/[^\s]+/g, '[PATH_REDACTED]')
        .replace(/https?:\/\/[^\s]+/g, '[URL_REDACTED]')
        .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[EMAIL_REDACTED]')
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_REDACTED]')
        .replace(/[a-zA-Z0-9]{20,}/g, '[TOKEN_REDACTED]');
    }
    // Keep safe primitive values
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value;
    }
    // Sanitize arrays
    else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' ? sanitizeErrorDetails(item) : item
      );
    }
  }

  return sanitized;
};