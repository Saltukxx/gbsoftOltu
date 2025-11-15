import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { logger } from '@/services/logger';
import prisma from '@/db';

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  sessionId?: string;
  lastActivity?: number;
}

interface ConnectionRateLimit {
  [ip: string]: {
    connections: number;
    firstConnection: number;
  };
}

// WebSocket rate limiting
const connectionLimits: ConnectionRateLimit = {};
const CONNECTIONS_PER_IP = 10; // Max 10 concurrent connections per IP
const RATE_LIMIT_WINDOW = 60000; // 1 minute window

// Clean up rate limiting data every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(connectionLimits).forEach(ip => {
    if (now - connectionLimits[ip].firstConnection > RATE_LIMIT_WINDOW) {
      delete connectionLimits[ip];
    }
  });
}, 5 * 60 * 1000);

export const initializeWebSocket = (io: Server) => {
  // Connection rate limiting middleware
  io.use((socket, next) => {
    const clientIP = socket.handshake.headers['x-real-ip'] as string || 
                     socket.handshake.headers['x-forwarded-for'] as string ||
                     socket.conn.remoteAddress;
    
    if (!connectionLimits[clientIP]) {
      connectionLimits[clientIP] = {
        connections: 0,
        firstConnection: Date.now()
      };
    }
    
    connectionLimits[clientIP].connections++;
    
    if (connectionLimits[clientIP].connections > CONNECTIONS_PER_IP) {
      logger.warn('WebSocket connection rate limit exceeded', { ip: clientIP });
      return next(new Error('Connection rate limit exceeded'));
    }
    
    socket.on('disconnect', () => {
      if (connectionLimits[clientIP]) {
        connectionLimits[clientIP].connections--;
        if (connectionLimits[clientIP].connections <= 0) {
          delete connectionLimits[clientIP];
        }
      }
    });
    
    next();
  });

  // Authentication middleware for WebSocket
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      // Validate token type
      if (decoded.type !== 'access') {
        return next(new Error('Invalid token type'));
      }

      // Check if token is revoked
      const isRevoked = await redis.get(`revoked_token:${require('crypto').createHash('sha256').update(token).digest('hex')}`);
      if (isRevoked) {
        return next(new Error('Token has been revoked'));
      }

      // Check session validity
      const sessionData = await redis.get(`refresh_token:${decoded.sessionId}`);
      if (!sessionData) {
        return next(new Error('Session invalid or expired'));
      }

      // Validate user and token version
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, role: true, isActive: true, tokenVersion: true },
      });

      if (!user || !user.isActive) {
        return next(new Error('Invalid token or user not active'));
      }

      // Check token version
      if (user.tokenVersion !== decoded.tokenVersion) {
        return next(new Error('Token version mismatch'));
      }

      // Set authenticated user data on socket
      socket.userId = user.id;
      socket.userRole = user.role;
      socket.sessionId = decoded.sessionId;
      socket.lastActivity = Date.now();
      
      logger.info(`WebSocket authenticated: ${user.id}`, {
        socketId: socket.id,
        role: user.role,
        sessionId: decoded.sessionId,
      });

      next();
    } catch (error) {
      logger.error('WebSocket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`WebSocket connected: ${socket.userId}`, {
      socketId: socket.id,
    });

    // Join user to their personal room
    socket.join(`user:${socket.userId}`);

    // Join role-based rooms
    if (socket.userRole) {
      socket.join(`role:${socket.userRole.toLowerCase()}`);
    }

    // Handle shift plan updates
    socket.on('shift:subscribe', () => {
      socket.join('shifts:updates');
      logger.debug(`User ${socket.userId} subscribed to shift updates`);
    });

    socket.on('shift:unsubscribe', () => {
      socket.leave('shifts:updates');
      logger.debug(`User ${socket.userId} unsubscribed from shift updates`);
    });

    // Handle vehicle tracking
    socket.on('vehicle:subscribe', (vehicleIds: string[]) => {
      vehicleIds.forEach(vehicleId => {
        socket.join(`vehicle:${vehicleId}`);
      });
      logger.debug(`User ${socket.userId} subscribed to vehicles: ${vehicleIds.join(', ')}`);
    });

    socket.on('vehicle:unsubscribe', (vehicleIds: string[]) => {
      vehicleIds.forEach(vehicleId => {
        socket.leave(`vehicle:${vehicleId}`);
      });
      logger.debug(`User ${socket.userId} unsubscribed from vehicles: ${vehicleIds.join(', ')}`);
    });

    // Handle voice messages
    socket.on('message:subscribe', () => {
      socket.join('messages:updates');
      logger.debug(`User ${socket.userId} subscribed to message updates`);
    });

    socket.on('message:typing', (data: { receiverId: string }) => {
      io.to(`user:${data.receiverId}`).emit('message:typing', {
        senderId: socket.userId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('message:stop-typing', (data: { receiverId: string }) => {
      io.to(`user:${data.receiverId}`).emit('message:stop-typing', {
        senderId: socket.userId,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle task updates
    socket.on('task:subscribe', () => {
      socket.join('tasks:updates');
      logger.debug(`User ${socket.userId} subscribed to task updates`);
    });

    socket.on('task:unsubscribe', () => {
      socket.leave('tasks:updates');
      logger.debug(`User ${socket.userId} unsubscribed from task updates`);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: ${socket.userId}`, {
        socketId: socket.id,
        reason,
      });
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'WebSocket connection established',
      userId: socket.userId,
      timestamp: new Date().toISOString(),
    });
  });

  return io;
};

// Helper functions to broadcast updates
export const broadcastShiftUpdate = (io: Server, shiftData: any) => {
  io.to('shifts:updates').emit('shift:updated', {
    type: 'shift_updated',
    data: shiftData,
    timestamp: new Date().toISOString(),
  });
};

export const broadcastVehicleLocation = (io: Server, vehicleId: string, locationData: any) => {
  io.to(`vehicle:${vehicleId}`).emit('vehicle:location', {
    type: 'location_update',
    vehicleId,
    data: locationData,
    timestamp: new Date().toISOString(),
  });
};

export const broadcastNewMessage = (io: Server, receiverId: string, messageData: any) => {
  io.to(`user:${receiverId}`).emit('message:new', {
    type: 'new_message',
    data: messageData,
    timestamp: new Date().toISOString(),
  });
};

export const broadcastTelemetryAlert = (io: Server, vehicleId: string, alertData: any) => {
  // Broadcast to all admins and supervisors
  io.to('role:admin').to('role:supervisor').emit('telemetry:alert', {
    type: 'telemetry_alert',
    vehicleId,
    data: alertData,
    timestamp: new Date().toISOString(),
  });

  // Also broadcast to vehicle subscribers
  io.to(`vehicle:${vehicleId}`).emit('telemetry:alert', {
    type: 'telemetry_alert',
    vehicleId,
    data: alertData,
    timestamp: new Date().toISOString(),
  });
};