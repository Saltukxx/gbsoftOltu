import { Request } from 'express';
import { logger } from '@/services/logger';
import prisma from '@/db';

export enum SecurityEventType {
  // Authentication Events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGIN_BLOCKED = 'LOGIN_BLOCKED',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  LOGOUT = 'LOGOUT',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Authorization Events
  ACCESS_DENIED = 'ACCESS_DENIED',
  PRIVILEGE_ESCALATION_ATTEMPT = 'PRIVILEGE_ESCALATION_ATTEMPT',
  UNAUTHORIZED_API_ACCESS = 'UNAUTHORIZED_API_ACCESS',
  
  // Data Access Events
  SENSITIVE_DATA_ACCESS = 'SENSITIVE_DATA_ACCESS',
  EMPLOYEE_DATA_ACCESS = 'EMPLOYEE_DATA_ACCESS',
  SHIFT_DATA_MODIFIED = 'SHIFT_DATA_MODIFIED',
  USER_DATA_EXPORTED = 'USER_DATA_EXPORTED',
  
  // Security Events
  CSRF_ATTACK_BLOCKED = 'CSRF_ATTACK_BLOCKED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_FILE_ACCESS = 'SUSPICIOUS_FILE_ACCESS',
  DIRECTORY_TRAVERSAL_BLOCKED = 'DIRECTORY_TRAVERSAL_BLOCKED',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  
  // System Events
  MQTT_UNAUTHORIZED_ACCESS = 'MQTT_UNAUTHORIZED_ACCESS',
  WEBSOCKET_CONNECTION_FAILED = 'WEBSOCKET_CONNECTION_FAILED',
  API_KEY_INVALID = 'API_KEY_INVALID',
  DATABASE_ERROR = 'DATABASE_ERROR',
  
  // Admin Events
  USER_CREATED = 'USER_CREATED',
  USER_MODIFIED = 'USER_MODIFIED',
  USER_DELETED = 'USER_DELETED',
  ROLE_CHANGED = 'ROLE_CHANGED',
  SYSTEM_CONFIG_CHANGED = 'SYSTEM_CONFIG_CHANGED'
}

export enum SecurityEventSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface SecurityEventData {
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  details?: Record<string, any>;
  request?: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Record<string, any>;
  };
}

