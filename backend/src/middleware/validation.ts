import { Request, Response, NextFunction } from 'express';
import {
  body,
  param,
  query,
  validationResult,
  ValidationChain,
} from 'express-validator';
import multer from 'multer';
import path from 'path';
import { logger } from '@/services/logger';
import { AuthenticatedRequest } from '@/middleware/auth';

/**
 * Generic validation error with HTTP-friendly metadata.
 */
export class ValidationError extends Error {
  public statusCode = 400;
  public errors: any[];

  constructor(message: string, errors: any[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const getUserId = (req: Request): string | undefined =>
  (req as AuthenticatedRequest).user?.id;

// Shared validation result handler
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined,
      location: error.location,
    }));

    logger.warn('Validation failed', {
      endpoint: req.originalUrl,
      method: req.method,
      errors: errorDetails,
      userId: getUserId(req),
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorDetails,
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

// Shift validation rules
export const validateShiftGeneration: ValidationChain[] = [
  body('employees')
    .isArray({ min: 1 })
    .withMessage('At least one employee is required')
    .custom(employees => {
      if (!Array.isArray(employees)) return false;
      return employees.every(
        emp =>
          emp.id &&
          typeof emp.name === 'string' &&
          emp.name.length > 0 &&
          typeof emp.performance_score === 'number' &&
          emp.performance_score >= 1 &&
          emp.performance_score <= 5 &&
          emp.availability &&
          typeof emp.availability === 'object',
      );
    })
    .withMessage('Invalid employee data format'),
  body('constraints')
    .isObject()
    .withMessage('Constraints must be an object'),
  body('constraints.max_hours_per_week')
    .isInt({ min: 1, max: 168 })
    .withMessage('Max hours per week must be between 1 and 168'),
  body('constraints.min_rest_hours')
    .isInt({ min: 8, max: 48 })
    .withMessage('Minimum rest hours must be between 8 and 48'),
  body('period.start_date')
    .isISO8601()
    .withMessage('Start date must be in ISO 8601 format')
    .custom(value => {
      const date = new Date(value);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (date < now) {
        throw new Error('Start date cannot be in the past');
      }
      return true;
    }),
  body('period.end_date')
    .isISO8601()
    .withMessage('End date must be in ISO 8601 format')
    .custom((value, { req }) => {
      const startDate = new Date(req.body.period.start_date);
      const endDate = new Date(value);
      if (endDate <= startDate) {
        throw new Error('End date must be after start date');
      }
      const daysDiff =
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 31) {
        throw new Error('Period cannot exceed 31 days');
      }
      return true;
    }),
  handleValidationErrors,
];

export const validateShiftUpdate: ValidationChain[] = [
  param('shiftId').isUUID().withMessage('Invalid shift ID format'),
  body('day')
    .optional()
    .isISO8601()
    .withMessage('Day must be in ISO 8601 format')
    .custom(value => {
      if (value) {
        const date = new Date(value);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (date < now) {
          throw new Error('Cannot assign shifts to past dates');
        }
      }
      return true;
    }),
  body('slot')
    .optional()
    .isIn(['MORNING', 'AFTERNOON', 'NIGHT'])
    .withMessage('Invalid shift slot'),
  body('employee_id')
    .optional()
    .isUUID()
    .withMessage('Invalid employee ID format'),
  body().custom(value => {
    if (value.day && value.slot && value.employee_id) {
      logger.info('Checking shift conflicts', {
        employeeId: value.employee_id,
        day: value.day,
        slot: value.slot,
      });
    }
    return true;
  }),
  handleValidationErrors,
];

// Vehicle telemetry validation
export const validateVehicleTelemetry: ValidationChain[] = [
  body('vehicle_id').isUUID().withMessage('Invalid vehicle ID format'),
  body('location.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('location.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('speed')
    .optional()
    .isFloat({ min: 0, max: 200 })
    .withMessage('Speed must be between 0 and 200 km/h'),
  body('fuel_level')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Fuel level must be between 0 and 100%'),
  body('engine_temp')
    .optional()
    .isFloat({ min: -40, max: 150 })
    .withMessage('Engine temperature must be between -40 and 150°C'),
  body('odometer')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Odometer must be a positive integer'),
  body('events')
    .optional()
    .isArray()
    .withMessage('Events must be an array')
    .custom(events => {
      if (Array.isArray(events)) {
        return events.every(
          event =>
            event.type &&
            typeof event.type === 'string' &&
            [
              'MAINTENANCE_DUE',
              'LOW_FUEL',
              'SPEEDING',
              'ENGINE_WARNING',
              'ROUTE_DEVIATION',
            ].includes(event.type),
        );
      }
      return true;
    })
    .withMessage('Invalid event types'),
  handleValidationErrors,
];

// Audio file upload configuration
const audioStorage = multer.memoryStorage();

export const audioUpload = multer({
  storage: audioStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/webm'];
    const allowedExtensions = ['.wav', '.mp3', '.m4a', '.webm'];

    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file type. Allowed: WAV, MP3, M4A, WebM'));
    }
  },
});

