import express from 'express';
import { query, param, validationResult } from 'express-validator';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { requireSupervisorOrAbove, AuthenticatedRequest } from '@/middleware/auth';
import { logger } from '@/services/logger';
import prisma from '@/db';

const router = express.Router();

// Get all active employees
router.get('/', requireSupervisorOrAbove, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const employees = await prisma.employee.findMany({
    where: { 
      user: { 
        isActive: true 
      } 
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: [
      { user: { firstName: 'asc' } },
      { user: { lastName: 'asc' } },
    ],
  });

  res.json({
    success: true,
    data: employees,
    count: employees.length,
  });
}));

// Get employee by ID
router.get('/:id', requireSupervisorOrAbove, [
  param('id').isUUID(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { id } = req.params;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (!employee) {
    throw createAppError('Employee not found', 404);
  }

  res.json({
    success: true,
    data: employee,
  });
}));

// Get employee shifts
router.get('/:id/shifts', requireSupervisorOrAbove, [
  param('id').isUUID(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { id } = req.params;
  const { startDate, endDate } = req.query;

  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!employee) {
    throw createAppError('Employee not found', 404);
  }

  const whereClause: any = { employeeId: id };
  
  if (startDate) {
    whereClause.day = { gte: new Date(startDate as string) };
  }
  
  if (endDate) {
    if (whereClause.day) {
      whereClause.day.lte = new Date(endDate as string);
    } else {
      whereClause.day = { lte: new Date(endDate as string) };
    }
  }

  const shifts = await prisma.shift.findMany({
    where: whereClause,
    orderBy: { day: 'desc' },
  });

  res.json({
    success: true,
    data: shifts,
    count: shifts.length,
  });
}));

export default router;