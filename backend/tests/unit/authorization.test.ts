import request from 'supertest';
import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { authMiddleware, requireSupervisorOrAbove, requireOperatorOrAbove } from '@/middleware/auth';

// Mock dependencies
jest.mock('@/db', () => ({
  user: {
    findUnique: jest.fn(),
  },
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    setex: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn(),
  }));
});

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
} as any;

// Test app setup
function createTestApp() {
  const app = express();
  app.use(express.json());
  return app;
}

function createValidToken(userId: string, role: UserRole, sessionId = 'test-session'): string {
  return jwt.sign(
    {
      userId,
      email: 'test@example.com',
      role,
      sessionId,
      tokenVersion: 1,
      type: 'access',
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Authorization Controls', () => {
  let app: express.Application;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
    
    // Default mock user response
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'test-user',
      email: 'test@example.com',
      role: UserRole.MESSENGER,
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      tokenVersion: 1,
    });
  });

  describe('Shifts Endpoints Authorization', () => {
    beforeEach(() => {
      // Mock shifts routes
      app.patch('/api/shifts/:id', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true, message: 'Shift updated' });
      });

      app.put('/api/shifts/:id', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true, message: 'Shift updated' });
      });

      app.delete('/api/shifts/:id', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true, message: 'Shift deleted' });
      });

      app.post('/api/shifts/generate', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true, message: 'Shifts generated' });
      });
    });

    it('should reject MESSENGER role from modifying shifts', async () => {
      const token = createValidToken('messenger-user', UserRole.MESSENGER);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'messenger-user',
        email: 'messenger@example.com',
        role: UserRole.MESSENGER,
        firstName: 'Test',
        lastName: 'Messenger',
        isActive: true,
        tokenVersion: 1,
      });

      const responses = await Promise.all([
        request(app).patch('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).put('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).delete('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).post('/api/shifts/generate').set('Authorization', `Bearer ${token}`),
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Insufficient permissions');
      });
    });

    it('should reject OPERATOR role from modifying shifts', async () => {
      const token = createValidToken('operator-user', UserRole.OPERATOR);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'operator-user',
        email: 'operator@example.com',
        role: UserRole.OPERATOR,
        firstName: 'Test',
        lastName: 'Operator',
        isActive: true,
        tokenVersion: 1,
      });

      const responses = await Promise.all([
        request(app).patch('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).put('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).delete('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).post('/api/shifts/generate').set('Authorization', `Bearer ${token}`),
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Insufficient permissions');
      });
    });

    it('should allow SUPERVISOR role to modify shifts', async () => {
      const token = createValidToken('supervisor-user', UserRole.SUPERVISOR);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'supervisor-user',
        email: 'supervisor@example.com',
        role: UserRole.SUPERVISOR,
        firstName: 'Test',
        lastName: 'Supervisor',
        isActive: true,
        tokenVersion: 1,
      });

      const responses = await Promise.all([
        request(app).patch('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).put('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).delete('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).post('/api/shifts/generate').set('Authorization', `Bearer ${token}`),
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it('should allow ADMIN role to modify shifts', async () => {
      const token = createValidToken('admin-user', UserRole.ADMIN);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-user',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        firstName: 'Test',
        lastName: 'Admin',
        isActive: true,
        tokenVersion: 1,
      });

      const responses = await Promise.all([
        request(app).patch('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).put('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).delete('/api/shifts/test-id').set('Authorization', `Bearer ${token}`),
        request(app).post('/api/shifts/generate').set('Authorization', `Bearer ${token}`),
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Employees Endpoints Authorization', () => {
    beforeEach(() => {
      // Mock employees routes
      app.get('/api/employees', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true, data: [] });
      });

      app.get('/api/employees/:id', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true, data: { id: req.params.id } });
      });

      app.get('/api/employees/:id/shifts', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true, data: [] });
      });
    });

    it('should reject MESSENGER and OPERATOR roles from accessing employee data', async () => {
      const messengerToken = createValidToken('messenger-user', UserRole.MESSENGER);
      const operatorToken = createValidToken('operator-user', UserRole.OPERATOR);

      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'messenger-user',
          role: UserRole.MESSENGER,
          isActive: true,
          tokenVersion: 1,
        })
        .mockResolvedValueOnce({
          id: 'operator-user',
          role: UserRole.OPERATOR,
          isActive: true,
          tokenVersion: 1,
        });

      const messengerResponse = await request(app)
        .get('/api/employees')
        .set('Authorization', `Bearer ${messengerToken}`);

      const operatorResponse = await request(app)
        .get('/api/employees/test-id')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(messengerResponse.status).toBe(403);
      expect(operatorResponse.status).toBe(403);
    });

    it('should allow SUPERVISOR and ADMIN roles to access employee data', async () => {
      const supervisorToken = createValidToken('supervisor-user', UserRole.SUPERVISOR);
      const adminToken = createValidToken('admin-user', UserRole.ADMIN);

      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'supervisor-user',
          role: UserRole.SUPERVISOR,
          isActive: true,
          tokenVersion: 1,
        })
        .mockResolvedValueOnce({
          id: 'admin-user',
          role: UserRole.ADMIN,
          isActive: true,
          tokenVersion: 1,
        });

      const supervisorResponse = await request(app)
        .get('/api/employees')
        .set('Authorization', `Bearer ${supervisorToken}`);

      const adminResponse = await request(app)
        .get('/api/employees/test-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(supervisorResponse.status).toBe(200);
      expect(adminResponse.status).toBe(200);
    });
  });

  describe('Authentication Edge Cases', () => {
    beforeEach(() => {
      app.get('/api/protected', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true });
      });
    });

    it('should reject requests without Authorization header', async () => {
      const response = await request(app).get('/api/protected');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access token required');
      expect(response.body.code).toBe('TOKEN_MISSING');
    });

    it('should reject requests with invalid token format', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Invalid Token Format');
      
      expect(response.status).toBe(401);
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        {
          userId: 'test-user',
          role: UserRole.ADMIN,
          type: 'access',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject tokens for inactive users', async () => {
      const token = createValidToken('inactive-user', UserRole.ADMIN);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'inactive-user',
        isActive: false,
        tokenVersion: 1,
      });

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('USER_INACTIVE');
    });

    it('should reject tokens with mismatched token version', async () => {
      const token = createValidToken('test-user', UserRole.ADMIN);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user',
        role: UserRole.ADMIN,
        isActive: true,
        tokenVersion: 2, // Different from token
      });

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_VERSION_MISMATCH');
    });

    it('should reject refresh tokens used as access tokens', async () => {
      const refreshToken = jwt.sign(
        {
          userId: 'test-user',
          role: UserRole.ADMIN,
          type: 'refresh', // Wrong token type
          sessionId: 'test-session',
          tokenVersion: 1,
        },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${refreshToken}`);
      
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_TOKEN_TYPE');
    });
  });

  describe('Role Hierarchy Validation', () => {
    beforeEach(() => {
      app.get('/api/operator-level', authMiddleware, requireOperatorOrAbove, (req, res) => {
        res.json({ success: true });
      });

      app.get('/api/supervisor-level', authMiddleware, requireSupervisorOrAbove, (req, res) => {
        res.json({ success: true });
      });
    });

    it('should enforce correct role hierarchy for operator-level endpoints', async () => {
      const roles = [
        { role: UserRole.MESSENGER, expectedStatus: 403 },
        { role: UserRole.OPERATOR, expectedStatus: 200 },
        { role: UserRole.SUPERVISOR, expectedStatus: 200 },
        { role: UserRole.ADMIN, expectedStatus: 200 },
      ];

      for (const { role, expectedStatus } of roles) {
        const token = createValidToken('test-user', role);
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user',
          role,
          isActive: true,
          tokenVersion: 1,
        });

        const response = await request(app)
          .get('/api/operator-level')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(expectedStatus);
      }
    });

    it('should enforce correct role hierarchy for supervisor-level endpoints', async () => {
      const roles = [
        { role: UserRole.MESSENGER, expectedStatus: 403 },
        { role: UserRole.OPERATOR, expectedStatus: 403 },
        { role: UserRole.SUPERVISOR, expectedStatus: 200 },
        { role: UserRole.ADMIN, expectedStatus: 200 },
      ];

      for (const { role, expectedStatus } of roles) {
        const token = createValidToken('test-user', role);
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user',
          role,
          isActive: true,
          tokenVersion: 1,
        });

        const response = await request(app)
          .get('/api/supervisor-level')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(expectedStatus);
      }
    });
  });
});