import express from 'express';
import { param, body, validationResult } from 'express-validator';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { logger } from '@/services/logger';
import { securityAudit, SecurityEventType } from '@/services/securityAudit';
import { requirePresident, AuthenticatedRequest, revokeAllUserSessions } from '@/middleware/auth';
import { UserRole } from '@prisma/client';
import prisma from '@/db';

const router = express.Router();

// Get all users with their roles (president only)
router.get('/', requirePresident, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          department: true,
          position: true,
        },
      },
    },
    orderBy: [
      { lastName: 'asc' },
      { firstName: 'asc' },
    ],
  });

  res.json({
    success: true,
    data: users,
    count: users.length,
  });
}));

// Update user role (president only)
router.patch('/:id/role', requirePresident, [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('role')
    .isIn(Object.values(UserRole))
    .withMessage(`Role must be one of: ${Object.values(UserRole).join(', ')}`),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { id } = req.params;
  const { role } = req.body;
  const presidentId = req.user!.id;

  // Get the user to update
  const userToUpdate = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      tokenVersion: true,
    },
  });

  if (!userToUpdate) {
    throw createAppError('User not found', 404);
  }

  if (!userToUpdate.isActive) {
    throw createAppError('Cannot change role of inactive user', 400);
  }

  // Safety rule: Prevent demoting or deactivating the last remaining PRESIDENT
  if (userToUpdate.role === UserRole.PRESIDENT && role !== UserRole.PRESIDENT) {
    const presidentCount = await prisma.user.count({
      where: {
        role: UserRole.PRESIDENT,
        isActive: true,
      },
    });

    if (presidentCount <= 1) {
      throw createAppError(
        'Cannot demote the last remaining PRESIDENT user. At least one PRESIDENT must exist.',
        400
      );
    }
  }

  // Safety rule: Prevent self-demotion from PRESIDENT to avoid accidental lockout
  if (presidentId === id && userToUpdate.role === UserRole.PRESIDENT && role !== UserRole.PRESIDENT) {
    throw createAppError(
      'You cannot demote yourself from PRESIDENT role. Ask another president to do it.',
      400
    );
  }

  // Update the user's role
  const updatedUser = await prisma.user.update({
    where: { id },
    data: { role: role as UserRole },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          department: true,
          position: true,
        },
      },
    },
  });

  // Increment token version to force re-login and apply new permissions immediately
  await revokeAllUserSessions(id);

  // Log the role change for audit trail
  await securityAudit.logAdminAction(
    SecurityEventType.ROLE_CHANGED,
    presidentId,
    `user:${id}`,
    {
      targetUserId: id,
      targetUserEmail: userToUpdate.email,
      oldRole: userToUpdate.role,
      newRole: role,
      changedBy: req.user!.email,
    },
    req
  );

  logger.info(`User role changed by president`, {
    presidentId,
    targetUserId: id,
    oldRole: userToUpdate.role,
    newRole: role,
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'User role updated successfully',
    data: updatedUser,
  });
}));

export default router;

