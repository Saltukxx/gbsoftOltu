import mqtt from 'mqtt';
import { Server } from 'socket.io';
import { logger } from '@/services/logger';
import { securityAudit, SecurityEventType, SecurityEventSeverity } from '@/services/securityAudit';
import { broadcastVehicleLocation, broadcastTelemetryAlert } from '@/services/websocket';
import { 
  MQTTConnectionManager, 
  ConnectionManagerFactory, 
  ConnectionMonitor,
  ConnectionState 
} from './connectionResilience';
import prisma from '@/db';

let mqttConnectionManager: MQTTConnectionManager;
let connectionMonitor: ConnectionMonitor;

// Enhanced input validation for MQTT messages
class MQTTInputValidator {
  
  static sanitizeString(input: any, maxLength: number = 100): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    
    // Remove potentially dangerous characters
    const sanitized = input
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
      .replace(/[<>'"&]/g, '') // Remove HTML/XML characters
      .trim()
      .substring(0, maxLength);
    
    if (sanitized.length === 0) {
      throw new Error('Input cannot be empty after sanitization');
    }
    
    return sanitized;
  }
  
  static validateVehicleId(vehicleId: any): string {
    if (!vehicleId) {
      throw new Error('Vehicle ID is required');
    }
    
    if (typeof vehicleId !== 'string') {
      throw new Error('Vehicle ID must be a string');
    }
    
    // Allow only alphanumeric characters, hyphens, and underscores
    // Length between 3 and 50 characters
    const pattern = /^[a-zA-Z0-9-_]{3,50}$/;
    if (!pattern.test(vehicleId)) {
      throw new Error('Vehicle ID format is invalid');
    }
    
    // Check for potentially malicious patterns
    const maliciousPatterns = [
      /\.\./,          // Directory traversal
      /[\/\\]/,        // Path separators
      /\$\{/,          // Template injection
      /<script/i,      // Script injection
      /javascript:/i,  // JavaScript protocol
      /data:/i,        // Data URLs
      /vbscript:/i,    // VBScript protocol
    ];
    
    for (const pattern of maliciousPatterns) {
      if (pattern.test(vehicleId)) {
        throw new Error('Vehicle ID contains invalid patterns');
      }
    }
    
    return vehicleId;
  }
  
  static validateCoordinates(lat: any, lng: any): { latitude: number; longitude: number } {
    const latitude = this.validateNumber(lat, -90, 90, 'Latitude');
    const longitude = this.validateNumber(lng, -180, 180, 'Longitude');
    
    return { latitude, longitude };
  }
  
  static validateNumber(value: any, min: number, max: number, fieldName: string): number {
    if (value === null || value === undefined) {
      throw new Error(`${fieldName} is required`);
    }
    
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`${fieldName} must be a valid number`);
    }
    
    if (num < min || num > max) {
      throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    
    return num;
  }
  
  static validateTelemetryPayload(payload: any): any {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload must be an object');
    }
    
    // Limit object depth to prevent DoS
    const maxDepth = 5;
    function checkDepth(obj: any, depth: number = 0): void {
      if (depth > maxDepth) {
        throw new Error('Payload object is too deeply nested');
      }
      
      if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(value => {
          if (value && typeof value === 'object') {
            checkDepth(value, depth + 1);
          }
        });
      }
    }
    
    checkDepth(payload);
    
    // Limit the number of properties
    const maxProperties = 50;
    const propertyCount = Object.keys(payload).length;
    if (propertyCount > maxProperties) {
      throw new Error(`Payload cannot have more than ${maxProperties} properties`);
    }
    
    // Validate string properties
    Object.keys(payload).forEach(key => {
      if (typeof key !== 'string') {
        throw new Error('All property keys must be strings');
      }
      
      if (key.length > 100) {
        throw new Error('Property keys cannot exceed 100 characters');
      }
      
      // Check for malicious property names
      const maliciousKeyPatterns = [
        /__proto__/,
        /constructor/,
        /prototype/,
        /\$\{/,
        /<script/i,
      ];
      
      if (maliciousKeyPatterns.some(pattern => pattern.test(key))) {
        throw new Error(`Property key "${key}" is not allowed`);
      }
    });
    
    return payload;
  }
  
