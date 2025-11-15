import express from 'express';
import { query, validationResult } from 'express-validator';
import { ShiftStatus } from '@prisma/client';
import { asyncHandler } from '@/middleware/errorHandler';
import { requireOperatorOrAbove, AuthenticatedRequest } from '@/middleware/auth';
import { aiClient } from '@/services/aiClient';
import { logger } from '@/services/logger';
import prisma from '@/db';

const router = express.Router();

// Get dashboard summary
router.get('/summary', requireOperatorOrAbove, [
  query('period').optional().isIn(['today', 'week', 'month']),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const period = req.query.period as string || 'today';
  
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      break;
    default:
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
  }

  // Today's shifts
  const todayShifts = await prisma.shift.findMany({
    where: {
      day: {
        gte: startDate,
        lte: now,
      },
    },
    include: {
      employee: {
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
    orderBy: { day: 'desc' },
  });

  // Active vehicles count
  const activeVehicles = await prisma.vehicle.count({
    where: { isActive: true },
  });

  // Recent vehicle locations (last 30 minutes)
  const recentLocationTime = new Date(now.getTime() - 30 * 60 * 1000);
  const activeVehicleLocations = await prisma.vehicleLocation.findMany({
    where: {
      recordedAt: { gte: recentLocationTime },
    },
    include: {
      vehicle: {
        select: { plateNumber: true, type: true },
      },
    },
    orderBy: { recordedAt: 'desc' },
    distinct: ['vehicleId'],
  });

  // Recent messages
  const recentMessages = await prisma.message.findMany({
    where: {
      OR: [
        { receiverId: req.user!.id },
        { senderId: req.user!.id },
      ],
      createdAt: { gte: startDate },
    },
    include: {
      sender: {
        select: { firstName: true, lastName: true },
      },
      receiver: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Unread messages count
  const unreadMessagesCount = await prisma.message.count({
    where: {
      receiverId: req.user!.id,
      isRead: false,
    },
  });

  // Fuel consumption for the period
  const currentPeriod = now.toISOString().slice(0, 7); // YYYY-MM
  const fuelReports = await prisma.fuelReport.findMany({
    where: {
      period: currentPeriod,
    },
    include: {
      vehicle: {
        select: { plateNumber: true, type: true },
      },
    },
  });

  const totalFuelConsumption = fuelReports.reduce((sum, report) => sum + report.consumptionLiters, 0);
  const averageEfficiency = fuelReports.length > 0 
    ? fuelReports.reduce((sum, report) => sum + (report.efficiency || 0), 0) / fuelReports.length
    : 0;

  // Recent telemetry alerts
  const recentAlerts = await prisma.telemetryEvent.findMany({
    where: {
      timestamp: { gte: startDate },
      severity: { in: ['HIGH', 'CRITICAL'] },
    },
    include: {
      vehicle: {
        select: { plateNumber: true },
      },
    },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  // Shift efficiency statistics
  const shiftStats = {
    total: todayShifts.length,
    active: todayShifts.filter(s => s.status === ShiftStatus.ACTIVE).length,
    completed: todayShifts.filter(s => s.status === ShiftStatus.COMPLETED).length,
    averageEfficiency: todayShifts.length > 0 
      ? todayShifts.reduce((sum, shift) => sum + (shift.efficiencyScore || 0), 0) / todayShifts.length
      : 0,
  };

  res.json({
    period,
    timestamp: now.toISOString(),
    shifts: {
      ...shiftStats,
      recent: todayShifts.slice(0, 5),
    },
    vehicles: {
      total: activeVehicles,
      currentlyActive: activeVehicleLocations.length,
      recentLocations: activeVehicleLocations,
    },
    fuel: {
      totalConsumption: totalFuelConsumption,
      averageEfficiency,
      reports: fuelReports,
    },
    messages: {
      unread: unreadMessagesCount,
      recent: recentMessages,
    },
    alerts: {
      recent: recentAlerts,
      critical: recentAlerts.filter(a => a.severity === 'CRITICAL').length,
      high: recentAlerts.filter(a => a.severity === 'HIGH').length,
    },
  });
}));

// Get performance metrics
router.get('/metrics', requireOperatorOrAbove, [
  query('metric').optional().isIn(['efficiency', 'fuel', 'alerts', 'shifts']),
  query('days').optional().isInt({ min: 1, max: 90 }),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const metric = req.query.metric as string;
  const days = parseInt(req.query.days as string) || 7;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  let data: any = {};

  if (!metric || metric === 'efficiency') {
    // Shift efficiency over time
    const shifts = await prisma.shift.findMany({
      where: {
        day: { gte: startDate },
        efficiencyScore: { not: null },
      },
      orderBy: { day: 'asc' },
    });

    data.efficiency = shifts.map(shift => ({
      date: shift.day.toISOString().split('T')[0],
      score: shift.efficiencyScore,
    }));
  }

  if (!metric || metric === 'fuel') {
    // Fuel consumption trends
    const reports = await prisma.fuelReport.findMany({
      include: {
        vehicle: {
          select: { plateNumber: true, type: true },
        },
      },
      orderBy: { period: 'desc' },
      take: days,
    });

    data.fuel = reports.map(report => ({
      period: report.period,
      consumption: report.consumptionLiters,
      efficiency: report.efficiency,
      vehicle: report.vehicle.plateNumber,
    }));
  }

  if (!metric || metric === 'alerts') {
    // Alert frequency over time
    const alerts = await prisma.telemetryEvent.findMany({
      where: {
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'desc' },
    });

    const alertsByDay = alerts.reduce((acc, alert) => {
      const date = alert.timestamp.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { total: 0, high: 0, critical: 0 };
      }
      acc[date].total++;
      if (alert.severity === 'HIGH') acc[date].high++;
      if (alert.severity === 'CRITICAL') acc[date].critical++;
      return acc;
    }, {} as Record<string, any>);

    data.alerts = Object.entries(alertsByDay).map(([date, stats]) => ({
      date,
      ...stats,
    }));
  }

  res.json({
    metric,
    period: {
      days,
      from: startDate.toISOString(),
      to: new Date().toISOString(),
    },
    data,
  });
}));

// Get emissions estimate for the fleet
router.get('/emissions', requireOperatorOrAbove, [
  query('period').optional().isIn(['week', 'month', 'quarter']),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const period = req.query.period as string || 'month';
  
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'quarter':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      break;
    default:
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
  }

  try {
    // Get vehicle fleet with fuel consumption data
    const vehicles = await prisma.vehicle.findMany({
      where: { isActive: true },
      include: {
        fuelReports: {
          where: {
            createdAt: { gte: startDate }
          }
        }
      }
    });

    // Prepare data for AI emissions calculation
    const vehicleEmissionData = vehicles.map(vehicle => ({
      vehicle_id: vehicle.id,
      vehicle_type: vehicle.type,
      fuel_type: vehicle.fuelType,
      engine_year: vehicle.year,
      fuel_consumption_data: vehicle.fuelReports.map(report => ({
        date: report.period,
        fuel_consumed: report.consumptionLiters,
        distance_traveled: (report.efficiency || 12) * report.consumptionLiters
      }))
    }));

    const aiRequest = {
      vehicles: vehicleEmissionData,
      time_period: {
        start_date: startDate.toISOString(),
        end_date: now.toISOString()
      },
      include_indirect_emissions: true
    };

    const emissionsData = await aiClient.estimateEmissions(aiRequest);

    // Get additional context
    const totalFuelConsumption = vehicles.reduce((total, vehicle) => 
      total + vehicle.fuelReports.reduce((vTotal, report) => vTotal + report.consumptionLiters, 0), 0
    );

    const activeVehicleCount = vehicles.length;

    res.json({
      period,
      timeRange: {
        start: startDate.toISOString(),
        end: now.toISOString()
      },
      emissions: emissionsData,
      context: {
        totalFuelConsumption,
        activeVehicleCount,
        averageEmissionPerVehicle: emissionsData.total_emissions.CO2 / activeVehicleCount,
        emissionTrend: 'stable' // Could be calculated from historical data
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get emissions data:', error);
    
    // Fallback to basic calculation if AI service is unavailable
    const vehicles = await prisma.vehicle.findMany({
      where: { isActive: true },
      include: {
        fuelReports: {
          where: {
            createdAt: { gte: startDate }
          }
        }
      }
    });

    const totalFuelConsumption = vehicles.reduce((total, vehicle) => 
      total + vehicle.fuelReports.reduce((vTotal, report) => vTotal + report.consumptionLiters, 0), 0
    );

    // Basic CO2 calculation (2.68 kg CO2 per liter diesel, 2.31 for gasoline)
    const estimatedCO2 = totalFuelConsumption * 2.5; // Average factor

    res.json({
      period,
      timeRange: {
        start: startDate.toISOString(),
        end: now.toISOString()
      },
      emissions: {
        total_emissions: {
          CO2: estimatedCO2,
          NOx: estimatedCO2 * 0.01,
          PM: estimatedCO2 * 0.0005
        },
        emissions_by_fuel_type: {
          DIESEL: { CO2: estimatedCO2 * 0.7 },
          GASOLINE: { CO2: estimatedCO2 * 0.3 }
        }
      },
      context: {
        totalFuelConsumption,
        activeVehicleCount: vehicles.length,
        dataSource: 'fallback_calculation',
        note: 'AI service unavailable, using basic calculation'
      },
      lastUpdated: new Date().toISOString()
    });
  }
}));

export default router;