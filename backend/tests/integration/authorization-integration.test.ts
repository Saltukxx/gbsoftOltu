import request from 'supertest';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { authMiddleware, generateTokenPair } from '@/middleware/auth';
import shiftsRouter from '@/routes/shifts';
import employeesRouter from '@/routes/employees';
import messagesRouter from '@/routes/messages';
import { UserRole } from '@prisma/client';

// Mock Redis and Prisma for integration tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    setex: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn(),
  }));
});

jest.mock('@/db', () => ({
  user: {
    findUnique: jest.fn(),
  },
  shift: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  employee: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
  },
  message: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
}));

// Mock WebSocket
jest.mock('@/app', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  },
}));

// Mock logger
jest.mock('@/services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock AI client
jest.mock('@/services/aiClient', () => ({
  aiClient: {
    generateShiftPlan: jest.fn(),
  },
}));

const mockDb = require('@/db');

function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  // Add routes with authentication middleware
  app.use('/api/shifts', authMiddleware, shiftsRouter);
  app.use('/api/employees', authMiddleware, employeesRouter);
  app.use('/api/messages', authMiddleware, messagesRouter);
  
  return app;
}

async function createTestTokens() {
  const users = {
    messenger: { id: 'messenger-id', email: 'messenger@test.com', role: UserRole.MESSENGER, tokenVersion: 1 },
    operator: { id: 'operator-id', email: 'operator@test.com', role: UserRole.OPERATOR, tokenVersion: 1 },
    supervisor: { id: 'supervisor-id', email: 'supervisor@test.com', role: UserRole.SUPERVISOR, tokenVersion: 1 },
    admin: { id: 'admin-id', email: 'admin@test.com', role: UserRole.ADMIN, tokenVersion: 1 },
  };

  const tokens: Record<string, string> = {};
  for (const [role, user] of Object.entries(users)) {
    const { accessToken } = await generateTokenPair(user);
    tokens[role] = accessToken;
  }

  return { users, tokens };
}

