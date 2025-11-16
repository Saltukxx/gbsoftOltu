import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { ShiftSlot, ShiftStatus } from '@prisma/client';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { requireSupervisorOrAbove, AuthenticatedRequest } from '@/middleware/auth';
import { sanitizeShiftInput } from '@/middleware/sanitization';
import { logger } from '@/services/logger';
import { aiClient } from '@/services/aiClient';
import { io } from '@/app';
import prisma from '@/db';
import { validateShift } from '@/services/shiftValidation';

const router = express.Router();

// Get shifts for a specific week or date range
router.get('/', [
  query('week').optional().custom((value) => {
    // Accept both YYYY-Wnn and YYYY-MM-DD formats
    const weekFormat = /^\d{4}-W\d{2}$/;
    const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
    if (weekFormat.test(value) || dateFormat.test(value)) {
      return true;
    }
    throw new Error('Week must be in YYYY-Wnn or YYYY-MM-DD format');
  }),
  query('startDate').optional().isISO8601().withMessage('startDate must be in ISO8601 format (YYYY-MM-DD)'),
  query('endDate').optional().isISO8601().withMessage('endDate must be in ISO8601 format (YYYY-MM-DD)'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Calculate week dates if week parameter provided, or use date range
  const { week, startDate: startDateParam, endDate: endDateParam } = req.query;
  let startDate: Date, endDate: Date;

  // If startDate and endDate are provided, use them (for workload calculations)
  if (startDateParam && endDateParam) {
    startDate = new Date(startDateParam as string);
    endDate = new Date(endDateParam as string);
  } else if (week) {
    const weekStr = week as string;
    
    // Check if it's YYYY-Wnn or YYYY-MM-DD format
    if (weekStr.includes('-W')) {
      // Parse week format YYYY-WNN
      const [year, weekNum] = weekStr.split('-W');
      startDate = new Date(parseInt(year), 0, 1 + (parseInt(weekNum) - 1) * 7);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
    } else {
      // Parse date format YYYY-MM-DD (assume it's a Monday or convert to Monday)
      startDate = new Date(weekStr);
      const dayOfWeek = startDate.getDay();
      // Convert to Monday (if day is 0 (Sunday), go back 6 days to previous Monday)
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate.setDate(startDate.getDate() - daysToMonday);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
    }
  } else {
    // Current week
    const today = new Date();
    const dayOfWeek = today.getDay();
    startDate = new Date(today);
    // Fix Sunday calculation: if Sunday (0), go back 6 days; otherwise go back (dayOfWeek - 1) days
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(today.getDate() - daysToMonday); // Monday
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // Sunday
  }

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
            select: { firstName: true, lastName: true, email: true },
          },
        },
      },
    },
    orderBy: [{ day: 'asc' }, { slot: 'asc' }],
  });

  // Get all employees for the planner (for drag-drop assignment)
  const employees = await prisma.employee.findMany({
    where: {
      user: { isActive: true },
    },
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
    orderBy: [
      { user: { firstName: 'asc' } },
      { user: { lastName: 'asc' } },
    ],
  });

  // Define slot metadata (code, label, time range)
  const slots = [
    {
      code: 'MORNING',
      label: 'Sabah',
      timeRange: '08:00-16:00',
      startTime: '08:00',
      endTime: '16:00',
    },
    {
      code: 'AFTERNOON',
      label: 'Öğleden Sonra',
      timeRange: '16:00-00:00',
      startTime: '16:00',
      endTime: '00:00',
    },
    {
      code: 'NIGHT',
      label: 'Gece',
      timeRange: '00:00-08:00',
      startTime: '00:00',
      endTime: '08:00',
    },
  ];

  // Transform shifts to include ISO date string for frontend compatibility
  const transformedShifts = shifts.map(shift => ({
    ...shift,
    day: shift.day.toISOString().split('T')[0], // Convert to YYYY-MM-DD format
  }));

  res.json({
    success: true,
    data: {
      shifts: transformedShifts,
      employees: employees.map(emp => ({
        id: emp.id,
        userId: emp.userId,
        employeeNumber: emp.employeeNumber,
        department: emp.department,
        position: emp.position,
        skills: emp.skills,
        performanceScore: emp.performanceScore,
        maxHoursPerWeek: emp.maxHoursPerWeek,
        availability: emp.availability,
        user: emp.user,
      })),
      slots,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        week: week || `${startDate.getFullYear()}-W${Math.ceil((startDate.getTime() - new Date(startDate.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`,
      },
    },
  });
}));

