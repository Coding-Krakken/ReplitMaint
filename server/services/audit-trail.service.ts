import { storage } from '../storage';
import crypto from 'crypto';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId?: string;
  warehouseId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: Record<string, any>;
  metadata: {
    ipAddress: string;
    userAgent: string;
    requestId?: string;
    duration?: number;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'authentication' | 'authorization' | 'data_access' | 'data_modification' | 'system' | 'security' | 'compliance';
  success: boolean;
  errorMessage?: string;
}

export interface ComplianceReport {
  id: string;
  reportType: 'sox' | 'iso27001' | 'gdpr' | 'hipaa' | 'custom';
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalEvents: number;
    criticalEvents: number;
    failedAttempts: number;
    dataAccessEvents: number;
    complianceScore: number;
  };
  findings: ComplianceFinding[];
  recommendations: string[];
}

export interface ComplianceFinding {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  count: number;
  impact: string;
  remediation: string;
  events: string[]; // Event IDs
}

export interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  warehouseId?: string;
  action?: string;
  entityType?: string;
  category?: string;
  severity?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

class AuditTrailService {
  private static instance: AuditTrailService;
  private auditEvents: Map<string, AuditEvent> = new Map();
  private eventQueue: AuditEvent[] = [];
  private processingQueue = false;

  public static getInstance(): AuditTrailService {
    if (!AuditTrailService.instance) {
      AuditTrailService.instance = new AuditTrailService();
    }
    return AuditTrailService.instance;
  }

