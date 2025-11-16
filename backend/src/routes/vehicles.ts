import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { TelemetryEventType, VehicleType, FuelType } from '@prisma/client';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { requireOperatorOrAbove, requirePresident, AuthenticatedRequest } from '@/middleware/auth';
import { apiKeyAuth, requireScope } from '@/middleware/apiKeyAuth';
import { sanitizeInput } from '@/middleware/sanitization';
import { securityAudit, SecurityEventType, SecurityEventSeverity } from '@/services/securityAudit';
import { logger } from '@/services/logger';
import { aiClient } from '@/services/aiClient';
import { io } from '@/app';
import prisma from '@/db';

const router = express.Router();

// Get all vehicles with latest telemetry and pagination
router.get('/', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const where = { isActive: true };

  const [vehicles, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: {
        assignedOperator: {
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        locations: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
        telemetryEvents: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          where: {
            type: 'FUEL_LEVEL',
          },
        },
        _count: {
          select: {
            routes: true,
            fuelReports: true,
          },
        },
      },
      orderBy: { plateNumber: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.vehicle.count({ where }),
  ]);

  res.json({
    success: true,
    data: vehicles.map(vehicle => {
      const lastLocation = vehicle.locations[0] || null;
      const lastTelemetryEvent = vehicle.telemetryEvents[0] || null;

      // Extract fuel level from telemetry event data if available
      const lastTelemetry = lastTelemetryEvent ? {
        vehicleId: vehicle.id,
        fuelLevel: (lastTelemetryEvent.data as any)?.fuelLevel || null,
        timestamp: lastTelemetryEvent.timestamp,
      } : null;

      return {
        ...vehicle,
        lastLocation: lastLocation ? {
          id: lastLocation.id,
          vehicleId: lastLocation.vehicleId,
          latitude: lastLocation.latitude,
          longitude: lastLocation.longitude,
          speed: lastLocation.speed,
          heading: lastLocation.heading,
          altitude: lastLocation.altitude,
          recordedAt: lastLocation.recordedAt,
        } : null,
        lastTelemetry,
        // Keep currentLocation for backward compatibility
        currentLocation: lastLocation,
      };
    }),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
}));

// Get vehicle locations endpoint for recent vehicle locations
// NOTE: This must come before /:id route to avoid route conflicts
router.get('/locations', [
  query('hours').optional().isInt({ min: 1, max: 168 }), // max 1 week
  query('vehicleId').optional().isUUID(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { hours = 24, vehicleId } = req.query;
  
  const timeRangeHours = parseInt(hours as string);
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - timeRangeHours);

  const whereClause: any = {
    recordedAt: { gte: startTime },
    vehicle: { isActive: true },
  };

  if (vehicleId) {
    whereClause.vehicleId = vehicleId;
  }

  // Optimize query: only fetch essential fields and limit results per vehicle
  const locations = await prisma.vehicleLocation.findMany({
    where: whereClause,
    select: {
      id: true,
      vehicleId: true,
      latitude: true,
      longitude: true,
      speed: true,
      heading: true,
      altitude: true,
      recordedAt: true,
      vehicle: {
        select: {
          id: true,
          plateNumber: true,
          type: true,
        },
      },
    },
    orderBy: { recordedAt: 'desc' },
    take: 500, // Reduced limit for better performance
  });

  res.json({
    success: true,
    data: locations,
    period: {
      from: startTime.toISOString(),
      to: new Date().toISOString(),
      rangeHours: timeRangeHours,
    },
    count: locations.length,
  });
}));

