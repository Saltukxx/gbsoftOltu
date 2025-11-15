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

const router = express.Router();

// Get shifts for a specific week
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
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Calculate week dates if week parameter provided
  const { week } = req.query;
  let startDate: Date, endDate: Date;

  if (week) {
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
        
        return await prisma.shift.upsert({
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
        recommendations: aiResult.recommendations
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

  await prisma.shift.delete({
    where: { id },
  });

  logger.info(`Shift deleted: ${id}`, {
    userId: req.user?.id,
  });

  res.json({
    message: 'Shift deleted successfully',
  });
}));

export default router;