class SecurityAuditService {
  /**
   * Log a security event with comprehensive details
   */
  async logSecurityEvent(eventData: SecurityEventData, req?: Request): Promise<void> {
    try {
      // Enhance event data with request information if available
      if (req && !eventData.request) {
        eventData.ipAddress = eventData.ipAddress || this.getClientIP(req);
        eventData.userAgent = eventData.userAgent || req.headers['user-agent'];
        eventData.request = {
          method: req.method,
          path: req.path,
          headers: this.sanitizeHeaders(req.headers as Record<string, string>),
          body: this.sanitizeBody(req.body)
        };
      }

      // Log to application logger with structured data
      const logLevel = this.getLogLevel(eventData.severity);
      logger[logLevel]('Security Event', {
        event: eventData.type,
        severity: eventData.severity,
        userId: eventData.userId,
        userEmail: eventData.userEmail,
        userRole: eventData.userRole,
        ipAddress: eventData.ipAddress,
        userAgent: eventData.userAgent,
        resource: eventData.resource,
        action: eventData.action,
        details: eventData.details,
        request: eventData.request,
        timestamp: new Date().toISOString(),
      });

      // Store critical events in database for audit trail
      if (this.shouldPersistEvent(eventData.type, eventData.severity)) {
        await this.persistSecurityEvent(eventData);
      }

      // Send alerts for critical security events
      if (eventData.severity === SecurityEventSeverity.CRITICAL) {
        await this.sendSecurityAlert(eventData);
      }

    } catch (error) {
      // Never let audit logging break the application
      logger.error('Failed to log security event', { error, eventData: eventData.type });
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    type: SecurityEventType,
    userId?: string,
    userEmail?: string,
    req?: Request,
    details?: Record<string, any>
  ): Promise<void> {
    const severity = type.includes('FAILED') || type.includes('BLOCKED') 
      ? SecurityEventSeverity.HIGH 
      : SecurityEventSeverity.MEDIUM;

    await this.logSecurityEvent({
      type,
      severity,
      userId,
      userEmail,
      details
    }, req);
  }

  /**
   * Log authorization failures
   */
  async logAuthorizationFailure(
    userId: string,
    userRole: string,
    resource: string,
    action: string,
    req?: Request
  ): Promise<void> {
    await this.logSecurityEvent({
      type: SecurityEventType.ACCESS_DENIED,
      severity: SecurityEventSeverity.HIGH,
      userId,
      userRole,
      resource,
      action,
      details: {
        attemptedResource: resource,
        attemptedAction: action,
        userRole
      }
    }, req);
  }

  /**
   * Log sensitive data access
   */
  async logDataAccess(
    type: SecurityEventType,
    userId: string,
    resource: string,
    details: Record<string, any>,
    req?: Request
  ): Promise<void> {
    await this.logSecurityEvent({
      type,
      severity: SecurityEventSeverity.MEDIUM,
      userId,
      resource,
      action: 'READ',
      details
    }, req);
  }

  /**
   * Log security attacks/violations
   */
  async logSecurityViolation(
    type: SecurityEventType,
    details: Record<string, any>,
    req?: Request
  ): Promise<void> {
    await this.logSecurityEvent({
      type,
      severity: SecurityEventSeverity.HIGH,
      details
    }, req);
  }

  /**
   * Log admin actions
   */
  async logAdminAction(
    type: SecurityEventType,
    adminUserId: string,
    targetResource: string,
    details: Record<string, any>,
    req?: Request
  ): Promise<void> {
    await this.logSecurityEvent({
      type,
      severity: SecurityEventSeverity.HIGH,
      userId: adminUserId,
      resource: targetResource,
      action: 'ADMIN_ACTION',
      details
    }, req);
  }

  private getClientIP(req: Request): string {
    return (
      req.headers['x-real-ip'] as string ||
      req.headers['x-forwarded-for'] as string ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    const sanitized: Record<string, string> = {};
    
    Object.entries(headers).forEach(([key, value]) => {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;
    
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'csrf'];
    const sanitized = { ...body };
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  private getLogLevel(severity: SecurityEventSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case SecurityEventSeverity.LOW:
        return 'info';
      case SecurityEventSeverity.MEDIUM:
        return 'info';
      case SecurityEventSeverity.HIGH:
        return 'warn';
      case SecurityEventSeverity.CRITICAL:
        return 'error';
      default:
        return 'info';
    }
  }

  private shouldPersistEvent(type: SecurityEventType, severity: SecurityEventSeverity): boolean {
    // Always persist high and critical events
    if (severity === SecurityEventSeverity.HIGH || severity === SecurityEventSeverity.CRITICAL) {
      return true;
    }
    
    // Persist specific authentication events regardless of severity
    const alwaysPersist = [
      SecurityEventType.LOGIN_SUCCESS,
      SecurityEventType.LOGIN_FAILED,
      SecurityEventType.LOGOUT,
      SecurityEventType.ROLE_CHANGED,
      SecurityEventType.USER_MODIFIED,
      SecurityEventType.USER_CREATED,
      SecurityEventType.USER_DELETED
    ];
    
    return alwaysPersist.includes(type);
  }

  private async persistSecurityEvent(eventData: SecurityEventData): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: eventData.userId || null,
          action: eventData.type,
          resource: eventData.resource || 'SECURITY_EVENT',
          details: {
            severity: eventData.severity,
            userEmail: eventData.userEmail,
            userRole: eventData.userRole,
            actionDetails: eventData.action,
            eventDetails: eventData.details,
            request: eventData.request
          },
          ipAddress: eventData.ipAddress,
          userAgent: eventData.userAgent
        }
      });
    } catch (error) {
      logger.error('Failed to persist security event to database', { error, eventType: eventData.type });
    }
  }

  private async sendSecurityAlert(eventData: SecurityEventData): Promise<void> {
    // In a production environment, this would send alerts to:
    // - Security team via email/Slack
    // - SIEM system
    // - Monitoring dashboard
    
    logger.error('CRITICAL SECURITY ALERT', {
      event: eventData.type,
      severity: eventData.severity,
      userId: eventData.userId,
      ipAddress: eventData.ipAddress,
      details: eventData.details,
      timestamp: new Date().toISOString()
    });

    // TODO: Implement actual alerting mechanism
    // - Email notifications
    // - Webhook to security monitoring system
    // - Push notification to security team
  }
}

// Export singleton instance
export const securityAudit = new SecurityAuditService();