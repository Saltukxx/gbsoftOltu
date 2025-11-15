import { EventEmitter } from 'events';
import { logger } from './logger';

// Connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

// Retry strategies
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
  resetOnSuccess: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeMs: number;
  monitoringWindowMs: number;
}

// Default configurations
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 10,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMs: 100,
  resetOnSuccess: true
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeMs: 60000,
  monitoringWindowMs: 300000 // 5 minutes
};

// Connection manager base class
export abstract class ConnectionManager extends EventEmitter {
  protected state: ConnectionState = ConnectionState.DISCONNECTED;
  protected retryCount = 0;
  protected retryConfig: RetryConfig;
  protected circuitBreakerConfig: CircuitBreakerConfig;
  protected failures: number[] = []; // Timestamp of recent failures
  protected isCircuitOpen = false;
  protected lastRecoveryAttempt = 0;
  protected reconnectTimer?: NodeJS.Timeout;
  protected healthCheckInterval?: NodeJS.Interval;
  protected serviceName: string;

  constructor(
    serviceName: string,
    retryConfig: Partial<RetryConfig> = {},
    circuitBreakerConfig: Partial<CircuitBreakerConfig> = {}
  ) {
    super();
    this.serviceName = serviceName;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.circuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...circuitBreakerConfig };

    // Set up health check
    this.setupHealthCheck();
  }

  // Abstract methods to be implemented by specific connection types
  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  protected abstract isHealthy(): Promise<boolean>;

  // Public connection management
  public async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    await this.connectWithRetry();
  }

  public async disconnect(): Promise<void> {
    this.clearReconnectTimer();
    this.clearHealthCheck();
    
    if (this.state !== ConnectionState.DISCONNECTED) {
      this.setState(ConnectionState.DISCONNECTED);
      await this.doDisconnect();
    }
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  // Connection with retry logic
  private async connectWithRetry(): Promise<void> {
    if (this.isCircuitOpen && !this.shouldAttemptRecovery()) {
      throw new Error(`Circuit breaker open for ${this.serviceName}`);
    }

    try {
      await this.doConnect();
      this.onConnectionSuccess();
    } catch (error) {
      this.onConnectionFailure(error as Error);
      await this.scheduleReconnect();
    }
  }

  // Successful connection handler
  private onConnectionSuccess(): void {
    this.setState(ConnectionState.CONNECTED);
    this.retryCount = 0;
    this.isCircuitOpen = false;
    this.failures = [];

    logger.info(`${this.serviceName} connected successfully`, {
      service: this.serviceName,
      retryCount: this.retryCount,
      state: this.state
    });

    this.emit('connected');
  }

  // Connection failure handler
  private onConnectionFailure(error: Error): void {
    this.failures.push(Date.now());
    this.cleanupOldFailures();
    this.checkCircuitBreaker();

    logger.error(`${this.serviceName} connection failed`, {
      service: this.serviceName,
      error: error.message,
      retryCount: this.retryCount,
      maxAttempts: this.retryConfig.maxAttempts,
      isCircuitOpen: this.isCircuitOpen
    });

    this.emit('error', error);

    if (this.retryCount >= this.retryConfig.maxAttempts) {
      this.setState(ConnectionState.ERROR);
      this.emit('maxRetriesReached', error);
      throw new Error(`Max connection attempts reached for ${this.serviceName}`);
    }
  }

  // Schedule reconnection with exponential backoff
  private async scheduleReconnect(): Promise<void> {
    this.setState(ConnectionState.RECONNECTING);
    this.retryCount++;

    const delay = this.calculateBackoffDelay();
    
    logger.info(`Scheduling reconnect for ${this.serviceName}`, {
      service: this.serviceName,
      delayMs: delay,
      retryCount: this.retryCount,
      maxAttempts: this.retryConfig.maxAttempts
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connectWithRetry();
      } catch (error) {
        // Error already handled in connectWithRetry
      }
    }, delay);
  }

  // Calculate exponential backoff delay with jitter
  private calculateBackoffDelay(): number {
    const exponentialDelay = Math.min(
      this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, this.retryCount - 1),
      this.retryConfig.maxDelayMs
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * this.retryConfig.jitterMs;
    return exponentialDelay + jitter;
  }

  // Circuit breaker logic
  private checkCircuitBreaker(): void {
    if (this.failures.length >= this.circuitBreakerConfig.failureThreshold) {
      this.isCircuitOpen = true;
      this.lastRecoveryAttempt = Date.now() + this.circuitBreakerConfig.recoveryTimeMs;

      logger.warn(`Circuit breaker opened for ${this.serviceName}`, {
        service: this.serviceName,
        failures: this.failures.length,
        threshold: this.circuitBreakerConfig.failureThreshold,
        recoveryTime: this.lastRecoveryAttempt
      });

      this.emit('circuitBreakerOpen');
    }
  }

  private shouldAttemptRecovery(): boolean {
    return Date.now() >= this.lastRecoveryAttempt;
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.circuitBreakerConfig.monitoringWindowMs;
    this.failures = this.failures.filter(timestamp => timestamp > cutoff);
  }

  // Health check setup
  private setupHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (this.state === ConnectionState.CONNECTED) {
        try {
          const healthy = await this.isHealthy();
          if (!healthy) {
            logger.warn(`Health check failed for ${this.serviceName}`, {
              service: this.serviceName,
              state: this.state
            });
            this.handleHealthCheckFailure();
          }
        } catch (error) {
          logger.error(`Health check error for ${this.serviceName}`, {
            service: this.serviceName,
            error: (error as Error).message
          });
          this.handleHealthCheckFailure();
        }
      }
    }, 30000); // Health check every 30 seconds
  }

  private async handleHealthCheckFailure(): Promise<void> {
    this.emit('healthCheckFailed');
    this.setState(ConnectionState.DISCONNECTED);
    await this.scheduleReconnect();
  }

  // State management
  private setState(newState: ConnectionState): void {
    const oldState = this.state;
    this.state = newState;

    logger.info(`${this.serviceName} state changed`, {
      service: this.serviceName,
      from: oldState,
      to: newState
    });

    this.emit('stateChanged', { from: oldState, to: newState });
  }

  // Cleanup methods
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private clearHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  // Get connection statistics
  public getStats() {
    return {
      service: this.serviceName,
      state: this.state,
      retryCount: this.retryCount,
      isCircuitOpen: this.isCircuitOpen,
      recentFailures: this.failures.length,
      lastRecoveryAttempt: this.lastRecoveryAttempt,
      uptime: this.state === ConnectionState.CONNECTED ? Date.now() - (this.failures[0] || Date.now()) : 0
    };
  }
}

