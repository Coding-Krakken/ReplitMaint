import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertLaborTimeSchema, profiles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { db } from "../db";

const authenticateRequest = (req: any, res: any, next: any) => {
  // Basic authentication check - replace with actual auth logic
  const user = req.headers['x-user-id'];
  if (!user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  req.user = { id: user };
  next();
};

const getCurrentUser = (req: any): string => {
  return req.user?.id || req.headers['x-user-id'] || 'anonymous';
};

export function registerLaborTimeRoutes(app: Express) {
  // Get labor time entries for a work order
  app.get("/api/work-orders/:id/labor-time", async (req, res) => {
    try {
      const workOrderId = req.params.id;
      const laborEntries = await storage.getLaborTime(workOrderId);
      
      // Enrich with user names
      const enrichedEntries = await Promise.all(
        laborEntries.map(async (entry) => {
          const user = await storage.getProfile(entry.userId);
          return {
            ...entry,
            userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown User'
          };
        })
      );
      
      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error fetching labor time:', error);
      res.status(500).json({ message: "Failed to fetch labor time" });
    }
  });

  // Start time tracking
  app.post("/api/work-orders/:id/labor-time/start", authenticateRequest, async (req, res) => {
    try {
      const workOrderId = req.params.id;
      const userId = getCurrentUser(req);
      
      // Check if user already has active time tracking
      const activeSession = await storage.getActiveLaborTime(userId);
      if (activeSession) {
        return res.status(400).json({ 
          message: "You already have an active time tracking session",
          activeSession: {
            workOrderId: activeSession.workOrderId,
            startTime: activeSession.startTime,
            description: activeSession.description
          }
        });
      }
      
      const laborTime = await storage.createLaborTime({
        workOrderId,
        userId,
        startTime: new Date(),
        description: req.body.description || 'Work in progress',
        isActive: true,
        isManual: false
      } as any);
      
      res.status(201).json(laborTime);
    } catch (error) {
      console.error('Error starting time tracking:', error);
      res.status(500).json({ message: "Failed to start time tracking" });
    }
  });

  // Stop time tracking
  app.post("/api/work-orders/:id/labor-time/stop", authenticateRequest, async (req, res) => {
    try {
      const workOrderId = req.params.id;
      const userId = getCurrentUser(req);
      
      // Find active session for this user and work order
      const activeSession = await storage.getActiveLaborTime(userId);
      if (!activeSession || activeSession.workOrderId !== workOrderId) {
        return res.status(400).json({ 
          message: "No active time tracking session found for this work order" 
        });
      }
      
      const endTime = new Date();
      const durationMinutes = req.body.duration || 
        Math.floor((endTime.getTime() - activeSession.startTime.getTime()) / 1000 / 60);
      
      // Update the session
      const updatedLaborTime = await storage.updateLaborTime(activeSession.id, {
        endTime,
        duration: durationMinutes,
        isActive: false,
        description: req.body.description || activeSession.description
      } as any);
      
      res.json(updatedLaborTime);
    } catch (error) {
      console.error('Error stopping time tracking:', error);
      res.status(500).json({ message: "Failed to stop time tracking" });
    }
  });

  // Add manual labor time entry
  app.post("/api/work-orders/:id/labor-time", authenticateRequest, async (req, res) => {
    try {
      const workOrderId = req.params.id;
      const userId = getCurrentUser(req);
      
      const laborTimeData = {
        workOrderId,
        userId,
        startTime: new Date(), // For manual entries, this is just a timestamp
        duration: req.body.duration,
        description: req.body.description,
        isActive: false,
        isManual: true
      };
      
      // Validate the data
      const validatedData = insertLaborTimeSchema.parse(laborTimeData);
      
      const laborTime = await storage.createLaborTime(validatedData as any);
      
      res.status(201).json(laborTime);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      console.error('Error creating labor time:', error);
      res.status(500).json({ message: "Failed to create labor time entry" });
    }
  });

  // Delete labor time entry
  app.delete("/api/work-orders/:workOrderId/labor-time/:id", authenticateRequest, async (req, res) => {
    try {
      const { workOrderId, id } = req.params;
      const userId = getCurrentUser(req);
      
      // Get the labor entry to verify ownership
      const laborEntry = await storage.getLaborTimeById(id);
      if (!laborEntry) {
        return res.status(404).json({ message: "Labor time entry not found" });
      }
      
      if (laborEntry.userId !== userId) {
        return res.status(403).json({ message: "You can only delete your own labor time entries" });
      }
      
      if (laborEntry.workOrderId !== workOrderId) {
        return res.status(400).json({ message: "Labor time entry does not belong to this work order" });
      }
      
      await storage.deleteLaborTime(id);
      
      res.json({ message: "Labor time entry deleted successfully" });
    } catch (error) {
      console.error('Error deleting labor time:', error);
      res.status(500).json({ message: "Failed to delete labor time entry" });
    }
  });

  // Get labor time summary for a work order
  app.get("/api/work-orders/:id/labor-time/summary", async (req, res) => {
    try {
      const workOrderId = req.params.id;
      const laborEntries = await storage.getLaborTime(workOrderId);
      
      const summary = {
        totalEntries: laborEntries.length,
        totalMinutes: laborEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0),
        totalHours: 0,
        activeEntries: laborEntries.filter(entry => entry.isActive).length,
        userBreakdown: {} as Record<string, { minutes: number; entries: number; name: string }>
      };
      
      summary.totalHours = Math.round((summary.totalMinutes / 60) * 100) / 100;
      
      // Build user breakdown
      for (const entry of laborEntries) {
        if (!summary.userBreakdown[entry.userId]) {
          const user = await storage.getProfile(entry.userId);
          summary.userBreakdown[entry.userId] = {
            minutes: 0,
            entries: 0,
            name: user ? `${user.firstName} ${user.lastName}` : 'Unknown User'
          };
        }
        
        summary.userBreakdown[entry.userId].minutes += entry.duration || 0;
        summary.userBreakdown[entry.userId].entries += 1;
      }
      
      res.json(summary);
    } catch (error) {
      console.error('Error generating labor time summary:', error);
      res.status(500).json({ message: "Failed to generate labor time summary" });
    }
  });

  // Get active time tracking status for current user
  app.get("/api/labor-time/active", authenticateRequest, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      const activeSession = await storage.getActiveLaborTime(userId);
      
      if (!activeSession) {
        return res.json({ active: false });
      }
      
      const workOrder = await storage.getWorkOrder(activeSession.workOrderId);
      
      res.json({
        active: true,
        session: {
          ...activeSession,
          workOrder: workOrder ? {
            id: workOrder.id,
            foNumber: workOrder.foNumber,
            description: workOrder.description
          } : null
        }
      });
    } catch (error) {
      console.error('Error checking active labor time:', error);
      res.status(500).json({ message: "Failed to check active labor time" });
    }
  });
}