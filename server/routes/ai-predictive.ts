import type { Express } from "express";
import { aiPredictiveService } from "../services/ai-predictive.service";

export function registerAIPredictiveRoutes(app: Express, authenticateRequest: any, requireRole: any): void {
  // Get equipment health score
  app.get("/api/ai/equipment/:id/health-score", authenticateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const warehouseId = user.warehouseId;
      
      const healthScore = await aiPredictiveService.calculateHealthScore(id, warehouseId);
      res.json(healthScore);
    } catch (error) {
      console.error('Get health score error:', error);
      res.status(500).json({ message: "Failed to calculate equipment health score" });
    }
  });

  // Get failure prediction for equipment
  app.get("/api/ai/equipment/:id/failure-prediction", authenticateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const warehouseId = user.warehouseId;
      
      const prediction = await aiPredictiveService.predictFailure(id, warehouseId);
      res.json(prediction);
    } catch (error) {
      console.error('Get failure prediction error:', error);
      res.status(500).json({ message: "Failed to predict equipment failure" });
    }
  });

  // Get maintenance strategy optimization
  app.get("/api/ai/equipment/:id/optimization", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const warehouseId = user.warehouseId;
      
      const optimization = await aiPredictiveService.optimizeMaintenanceStrategy(id, warehouseId);
      res.json(optimization);
    } catch (error) {
      console.error('Get optimization error:', error);
      res.status(500).json({ message: "Failed to optimize maintenance strategy" });
    }
  });

  // Get performance trends for equipment
  app.get("/api/ai/equipment/:id/trends", authenticateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const warehouseId = user.warehouseId;
      const months = parseInt(req.query.months as string) || 12;
      
      const trends = await aiPredictiveService.analyzePerformanceTrends(id, warehouseId, months);
      res.json(trends);
    } catch (error) {
      console.error('Get performance trends error:', error);
      res.status(500).json({ message: "Failed to analyze performance trends" });
    }
  });

  // Bulk health score analysis for multiple equipment
  app.post("/api/ai/equipment/bulk-health-analysis", authenticateRequest, async (req, res) => {
    try {
      const { equipmentIds } = req.body;
      const user = (req as any).user;
      const warehouseId = user.warehouseId;
      
      if (!Array.isArray(equipmentIds)) {
        return res.status(400).json({ message: "equipmentIds must be an array" });
      }

      const healthScores = await Promise.all(
        equipmentIds.map(async (id: string) => {
          try {
            return await aiPredictiveService.calculateHealthScore(id, warehouseId);
          } catch (error) {
            console.error(`Error calculating health score for equipment ${id}:`, error);
            return null;
          }
        })
      );

      // Filter out failed calculations
      const validHealthScores = healthScores.filter(score => score !== null);
      
      res.json(validHealthScores);
    } catch (error) {
      console.error('Bulk health analysis error:', error);
      res.status(500).json({ message: "Failed to perform bulk health analysis" });
    }
  });

  // Get predictive maintenance dashboard data
  app.get("/api/ai/dashboard", authenticateRequest, async (req, res) => {
    try {
      const user = (req as any).user;
      const warehouseId = user.warehouseId;
      
      // Get all equipment for the warehouse
      const { storage } = await import('../storage');
      const equipment = await storage.getEquipment(warehouseId);
      
      // Calculate health scores for all equipment
      const healthPromises = equipment.map(async (equip) => {
        try {
          const healthScore = await aiPredictiveService.calculateHealthScore(equip.id, warehouseId);
          return {
            equipmentId: equip.id,
            assetTag: equip.assetTag,
            description: equip.description || equip.model,
            ...healthScore
          };
        } catch (error) {
          return null;
        }
      });

      const healthScores = (await Promise.all(healthPromises)).filter(Boolean);

      // Calculate failure predictions for critical equipment
      const criticalEquipment = equipment.filter(e => e.criticality === 'high');
      const predictionPromises = criticalEquipment.slice(0, 10).map(async (equip) => {
        try {
          return await aiPredictiveService.predictFailure(equip.id, warehouseId);
        } catch (error) {
          return null;
        }
      });

      const failurePredictions = (await Promise.all(predictionPromises)).filter(Boolean);

      // Aggregate dashboard statistics
      const totalEquipment = healthScores.length;
      const healthyEquipment = healthScores.filter(h => h.riskLevel === 'low').length;
      const atRiskEquipment = healthScores.filter(h => h.riskLevel === 'high' || h.riskLevel === 'critical').length;
      const averageHealthScore = healthScores.reduce((sum, h) => sum + h.overallScore, 0) / healthScores.length || 0;
      
      const highRiskPredictions = failurePredictions.filter(p => p.probabilityOfFailure > 70);
      const mediumRiskPredictions = failurePredictions.filter(p => p.probabilityOfFailure > 40 && p.probabilityOfFailure <= 70);

      const dashboardData = {
        summary: {
          totalEquipment,
          healthyEquipment,
          atRiskEquipment,
          averageHealthScore: Math.round(averageHealthScore * 10) / 10,
          predictionsGenerated: failurePredictions.length
        },
        healthScores: healthScores.slice(0, 20), // Top 20 for performance
        failurePredictions: failurePredictions.slice(0, 10), // Top 10 critical predictions
        riskAnalysis: {
          highRisk: highRiskPredictions.length,
          mediumRisk: mediumRiskPredictions.length,
          lowRisk: failurePredictions.length - highRiskPredictions.length - mediumRiskPredictions.length
        },
        recommendations: [
          ...healthScores
            .filter(h => h.riskLevel === 'critical')
            .slice(0, 5)
            .map(h => ({
              type: 'critical_health',
              equipmentId: h.equipmentId,
              assetTag: h.assetTag,
              message: `Critical health score (${h.overallScore}) requires immediate attention`,
              priority: 'urgent'
            })),
          ...highRiskPredictions.slice(0, 3).map(p => ({
            type: 'failure_prediction',
            equipmentId: p.equipmentId,
            assetTag: p.assetTag,
            message: `High failure probability (${Math.round(p.probabilityOfFailure)}%) - ${p.failureType}`,
            priority: 'high'
          }))
        ]
      };

      res.json(dashboardData);
    } catch (error) {
      console.error('AI dashboard error:', error);
      res.status(500).json({ message: "Failed to generate AI dashboard data" });
    }
  });

  // Get equipment maintenance recommendations
  app.get("/api/ai/equipment/:id/recommendations", authenticateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const warehouseId = user.warehouseId;
      
      // Get health score and failure prediction
      const [healthScore, failurePrediction] = await Promise.all([
        aiPredictiveService.calculateHealthScore(id, warehouseId),
        aiPredictiveService.predictFailure(id, warehouseId)
      ]);

      const recommendations = {
        healthRecommendations: healthScore.recommendations,
        predictiveActions: failurePrediction.recommendedActions,
        riskLevel: healthScore.riskLevel,
        failureProbability: failurePrediction.probabilityOfFailure,
        dataQuality: failurePrediction.dataQuality,
        overallScore: healthScore.overallScore,
        lastUpdated: new Date().toISOString()
      };

      res.json(recommendations);
    } catch (error) {
      console.error('Get recommendations error:', error);
      res.status(500).json({ message: "Failed to get equipment recommendations" });
    }
  });

  // Generate predictive maintenance report
  app.get("/api/ai/reports/predictive-maintenance", authenticateRequest, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const user = (req as any).user;
      const warehouseId = user.warehouseId;
      const reportType = req.query.type as string || 'summary';
      
      const { storage } = await import('../storage');
      const equipment = await storage.getEquipment(warehouseId);
      
      let reportData;

      switch (reportType) {
        case 'health-summary':
          const healthScores = await Promise.all(
            equipment.map(async (equip) => {
              try {
                return await aiPredictiveService.calculateHealthScore(equip.id, warehouseId);
              } catch (error) {
                return null;
              }
            })
          );
          
          reportData = {
            reportType: 'Equipment Health Summary',
            generatedAt: new Date().toISOString(),
            totalEquipment: equipment.length,
            healthScores: healthScores.filter(Boolean),
            summary: {
              averageHealth: healthScores.filter(Boolean).reduce((sum, h) => sum + h.overallScore, 0) / healthScores.filter(Boolean).length,
              criticalEquipment: healthScores.filter(h => h?.riskLevel === 'critical').length,
              highRiskEquipment: healthScores.filter(h => h?.riskLevel === 'high').length
            }
          };
          break;

        case 'failure-predictions':
          const predictions = await Promise.all(
            equipment.slice(0, 20).map(async (equip) => {
              try {
                return await aiPredictiveService.predictFailure(equip.id, warehouseId);
              } catch (error) {
                return null;
              }
            })
          );
          
          reportData = {
            reportType: 'Failure Predictions Report',
            generatedAt: new Date().toISOString(),
            predictions: predictions.filter(Boolean),
            summary: {
              highRiskPredictions: predictions.filter(p => p?.probabilityOfFailure > 70).length,
              totalPredictions: predictions.filter(Boolean).length,
              averageConfidence: predictions.filter(Boolean).reduce((sum, p) => sum + p.confidence, 0) / predictions.filter(Boolean).length
            }
          };
          break;

        default:
          reportData = {
            reportType: 'Predictive Maintenance Overview',
            generatedAt: new Date().toISOString(),
            message: 'Available report types: health-summary, failure-predictions'
          };
      }

      res.json(reportData);
    } catch (error) {
      console.error('Generate report error:', error);
      res.status(500).json({ message: "Failed to generate predictive maintenance report" });
    }
  });
}