  static validateTopicStructure(topic: string): { vehicleId: string; messageType: string } {
    const parts = topic.split('/');
    
    // Expected format: vehicles/{vehicleId}/telemetry/{messageType}
    if (parts.length !== 4 || parts[0] !== 'vehicles' || parts[2] !== 'telemetry') {
      throw new Error('Invalid topic structure');
    }
    
    const vehicleId = this.validateVehicleId(parts[1]);
    const messageType = this.sanitizeString(parts[3], 50);
    
    // Validate message type against allowed types
    const allowedTypes = ['gps', 'fuel', 'engine', 'maintenance', 'status', 'alert'];
    if (!allowedTypes.includes(messageType.toLowerCase())) {
      throw new Error(`Message type "${messageType}" is not allowed`);
    }
    
    return { vehicleId, messageType: messageType.toLowerCase() };
  }
}

export const initializeMQTT = async (io: Server) => {
  const mqttUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';
  const clientId = process.env.MQTT_CLIENT_ID || 'oltu-backend';

  logger.info(`Initializing MQTT broker connection: ${mqttUrl}`);

  // Create MQTT client with enhanced options
  const client = mqtt.connect(mqttUrl, {
    clientId,
    clean: true,
    reconnectPeriod: 1000, // Start with 1 second
    connectTimeout: 10000,
    keepalive: 30,
    rejectUnauthorized: process.env.MQTT_REJECT_UNAUTHORIZED !== "false",
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    properties: {
      sessionExpiryInterval: 3600, // 1 hour
    },
    will: {
      topic: 'system/backend/status',
      payload: JSON.stringify({ 
        status: 'offline', 
        timestamp: new Date().toISOString(),
        clientId 
      }),
      qos: 1,
      retain: true
    }
  });

  // Create connection manager with custom retry configuration
  mqttConnectionManager = ConnectionManagerFactory.createMQTTManager(client, {
    maxAttempts: 15,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 1.5,
    jitterMs: 500,
    resetOnSuccess: true
  });

  // Set up connection monitoring
  connectionMonitor = new ConnectionMonitor();
  connectionMonitor.addManager(mqttConnectionManager);

  // Enhanced event handling
  mqttConnectionManager.on('connected', () => {
    logger.info('MQTT connection established with resilience manager');
    subscribeToTopics(client);
    publishOnlineStatus(client, clientId);
  });

  mqttConnectionManager.on('error', (error) => {
    logger.error('MQTT connection manager error:', error);
  });

  mqttConnectionManager.on('circuitBreakerOpen', () => {
    logger.warn('MQTT circuit breaker opened - connection failures detected');
    // Could notify monitoring systems or trigger alerts
  });

  mqttConnectionManager.on('maxRetriesReached', (error) => {
    logger.error('MQTT max retries reached - manual intervention may be required:', error);
    // Could trigger emergency procedures or notifications
  });

  // Enhanced message handling with error recovery
  client.on('message', async (topic, message) => {
    try {
      await handleMQTTMessage(io, topic, message);
    } catch (error) {
      logger.error('Critical error processing MQTT message:', {
        topic,
        message: message.toString().substring(0, 100), // Truncate for logging
        error: (error as Error).message,
        stack: (error as Error).stack
      });

      // Implement dead letter queue or retry mechanism for critical failures
      await handleFailedMessage(topic, message, error as Error);
    }
  });

  // Additional MQTT event handlers
  client.on('packetsend', (packet) => {
    logger.debug('MQTT packet sent:', { cmd: packet.cmd, messageId: packet.messageId });
  });

  client.on('packetreceive', (packet) => {
    logger.debug('MQTT packet received:', { cmd: packet.cmd, messageId: packet.messageId });
  });

  client.on('close', () => {
    logger.warn('MQTT connection closed');
  });

  client.on('disconnect', () => {
    logger.warn('MQTT client disconnected');
  });

  client.on('offline', () => {
    logger.warn('MQTT client went offline');
  });

  client.on('end', () => {
    logger.info('MQTT client ended');
  });

  // Start the connection - don't throw error, let it retry in background
  try {
    await mqttConnectionManager.connect();
    logger.info('MQTT service initialized successfully');
  } catch (error) {
    logger.warn('MQTT initial connection failed - will retry in background:', (error as Error).message);
    // Don't throw - let the connection manager handle retries
    // The app can continue running without MQTT
  }

  return { client, connectionManager: mqttConnectionManager, monitor: connectionMonitor };
};

// Enhanced topic subscription with error handling
const subscribeToTopics = (client: mqtt.MqttClient) => {
  const topics = [
    'vehicles/+/telemetry',     // vehicles/{vehicleId}/telemetry
    'vehicles/+/alerts',        // vehicles/{vehicleId}/alerts
    'vehicles/+/status',        // vehicles/{vehicleId}/status
    'system/+/heartbeat',       // system/{serviceId}/heartbeat
    'admin/commands',           // admin commands
  ];

  const subscribeOptions = {
    qos: 1 as mqtt.QoS,
    nl: false,
    rap: false,
    rh: 0
  };

  topics.forEach(topic => {
    client.subscribe(topic, subscribeOptions, (err, granted) => {
      if (err) {
        logger.error(`Failed to subscribe to topic ${topic}:`, err);
      } else {
        logger.info(`Subscribed to MQTT topic: ${topic}`, { 
          qos: granted?.[0]?.qos,
          topic: granted?.[0]?.topic 
        });
      }
    });
  });
};