// Get live vehicle data
router.get('/live', [
  query('vehicleId').optional().isUUID(),
  query('range').optional().matches(/^\d+[hd]$/), // e.g., "24h", "7d"
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { vehicleId, range } = req.query;

  let timeRangeHours = 24; // default 24 hours
  if (range) {
    const match = (range as string).match(/^(\d+)([hd])$/);
    if (match) {
      const [, value, unit] = match;
      timeRangeHours = unit === 'h' ? parseInt(value) : parseInt(value) * 24;
    }
  }

  const startTime = new Date();
  startTime.setHours(startTime.getHours() - timeRangeHours);

  const whereClause: any = {
    recordedAt: { gte: startTime },
  };

  if (vehicleId) {
    whereClause.vehicleId = vehicleId;
  }

  const locations = await prisma.vehicleLocation.findMany({
    where: whereClause,
    include: {
      vehicle: {
        select: {
          id: true,
          plateNumber: true,
          type: true,
          assignedOperator: {
            include: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      },
    },
    orderBy: { recordedAt: 'desc' },
  });

  const telemetryEvents = await prisma.telemetryEvent.findMany({
    where: {
      timestamp: { gte: startTime },
      ...(vehicleId && { vehicleId }),
    },
    orderBy: { timestamp: 'desc' },
    take: 100,
  });

  res.json({
    success: true,
    data: {
      locations,
      telemetryEvents,
    },
    period: {
      from: startTime.toISOString(),
      to: new Date().toISOString(),
      rangeHours: timeRangeHours,
    },
  });
}));

// Get single vehicle by ID
// NOTE: Must come after /locations and /live routes to avoid route conflicts
router.get('/:id', [
  param('id').isUUID(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  const vehicle = await prisma.vehicle.findUnique({
    where: { id, isActive: true },
    include: {
      assignedOperator: {
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      },
      locations: {
        orderBy: { recordedAt: 'desc' },
        take: 1,
      },
      telemetryEvents: {
        orderBy: { timestamp: 'desc' },
        take: 1,
        where: {
          type: 'FUEL_LEVEL',
        },
      },
    },
  });

  if (!vehicle) {
    throw createAppError('Vehicle not found', 404);
  }

  const lastLocation = vehicle.locations[0] || null;
  const lastTelemetryEvent = vehicle.telemetryEvents[0] || null;
  
  const lastTelemetry = lastTelemetryEvent ? {
    vehicleId: vehicle.id,
    fuelLevel: (lastTelemetryEvent.data as any)?.fuelLevel || null,
    timestamp: lastTelemetryEvent.timestamp,
  } : null;

  res.json({
    success: true,
    data: {
      ...vehicle,
      lastLocation: lastLocation ? {
        id: lastLocation.id,
        vehicleId: lastLocation.vehicleId,
        latitude: lastLocation.latitude,
        longitude: lastLocation.longitude,
        speed: lastLocation.speed,
        heading: lastLocation.heading,
        altitude: lastLocation.altitude,
        recordedAt: lastLocation.recordedAt,
      } : null,
      lastTelemetry,
      currentLocation: lastLocation,
    },
  });
}));

// Post telemetry data (from IoT devices) - Requires API key authentication
router.post('/telemetry', apiKeyAuth, requireScope('telemetry:write'), [
  body('vehicleId').isUUID(),
  body('gps.lat').isFloat({ min: -90, max: 90 }),
  body('gps.lng').isFloat({ min: -180, max: 180 }),
  body('speed').optional().isFloat({ min: 0, max: 300 }).withMessage('Speed must be between 0 and 300 km/h'),
  body('fuelLevel').optional().isFloat({ min: 0, max: 100 }).withMessage('Fuel level must be between 0 and 100%'),
  body('engineHours').optional().isFloat({ min: 0 }).withMessage('Engine hours must be positive'),
  body('alerts').optional().isArray(),
], asyncHandler(async (req: any, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { vehicleId, gps, speed, fuelLevel, engineHours, alerts } = req.body;

  // Verify vehicle exists
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      assignedOperator: {
        include: {
          user: {
            select: { firstName: true, lastName: true }
          }
        }
      }
    }
  });

  if (!vehicle) {
    await securityAudit.logSecurityEvent({
      type: SecurityEventType.UNAUTHORIZED_API_ACCESS,
      severity: SecurityEventSeverity.MEDIUM,
      details: {
        reason: 'Telemetry submitted for unknown vehicle',
        vehicleId,
        apiKeyId: req.apiKey?.id,
        apiKeyName: req.apiKey?.name
      }
    }, req);
    throw createAppError('Vehicle not found', 404);
  }

  if (!vehicle.isActive) {
    await securityAudit.logSecurityEvent({
      type: SecurityEventType.UNAUTHORIZED_API_ACCESS,
      severity: SecurityEventSeverity.MEDIUM,
      details: {
        reason: 'Telemetry submitted for inactive vehicle',
        vehicleId,
        plateNumber: vehicle.plateNumber,
        apiKeyId: req.apiKey?.id
      }
    }, req);
    throw createAppError('Vehicle is not active', 403);
  }

  // Store location with additional data
  const location = await prisma.vehicleLocation.create({
    data: {
      vehicleId,
      latitude: gps.lat,
      longitude: gps.lng,
      speed: speed || null,
      heading: gps.heading || null,
      altitude: gps.altitude || null,
      recordedAt: new Date(),
    },
  });

  // Broadcast real-time location update via WebSocket
  io.to(`vehicle:${vehicleId}`).emit('vehicle:location', {
    type: 'location_update',
    vehicleId,
    data: {
      id: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      speed: location.speed,
      heading: location.heading,
      recordedAt: location.recordedAt,
      vehicle: {
        plateNumber: vehicle.plateNumber,
        type: vehicle.type,
        assignedOperator: vehicle.assignedOperator
      }
    },
    timestamp: new Date().toISOString()
  });

  // Process telemetry events
  const events = [];
  const criticalAlerts = [];
  
  if (fuelLevel !== undefined) {
    const severity = fuelLevel < 20 ? 'CRITICAL' : fuelLevel < 50 ? 'HIGH' : 'LOW';
    events.push({
      vehicleId,
      type: TelemetryEventType.FUEL_LEVEL,
      data: { fuelLevel, threshold: fuelLevel < 20 ? 20 : 50 },
      severity,
      message: fuelLevel < 20 ? `Critical fuel level: ${fuelLevel}%` : null,
    });

    if (severity === 'CRITICAL') {
      criticalAlerts.push({
        type: 'FUEL_CRITICAL',
        vehicleId,
        plateNumber: vehicle.plateNumber,
        message: `Critical fuel level: ${fuelLevel}%`,
        data: { fuelLevel }
      });
    }
  }

  if (speed !== undefined && speed > 80) {
    events.push({
      vehicleId,
      type: TelemetryEventType.SPEED_VIOLATION,
      data: { speed, limit: 80, operator: vehicle.assignedOperator?.user?.firstName },
      severity: 'HIGH',
      message: `Speed violation: ${speed} km/h (limit: 80 km/h)`,
    });

    criticalAlerts.push({
      type: 'SPEED_VIOLATION',
      vehicleId,
      plateNumber: vehicle.plateNumber,
      message: `Speed violation: ${speed} km/h`,
      data: { speed, limit: 80 }
    });
  }

  if (alerts && alerts.length > 0) {
    for (const alert of alerts) {
      events.push({
        vehicleId,
        type: TelemetryEventType.MAINTENANCE_ALERT,
        data: alert,
        severity: alert.priority || 'MEDIUM',
        message: alert.message,
      });

      if (alert.priority === 'HIGH' || alert.priority === 'CRITICAL') {
        criticalAlerts.push({
          type: 'MAINTENANCE_ALERT',
          vehicleId,
          plateNumber: vehicle.plateNumber,
          message: alert.message,
          data: alert
        });
      }
    }
  }

  // Store telemetry events in database
  if (events.length > 0) {
    await prisma.telemetryEvent.createMany({
      data: events,
    });
  }

  // Broadcast critical alerts to admins and supervisors
  if (criticalAlerts.length > 0) {
    for (const alert of criticalAlerts) {
      io.to('role:admin').to('role:supervisor').emit('telemetry:alert', {
        type: 'telemetry_alert',
        vehicleId: alert.vehicleId,
        data: alert,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Log telemetry reception
  logger.info(`Telemetry received for vehicle ${vehicle.plateNumber}`, {
    vehicleId,
    plateNumber: vehicle.plateNumber,
    location: { lat: gps.lat, lng: gps.lng },
    speed,
    fuelLevel,
    eventsCreated: events.length,
    criticalAlerts: criticalAlerts.length,
    apiKeyId: req.apiKey?.id,
    apiKeyName: req.apiKey?.name,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: 'Telemetry data processed successfully',
    data: {
      locationId: location.id,
      eventsCreated: events.length,
      criticalAlerts: criticalAlerts.length,
      vehicle: {
        plateNumber: vehicle.plateNumber,
        type: vehicle.type
      }
    }
  });
}));

// Get vehicle routes
router.get('/:id/routes', [
  param('id').isUUID(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit as string) || 10;

  const routes = await prisma.vehicleRoute.findMany({
    where: { vehicleId: id },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });

  res.json({ 
    success: true,
    data: routes 
  });
}));

// Get fuel reports
router.get('/:id/fuel-reports', [
  param('id').isUUID(),
  query('period').optional().matches(/^\d{4}-\d{2}$/), // YYYY-MM format
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { period } = req.query;

  const whereClause: any = { vehicleId: id };
  if (period) {
    whereClause.period = period;
  }

  const reports = await prisma.fuelReport.findMany({
    where: whereClause,
    orderBy: { period: 'desc' },
  });

  res.json({ 
    success: true,
    data: reports 
  });
}));