// Redis connection manager
export class RedisConnectionManager extends ConnectionManager {
  private redis: any;

  constructor(redisInstance: any, retryConfig?: Partial<RetryConfig>) {
    super('Redis', retryConfig);
    this.redis = redisInstance;

    // Listen to Redis events
    this.redis.on('connect', () => this.emit('connected'));
    this.redis.on('error', (error: Error) => this.onConnectionFailure(error));
    this.redis.on('close', () => {
      if (this.state === ConnectionState.CONNECTED) {
        this.setState(ConnectionState.DISCONNECTED);
        this.scheduleReconnect();
      }
    });
  }

  protected async doConnect(): Promise<void> {
    if (this.redis.status !== 'ready') {
      await this.redis.connect();
    }
  }

  protected async doDisconnect(): Promise<void> {
    await this.redis.disconnect();
  }

  protected async isHealthy(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}

// MQTT connection manager
export class MQTTConnectionManager extends ConnectionManager {
  private client: any;

  constructor(mqttClient: any, retryConfig?: Partial<RetryConfig>) {
    super('MQTT', retryConfig);
    this.client = mqttClient;

    // Listen to MQTT events
    this.client.on('connect', () => this.emit('connected'));
    this.client.on('error', (error: Error) => this.onConnectionFailure(error));
    this.client.on('close', () => {
      if (this.state === ConnectionState.CONNECTED) {
        this.setState(ConnectionState.DISCONNECTED);
        this.scheduleReconnect();
      }
    });
    this.client.on('offline', () => {
      this.setState(ConnectionState.DISCONNECTED);
      this.scheduleReconnect();
    });
  }

  protected async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client.connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('MQTT connection timeout'));
      }, 10000);

      this.client.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client.once('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      if (!this.client.connected && !this.client.reconnecting) {
        this.client.reconnect();
      }
    });
  }

  protected async doDisconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.client.connected) {
        resolve();
        return;
      }

      this.client.end(false, {}, () => {
        resolve();
      });
    });
  }

  protected async isHealthy(): Promise<boolean> {
    return this.client.connected;
  }
}

// WebSocket connection manager
export class WebSocketConnectionManager extends ConnectionManager {
  private io: any;

  constructor(socketIoInstance: any, retryConfig?: Partial<RetryConfig>) {
    super('WebSocket', retryConfig);
    this.io = socketIoInstance;
  }

  protected async doConnect(): Promise<void> {
    // Socket.IO server doesn't need explicit connection
    // This would be more relevant for client-side WebSocket connections
    return Promise.resolve();
  }

  protected async doDisconnect(): Promise<void> {
    if (this.io) {
      this.io.close();
    }
  }