// Publish online status
const publishOnlineStatus = (client: mqtt.MqttClient, clientId: string) => {
  const statusMessage = {
    status: 'online',
    timestamp: new Date().toISOString(),
    clientId,
    version: process.env.npm_package_version || '1.0.0',
    capabilities: ['telemetry', 'alerts', 'status', 'commands']
  };

  client.publish('system/backend/status', JSON.stringify(statusMessage), {
    qos: 1,
    retain: true
  }, (err) => {
    if (err) {
      logger.error('Failed to publish online status:', err);
    } else {
      logger.info('Published online status to MQTT');
    }
  });
};

// Enhanced message handling
const handleMQTTMessage = async (io: Server, topic: string, message: Buffer) => {
  const startTime = Date.now();
  
  try {
    const payload = JSON.parse(message.toString());
    
    // Enhanced topic structure validation for vehicle telemetry messages
    if (topic.startsWith('vehicles/') && topic.includes('/telemetry/')) {
      try {
        const { vehicleId, messageType } = MQTTInputValidator.validateTopicStructure(topic);
        await handleVehicleMessage(io, vehicleId, messageType, payload);
        return;
      } catch (topicError: any) {
        await securityAudit.logSecurityEvent({
          type: SecurityEventType.MQTT_UNAUTHORIZED_ACCESS,
          severity: SecurityEventSeverity.MEDIUM,
          details: {
            reason: 'Invalid topic structure',
            topic,
            error: topicError.message
          }
        });
        logger.warn('Invalid vehicle telemetry topic structure', { topic, error: topicError.message });
        return;
      }
    }
    
    // Fallback to basic topic parsing for other message types
    const topicParts = topic.split('/');
    
    // Validate topic structure
    if (topicParts.length < 3) {
      logger.warn(`Invalid topic structure: ${topic}`);
      return;
    }

    const [domain, identifier, messageType] = topicParts;
    
    logger.debug(`MQTT message received: ${topic}`, {
      domain,
      identifier,
      messageType,
      payloadSize: message.length,
      timestamp: payload.timestamp
    });

    switch (domain) {
      case 'vehicles':
        // For non-telemetry vehicle messages, use basic validation
        await handleVehicleMessage(io, identifier, messageType, payload);
        break;
      case 'system':
        await handleSystemMessage(identifier, messageType, payload);
        break;
      case 'admin':
        await handleAdminMessage(messageType, payload);
        break;
      default:
        logger.warn(`Unknown message domain: ${domain}`);
    }

    // Log processing time for performance monitoring
    const processingTime = Date.now() - startTime;
    if (processingTime > 1000) { // Log if processing takes more than 1 second
      logger.warn(`Slow MQTT message processing: ${topic}`, {
        processingTimeMs: processingTime,
        payloadSize: message.length
      });
    }
  } catch (parseError) {
    logger.error('Failed to parse MQTT message JSON:', {
      topic,
      error: (parseError as Error).message,
      rawMessage: message.toString().substring(0, 100)
    });
    throw parseError;
  }
};

