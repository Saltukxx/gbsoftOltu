import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { logger } from '@/services/logger';
import { securityAudit, SecurityEventType } from '@/services/securityAudit';
import { generateTokenPair, refreshAccessToken, revokeToken, authMiddleware, AuthenticatedRequest, revokeAllUserSessions } from '@/middleware/auth';
import { authLimiter } from '@/middleware/rateLimiting';
import prisma from '@/db';

const router = express.Router();

// Login endpoint - Apply rate limiting to prevent brute force attacks
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], asyncHandler(async (req: express.Request, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { email, password } = req.body;

  // Log login attempt for debugging
  logger.info('Login attempt', { email, ip: req.ip });

  const user = await prisma.user.findUnique({
    where: { email },
    include: { employee: true },
  });

  if (!user || !user.isActive) {
    logger.warn('Login failed: User not found or inactive', { email, ip: req.ip });
    await securityAudit.logAuthEvent(
      SecurityEventType.LOGIN_FAILED,
      undefined,
      email,
      req,
      { reason: 'User not found or inactive' }
    );
    throw createAppError('Invalid credentials', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    logger.warn('Login failed: Invalid password', { email, userId: user.id, ip: req.ip });
    await securityAudit.logAuthEvent(
      SecurityEventType.LOGIN_FAILED,
      user.id,
      user.email,
      req,
      { reason: 'Invalid password' }
    );
    throw createAppError('Invalid credentials', 401);
  }

  logger.info('Login successful', { email, userId: user.id, role: user.role, ip: req.ip });

  // Use sophisticated token generation from auth middleware
  const tokens = await generateTokenPair(user);

  // Log successful login
  await securityAudit.logAuthEvent(
    SecurityEventType.LOGIN_SUCCESS,
    user.id,
    user.email,
    req,
    { 
      sessionId: tokens.sessionId,
      userRole: user.role 
    }
  );

  res.json({
    success: true,
    message: 'Login successful',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      employee: user.employee,
    },
  });
}));

// Refresh token endpoint - Apply rate limiting to prevent token abuse
router.post('/refresh', authLimiter, [
  body('refreshToken').notEmpty(),
], asyncHandler(async (req: express.Request, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { refreshToken } = req.body;

  try {
    const newTokens = await refreshAccessToken(
      refreshToken, 
      req.ip, 
      req.get('User-Agent')
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      sessionId: newTokens.sessionId,
    });
  } catch (error: any) {
    logger.warn('Token refresh failed', { 
      error: error.message,
      ip: req.ip 
    });
    throw createAppError('Invalid refresh token', 401);
  }
}));

// Get current user profile
router.get('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
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
          department: true,
          position: true,
          performanceScore: true,
          maxHoursPerWeek: true,
        },
      },
    },
  });

  if (!user) {
    throw createAppError('User not found', 404);
  }

  res.json({
    success: true,
    user,
  });
}));

// Logout endpoint with session revocation
router.post('/logout', authMiddleware, [
  body('refreshToken').optional(),
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { refreshToken } = req.body;
    const sessionId = (req.user as any)?.sessionId;

    // Revoke the access token and session
    if (token) {
      await revokeToken(token, sessionId);
    }

    // If refresh token provided, revoke it as well
    if (refreshToken) {
      try {
        await revokeToken(refreshToken);
      } catch (error) {
        logger.warn('Failed to revoke refresh token during logout', { 
          error,
          userId: req.user!.id 
        });
      }
    }

    logger.info(`User logged out: ${req.user!.email}`, {
      userId: req.user!.id,
      sessionId,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error: any) {
    logger.error('Logout error:', { 
      error: error.message,
      userId: req.user!.id,
      ip: req.ip 
    });
    res.json({
      success: true,
      message: 'Logout completed with warnings',
    });
  }
}));

// Change password endpoint - Apply rate limiting to prevent brute force attacks
router.post('/change-password', authMiddleware, authLimiter, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.user!.id;

  // Get user with password field
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      password: true,
      tokenVersion: true,
      role: true,
    },
  });

  if (!user) {
    throw createAppError('User not found', 404);
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    await securityAudit.logAuthEvent(
      SecurityEventType.LOGIN_FAILED,
      userId,
      user.email,
      req,
      { reason: 'Invalid current password for password change attempt' }
    );
    throw createAppError('Current password is incorrect', 401);
  }

  // Check if new password is different from current password
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw createAppError('New password must be different from current password', 400);
  }

  // Hash new password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
    },
  });

  // Revoke all user sessions to force re-login on all devices
  // This will increment tokenVersion to invalidate all existing tokens
  await revokeAllUserSessions(userId);

  // Revoke current access token for immediate effect
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      await revokeToken(token);
    } catch (error) {
      logger.warn('Failed to revoke current token during password change', { 
        error,
        userId 
      });
    }
  }

  // Log successful password change
  await securityAudit.logAuthEvent(
    SecurityEventType.USER_MODIFIED,
    userId,
    user.email,
    req,
    { 
      action: 'PASSWORD_CHANGED',
      userRole: user.role 
    }
  );

  logger.info(`Password changed successfully for user: ${user.email}`, {
    userId,
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'Password updated successfully. Please log in again.',
  });
}));

export default router;