// Predict fuel consumption using AI
router.post('/:id/fuel-prediction', [
  param('id').isUUID(),
  body('prediction_period.start_date').isISO8601(),
  body('prediction_period.end_date').isISO8601(),
  body('planned_routes').optional().isArray(),
  body('external_factors').optional().isObject(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { prediction_period, planned_routes, external_factors } = req.body;

  // Get vehicle details
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      assignedOperator: {
        include: {
          user: {
            select: { firstName: true, lastName: true }
          }
        }
      }
    }
  });

  if (!vehicle) {
    throw createAppError('Vehicle not found', 404);
  }

  // Get historical fuel data (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const fuelReports = await prisma.fuelReport.findMany({
    where: {
      vehicleId: id,
      createdAt: { gte: thirtyDaysAgo }
    },
    orderBy: { period: 'desc' }
  });

  // Get recent routes for historical data
  const routes = await prisma.vehicleRoute.findMany({
    where: {
      vehicleId: id,
      startedAt: { gte: thirtyDaysAgo }
    },
    orderBy: { startedAt: 'desc' },
    take: 30
  });

  // Prepare historical data for AI service
  const historical_data = routes.map(route => ({
    date: route.startedAt.toISOString().split('T')[0],
    fuel_consumed: route.fuelUsed || 0,
    distance_traveled: route.distanceKm || 0,
    avg_speed: route.distanceKm && route.endedAt ? 
      (route.distanceKm / ((route.endedAt.getTime() - route.startedAt.getTime()) / 3600000)) : 35,
    route_type: "mixed" // Default value
  }));

  try {
    // Call AI service for fuel prediction
    const aiRequest = {
      vehicle: {
        id: vehicle.id,
        plate_number: vehicle.plateNumber,
        vehicle_type: vehicle.type,
        fuel_type: vehicle.fuelType,
        fuel_capacity: vehicle.fuelCapacity,
        year: vehicle.year,
        model: vehicle.model
      },
      historical_data,
      prediction_period,
      planned_routes,
      external_factors
    };

    const prediction = await aiClient.predictFuelConsumption(aiRequest);

    // Log the prediction request
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'FUEL_PREDICTION',
        resource: 'vehicles',
        details: {
          vehicleId: id,
          plateNumber: vehicle.plateNumber,
          prediction_period,
          predicted_consumption: prediction.predicted_consumption
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.json({
      success: true,
      message: 'Fuel prediction completed successfully',
      data: {
        vehicle: {
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          type: vehicle.type
        },
        prediction,
        historical_data_points: historical_data.length
      }
    });

  } catch (error) {
    logger.error('Failed to predict fuel consumption:', error);
    if (error instanceof Error && error.message.includes('AI service')) {
      throw createAppError('AI prediction service is currently unavailable', 503);
    }
    throw error;
  }
}));

