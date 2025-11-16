import express from 'express';
import { query, param, body, validationResult } from 'express-validator';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { requireSupervisorOrAbove, requirePresident, AuthenticatedRequest } from '@/middleware/auth';
import { logger } from '@/services/logger';
import { sanitizeInput } from '@/middleware/sanitization';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '@/db';

const router = express.Router();

// Get all active employees with pagination
router.get('/', requireSupervisorOrAbove, [
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

  const where = {
    user: {
      isActive: true
    }
  };

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
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
      take: limit,
      skip: offset,
    }),
    prisma.employee.count({ where }),
  ]);

  res.json({
    success: true,
    data: employees,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
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

// Create new employee with user account (PRESIDENT only)
router.post('/', requirePresident, sanitizeInput, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('role').isIn(Object.values(UserRole)).withMessage('Valid role is required'),
  body('employeeNumber').trim().notEmpty().withMessage('Employee number is required'),
  body('department').trim().notEmpty().withMessage('Department is required'),
  body('position').trim().notEmpty().withMessage('Position is required'),
  body('skills').optional().isArray().withMessage('Skills must be an array'),
  body('maxHoursPerWeek').optional().isInt({ min: 1, max: 168 }).withMessage('Max hours must be between 1 and 168'),
  body('availability').optional().isObject().withMessage('Availability must be an object'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const {
    email,
    password,
    firstName,
    lastName,
    role,
    employeeNumber,
    department,
    position,
    skills = [],
    maxHoursPerWeek = 40,
    availability = {},
  } = req.body;

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw createAppError('Email already registered', 400);
  }

  // Check if employee number already exists
  const existingEmployee = await prisma.employee.findUnique({
    where: { employeeNumber },
  });

  if (existingEmployee) {
    throw createAppError('Employee number already exists', 400);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user and employee in transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        role: role as UserRole,
        isActive: true,
      },
    });

    const employee = await tx.employee.create({
      data: {
        userId: user.id,
        employeeNumber,
        department,
        position,
        skills,
        maxHoursPerWeek,
        availability,
        isActive: true,
      },
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

    return { user, employee };
  });

  logger.info('New employee created', {
    employeeId: result.employee.id,
    userId: result.user.id,
    createdBy: req.user!.id,
  });

  res.status(201).json({
    success: true,
    message: 'Employee created successfully',
    data: result.employee,
  });
}));

// Update employee (PRESIDENT only)
router.patch('/:id', requirePresident, sanitizeInput, [
  param('id').isUUID().withMessage('Invalid employee ID'),
  body('department').optional().trim().notEmpty().withMessage('Department cannot be empty'),
  body('position').optional().trim().notEmpty().withMessage('Position cannot be empty'),
  body('skills').optional().isArray().withMessage('Skills must be an array'),
  body('maxHoursPerWeek').optional().isInt({ min: 1, max: 168 }).withMessage('Max hours must be between 1 and 168'),
  body('availability').optional().isObject().withMessage('Availability must be an object'),
  body('performanceScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Performance score must be between 0 and 100'),
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
  const allowedFields = ['department', 'position', 'skills', 'maxHoursPerWeek', 'availability', 'performanceScore'];
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  if (Object.keys(updateData).length === 0) {
    throw createAppError('No valid fields to update', 400);
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: updateData,
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

  logger.info('Employee updated', {
    employeeId: id,
    updatedBy: req.user!.id,
    fields: Object.keys(updateData),
  });

  res.json({
    success: true,
    message: 'Employee updated successfully',
    data: employee,
  });
}));

export default router;