// Vehicle message handler with enhanced validation
const handleVehicleMessage = async (io: Server, vehicleId: string, messageType: string, payload: any) => {
  try {
    // Enhanced vehicle ID validation using our security validator
    const validatedVehicleId = MQTTInputValidator.validateVehicleId(vehicleId);
    
    // Validate and sanitize payload using comprehensive validation
    const validatedPayload = MQTTInputValidator.validateTelemetryPayload(payload);
    
    // Verify vehicle exists with caching
    const vehicle = await getVehicleWithCache(validatedVehicleId);
    if (!vehicle || !vehicle.isActive) {
      await securityAudit.logSecurityEvent({
        type: SecurityEventType.MQTT_UNAUTHORIZED_ACCESS,
        severity: SecurityEventSeverity.MEDIUM,
        details: {
          reason: 'Unknown or inactive vehicle',
          vehicleId: validatedVehicleId,
          messageType
        }
      });
      logger.warn(`Received telemetry for unknown/inactive vehicle: ${validatedVehicleId}`);
      return;
    }

    // Rate limiting per vehicle
    if (await isRateLimited(validatedVehicleId)) {
      logger.warn(`Rate limit exceeded for vehicle: ${validatedVehicleId}`);
      return;
    }

    // Validate message type against allowed types
    const allowedMessageTypes = ['telemetry', 'alerts', 'status'];
    const sanitizedMessageType = MQTTInputValidator.sanitizeString(messageType, 20);
    
    if (!allowedMessageTypes.includes(sanitizedMessageType.toLowerCase())) {
      await securityAudit.logSecurityEvent({
        type: SecurityEventType.MQTT_UNAUTHORIZED_ACCESS,
        severity: SecurityEventSeverity.MEDIUM,
        details: {
          reason: 'Invalid message type',
          vehicleId: validatedVehicleId,
          messageType: sanitizedMessageType
        }
      });
      logger.warn(`Invalid vehicle message type: ${sanitizedMessageType}`, { vehicleId: validatedVehicleId });
      return;
    }

    switch (sanitizedMessageType.toLowerCase()) {
      case 'telemetry':
        await handleTelemetryMessage(io, validatedVehicleId, validatedPayload);
        break;
      case 'alerts':
        await handleAlertMessage(io, validatedVehicleId, validatedPayload);
        break;
      case 'status':
        await handleStatusMessage(io, validatedVehicleId, validatedPayload);
        break;
      default:
        logger.warn(`Unknown vehicle message type: ${sanitizedMessageType}`, { vehicleId: validatedVehicleId });
    }
  } catch (validationError: any) {
    // Log validation failures as security events
    await securityAudit.logSecurityEvent({
      type: SecurityEventType.MQTT_UNAUTHORIZED_ACCESS,
      severity: SecurityEventSeverity.HIGH,
      details: {
        reason: 'Input validation failed',
        error: validationError.message,
        vehicleId,
        messageType,
        payloadSize: JSON.stringify(payload).length
      }
    });
    
    logger.warn('MQTT message validation failed', {
      vehicleId,
      messageType,
      error: validationError.message
    });
  }
};

// System message handler
const handleSystemMessage = async (serviceId: string, messageType: string, payload: any) => {
  switch (messageType) {
    case 'heartbeat':
      logger.debug(`Heartbeat received from ${serviceId}`, payload);
      break;
    default:
      logger.debug(`System message: ${serviceId}/${messageType}`, payload);
  }
};

// Admin message handler
const handleAdminMessage = async (messageType: string, payload: any) => {
  logger.info(`Admin command received: ${messageType}`, payload);
  // Implement admin command handling
};

// Vehicle cache for performance
const vehicleCache = new Map<string, { vehicle: any, expires: number }>();
const VEHICLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getVehicleWithCache = async (vehicleId: string) => {
  const cached = vehicleCache.get(vehicleId);
  if (cached && cached.expires > Date.now()) {
    return cached.vehicle;
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, plateNumber: true, isActive: true },
  });

  if (vehicle) {
    vehicleCache.set(vehicleId, {
      vehicle,
      expires: Date.now() + VEHICLE_CACHE_TTL
    });
  }

  return vehicle;
};

// Rate limiting
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 messages per minute per vehicle

