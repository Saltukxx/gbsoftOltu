import express from 'express';
import { query, validationResult } from 'express-validator';
import { ShiftStatus, VehicleType, FuelType } from '@prisma/client';
import { asyncHandler } from '@/middleware/errorHandler';
import { requireSupervisorOrAbove, AuthenticatedRequest } from '@/middleware/auth';
import { aiClient } from '@/services/aiClient';
import { logger } from '@/services/logger';
import { cache } from '@/services/cache';
import prisma from '@/db';

const router = express.Router();

// Helper function to calculate date range based on period
function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = new Date(now);
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'quarter':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      break;
    default:
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
  }

  return { startDate, endDate };
}

// Get comprehensive analysis overview (with Redis caching)
router.get('/overview', requireSupervisorOrAbove, [
  query('period').optional().isIn(['today', 'week', 'month', 'quarter']),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const period = (req.query.period as string) || 'month';
  const { startDate, endDate } = getDateRange(period);

  // Cache key based on period
  const cacheKey = `analysis:overview:${period}`;

  try {
    // Try to get from cache first
    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      logger.debug(`Analysis overview served from cache for period: ${period}`);
      return res.json(cached);
    }

    // If not in cache, compute the analysis
    logger.debug(`Computing analysis overview for period: ${period}`);
    // 1. Municipality Overview
    const totalVehicles = await prisma.vehicle.count({
      where: { isActive: true }
    });

    const totalEmployees = await prisma.employee.count({
      where: { 
        isActive: true,
        user: { isActive: true }
      }
    });

    const shifts = await prisma.shift.findMany({
      where: {
        day: {
          gte: startDate,
          lte: endDate,
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
    });

    const activeShifts = shifts.filter(s => s.status === ShiftStatus.ACTIVE).length;
    const completedShifts = shifts.filter(s => s.status === ShiftStatus.COMPLETED).length;

    // 2. Vehicle Fleet Analysis
    const vehicles = await prisma.vehicle.findMany({
      where: { isActive: true },
      include: {
        fuelReports: {
          where: {
            createdAt: { gte: startDate }
          }
        },
        locations: {
          where: {
            recordedAt: { gte: startDate }
          },
          orderBy: { recordedAt: 'desc' },
          take: 1
        }
      }
    });

    // Vehicle distribution by type
    const vehicleDistribution = vehicles.reduce((acc, vehicle) => {
      acc[vehicle.type] = (acc[vehicle.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Vehicle efficiency by type
    const vehicleEfficiency = vehicles.reduce((acc, vehicle) => {
      const reports = vehicle.fuelReports;
      if (reports.length > 0) {
        const avgEfficiency = reports.reduce((sum, r) => sum + (r.efficiency || 0), 0) / reports.length;
        if (!acc[vehicle.type]) {
          acc[vehicle.type] = { total: 0, sum: 0 };
        }
        acc[vehicle.type].total += 1;
        acc[vehicle.type].sum += avgEfficiency;
      }
      return acc;
    }, {} as Record<string, { total: number; sum: number }>);

    const vehicleEfficiencyByType = Object.entries(vehicleEfficiency)
      .filter(([_, data]) => data.total > 0)
      .map(([type, data]) => ({
        type,
        averageEfficiency: data.total > 0 ? data.sum / data.total : 0
      }));

    // Vehicle utilization (vehicles with recent locations)
    const utilizedVehicles = vehicles.filter(v => v.locations.length > 0).length;
    const utilizationRate = vehicles.length > 0 ? (utilizedVehicles / vehicles.length) * 100 : 0;

    // 3. Worker Performance Analysis
    const employees = await prisma.employee.findMany({
      where: { 
        isActive: true,
        user: { isActive: true }
      },
      include: {
        user: {
          select: { firstName: true, lastName: true },
        },
        shifts: {
          where: {
            day: { gte: startDate, lte: endDate }
          }
        }
      }
    });

    const workerPerformance = employees.map(emp => {
      const empShifts = emp.shifts;
      const completed = empShifts.filter(s => s.status === ShiftStatus.COMPLETED).length;
      const total = empShifts.length;
      const avgEfficiency = empShifts.length > 0
        ? empShifts.reduce((sum, s) => sum + (s.efficiencyScore || 0), 0) / empShifts.length
        : 0;

      // Calculate hours worked (approximate: 8 hours per shift)
      const hoursWorked = completed * 8;

      return {
        employeeId: emp.id,
        employeeName: `${emp.user.firstName} ${emp.user.lastName}`,
        department: emp.department,
        totalShifts: total,
        completedShifts: completed,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        averageEfficiency: avgEfficiency,
        hoursWorked,
        performanceScore: emp.performanceScore
      };
    });

    const averageCompletionRate = workerPerformance.length > 0
      ? workerPerformance.reduce((sum, w) => sum + (w.completionRate || 0), 0) / workerPerformance.length
      : 0;

    const averageEfficiencyScore = workerPerformance.length > 0
      ? workerPerformance.reduce((sum, w) => sum + (w.averageEfficiency || 0), 0) / workerPerformance.length
      : 0;

    const totalHoursWorked = workerPerformance.reduce((sum, w) => sum + (w.hoursWorked || 0), 0);

    // 4. Fuel Analysis
    const fuelReports = await prisma.fuelReport.findMany({
      where: {
        createdAt: { gte: startDate }
      },
      include: {
        vehicle: {
          select: { plateNumber: true, type: true, fuelType: true }
        }
      },
      orderBy: { period: 'asc' }
    });

    const totalFuelConsumption = fuelReports.reduce((sum, report) => sum + (report.consumptionLiters || 0), 0);
    const totalFuelCost = fuelReports.reduce((sum, report) => sum + (report.totalCost || 0), 0);
    const averageFuelEfficiency = fuelReports.length > 0
      ? fuelReports.reduce((sum, report) => sum + (report.efficiency || 0), 0) / fuelReports.length
      : 0;

    // Fuel consumption by vehicle type
    const fuelByVehicleType = vehicles.reduce((acc, vehicle) => {
      const reports = vehicle.fuelReports || [];
      const consumption = reports.reduce((sum, r) => sum + (r.consumptionLiters || 0), 0);
      if (consumption > 0) {
        if (!acc[vehicle.type]) {
          acc[vehicle.type] = 0;
        }
        acc[vehicle.type] += consumption;
      }
      return acc;
    }, {} as Record<string, number>);

    // Fuel consumption trends (by period)
    const fuelTrends = fuelReports.reduce((acc, report) => {
      if (!report.period) return acc;
      if (!acc[report.period]) {
        acc[report.period] = 0;
      }
      acc[report.period] += report.consumptionLiters || 0;
      return acc;
    }, {} as Record<string, number>);

    const fuelTrendsArray = Object.entries(fuelTrends).map(([period, consumption]) => ({
      period,
      consumption
    })).sort((a, b) => a.period.localeCompare(b.period));

    // 5. Carbon Emissions Analysis
    let emissionsData;
    try {
      // Only try AI service if we have vehicles with fuel reports
      const vehiclesWithFuelData = vehicles.filter(v => v.fuelReports.length > 0);
      
      if (vehiclesWithFuelData.length > 0) {
        const vehicleEmissionData = vehiclesWithFuelData.map(vehicle => ({
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
            end_date: endDate.toISOString()
          },
          include_indirect_emissions: true
        };

        emissionsData = await aiClient.estimateEmissions(aiRequest);
      } else {
        // No vehicles with fuel data, use zero emissions
        throw new Error('No vehicles with fuel data');
      }
    } catch (error) {
      logger.warn('AI emissions service unavailable, using fallback calculation', { error: error instanceof Error ? error.message : String(error) });
      // Fallback calculation
      const estimatedCO2 = totalFuelConsumption * 2.5; // Average factor
      emissionsData = {
        total_emissions: {
          CO2: estimatedCO2 || 0,
          NOx: (estimatedCO2 || 0) * 0.01,
          PM: (estimatedCO2 || 0) * 0.0005
        },
        emissions_by_fuel_type: {
          DIESEL: { CO2: (estimatedCO2 || 0) * 0.7 },
          GASOLINE: { CO2: (estimatedCO2 || 0) * 0.3 }
        }
      };
    }

    // Ensure emissionsData structure is valid
    if (!emissionsData || !emissionsData.total_emissions) {
      emissionsData = {
        total_emissions: {
          CO2: 0,
          NOx: 0,
          PM: 0
        },
        emissions_by_fuel_type: {}
      };
    }

    // Emissions by vehicle type
    const emissionsByVehicleType = Object.entries(vehicleDistribution).reduce((acc, [type, count]) => {
      const typeVehicles = vehicles.filter(v => v.type === type);
      const typeFuelConsumption = typeVehicles.reduce((sum, v) => 
        sum + (v.fuelReports || []).reduce((rSum, r) => rSum + (r.consumptionLiters || 0), 0), 0
      );
      const typeCO2 = typeFuelConsumption * 2.5; // Simplified calculation
      acc[type] = {
        vehicleCount: count,
        totalCO2: typeCO2 || 0,
        averageCO2PerVehicle: count > 0 ? (typeCO2 || 0) / count : 0
      };
      return acc;
    }, {} as Record<string, { vehicleCount: number; totalCO2: number; averageCO2PerVehicle: number }>);

    // Build response object
    const response = {
      success: true,
      period,
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      municipality: {
        totalVehicles,
        totalEmployees,
        activeShifts,
        completedShifts,
        totalShifts: shifts.length
      },
      vehicles: {
        distribution: vehicleDistribution,
        efficiencyByType: vehicleEfficiencyByType,
        utilizationRate,
        totalUtilized: utilizedVehicles
      },
      workers: {
        totalEmployees: employees.length,
        averageCompletionRate,
        averageEfficiencyScore,
        totalHoursWorked,
        performance: workerPerformance
      },
      fuel: {
        totalConsumption: totalFuelConsumption,
        totalCost: totalFuelCost,
        averageEfficiency: averageFuelEfficiency,
        consumptionByVehicleType: fuelByVehicleType,
        trends: fuelTrendsArray
      },
      emissions: {
        total: {
          CO2: emissionsData.total_emissions?.CO2 || 0,
          NOx: emissionsData.total_emissions?.NOx || 0,
          PM: emissionsData.total_emissions?.PM || 0
        },
        byFuelType: emissionsData.emissions_by_fuel_type || {},
        byVehicleType: emissionsByVehicleType,
        averagePerVehicle: totalVehicles > 0
          ? ((emissionsData.total_emissions?.CO2 || 0) / totalVehicles)
          : 0
      }
    };

    // Cache the result with appropriate TTL based on period
    const cacheTTL = period === 'today' ? 60 : period === 'week' ? 300 : period === 'month' ? 600 : 1800; // 1min, 5min, 10min, 30min
    await cache.set(cacheKey, response, { ttl: cacheTTL });
    logger.debug(`Cached analysis overview for period: ${period} with TTL: ${cacheTTL}s`);

    res.json(response);
  } catch (error: any) {
    logger.error('Analysis overview error:', { 
      error: error?.message || String(error), 
      stack: error?.stack,
      name: error?.name
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate analysis overview',
      message: error?.message || 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}));

export default router;

