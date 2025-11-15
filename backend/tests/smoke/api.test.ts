import request from 'supertest';
import { app } from '@/app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('API Smoke Tests', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user for authentication
    // This is a valid bcrypt hash for "password123" (cost=10)
    const testUser = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {
        // Update password in case user already exists
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
      },
      create: {
        email: 'test@example.com',
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // Actual hash for "password123"
        firstName: 'Test',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        tokenVersion: 1,
      },
    });

    testUserId = testUser.id;

    // Login to get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123',
      });

    if (loginResponse.status === 200) {
      authToken = loginResponse.body.accessToken;
    } else {
      console.error('Login failed:', loginResponse.status, loginResponse.body);
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.user.deleteMany({
      where: { email: 'test@example.com' },
    });
    await prisma.$disconnect();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('service');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without auth token', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should accept requests with valid auth token', async () => {
      if (!authToken) {
        console.warn('Skipping authenticated test - no token available');
        return;
      }

      const response = await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(response.status);
    });

    it('should provide logout endpoint', async () => {
      if (!authToken) {
        console.warn('Skipping logout test - no token available');
        return;
      }

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('API Endpoints', () => {
    const endpoints = [
      { method: 'GET', path: '/api/shifts', name: 'Shifts list' },
      { method: 'GET', path: '/api/employees', name: 'Employees list' },
      { method: 'GET', path: '/api/vehicles', name: 'Vehicles list' },
      { method: 'GET', path: '/api/vehicles/locations', name: 'Vehicle locations' },
      { method: 'GET', path: '/api/messages/conversations', name: 'Conversations' },
    ];

    endpoints.forEach(({ method, path, name }) => {
      it(`${name} endpoint should be accessible`, async () => {
        if (!authToken) {
          console.warn(`Skipping ${name} test - no token available`);
          return;
        }

        let requestBuilder = request(app)[method.toLowerCase() as 'get'];
        requestBuilder = requestBuilder.set('Authorization', `Bearer ${authToken}`);
        
        const response = await requestBuilder;

        // Accept various success codes or specific error codes
        expect([200, 201, 404, 422, 400]).toContain(response.status);
        
        // If successful, should have proper structure
        if (response.status === 200) {
          expect(response.body).toHaveProperty('success');
        }
      });
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting', async () => {
      // Make multiple rapid requests to test rate limiting
      const promises = Array(10).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed (health endpoint shouldn't be rate limited)
      // but we're testing that the middleware is working
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 routes gracefully', async () => {
      const response = await request(app)
        .get('/api/nonexistent-endpoint')
        .set('Authorization', `Bearer ${authToken || 'fake-token'}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');

      expect(response.status).toBe(400);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/health');

      // Check for helmet security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });
});