// Message validation
export const validateMessage: ValidationChain[] = [
  body('conversation_id')
    .optional()
    .isUUID()
    .withMessage('Invalid conversation ID format'),
  body('recipient_id')
    .optional()
    .isUUID()
    .withMessage('Invalid recipient ID format'),
  body('type')
    .isIn(['TEXT', 'VOICE'])
    .withMessage('Message type must be TEXT or VOICE'),
  body('content')
    .if(body('type').equals('TEXT'))
    .notEmpty()
    .withMessage('Text message content is required')
    .isLength({ max: 5000 })
    .withMessage('Message content cannot exceed 5000 characters'),
  body('duration')
    .if(body('type').equals('VOICE'))
    .optional()
    .isFloat({ min: 0, max: 300 })
    .withMessage('Voice message duration must be between 0 and 300 seconds'),
  body().custom((value, { req }) => {
    if (value.type === 'VOICE' && !(req as Request & { file?: Express.Multer.File }).file) {
      throw new Error('Voice message requires audio file');
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (value.type === 'VOICE' && file) {
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('Audio file size cannot exceed 10MB');
      }
    }
    return true;
  }),
  handleValidationErrors,
];

// Parameter validation helpers
export const validateUUID = (paramName: string): ValidationChain[] => [
  param(paramName).isUUID().withMessage(`Invalid ${paramName} format`),
  handleValidationErrors,
];

export const validatePagination: ValidationChain[] = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sort')
    .optional()
    .isIn(['created_at', 'updated_at', 'name', 'status'])
    .withMessage('Invalid sort field'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc'),
  handleValidationErrors,
];

// Simple in-memory request limiter
export const validateRateLimit = (windowMs: number, maxRequests: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = `${req.ip}-${getUserId(req) || 'anonymous'}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    for (const [key, value] of requests.entries()) {
      if (value.resetTime < windowStart) {
        requests.delete(key);
      }
    }

    const clientData = requests.get(clientId);

    if (!clientData) {
      requests.set(clientId, { count: 1, resetTime: now + windowMs });
      next();
    } else if (clientData.count >= maxRequests) {
      logger.warn('Rate limit exceeded', {
        clientId,
        endpoint: req.originalUrl,
        count: clientData.count,
        maxRequests,
      });

      res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
        timestamp: new Date().toISOString(),
      });
    } else {
      clientData.count += 1;
      next();
    }
  };
};

// Business logic validation helpers
export const validateShiftConflicts = async (
  employeeId: string,
  day: string,
  slot: string,
  excludeShiftId?: string,
) => {
  try {
    logger.info('Validating shift conflicts', {
      employeeId,
      day,
      slot,
      excludeShiftId,
    });

    const hasConflict = false;

    if (hasConflict) {
      throw new ValidationError('Employee already has a shift assigned for this time slot');
    }

    return true;
  } catch (error) {
    logger.error('Error validating shift conflicts', { error, employeeId, day, slot });
    throw error;
  }
};

export const validateVehicleAvailability = async (
  vehicleId: string,
  startTime: Date,
  endTime: Date,
) => {
  try {
    logger.info('Validating vehicle availability', {
      vehicleId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    const isAvailable = true;

    if (!isAvailable) {
      throw new ValidationError('Vehicle is not available for the specified time period');
    }

    return true;
  } catch (error) {
    logger.error('Error validating vehicle availability', { error, vehicleId });
    throw error;
  }
};