const isRateLimited = async (vehicleId: string): Promise<boolean> => {
  const now = Date.now();
  const limit = rateLimitMap.get(vehicleId);

  if (!limit || limit.resetTime < now) {
    rateLimitMap.set(vehicleId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (limit.count >= RATE_LIMIT_MAX) {
    return true;
  }

  limit.count++;
  return false;
};

// Failed message handler (dead letter queue simulation)
const handleFailedMessage = async (topic: string, message: Buffer, error: Error) => {
  const failedMessage = {
    topic,
    message: message.toString(),
    error: error.message,
    timestamp: new Date().toISOString(),
    retryCount: 0
  };

  // In production, this would go to a proper dead letter queue
  logger.error('Message processing failed - added to dead letter queue:', failedMessage);
  
  // Could implement retry logic or store in database for manual review
};

// Graceful shutdown
export const shutdownMQTT = async () => {
  logger.info('Shutting down MQTT service...');
  
  if (connectionMonitor) {
    connectionMonitor.destroy();
  }

  if (mqttConnectionManager) {
    await mqttConnectionManager.disconnect();
  }
  
  logger.info('MQTT service shutdown complete');
};

// Health check endpoint data
export const getMQTTHealthStatus = () => {
  if (!mqttConnectionManager) {
    return { status: 'not_initialized' };
  }

  return {
    connection: mqttConnectionManager.getStats(),
    cache: {
      vehicleCacheSize: vehicleCache.size,
      rateLimitEntries: rateLimitMap.size
    }
  };
};

async function handleTelemetryMessage(io: Server, vehicleId: string, payload: any) {
  const { gps, speed, fuelLevel, engineHours, timestamp } = payload;

  if (!gps) {
    logger.warn('Missing GPS data in telemetry message', { vehicleId });
    return;
  }

  try {
    // Validate GPS coordinates using our enhanced validator
    const { latitude, longitude } = MQTTInputValidator.validateCoordinates(gps.lat, gps.lng);
    
    // Validate optional numeric fields
    const validatedSpeed = speed !== undefined ? 
      MQTTInputValidator.validateNumber(speed, 0, 300, 'Speed') : null;
    const validatedFuelLevel = fuelLevel !== undefined ? 
      MQTTInputValidator.validateNumber(fuelLevel, 0, 100, 'Fuel Level') : null;
    const validatedHeading = gps.heading !== undefined ? 
      MQTTInputValidator.validateNumber(gps.heading, 0, 360, 'Heading') : null;
    const validatedAltitude = gps.altitude !== undefined ? 
      MQTTInputValidator.validateNumber(gps.altitude, -1000, 10000, 'Altitude') : null;

    // Store location data
    const location = await prisma.vehicleLocation.create({
      data: {
        vehicleId,
        latitude,
        longitude,
        speed: validatedSpeed,
        heading: validatedHeading,
        altitude: validatedAltitude,
        recordedAt: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    // Broadcast real-time location update
    broadcastVehicleLocation(io, vehicleId, {
      id: location.id,
      vehicleId,
      latitude: location.latitude,
      longitude: location.longitude,
      speed: location.speed,
      heading: location.heading,
      recordedAt: location.recordedAt,
    });

    // Process telemetry events using validated values
    const events = [];

    if (validatedFuelLevel !== null) {
      events.push({
        vehicleId,
        type: 'FUEL_LEVEL',
        data: { fuelLevel: validatedFuelLevel },
        severity: validatedFuelLevel < 20 ? 'HIGH' : validatedFuelLevel < 50 ? 'MEDIUM' : 'LOW',
        message: validatedFuelLevel < 20 ? `Low fuel: ${validatedFuelLevel}%` : null,
      });
    }

    if (validatedSpeed !== null && validatedSpeed > 80) {
      events.push({
        vehicleId,
        type: 'SPEED_VIOLATION',
        data: { speed: validatedSpeed, limit: 80 },
        severity: 'HIGH',
        message: `Speed violation: ${validatedSpeed} km/h (limit: 80 km/h)`,
      });
    }

    if (events.length > 0) {
      await prisma.telemetryEvent.createMany({
        data: events,
      });

      // Broadcast high-severity alerts
      events.filter(event => event.severity === 'HIGH' || event.severity === 'CRITICAL')
        .forEach(event => {
          broadcastTelemetryAlert(io, vehicleId, event);
        });
    }

    logger.debug(`Processed telemetry for vehicle ${vehicleId}`, {
      locationId: location.id,
      eventsCount: events.length,
    });
  } catch (error) {
    logger.error(`Error storing telemetry for vehicle ${vehicleId}:`, error);
  }
}

async function handleAlertMessage(io: Server, vehicleId: string, payload: any) {
  const { type, severity, message, data } = payload;

  try {
    const event = await prisma.telemetryEvent.create({
      data: {
        vehicleId,
        type: type || 'MAINTENANCE_ALERT',
        data: data || payload,
        severity: severity || 'MEDIUM',
        message: message || 'Vehicle alert received',
      },
    });

    // Broadcast alert if it's high priority
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      broadcastTelemetryAlert(io, vehicleId, event);
    }

    logger.info(`Alert processed for vehicle ${vehicleId}`, {
      eventId: event.id,
      type,
      severity,
    });
  } catch (error) {
    logger.error(`Error storing alert for vehicle ${vehicleId}:`, error);
  }
}

async function handleStatusMessage(io: Server, vehicleId: string, payload: any) {
  const { status, engineStatus, timestamp } = payload;

  try {
    // Store engine status changes
    if (engineStatus) {
      await prisma.telemetryEvent.create({
        data: {
          vehicleId,
          type: engineStatus === 'started' ? 'ENGINE_START' : 'ENGINE_STOP',
          data: { status: engineStatus },
          severity: 'LOW',
          message: `Engine ${engineStatus}`,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
        },
      });
    }

    logger.debug(`Status update for vehicle ${vehicleId}`, payload);
  } catch (error) {
    logger.error(`Error storing status for vehicle ${vehicleId}:`, error);
  }
}