  // Log audit events
  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date()
    };

    // Store in memory cache
    this.auditEvents.set(auditEvent.id, auditEvent);

    // Queue for batch processing
    this.eventQueue.push(auditEvent);
    this.processEventQueue();

    console.log(`Audit event logged: ${auditEvent.action} by user ${auditEvent.userId}`);
  }

  // Authentication events
  async logAuthentication(
    userId: string, 
    action: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'mfa_setup',
    success: boolean,
    metadata: AuditEvent['metadata'],
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: `auth_${action}`,
      entityType: 'user',
      entityId: userId,
      details: {
        ...details,
        timestamp: new Date().toISOString()
      },
      metadata,
      severity: success ? 'low' : 'medium',
      category: 'authentication',
      success
    });
  }

  // Data access events
  async logDataAccess(
    userId: string,
    entityType: string,
    entityId: string,
    action: 'view' | 'search' | 'export' | 'download',
    metadata: AuditEvent['metadata'],
    warehouseId?: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.logEvent({
      userId,
      warehouseId,
      action: `data_${action}`,
      entityType,
      entityId,
      details,
      metadata,
      severity: entityType === 'sensitive_data' ? 'high' : 'low',
      category: 'data_access',
      success: true
    });
  }

  // Data modification events
  async logDataModification(
    userId: string,
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete',
    changes: Record<string, any>,
    metadata: AuditEvent['metadata'],
    warehouseId?: string,
    success = true
  ): Promise<void> {
    await this.logEvent({
      userId,
      warehouseId,
      action: `data_${action}`,
      entityType,
      entityId,
      details: {
        changes,
        timestamp: new Date().toISOString()
      },
      metadata,
      severity: action === 'delete' ? 'high' : 'medium',
      category: 'data_modification',
      success
    });
  }

  // System events
  async logSystemEvent(
    userId: string,
    action: string,
    details: Record<string, any>,
    metadata: AuditEvent['metadata'],
    severity: AuditEvent['severity'] = 'medium',
    success = true
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: `system_${action}`,
      entityType: 'system',
      details,
      metadata,
      severity,
      category: 'system',
      success
    });
  }

  // Security events
  async logSecurityEvent(
    userId: string,
    action: string,
    details: Record<string, any>,
    metadata: AuditEvent['metadata'],
    severity: AuditEvent['severity'] = 'high',
    success = false
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: `security_${action}`,
      entityType: 'security',
      details,
      metadata,
      severity,
      category: 'security',
      success,
      errorMessage: success ? undefined : details.error
    });
  }

  // Query audit events
  async queryEvents(query: AuditQuery): Promise<{ events: AuditEvent[]; total: number }> {
    try {
      let events = Array.from(this.auditEvents.values());

      // Apply filters
      if (query.startDate) {
        events = events.filter(e => e.timestamp >= query.startDate!);
      }
      if (query.endDate) {
        events = events.filter(e => e.timestamp <= query.endDate!);
      }
      if (query.userId) {
        events = events.filter(e => e.userId === query.userId);
      }
      if (query.warehouseId) {
        events = events.filter(e => e.warehouseId === query.warehouseId);
      }
      if (query.action) {
        events = events.filter(e => e.action.includes(query.action!));
      }
      if (query.entityType) {
        events = events.filter(e => e.entityType === query.entityType);
      }
      if (query.category) {
        events = events.filter(e => e.category === query.category);
      }
      if (query.severity) {
        events = events.filter(e => e.severity === query.severity);
      }
      if (query.success !== undefined) {
        events = events.filter(e => e.success === query.success);
      }

      // Sort by timestamp (newest first)
      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const total = events.length;
      
      // Apply pagination
      if (query.offset) {
        events = events.slice(query.offset);
      }
      if (query.limit) {
        events = events.slice(0, query.limit);
      }

      return { events, total };

    } catch (error) {
      console.error('Error querying audit events:', error);
      throw error;
    }
  }

  // Generate compliance report
  async generateComplianceReport(
    reportType: ComplianceReport['reportType'],
    startDate: Date,
    endDate: Date,
    warehouseId?: string
  ): Promise<ComplianceReport> {
    try {
      const { events } = await this.queryEvents({
        startDate,
        endDate,
        warehouseId
      });

      const totalEvents = events.length;
      const criticalEvents = events.filter(e => e.severity === 'critical').length;
      const failedAttempts = events.filter(e => !e.success).length;
      const dataAccessEvents = events.filter(e => e.category === 'data_access').length;

      // Calculate compliance score
      const complianceScore = this.calculateComplianceScore(events, reportType);

      // Generate findings
      const findings = this.generateComplianceFindings(events, reportType);

      // Generate recommendations
      const recommendations = this.generateComplianceRecommendations(findings, reportType);

      return {
        id: crypto.randomUUID(),
        reportType,
        generatedAt: new Date(),
        period: { start: startDate, end: endDate },
        summary: {
          totalEvents,
          criticalEvents,
          failedAttempts,
          dataAccessEvents,
          complianceScore
        },
        findings,
        recommendations
      };

    } catch (error) {
      console.error('Error generating compliance report:', error);
      throw error;
    }
  }

  // Get audit statistics
  async getAuditStatistics(startDate?: Date, endDate?: Date, warehouseId?: string): Promise<{
    totalEvents: number;
    eventsByCategory: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    failedEvents: number;
    topUsers: Array<{ userId: string; eventCount: number }>;
    recentEvents: AuditEvent[];
  }> {
    try {
      const { events } = await this.queryEvents({ startDate, endDate, warehouseId });

      const eventsByCategory = events.reduce((acc, event) => {
        acc[event.category] = (acc[event.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const eventsBySeverity = events.reduce((acc, event) => {
        acc[event.severity] = (acc[event.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const failedEvents = events.filter(e => !e.success).length;

      // Top users by event count
      const userEventCounts = events.reduce((acc, event) => {
        acc[event.userId] = (acc[event.userId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topUsers = Object.entries(userEventCounts)
        .map(([userId, eventCount]) => ({ userId, eventCount }))
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, 10);

      const recentEvents = events.slice(0, 20);

      return {
        totalEvents: events.length,
        eventsByCategory,
        eventsBySeverity,
        failedEvents,
        topUsers,
        recentEvents
      };

    } catch (error) {
      console.error('Error getting audit statistics:', error);
      throw error;
    }
  }

  // Private helper methods

  private async processEventQueue(): Promise<void> {
    if (this.processingQueue || this.eventQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    try {
      const batch = this.eventQueue.splice(0, 100); // Process in batches of 100
      
      // In a production system, you would batch write to a database here
      console.log(`Processing ${batch.length} audit events`);

      // Simulate database write delay
      await new Promise(resolve => setTimeout(resolve, 10));

    } catch (error) {
      console.error('Error processing audit event queue:', error);
    } finally {
      this.processingQueue = false;
      
      // Process next batch if there are more events
      if (this.eventQueue.length > 0) {
        setTimeout(() => this.processEventQueue(), 1000);
      }
    }
  }

  private calculateComplianceScore(events: AuditEvent[], reportType: string): number {
    // Simplified compliance scoring - in production this would be more sophisticated
    let score = 100;

    const failedAuthAttempts = events.filter(e => 
      e.category === 'authentication' && !e.success
    ).length;
    
    const criticalEvents = events.filter(e => e.severity === 'critical').length;
    const unauthorizedAccess = events.filter(e => 
      e.category === 'security' && !e.success
    ).length;

    // Deduct points for compliance issues
    score -= Math.min(30, failedAuthAttempts * 2);
    score -= Math.min(40, criticalEvents * 5);
    score -= Math.min(30, unauthorizedAccess * 3);

    return Math.max(0, Math.min(100, score));
  }

  private generateComplianceFindings(events: AuditEvent[], reportType: string): ComplianceFinding[] {
    const findings: ComplianceFinding[] = [];

    // Failed authentication attempts
    const failedAuth = events.filter(e => 
      e.category === 'authentication' && !e.success
    );
    
    if (failedAuth.length > 0) {
      findings.push({
        id: crypto.randomUUID(),
        severity: failedAuth.length > 10 ? 'high' : 'medium',
        category: 'Authentication Security',
        description: `${failedAuth.length} failed authentication attempts detected`,
        count: failedAuth.length,
        impact: 'Potential unauthorized access attempts',
        remediation: 'Review failed login attempts and consider implementing account lockout policies',
        events: failedAuth.map(e => e.id)
      });
    }

    // Critical security events
    const criticalSecurity = events.filter(e => 
      e.category === 'security' && e.severity === 'critical'
    );
    
    if (criticalSecurity.length > 0) {
      findings.push({
        id: crypto.randomUUID(),
        severity: 'critical',
        category: 'Security Incidents',
        description: `${criticalSecurity.length} critical security events recorded`,
        count: criticalSecurity.length,
        impact: 'High-risk security incidents that require immediate attention',
        remediation: 'Investigate all critical security events and implement corrective measures',
        events: criticalSecurity.map(e => e.id)
      });
    }

    // Excessive privileged access
    const privilegedAccess = events.filter(e => 
      e.category === 'data_access' && e.details?.privileged === true
    );
    
    if (privilegedAccess.length > 100) {
      findings.push({
        id: crypto.randomUUID(),
        severity: 'medium',
        category: 'Access Control',
        description: `${privilegedAccess.length} privileged access events`,
        count: privilegedAccess.length,
        impact: 'High volume of privileged access may indicate over-privileged accounts',
        remediation: 'Review privileged access patterns and implement least privilege principle',
        events: privilegedAccess.slice(0, 10).map(e => e.id) // Sample events
      });
    }

    return findings;
  }

  private generateComplianceRecommendations(findings: ComplianceFinding[], reportType: string): string[] {
    const recommendations: string[] = [];

    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const highFindings = findings.filter(f => f.severity === 'high');

    if (criticalFindings.length > 0) {
      recommendations.push('Immediate action required: Address all critical security findings within 24 hours');
    }

    if (highFindings.length > 0) {
      recommendations.push('High priority: Investigate and remediate high-severity findings within one week');
    }

    recommendations.push('Implement automated monitoring for failed authentication attempts');
    recommendations.push('Regular review of user access permissions and roles');
    recommendations.push('Establish incident response procedures for security events');
    recommendations.push('Consider implementing additional security controls based on findings');

    if (reportType === 'gdpr') {
      recommendations.push('Ensure data processing activities are properly documented');
      recommendations.push('Review data retention policies and implementation');
    }

    if (reportType === 'sox') {
      recommendations.push('Maintain segregation of duties in financial processes');
      recommendations.push('Implement change management controls for critical systems');
    }

    return recommendations;
  }
}

export const auditTrailService = AuditTrailService.getInstance();