// Create new vehicle (PRESIDENT only)
router.post('/', requirePresident, sanitizeInput, [
  body('plateNumber').trim().notEmpty().withMessage('Plate number is required'),
  body('type').isIn(Object.values(VehicleType)).withMessage('Valid vehicle type is required'),
  body('model').trim().notEmpty().withMessage('Model is required'),
  body('year').isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Valid year is required'),
  body('fuelType').isIn(Object.values(FuelType)).withMessage('Valid fuel type is required'),
  body('fuelCapacity').isFloat({ min: 0 }).withMessage('Fuel capacity must be a positive number'),
  body('assignedOperatorId').optional().isUUID().withMessage('Invalid operator ID'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const {
    plateNumber,
    type,
    model,
    year,
    fuelType,
    fuelCapacity,
    assignedOperatorId,
  } = req.body;

  // Check if plate number already exists
  const existingVehicle = await prisma.vehicle.findUnique({
    where: { plateNumber: plateNumber.toUpperCase() },
  });

  if (existingVehicle) {
    throw createAppError('Plate number already exists', 400);
  }

  // If operator is assigned, verify they exist and are active
  if (assignedOperatorId) {
    const operator = await prisma.employee.findUnique({
      where: { id: assignedOperatorId },
      select: { id: true, isActive: true },
    });

    if (!operator) {
      throw createAppError('Operator not found', 404);
    }

    if (!operator.isActive) {
      throw createAppError('Cannot assign inactive operator', 400);
    }
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      plateNumber: plateNumber.toUpperCase(),
      type: type as VehicleType,
      model,
      year,
      fuelType: fuelType as FuelType,
      fuelCapacity,
      assignedOperatorId: assignedOperatorId || null,
      isActive: true,
    },
    include: {
      assignedOperator: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  logger.info('New vehicle created', {
    vehicleId: vehicle.id,
    plateNumber: vehicle.plateNumber,
    createdBy: req.user!.id,
  });

  res.status(201).json({
    success: true,
    message: 'Vehicle created successfully',
    data: vehicle,
  });
}));

// Update vehicle (PRESIDENT only)
router.patch('/:id', requirePresident, sanitizeInput, [
  param('id').isUUID().withMessage('Invalid vehicle ID'),
  body('model').optional().trim().notEmpty().withMessage('Model cannot be empty'),
  body('year').optional().isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Valid year is required'),
  body('fuelCapacity').optional().isFloat({ min: 0 }).withMessage('Fuel capacity must be a positive number'),
  body('assignedOperatorId').optional().custom((value) => {
    if (value === null) return true; // Allow null to unassign
    if (typeof value === 'string' && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return true;
    }
    throw new Error('Invalid operator ID');
  }),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  body('lastMaintenanceDate').optional().isISO8601().withMessage('Invalid date format'),
  body('nextMaintenanceDate').optional().isISO8601().withMessage('Invalid date format'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { id } = req.params;
  const updateData: any = {};

  // Build update object with only provided fields
  const allowedFields = ['model', 'year', 'fuelCapacity', 'assignedOperatorId', 'isActive', 'lastMaintenanceDate', 'nextMaintenanceDate'];
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      if (field === 'lastMaintenanceDate' || field === 'nextMaintenanceDate') {
        updateData[field] = req.body[field] ? new Date(req.body[field]) : null;
      } else {
        updateData[field] = req.body[field];
      }
    }
  });

  if (Object.keys(updateData).length === 0) {
    throw createAppError('No valid fields to update', 400);
  }

  // If operator is being assigned, verify they exist and are active
  if (updateData.assignedOperatorId !== undefined && updateData.assignedOperatorId !== null) {
    const operator = await prisma.employee.findUnique({
      where: { id: updateData.assignedOperatorId },
      select: { id: true, isActive: true },
    });

    if (!operator) {
      throw createAppError('Operator not found', 404);
    }

    if (!operator.isActive) {
      throw createAppError('Cannot assign inactive operator', 400);
    }
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: updateData,
    include: {
      assignedOperator: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  logger.info('Vehicle updated', {
    vehicleId: id,
    updatedBy: req.user!.id,
    fields: Object.keys(updateData),
  });

  res.json({
    success: true,
    message: 'Vehicle updated successfully',
    data: vehicle,
  });
}));

export default router;