import type { Express } from "express";
import { auditTrailService } from "../services/audit-trail.service";

export function registerAuditRoutes(app: Express, authenticateRequest: any, requireRole: any): void {
  // Query audit events
  app.get("/api/audit/events", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        userId,
        action,
        entityType,
        category,
        severity,
        success,
        limit = 50,
        offset = 0
      } = req.query;

      const query = {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        userId: userId as string,
        warehouseId: (req as any).user?.warehouseId,
        action: action as string,
        entityType: entityType as string,
        category: category as string,
        severity: severity as string,
        success: success !== undefined ? success === 'true' : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      const result = await auditTrailService.queryEvents(query);
      res.json(result);
    } catch (error) {
      console.error('Query audit events error:', error);
      res.status(500).json({ message: "Failed to query audit events" });
    }
  });

  // Get audit statistics
  app.get("/api/audit/statistics", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const user = (req as any).user;

      const stats = await auditTrailService.getAuditStatistics(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined,
        user.warehouseId
      );

      res.json(stats);
    } catch (error) {
      console.error('Get audit statistics error:', error);
      res.status(500).json({ message: "Failed to get audit statistics" });
    }
  });

  // Generate compliance report
  app.post("/api/audit/compliance-report", authenticateRequest, requireRole('admin'), async (req, res) => {
    try {
      const { reportType, startDate, endDate } = req.body;
      const user = (req as any).user;

      if (!reportType || !startDate || !endDate) {
        return res.status(400).json({ 
          message: "reportType, startDate, and endDate are required" 
        });
      }

      const validReportTypes = ['sox', 'iso27001', 'gdpr', 'hipaa', 'custom'];
      if (!validReportTypes.includes(reportType)) {
        return res.status(400).json({ 
          message: `Invalid report type. Must be one of: ${validReportTypes.join(', ')}` 
        });
      }

      const report = await auditTrailService.generateComplianceReport(
        reportType,
        new Date(startDate),
        new Date(endDate),
        user.warehouseId
      );

      res.json(report);
    } catch (error) {
      console.error('Generate compliance report error:', error);
      res.status(500).json({ message: "Failed to generate compliance report" });
    }
  });

  // Get audit event by ID
  app.get("/api/audit/events/:id", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { id } = req.params;
      const { events } = await auditTrailService.queryEvents({ limit: 1000 });
      const event = events.find(e => e.id === id);

      if (!event) {
        return res.status(404).json({ message: "Audit event not found" });
      }

      res.json(event);
    } catch (error) {
      console.error('Get audit event error:', error);
      res.status(500).json({ message: "Failed to get audit event" });
    }
  });

  // Export audit data (for compliance purposes)
  app.get("/api/audit/export", authenticateRequest, requireRole('admin'), async (req, res) => {
    try {
      const { startDate, endDate, format = 'json' } = req.query;
      const user = (req as any).user;

      const query = {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        warehouseId: user.warehouseId,
        limit: 10000 // Large limit for export
      };

      const { events } = await auditTrailService.queryEvents(query);

      if (format === 'csv') {
        // Convert to CSV format
        const csvHeaders = [
          'Timestamp', 'User ID', 'Action', 'Entity Type', 'Entity ID', 
          'Category', 'Severity', 'Success', 'IP Address', 'User Agent'
        ].join(',');

        const csvData = events.map(event => [
          event.timestamp.toISOString(),
          event.userId,
          event.action,
          event.entityType,
          event.entityId || '',
          event.category,
          event.severity,
          event.success,
          event.metadata.ipAddress,
          `"${event.metadata.userAgent}"`
        ].join(',')).join('\n');

        const csvContent = `${csvHeaders}\n${csvData}`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit-export-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
      } else {
        // JSON format
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit-export-${new Date().toISOString().split('T')[0]}.json"`);
        res.json({
          exportDate: new Date().toISOString(),
          period: query,
          totalEvents: events.length,
          events
        });
      }
    } catch (error) {
      console.error('Export audit data error:', error);
      res.status(500).json({ message: "Failed to export audit data" });
    }
  });

  // Get compliance dashboard data
  app.get("/api/audit/compliance-dashboard", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const user = (req as any).user;
      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const [stats, recentEvents] = await Promise.all([
        auditTrailService.getAuditStatistics(last30Days, new Date(), user.warehouseId),
        auditTrailService.queryEvents({ 
          startDate: last30Days, 
          warehouseId: user.warehouseId,
          limit: 10,
          success: false 
        })
      ]);

      const complianceData = {
        summary: {
          totalEvents: stats.totalEvents,
          failedEvents: stats.failedEvents,
          securityIncidents: stats.eventsByCategory.security || 0,
          dataAccessEvents: stats.eventsByCategory.data_access || 0,
          complianceScore: Math.max(0, 100 - (stats.failedEvents * 2))
        },
        eventsByCategory: stats.eventsByCategory,
        eventsBySeverity: stats.eventsBySeverity,
        topUsers: stats.topUsers,
        recentFailures: recentEvents.events,
        trends: {
          // Simplified trend calculation - in production would use historical data
          authenticationFailures: stats.eventsByCategory.authentication || 0,
          securityEvents: stats.eventsByCategory.security || 0,
          dataModifications: stats.eventsByCategory.data_modification || 0
        },
        recommendations: [
          stats.failedEvents > 50 ? 'High number of failed events detected - review security policies' : null,
          stats.eventsByCategory.security > 10 ? 'Multiple security events - investigate potential threats' : null,
          stats.eventsByCategory.authentication > 100 ? 'Consider implementing stronger authentication controls' : null
        ].filter(Boolean)
      };

      res.json(complianceData);
    } catch (error) {
      console.error('Compliance dashboard error:', error);
      res.status(500).json({ message: "Failed to get compliance dashboard data" });
    }
  });

  // Manual audit event logging (for testing or special cases)
  app.post("/api/audit/log-event", authenticateRequest, requireRole('admin'), async (req, res) => {
    try {
      const {
        action,
        entityType,
        entityId,
        details,
        severity = 'medium',
        category = 'system',
        success = true
      } = req.body;

      const user = (req as any).user;
      const metadata = {
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.headers['user-agent'] || 'Unknown',
        requestId: req.headers['x-request-id'] as string
      };

      await auditTrailService.logEvent({
        userId: user.id,
        sessionId: user.sessionId,
        warehouseId: user.warehouseId,
        action,
        entityType,
        entityId,
        details,
        metadata,
        severity,
        category,
        success
      });

      res.json({ message: "Audit event logged successfully" });
    } catch (error) {
      console.error('Manual log event error:', error);
      res.status(500).json({ message: "Failed to log audit event" });
    }
  });
}