// Generate AI-optimized shifts
router.post('/generate', requireSupervisorOrAbove, [
  body('employees').isArray(),
  body('constraints').isObject(),
  body('period.start_date').isISO8601(),
  body('period.end_date').isISO8601(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { employees, constraints, period, optimize_for = 'efficiency' } = req.body;

  logger.info(`Generating shifts for ${employees.length} employees`, {
    userId: req.user?.id,
    period,
  });

  try {
    // Get employee data from database
    const employeeData = await Promise.all(
      employees.map(async (empId: string) => {
        const employee = await prisma.employee.findUnique({
          where: { id: empId },
          include: {
            user: {
              select: { firstName: true, lastName: true }
            }
          }
        });
        
        if (!employee) {
          throw createAppError(`Employee ${empId} not found`, 404);
        }

        return {
          id: employee.id,
          name: `${employee.user.firstName} ${employee.user.lastName}`,
          skills: employee.skills as string[],
          performance_score: employee.performanceScore,
          max_hours_per_week: employee.maxHoursPerWeek,
          availability: employee.availability
        };
      })
    );

    // Call AI service for shift optimization
    const aiRequest = {
      employees: employeeData,
      constraints,
      period,
      optimize_for
    };

    const aiResult = await aiClient.generateShiftPlan(aiRequest);

    // Store generated shifts in database
    const createdShifts = await Promise.all(
      aiResult.schedule.map(async (shift: any) => {
        const shiftDate = new Date(shift.day);
        
        // Check if shift already exists
        const existingShift = await prisma.shift.findUnique({
          where: {
            employeeId_day_slot: {
              employeeId: shift.employee_id,
              day: shiftDate,
              slot: shift.slot as ShiftSlot
            }
          }
        });

        // Create history record if updating
        if (existingShift) {
          await prisma.shiftHistory.create({
            data: {
              shiftId: existingShift.id,
              employeeId: existingShift.employeeId,
              day: existingShift.day,
              slot: existingShift.slot,
              status: existingShift.status,
              efficiencyScore: existingShift.efficiencyScore,
              notes: existingShift.notes,
              action: 'UPDATE',
              changedBy: req.user?.id,
              previousData: {
                day: existingShift.day.toISOString(),
                slot: existingShift.slot,
                status: existingShift.status,
                efficiencyScore: existingShift.efficiencyScore,
                notes: existingShift.notes,
              },
            },
          });
        }
        
        const resultShift = await prisma.shift.upsert({
          where: {
            employeeId_day_slot: {
              employeeId: shift.employee_id,
              day: shiftDate,
              slot: shift.slot as ShiftSlot
            }
          },
          update: {
            status: ShiftStatus.SCHEDULED,
            efficiencyScore: shift.confidence,
            updatedAt: new Date()
          },
          create: {
            employeeId: shift.employee_id,
            day: shiftDate,
            slot: shift.slot as ShiftSlot,
            status: ShiftStatus.SCHEDULED,
            efficiencyScore: shift.confidence,
            notes: `Generated by AI - ${optimize_for} optimization`
          },
          include: {
            employee: {
              include: {
                user: {
                  select: { firstName: true, lastName: true }
                }
              }
            }
          }
        });

        // Create history record for new shifts
        if (!existingShift) {
          await prisma.shiftHistory.create({
            data: {
              shiftId: resultShift.id,
              employeeId: resultShift.employeeId,
              day: resultShift.day,
              slot: resultShift.slot,
              status: resultShift.status,
              efficiencyScore: resultShift.efficiencyScore,
              notes: resultShift.notes,
              action: 'CREATE',
              changedBy: req.user?.id,
            },
          });
        }

        return resultShift;
      })
    );

    // Log the operation
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'SHIFT_GENERATION',
        resource: 'shifts',
        details: {
          employeeCount: employees.length,
          period,
          optimize_for,
          efficiency: aiResult.metrics.efficiency_score,
          shiftsCreated: createdShifts.length
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    // Calculate per-employee breakdown
    const employeeBreakdown = new Map<string, {
      id: string;
      name: string;
      shiftCount: number;
      totalHours: number;
      slots: { morning: number; afternoon: number; night: number };
      weekendShifts: number;
      violations: string[];
    }>();

    createdShifts.forEach(shift => {
      const empId = shift.employeeId;
      if (!employeeBreakdown.has(empId)) {
        employeeBreakdown.set(empId, {
          id: empId,
          name: `${shift.employee.user.firstName} ${shift.employee.user.lastName}`,
          shiftCount: 0,
          totalHours: 0,
          slots: { morning: 0, afternoon: 0, night: 0 },
          weekendShifts: 0,
          violations: []
        });
      }

      const empData = employeeBreakdown.get(empId)!;
      empData.shiftCount++;
      empData.totalHours += 8; // Assuming 8-hour shifts

      // Track slot distribution
      const slotLower = shift.slot.toLowerCase();
      if (slotLower === 'morning') empData.slots.morning++;
      else if (slotLower === 'afternoon') empData.slots.afternoon++;
      else if (slotLower === 'night') empData.slots.night++;

      // Track weekend shifts
      const dayOfWeek = shift.day.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        empData.weekendShifts++;
      }
    });

    // Check for violations per employee
    const maxHoursPerWeek = constraints.maxHoursPerEmployee || 40;
    employeeBreakdown.forEach((empData, empId) => {
      if (empData.totalHours > maxHoursPerWeek) {
        empData.violations.push(`Exceeds max hours: ${empData.totalHours}h > ${maxHoursPerWeek}h`);
      }
      if (empData.weekendShifts > 2) {
        empData.violations.push(`Too many weekend shifts: ${empData.weekendShifts}`);
      }
    });

    const employeeBreakdownArray = Array.from(employeeBreakdown.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    // Broadcast shift updates via WebSocket
    io.to('shifts:updates').emit('shift:bulk-updated', {
      type: 'shifts_generated',
      shifts: createdShifts,
      metadata: aiResult.metrics,
      generatedBy: req.user!.id,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      message: 'Shifts generated successfully',
      data: {
        shifts: createdShifts,
        metrics: aiResult.metrics,
        violations: aiResult.violations,
        recommendations: aiResult.recommendations,
        employeeBreakdown: employeeBreakdownArray
      },
      metadata: {
        generatedBy: req.user?.id,
        generatedAt: new Date().toISOString(),
        employeeCount: employees.length,
        totalShifts: createdShifts.length
      },
    });
    
  } catch (error) {
    logger.error('Failed to generate shifts:', error);
    if (error instanceof Error && error.message.includes('AI service')) {
      throw createAppError('AI optimization service is currently unavailable', 503);
    }
    throw error;
  }
}));

// Update a specific shift
// Apply input sanitization to prevent XSS attacks
router.patch('/:id', requireSupervisorOrAbove, sanitizeShiftInput, [
  param('id').isUUID(),
  body('status').optional().isIn(Object.values(ShiftStatus)),
  body('efficiencyScore').optional().isFloat({ min: 0, max: 1 }),
  body('notes').optional().isString(),
  body('day').optional().isISO8601().withMessage('Day must be in ISO8601 format (YYYY-MM-DD)'),
  body('slot').optional().isIn(Object.values(ShiftSlot)).withMessage(`Slot must be one of: ${Object.values(ShiftSlot).join(', ')}`),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { id } = req.params;
  const updates = req.body;

  const shift = await prisma.shift.findUnique({
    where: { id },
  });

  if (!shift) {
    throw createAppError('Shift not found', 404);
  }

  // Create history record before update
  await prisma.shiftHistory.create({
    data: {
      shiftId: shift.id,
      employeeId: shift.employeeId,
      day: shift.day,
      slot: shift.slot,
      status: shift.status,
      efficiencyScore: shift.efficiencyScore,
      notes: shift.notes,
      action: 'UPDATE',
      changedBy: req.user?.id,
      previousData: {
        day: shift.day.toISOString(),
        slot: shift.slot,
        status: shift.status,
        efficiencyScore: shift.efficiencyScore,
        notes: shift.notes,
      },
    },
  });

  // Prepare update data
  const updateData: any = {
    updatedAt: new Date(),
  };

  if (updates.status) updateData.status = updates.status;
  if (updates.efficiencyScore !== undefined) updateData.efficiencyScore = updates.efficiencyScore;
  if (updates.notes) updateData.notes = updates.notes;
  if (updates.day) {
    // Validate and convert ISO date string to Date object
    const dayDate = new Date(updates.day);
    if (isNaN(dayDate.getTime())) {
      throw createAppError('Invalid date format for day field', 400);
    }
    updateData.day = dayDate;
  }
  if (updates.slot) {
    // Validate slot is a valid enum value
    if (!Object.values(ShiftSlot).includes(updates.slot as ShiftSlot)) {
      throw createAppError(`Invalid slot value. Must be one of: ${Object.values(ShiftSlot).join(', ')}`, 400);
    }
    updateData.slot = updates.slot as ShiftSlot;
  }

  const updatedShift = await prisma.shift.update({
    where: { id },
    data: updateData,
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

  // Transform shift to include ISO date string for frontend
  const transformedShift = {
    ...updatedShift,
    day: updatedShift.day.toISOString().split('T')[0],
  };

  // Broadcast shift update via WebSocket
  io.to('shifts:updates').emit('shift:updated', {
    type: 'shift_updated',
    shift: transformedShift,
    updatedBy: req.user!.id,
    timestamp: new Date().toISOString()
  });

  logger.info(`Shift updated: ${id}`, {
    userId: req.user?.id,
    updates,
  });

  res.json({
    success: true,
    message: 'Shift updated successfully',
    data: transformedShift,
  });
}));

// PUT endpoint for compatibility
// Apply input sanitization to prevent XSS attacks
router.put('/:id', requireSupervisorOrAbove, sanitizeShiftInput, [
  param('id').isUUID(),
  body('status').optional().isIn(Object.values(ShiftStatus)),
  body('efficiencyScore').optional().isFloat({ min: 0, max: 1 }),
  body('notes').optional().isString(),
  body('day').optional().isISO8601().withMessage('Day must be in ISO8601 format (YYYY-MM-DD)'),
  body('slot').optional().isIn(Object.values(ShiftSlot)).withMessage(`Slot must be one of: ${Object.values(ShiftSlot).join(', ')}`),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { id } = req.params;
  const updates = req.body;

  const shift = await prisma.shift.findUnique({
    where: { id },
  });

  if (!shift) {
    throw createAppError('Shift not found', 404);
  }

  // Create history record before update
  await prisma.shiftHistory.create({
    data: {
      shiftId: shift.id,
      employeeId: shift.employeeId,
      day: shift.day,
      slot: shift.slot,
      status: shift.status,
      efficiencyScore: shift.efficiencyScore,
      notes: shift.notes,
      action: 'UPDATE',
      changedBy: req.user?.id,
      previousData: {
        day: shift.day.toISOString(),
        slot: shift.slot,
        status: shift.status,
        efficiencyScore: shift.efficiencyScore,
        notes: shift.notes,
      },
    },
  });

  // Prepare update data
  const updateData: any = {
    updatedAt: new Date(),
  };

  if (updates.status) updateData.status = updates.status;
  if (updates.efficiencyScore !== undefined) updateData.efficiencyScore = updates.efficiencyScore;
  if (updates.notes) updateData.notes = updates.notes;
  if (updates.day) {
    // Validate and convert ISO date string to Date object
    const dayDate = new Date(updates.day);
    if (isNaN(dayDate.getTime())) {
      throw createAppError('Invalid date format for day field', 400);
    }
    updateData.day = dayDate;
  }
  if (updates.slot) {
    // Validate slot is a valid enum value
    if (!Object.values(ShiftSlot).includes(updates.slot as ShiftSlot)) {
      throw createAppError(`Invalid slot value. Must be one of: ${Object.values(ShiftSlot).join(', ')}`, 400);
    }
    updateData.slot = updates.slot as ShiftSlot;
  }

  const updatedShift = await prisma.shift.update({
    where: { id },
    data: updateData,
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

  // Transform shift to include ISO date string for frontend
  const transformedShift = {
    ...updatedShift,
    day: updatedShift.day.toISOString().split('T')[0],
  };

  // Broadcast shift update via WebSocket
  io.to('shifts:updates').emit('shift:updated', {
    type: 'shift_updated',
    shift: transformedShift,
    updatedBy: req.user!.id,
    timestamp: new Date().toISOString()
  });

  logger.info(`Shift updated: ${id}`, {
    userId: req.user?.id,
    updates,
  });

  res.json({
    success: true,
    message: 'Shift updated successfully',
    data: transformedShift,
  });
}));

// Validate shift constraints without saving
router.post('/validate', requireSupervisorOrAbove, [
  body('employeeId').isUUID().withMessage('Invalid employee ID format'),
  body('day').isISO8601().withMessage('Day must be in ISO8601 format (YYYY-MM-DD)'),
  body('slot').isIn(Object.values(ShiftSlot)).withMessage(`Slot must be one of: ${Object.values(ShiftSlot).join(', ')}`),
  body('excludeShiftId').optional().isUUID().withMessage('Invalid exclude shift ID format'),
  body('constraints').optional().isObject().withMessage('Constraints must be an object'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { employeeId, day, slot, excludeShiftId, constraints } = req.body;

  try {
    const validationResult = await validateShift(
      {
        employeeId,
        day,
        slot,
        excludeShiftId,
      },
      constraints
    );

    res.json({
      success: true,
      isValid: validationResult.isValid,
      violations: validationResult.violations,
      warnings: validationResult.warnings,
    });
  } catch (error) {
    logger.error('Error validating shift:', error);
    throw createAppError('Failed to validate shift', 500);
  }
}));

// Bulk delete shifts
router.post('/bulk-delete', requireSupervisorOrAbove, [
  body('shiftIds').isArray({ min: 1 }).withMessage('At least one shift ID is required'),
  body('shiftIds.*').isUUID().withMessage('Invalid shift ID format'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { shiftIds } = req.body;

  // Fetch shifts before deletion for history
  const shifts = await prisma.shift.findMany({
    where: {
      id: { in: shiftIds },
      deletedAt: null,
    },
  });

  if (shifts.length === 0) {
    throw createAppError('No valid shifts found to delete', 404);
  }

  // Create history records for all shifts
  await Promise.all(
    shifts.map(shift =>
      prisma.shiftHistory.create({
        data: {
          shiftId: shift.id,
          employeeId: shift.employeeId,
          day: shift.day,
          slot: shift.slot,
          status: shift.status,
          efficiencyScore: shift.efficiencyScore,
          notes: shift.notes,
          action: 'DELETE',
          changedBy: req.user?.id,
          previousData: {
            day: shift.day.toISOString(),
            slot: shift.slot,
            status: shift.status,
            efficiencyScore: shift.efficiencyScore,
            notes: shift.notes,
          },
        },
      })
    )
  );

  // Soft delete all shifts
  const result = await prisma.shift.updateMany({
    where: {
      id: { in: shifts.map(s => s.id) },
    },
    data: {
      deletedAt: new Date(),
    },
  });

  logger.info(`Bulk deleted ${result.count} shifts`, {
    userId: req.user?.id,
    shiftIds: shifts.map(s => s.id),
  });

  // Broadcast bulk delete via WebSocket
  io.to('shifts:updates').emit('shift:bulk-deleted', {
    type: 'shifts_bulk_deleted',
    shiftIds: shifts.map(s => s.id),
    deletedBy: req.user!.id,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: `Successfully deleted ${result.count} shift(s)`,
    deletedCount: result.count,
  });
}));

// Bulk update shifts
router.post('/bulk-update', requireSupervisorOrAbove, [
  body('shiftIds').isArray({ min: 1 }).withMessage('At least one shift ID is required'),
  body('shiftIds.*').isUUID().withMessage('Invalid shift ID format'),
  body('updates').isObject().withMessage('Updates must be an object'),
  body('updates.status').optional().isIn(Object.values(ShiftStatus)),
  body('updates.efficiencyScore').optional().isFloat({ min: 0, max: 1 }),
  body('updates.notes').optional().isString(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { shiftIds, updates } = req.body;

  // Fetch shifts before update for history
  const shifts = await prisma.shift.findMany({
    where: {
      id: { in: shiftIds },
      deletedAt: null,
    },
  });

  if (shifts.length === 0) {
    throw createAppError('No valid shifts found to update', 404);
  }

  // Prepare update data
  const updateData: any = {
    updatedAt: new Date(),
  };

  if (updates.status) updateData.status = updates.status;
  if (updates.efficiencyScore !== undefined) updateData.efficiencyScore = updates.efficiencyScore;
  if (updates.notes !== undefined) updateData.notes = updates.notes;

  // Create history records for all shifts
  await Promise.all(
    shifts.map(shift =>
      prisma.shiftHistory.create({
        data: {
          shiftId: shift.id,
          employeeId: shift.employeeId,
          day: shift.day,
          slot: shift.slot,
          status: shift.status,
          efficiencyScore: shift.efficiencyScore,
          notes: shift.notes,
          action: 'UPDATE',
          changedBy: req.user?.id,
          previousData: {
            day: shift.day.toISOString(),
            slot: shift.slot,
            status: shift.status,
            efficiencyScore: shift.efficiencyScore,
            notes: shift.notes,
          },
        },
      })
    )
  );

  // Update all shifts
  const result = await prisma.shift.updateMany({
    where: {
      id: { in: shifts.map(s => s.id) },
    },
    data: updateData,
  });

  // Fetch updated shifts for response
  const updatedShifts = await prisma.shift.findMany({
    where: {
      id: { in: shifts.map(s => s.id) },
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

  logger.info(`Bulk updated ${result.count} shifts`, {
    userId: req.user?.id,
    shiftIds: shifts.map(s => s.id),
    updates,
  });

  // Broadcast bulk update via WebSocket
  io.to('shifts:updates').emit('shift:bulk-updated', {
    type: 'shifts_bulk_updated',
    shifts: updatedShifts.map(s => ({
      ...s,
      day: s.day.toISOString().split('T')[0],
    })),
    updatedBy: req.user!.id,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: `Successfully updated ${result.count} shift(s)`,
    updatedCount: result.count,
    shifts: updatedShifts.map(s => ({
      ...s,
      day: s.day.toISOString().split('T')[0],
    })),
  });
}));

// Copy week shifts
router.post('/copy-week', requireSupervisorOrAbove, [
  body('sourceWeek').isISO8601().withMessage('Source week must be in ISO8601 format (YYYY-MM-DD)'),
  body('targetWeek').isISO8601().withMessage('Target week must be in ISO8601 format (YYYY-MM-DD)'),
  body('overwrite').optional().isBoolean().withMessage('Overwrite must be a boolean'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { sourceWeek, targetWeek, overwrite = false } = req.body;

  // Calculate week start dates (Monday)
  const sourceDate = new Date(sourceWeek);
  const targetDate = new Date(targetWeek);
  
  const sourceDayOfWeek = sourceDate.getDay();
  const targetDayOfWeek = targetDate.getDay();
  const sourceDaysToMonday = sourceDayOfWeek === 0 ? 6 : sourceDayOfWeek - 1;
  const targetDaysToMonday = targetDayOfWeek === 0 ? 6 : targetDayOfWeek - 1;
  
  const sourceWeekStart = new Date(sourceDate);
  sourceWeekStart.setDate(sourceWeekStart.getDate() - sourceDaysToMonday);
  sourceWeekStart.setHours(0, 0, 0, 0);
  
  const targetWeekStart = new Date(targetDate);
  targetWeekStart.setDate(targetWeekStart.getDate() - targetDaysToMonday);
  targetWeekStart.setHours(0, 0, 0, 0);

  const sourceWeekEnd = new Date(sourceWeekStart);
  sourceWeekEnd.setDate(sourceWeekEnd.getDate() + 6);
  sourceWeekEnd.setHours(23, 59, 59, 999);

  // Fetch source week shifts
  const sourceShifts = await prisma.shift.findMany({
    where: {
      day: {
        gte: sourceWeekStart,
        lte: sourceWeekEnd,
      },
      deletedAt: null,
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

  if (sourceShifts.length === 0) {
    throw createAppError('No shifts found in source week', 404);
  }

  // Check for existing shifts in target week if not overwriting
  if (!overwrite) {
    const targetWeekEnd = new Date(targetWeekStart);
    targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
    targetWeekEnd.setHours(23, 59, 59, 999);

    const existingShifts = await prisma.shift.findMany({
      where: {
        day: {
          gte: targetWeekStart,
          lte: targetWeekEnd,
        },
        deletedAt: null,
      },
    });

    if (existingShifts.length > 0) {
      throw createAppError(
        `Target week already has ${existingShifts.length} shift(s). Use overwrite=true to replace them.`,
        409
      );
    }
  } else {
    // Soft delete existing shifts in target week
    const targetWeekEnd = new Date(targetWeekStart);
    targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
    targetWeekEnd.setHours(23, 59, 59, 999);

    const existingShifts = await prisma.shift.findMany({
      where: {
        day: {
          gte: targetWeekStart,
          lte: targetWeekEnd,
        },
        deletedAt: null,
      },
    });

    if (existingShifts.length > 0) {
      // Create history records for deleted shifts
      await Promise.all(
        existingShifts.map(shift =>
          prisma.shiftHistory.create({
            data: {
              shiftId: shift.id,
              employeeId: shift.employeeId,
              day: shift.day,
              slot: shift.slot,
              status: shift.status,
              efficiencyScore: shift.efficiencyScore,
              notes: shift.notes,
              action: 'DELETE',
              changedBy: req.user?.id,
              previousData: {
                day: shift.day.toISOString(),
                slot: shift.slot,
                status: shift.status,
                efficiencyScore: shift.efficiencyScore,
                notes: shift.notes,
              },
            },
          })
        )
      );

      await prisma.shift.updateMany({
        where: {
          id: { in: existingShifts.map(s => s.id) },
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }
  }

  // Calculate day offset
  const dayOffset = Math.floor((targetWeekStart.getTime() - sourceWeekStart.getTime()) / (1000 * 60 * 60 * 24));

  // Create new shifts for target week
  const createdShifts = await Promise.all(
    sourceShifts.map(async (sourceShift) => {
      const newDay = new Date(sourceShift.day);
      newDay.setDate(newDay.getDate() + dayOffset);

      // Create history record for new shift
      const newShift = await prisma.shift.create({
        data: {
          employeeId: sourceShift.employeeId,
          day: newDay,
          slot: sourceShift.slot,
          status: sourceShift.status,
          efficiencyScore: sourceShift.efficiencyScore,
          notes: sourceShift.notes ? `Copied from ${sourceShift.day.toISOString().split('T')[0]}: ${sourceShift.notes}` : `Copied from ${sourceShift.day.toISOString().split('T')[0]}`,
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

      // Create history record
      await prisma.shiftHistory.create({
        data: {
          shiftId: newShift.id,
          employeeId: newShift.employeeId,
          day: newShift.day,
          slot: newShift.slot,
          status: newShift.status,
          efficiencyScore: newShift.efficiencyScore,
          notes: newShift.notes,
          action: 'CREATE',
          changedBy: req.user?.id,
        },
      });

      return newShift;
    })
  );

  logger.info(`Copied ${createdShifts.length} shifts from week ${sourceWeek} to ${targetWeek}`, {
    userId: req.user?.id,
    sourceWeek: sourceWeekStart.toISOString(),
    targetWeek: targetWeekStart.toISOString(),
  });

  // Broadcast copy operation via WebSocket
  io.to('shifts:updates').emit('shift:bulk-updated', {
    type: 'shifts_copied',
    shifts: createdShifts.map(s => ({
      ...s,
      day: s.day.toISOString().split('T')[0],
    })),
    copiedBy: req.user!.id,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: `Successfully copied ${createdShifts.length} shift(s) from source week to target week`,
    copiedCount: createdShifts.length,
    shifts: createdShifts.map(s => ({
      ...s,
      day: s.day.toISOString().split('T')[0],
    })),
  });
}));

// Delete a shift
router.delete('/:id', requireSupervisorOrAbove, [
  param('id').isUUID(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;

  const shift = await prisma.shift.findUnique({
    where: { id },
  });

  if (!shift) {
    throw createAppError('Shift not found', 404);
  }

  // Create history record before soft delete
  await prisma.shiftHistory.create({
    data: {
      shiftId: shift.id,
      employeeId: shift.employeeId,
      day: shift.day,
      slot: shift.slot,
      status: shift.status,
      efficiencyScore: shift.efficiencyScore,
      notes: shift.notes,
      action: 'DELETE',
      changedBy: req.user?.id,
      previousData: {
        day: shift.day.toISOString(),
        slot: shift.slot,
        status: shift.status,
        efficiencyScore: shift.efficiencyScore,
        notes: shift.notes,
      },
    },
  });

  // Soft delete (set deletedAt instead of hard delete)
  await prisma.shift.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });

  logger.info(`Shift deleted: ${id}`, {
    userId: req.user?.id,
  });

  res.json({
    message: 'Shift deleted successfully',
  });
}));

export default router;