  protected async isHealthy(): Promise<boolean> {
    // Check if Socket.IO server is responsive
    return this.io && this.io.engine && this.io.engine.clientsCount >= 0;
  }
}

// Database connection manager with connection pooling
export class DatabaseConnectionManager extends ConnectionManager {
  private prisma: any;

  constructor(prismaInstance: any, retryConfig?: Partial<RetryConfig>) {
    super('Database', retryConfig);
    this.prisma = prismaInstance;
  }

  protected async doConnect(): Promise<void> {
    await this.prisma.$connect();
  }

  protected async doDisconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  protected async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

// Connection manager factory
export class ConnectionManagerFactory {
  private static managers: Map<string, ConnectionManager> = new Map();

  public static createRedisManager(redisInstance: any, retryConfig?: Partial<RetryConfig>): RedisConnectionManager {
    const key = 'redis';
    if (!this.managers.has(key)) {
      const manager = new RedisConnectionManager(redisInstance, retryConfig);
      this.managers.set(key, manager);
    }
    return this.managers.get(key) as RedisConnectionManager;
  }

  public static createMQTTManager(mqttClient: any, retryConfig?: Partial<RetryConfig>): MQTTConnectionManager {
    const key = 'mqtt';
    if (!this.managers.has(key)) {
      const manager = new MQTTConnectionManager(mqttClient, retryConfig);
      this.managers.set(key, manager);
    }
    return this.managers.get(key) as MQTTConnectionManager;
  }

  public static createWebSocketManager(socketIo: any, retryConfig?: Partial<RetryConfig>): WebSocketConnectionManager {
    const key = 'websocket';
    if (!this.managers.has(key)) {
      const manager = new WebSocketConnectionManager(socketIo, retryConfig);
      this.managers.set(key, manager);
    }
    return this.managers.get(key) as WebSocketConnectionManager;
  }

  public static createDatabaseManager(prisma: any, retryConfig?: Partial<RetryConfig>): DatabaseConnectionManager {
    const key = 'database';
    if (!this.managers.has(key)) {
      const manager = new DatabaseConnectionManager(prisma, retryConfig);
      this.managers.set(key, manager);
    }
    return this.managers.get(key) as DatabaseConnectionManager;
  }

  public static getAllManagers(): ConnectionManager[] {
    return Array.from(this.managers.values());
  }

  public static async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.managers.values()).map(manager => 
      manager.disconnect().catch(error => 
        logger.error(`Failed to disconnect ${manager.getStats().service}:`, error)
      )
    );
    
    await Promise.allSettled(disconnectPromises);
    this.managers.clear();
  }

  public static getHealthStatus(): { [key: string]: any } {
    const status: { [key: string]: any } = {};
    
    for (const [key, manager] of this.managers.entries()) {
      status[key] = manager.getStats();
    }
    
    return status;
  }
}

// Monitoring and alerting
export class ConnectionMonitor extends EventEmitter {
  private managers: ConnectionManager[] = [];
  private monitoringInterval?: NodeJS.Interval;

  constructor() {
    super();
    this.setupMonitoring();
  }

  public addManager(manager: ConnectionManager): void {
    this.managers.push(manager);
    
    // Set up event listeners for each manager
    manager.on('error', (error) => {
      this.emit('connectionError', { service: manager.getStats().service, error });
    });

    manager.on('circuitBreakerOpen', () => {
      this.emit('circuitBreakerOpen', { service: manager.getStats().service });
    });

    manager.on('maxRetriesReached', (error) => {
      this.emit('criticalConnectionFailure', { service: manager.getStats().service, error });
    });
  }

  private setupMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const healthReport = this.generateHealthReport();
      this.emit('healthReport', healthReport);

      // Log critical issues
      const criticalIssues = healthReport.services.filter(
        service => service.state === ConnectionState.ERROR || service.isCircuitOpen
      );

      if (criticalIssues.length > 0) {
        logger.error('Critical connection issues detected:', criticalIssues);
        this.emit('criticalIssuesDetected', criticalIssues);
      }
    }, 60000); // Monitor every minute
  }

  public generateHealthReport() {
    const services = this.managers.map(manager => manager.getStats());
    const totalServices = services.length;
    const connectedServices = services.filter(s => s.state === ConnectionState.CONNECTED).length;
    const failedServices = services.filter(s => s.state === ConnectionState.ERROR).length;
    const overallHealth = connectedServices / totalServices;

    return {
      timestamp: new Date().toISOString(),
      overallHealth,
      totalServices,
      connectedServices,
      failedServices,
      services
    };
  }

  public destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.removeAllListeners();
  }
}