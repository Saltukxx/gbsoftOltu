import { generateTokenPair, refreshAccessToken } from '@/middleware/auth';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Mock Redis for tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  }));
});

describe('Authentication', () => {
  const testUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'ADMIN' as const,
    tokenVersion: 1,
  };

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  describe('generateTokenPair', () => {
    it('should generate valid access and refresh tokens', async () => {
      const tokens = await generateTokenPair(testUser);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('sessionId');

      // Verify access token structure
      const decoded = jwt.verify(tokens.accessToken, process.env.JWT_SECRET!) as any;
      expect(decoded.userId).toBe(testUser.id);
      expect(decoded.email).toBe(testUser.email);
      expect(decoded.role).toBe(testUser.role);
      expect(decoded.type).toBe('access');
    });

    it('should create tokens with different session IDs when called multiple times', async () => {
      const tokens1 = await generateTokenPair(testUser);
      const tokens2 = await generateTokenPair(testUser);

      expect(tokens1.sessionId).not.toBe(tokens2.sessionId);
    });
  });

  describe('Token Verification', () => {
    it('should verify valid tokens correctly', () => {
      const payload = {
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
        sessionId: 'test-session',
        tokenVersion: 1,
        type: 'access' as const,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

      expect(decoded.userId).toBe(testUser.id);
      expect(decoded.type).toBe('access');
    });

    it('should reject expired tokens', () => {
      const payload = {
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
        sessionId: 'test-session',
        tokenVersion: 1,
        type: 'access' as const,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '-1h' });

      expect(() => {
        jwt.verify(token, process.env.JWT_SECRET!);
      }).toThrow('jwt expired');
    });

    it('should reject tokens with invalid signature', () => {
      const payload = {
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
        sessionId: 'test-session',
        tokenVersion: 1,
        type: 'access' as const,
      };

      const token = jwt.sign(payload, 'wrong-secret', { expiresIn: '1h' });

      expect(() => {
        jwt.verify(token, process.env.JWT_SECRET!);
      }).toThrow('invalid signature');
    });
  });

  describe('Token Security', () => {
    it('should include necessary claims in tokens', async () => {
      const tokens = await generateTokenPair(testUser);
      const decoded = jwt.verify(tokens.accessToken, process.env.JWT_SECRET!) as any;

      // Check required security claims
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('sessionId');
      expect(decoded).toHaveProperty('tokenVersion');
      expect(decoded.tokenVersion).toBe(testUser.tokenVersion);
    });

    it('should generate different tokens for different users', async () => {
      const user2 = { ...testUser, id: 'different-user', email: 'other@example.com' };
      
      const tokens1 = await generateTokenPair(testUser);
      const tokens2 = await generateTokenPair(user2);

      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
      
      const decoded1 = jwt.verify(tokens1.accessToken, process.env.JWT_SECRET!) as any;
      const decoded2 = jwt.verify(tokens2.accessToken, process.env.JWT_SECRET!) as any;
      
      expect(decoded1.userId).not.toBe(decoded2.userId);
    });
  });
});