describe('Authorization Integration Tests', () => {
  let app: express.Application;
  let { users, tokens }: { users: any; tokens: Record<string, string> } = { users: {}, tokens: {} };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    app = createTestApp();
    const testData = await createTestTokens();
    users = testData.users;
    tokens = testData.tokens;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockDb.user.findUnique.mockImplementation((params: any) => {
      const userId = params.where.id;
      const user = Object.values(users).find((u: any) => u.id === userId);
      return Promise.resolve(user ? { ...user, isActive: true, firstName: 'Test', lastName: 'User' } : null);
    });

    mockDb.shift.findUnique.mockResolvedValue({
      id: 'test-shift-id',
      employeeId: 'test-employee',
      day: new Date(),
      slot: 'MORNING',
      status: 'SCHEDULED',
    });

    mockDb.employee.findUnique.mockResolvedValue({
      id: 'test-employee-id',
      user: { firstName: 'Test', lastName: 'Employee' },
    });
  });

  describe('Shifts API Authorization', () => {
    describe('GET /api/shifts (read access)', () => {
      it('should allow all authenticated roles to read shifts', async () => {
        const responses = await Promise.all([
          request(app).get('/api/shifts').set('Authorization', `Bearer ${tokens.messenger}`),
          request(app).get('/api/shifts').set('Authorization', `Bearer ${tokens.operator}`),
          request(app).get('/api/shifts').set('Authorization', `Bearer ${tokens.supervisor}`),
          request(app).get('/api/shifts').set('Authorization', `Bearer ${tokens.admin}`),
        ]);

        responses.forEach(response => {
          expect(response.status).toBe(200);
        });
      });
    });

    describe('PATCH/PUT /api/shifts/:id (write access)', () => {
      it('should only allow SUPERVISOR and ADMIN to modify shifts', async () => {
        const testData = { status: 'COMPLETED' };

        // Test PATCH endpoint
        const patchResponses = await Promise.all([
          request(app).patch('/api/shifts/test-id').send(testData).set('Authorization', `Bearer ${tokens.messenger}`),
          request(app).patch('/api/shifts/test-id').send(testData).set('Authorization', `Bearer ${tokens.operator}`),
          request(app).patch('/api/shifts/test-id').send(testData).set('Authorization', `Bearer ${tokens.supervisor}`),
          request(app).patch('/api/shifts/test-id').send(testData).set('Authorization', `Bearer ${tokens.admin}`),
        ]);

        expect(patchResponses[0].status).toBe(403); // MESSENGER
        expect(patchResponses[1].status).toBe(403); // OPERATOR
        expect(patchResponses[2].status).toBe(200); // SUPERVISOR
        expect(patchResponses[3].status).toBe(200); // ADMIN

        // Test PUT endpoint
        const putResponses = await Promise.all([
          request(app).put('/api/shifts/test-id').send(testData).set('Authorization', `Bearer ${tokens.messenger}`),
          request(app).put('/api/shifts/test-id').send(testData).set('Authorization', `Bearer ${tokens.operator}`),
          request(app).put('/api/shifts/test-id').send(testData).set('Authorization', `Bearer ${tokens.supervisor}`),
          request(app).put('/api/shifts/test-id').send(testData).set('Authorization', `Bearer ${tokens.admin}`),
        ]);

        expect(putResponses[0].status).toBe(403); // MESSENGER
        expect(putResponses[1].status).toBe(403); // OPERATOR
        expect(putResponses[2].status).toBe(200); // SUPERVISOR
        expect(putResponses[3].status).toBe(200); // ADMIN
      });
    });

    describe('DELETE /api/shifts/:id (delete access)', () => {
      it('should only allow SUPERVISOR and ADMIN to delete shifts', async () => {
        const responses = await Promise.all([
          request(app).delete('/api/shifts/test-id').set('Authorization', `Bearer ${tokens.messenger}`),
          request(app).delete('/api/shifts/test-id').set('Authorization', `Bearer ${tokens.operator}`),
          request(app).delete('/api/shifts/test-id').set('Authorization', `Bearer ${tokens.supervisor}`),
          request(app).delete('/api/shifts/test-id').set('Authorization', `Bearer ${tokens.admin}`),
        ]);

        expect(responses[0].status).toBe(403); // MESSENGER
        expect(responses[1].status).toBe(403); // OPERATOR
        expect(responses[2].status).toBe(200); // SUPERVISOR
        expect(responses[3].status).toBe(200); // ADMIN
      });
    });
  });

  describe('Employees API Authorization', () => {
    describe('GET /api/employees (employee directory access)', () => {
      it('should only allow SUPERVISOR and ADMIN to access employee directory', async () => {
        const responses = await Promise.all([
          request(app).get('/api/employees').set('Authorization', `Bearer ${tokens.messenger}`),
          request(app).get('/api/employees').set('Authorization', `Bearer ${tokens.operator}`),
          request(app).get('/api/employees').set('Authorization', `Bearer ${tokens.supervisor}`),
          request(app).get('/api/employees').set('Authorization', `Bearer ${tokens.admin}`),
        ]);

        expect(responses[0].status).toBe(403); // MESSENGER
        expect(responses[1].status).toBe(403); // OPERATOR
        expect(responses[2].status).toBe(200); // SUPERVISOR
        expect(responses[3].status).toBe(200); // ADMIN
      });
    });

    describe('GET /api/employees/:id (individual employee access)', () => {
      it('should only allow SUPERVISOR and ADMIN to access individual employee data', async () => {
        const responses = await Promise.all([
          request(app).get('/api/employees/test-id').set('Authorization', `Bearer ${tokens.messenger}`),
          request(app).get('/api/employees/test-id').set('Authorization', `Bearer ${tokens.operator}`),
          request(app).get('/api/employees/test-id').set('Authorization', `Bearer ${tokens.supervisor}`),
          request(app).get('/api/employees/test-id').set('Authorization', `Bearer ${tokens.admin}`),
        ]);

        expect(responses[0].status).toBe(403); // MESSENGER
        expect(responses[1].status).toBe(403); // OPERATOR
        expect(responses[2].status).toBe(200); // SUPERVISOR
        expect(responses[3].status).toBe(200); // ADMIN
      });
    });

    describe('GET /api/employees/:id/shifts (employee shifts access)', () => {
      it('should only allow SUPERVISOR and ADMIN to access employee shift data', async () => {
        const responses = await Promise.all([
          request(app).get('/api/employees/test-id/shifts').set('Authorization', `Bearer ${tokens.messenger}`),
          request(app).get('/api/employees/test-id/shifts').set('Authorization', `Bearer ${tokens.operator}`),
          request(app).get('/api/employees/test-id/shifts').set('Authorization', `Bearer ${tokens.supervisor}`),
          request(app).get('/api/employees/test-id/shifts').set('Authorization', `Bearer ${tokens.admin}`),
        ]);

        expect(responses[0].status).toBe(403); // MESSENGER
        expect(responses[1].status).toBe(403); // OPERATOR
        expect(responses[2].status).toBe(200); // SUPERVISOR
        expect(responses[3].status).toBe(200); // ADMIN
      });
    });
  });

  describe('No Authentication', () => {
    it('should reject all requests without authentication tokens', async () => {
      const endpoints = [
        'GET /api/shifts',
        'PATCH /api/shifts/test-id',
        'PUT /api/shifts/test-id',
        'DELETE /api/shifts/test-id',
        'GET /api/employees',
        'GET /api/employees/test-id',
        'GET /api/employees/test-id/shifts',
      ];

      const responses = await Promise.all([
        request(app).get('/api/shifts'),
        request(app).patch('/api/shifts/test-id').send({}),
        request(app).put('/api/shifts/test-id').send({}),
        request(app).delete('/api/shifts/test-id'),
        request(app).get('/api/employees'),
        request(app).get('/api/employees/test-id'),
        request(app).get('/api/employees/test-id/shifts'),
      ]);

      responses.forEach((response, index) => {
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Access token required');
        expect(response.body.code).toBe('TOKEN_MISSING');
      });
    });
  });

  describe('Session Security', () => {
    it('should not expose session data in API responses', async () => {
      // Mock conversation data
      mockDb.message.findMany.mockResolvedValue([
        {
          id: 'msg1',
          senderId: users.supervisor.id,
          receiverId: users.operator.id,
          content: 'Test message',
          createdAt: new Date(),
          sender: {
            id: users.supervisor.id,
            firstName: 'Super',
            lastName: 'Visor',
            role: 'SUPERVISOR',
          },
          receiver: {
            id: users.operator.id,
            firstName: 'Oper',
            lastName: 'Ator',
            role: 'OPERATOR',
          },
        },
      ]);

      const response = await request(app)
        .get('/api/messages/conversations')
        .set('Authorization', `Bearer ${tokens.supervisor}`);

      expect(response.status).toBe(200);
      
      // Check that response doesn't contain session-related fields
      if (response.body.data && response.body.data.length > 0) {
        const conversation = response.body.data[0];
        if (conversation.participants) {
          conversation.participants.forEach((participant: any) => {
            expect(participant).not.toHaveProperty('sessionId');
            expect(participant).not.toHaveProperty('tokenVersion');
            expect(participant).toHaveProperty('id');
            expect(participant).toHaveProperty('firstName');
            expect(participant).toHaveProperty('lastName');
            expect(participant).toHaveProperty('role');
          });
        }
      }
    });
  });
});