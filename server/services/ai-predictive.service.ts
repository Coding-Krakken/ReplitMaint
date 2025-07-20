import { storage } from '../storage';

export interface EquipmentHealthScore {
  equipmentId: string;
  assetTag: string;
  overallScore: number;
  availabilityScore: number;
  reliabilityScore: number;
  performanceScore: number;
  maintenanceScore: number;
  lastCalculated: Date;
  trend: 'improving' | 'stable' | 'declining';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface FailurePrediction {
  equipmentId: string;
  assetTag: string;
  probabilityOfFailure: number;
  predictedFailureDate: Date;
  confidence: number;
  failureType: string;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedActions: PredictiveAction[];
  dataQuality: 'poor' | 'fair' | 'good' | 'excellent';
  lastCalculated: Date;
}

export interface PredictiveAction {
  id: string;
  type: 'inspection' | 'maintenance' | 'replacement' | 'monitoring';
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedCost: number;
  timeToComplete: number; // hours
  preventionProbability: number; // percentage
  recommendedDate: Date;
}

export interface MaintenanceOptimization {
  equipmentId: string;
  currentStrategy: 'reactive' | 'preventive' | 'predictive';
  recommendedStrategy: 'reactive' | 'preventive' | 'predictive';
  costSavings: {
    annual: number;
    downtimeReduction: number; // hours
    maintenanceCostReduction: number;
    productionImprovementValue: number;
  };
  implementationPlan: OptimizationStep[];
}

export interface OptimizationStep {
  step: number;
  description: string;
  timeline: string;
  resources: string[];
  cost: number;
  expectedBenefit: string;
}

export interface PerformanceTrend {
  date: string;
  mtbf: number;
  mttr: number;
  availability: number;
  efficiency: number;
  cost: number;
}

class AIPredictiveService {
  private static instance: AIPredictiveService;
  private healthScoreCache: Map<string, EquipmentHealthScore> = new Map();
  private predictionCache: Map<string, FailurePrediction> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  public static getInstance(): AIPredictiveService {
    if (!AIPredictiveService.instance) {
      AIPredictiveService.instance = new AIPredictiveService();
    }
    return AIPredictiveService.instance;
  }

  // Equipment Health Scoring Algorithm
  async calculateHealthScore(equipmentId: string, warehouseId: string): Promise<EquipmentHealthScore> {
    try {
      // Check cache first
      const cached = this.healthScoreCache.get(equipmentId);
      if (cached && Date.now() - cached.lastCalculated.getTime() < this.CACHE_TTL) {
        return cached;
      }

      const equipment = await storage.getEquipment(warehouseId);
      const targetEquipment = equipment.find(e => e.id === equipmentId);
      
      if (!targetEquipment) {
        throw new Error('Equipment not found');
      }

      // Get historical work orders for this equipment
      const workOrders = await storage.getWorkOrders(warehouseId);
      const equipmentWorkOrders = workOrders.filter(wo => wo.equipmentId === equipmentId);

      // Calculate component scores
      const availabilityScore = await this.calculateAvailabilityScore(equipmentId, equipmentWorkOrders);
      const reliabilityScore = await this.calculateReliabilityScore(equipmentId, equipmentWorkOrders);
      const performanceScore = await this.calculatePerformanceScore(equipmentId, targetEquipment);
      const maintenanceScore = await this.calculateMaintenanceScore(equipmentId, equipmentWorkOrders);

      // Overall health score (weighted average)
      const overallScore = Math.round(
        (availabilityScore * 0.3) +
        (reliabilityScore * 0.25) +
        (performanceScore * 0.25) +
        (maintenanceScore * 0.2)
      );

      // Determine trend and risk level
      const trend = this.determineTrend(equipmentId, overallScore);
      const riskLevel = this.determineRiskLevel(overallScore, trend);

      // Generate recommendations
      const recommendations = this.generateHealthRecommendations(
        overallScore, availabilityScore, reliabilityScore, performanceScore, maintenanceScore
      );

      const healthScore: EquipmentHealthScore = {
        equipmentId,
        assetTag: targetEquipment.assetTag,
        overallScore,
        availabilityScore,
        reliabilityScore,
        performanceScore,
        maintenanceScore,
        lastCalculated: new Date(),
        trend,
        riskLevel,
        recommendations
      };

      // Cache the result
      this.healthScoreCache.set(equipmentId, healthScore);
      return healthScore;

    } catch (error) {
      console.error('Error calculating health score:', error);
      throw error;
    }
  }

  // Failure Prediction Algorithm
  async predictFailure(equipmentId: string, warehouseId: string): Promise<FailurePrediction> {
    try {
      // Check cache first
      const cached = this.predictionCache.get(equipmentId);
      if (cached && Date.now() - cached.lastCalculated.getTime() < this.CACHE_TTL) {
        return cached;
      }

      const equipment = await storage.getEquipment(warehouseId);
      const targetEquipment = equipment.find(e => e.id === equipmentId);
      
      if (!targetEquipment) {
        throw new Error('Equipment not found');
      }

      // Get historical data
      const workOrders = await storage.getWorkOrders(warehouseId);
      const equipmentWorkOrders = workOrders.filter(wo => wo.equipmentId === equipmentId);
      const failureHistory = equipmentWorkOrders.filter(wo => wo.type === 'corrective');

      // Calculate failure probability using survival analysis approach
      const failureData = this.analyzeFailurePatterns(failureHistory);
      const healthScore = await this.calculateHealthScore(equipmentId, warehouseId);
      
      // Machine Learning-inspired prediction algorithm
      const probabilityOfFailure = this.calculateFailureProbability(
        failureData, 
        healthScore.overallScore,
        targetEquipment
      );

      // Predict failure date using exponential distribution
      const predictedFailureDate = this.predictFailureDate(
        failureData.meanTimeBetweenFailures,
        probabilityOfFailure
      );

      // Determine most likely failure type
      const failureType = this.predictFailureType(failureHistory, targetEquipment);
      
      // Calculate prediction confidence
      const confidence = this.calculatePredictionConfidence(failureHistory.length, healthScore.overallScore);
      
      // Determine impact level
      const impactLevel = this.determineImpactLevel(targetEquipment.criticality);
      
      // Generate recommended actions
      const recommendedActions = this.generatePredictiveActions(
        probabilityOfFailure,
        failureType,
        impactLevel,
        targetEquipment
      );

      // Assess data quality
      const dataQuality = this.assessDataQuality(equipmentWorkOrders.length, targetEquipment);

      const prediction: FailurePrediction = {
        equipmentId,
        assetTag: targetEquipment.assetTag,
        probabilityOfFailure,
        predictedFailureDate,
        confidence,
        failureType,
        impactLevel,
        recommendedActions,
        dataQuality,
        lastCalculated: new Date()
      };

      // Cache the result
      this.predictionCache.set(equipmentId, prediction);
      return prediction;

    } catch (error) {
      console.error('Error predicting failure:', error);
      throw error;
    }
  }

  // Maintenance Strategy Optimization
  async optimizeMaintenanceStrategy(equipmentId: string, warehouseId: string): Promise<MaintenanceOptimization> {
    try {
      const equipment = await storage.getEquipment(warehouseId);
      const targetEquipment = equipment.find(e => e.id === equipmentId);
      
      if (!targetEquipment) {
        throw new Error('Equipment not found');
      }

      const workOrders = await storage.getWorkOrders(warehouseId);
      const equipmentWorkOrders = workOrders.filter(wo => wo.equipmentId === equipmentId);
      
      // Analyze current maintenance strategy
      const currentStrategy = this.analyzeCurrentStrategy(equipmentWorkOrders);
      
      // Get health score and failure prediction
      const healthScore = await this.calculateHealthScore(equipmentId, warehouseId);
      const failurePrediction = await this.predictFailure(equipmentId, warehouseId);
      
      // Determine optimal strategy
      const recommendedStrategy = this.recommendOptimalStrategy(
        healthScore, 
        failurePrediction, 
        targetEquipment,
        equipmentWorkOrders
      );

      // Calculate cost savings
      const costSavings = this.calculateCostSavings(
        currentStrategy,
        recommendedStrategy,
        equipmentWorkOrders,
        targetEquipment
      );

      // Generate implementation plan
      const implementationPlan = this.generateImplementationPlan(
        currentStrategy,
        recommendedStrategy,
        targetEquipment
      );

      return {
        equipmentId,
        currentStrategy,
        recommendedStrategy,
        costSavings,
        implementationPlan
      };

    } catch (error) {
      console.error('Error optimizing maintenance strategy:', error);
      throw error;
    }
  }

  // Performance Trend Analysis
  async analyzePerformanceTrends(equipmentId: string, warehouseId: string, months = 12): Promise<PerformanceTrend[]> {
    try {
      const workOrders = await storage.getWorkOrders(warehouseId);
      const equipmentWorkOrders = workOrders.filter(wo => wo.equipmentId === equipmentId);
      
      const trends: PerformanceTrend[] = [];
      const now = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        
        const monthWorkOrders = equipmentWorkOrders.filter(wo => {
          const woDate = new Date(wo.createdAt);
          return woDate >= monthDate && woDate < nextMonth;
        });

        const metrics = this.calculateMonthlyMetrics(monthWorkOrders, monthDate);
        
        trends.push({
          date: monthDate.toISOString().slice(0, 7),
          mtbf: metrics.mtbf,
          mttr: metrics.mttr,
          availability: metrics.availability,
          efficiency: metrics.efficiency,
          cost: metrics.cost
        });
      }

      return trends;

    } catch (error) {
      console.error('Error analyzing performance trends:', error);
      throw error;
    }
  }

  // Private helper methods

  private async calculateAvailabilityScore(equipmentId: string, workOrders: any[]): Promise<number> {
    // Calculate availability based on uptime vs downtime
    const totalHours = 30 * 24; // Last 30 days
    const downtimeHours = workOrders.reduce((sum, wo) => {
      const duration = wo.actualDuration || 4; // Assume 4 hours if not recorded
      return sum + duration;
    }, 0);
    
    const availability = ((totalHours - downtimeHours) / totalHours) * 100;
    return Math.max(0, Math.min(100, availability));
  }

  private async calculateReliabilityScore(equipmentId: string, workOrders: any[]): Promise<number> {
    // Calculate reliability based on failure frequency and MTBF
    const failureCount = workOrders.filter(wo => wo.type === 'corrective').length;
    const timeSpan = 365; // days
    const mtbf = timeSpan / Math.max(1, failureCount);
    
    // Score based on MTBF (higher MTBF = better reliability)
    const reliabilityScore = Math.min(100, (mtbf / 30) * 100);
    return Math.max(0, reliabilityScore);
  }

  private async calculatePerformanceScore(equipmentId: string, equipment: any): Promise<number> {
    // Base performance score on equipment status and age
    let score = 100;
    
    if (equipment.status === 'inactive') score -= 40;
    if (equipment.status === 'maintenance') score -= 20;
    
    // Age factor (older equipment typically has lower performance)
    if (equipment.installDate) {
      const ageYears = (new Date().getTime() - new Date(equipment.installDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
      score -= Math.min(30, ageYears * 2);
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private async calculateMaintenanceScore(equipmentId: string, workOrders: any[]): Promise<number> {
    // Score based on maintenance frequency and type balance
    const preventiveCount = workOrders.filter(wo => wo.type === 'preventive').length;
    const correctiveCount = workOrders.filter(wo => wo.type === 'corrective').length;
    const totalCount = workOrders.length;
    
    if (totalCount === 0) return 85; // New equipment with no history
    
    const preventiveRatio = preventiveCount / totalCount;
    const maintenanceScore = preventiveRatio * 100;
    
    return Math.max(0, Math.min(100, maintenanceScore));
  }

  private determineTrend(equipmentId: string, currentScore: number): 'improving' | 'stable' | 'declining' {
    // Simplified trend analysis - in production, would use historical scores
    if (currentScore >= 85) return 'stable';
    if (currentScore >= 70) return 'stable';
    return 'declining';
  }

  private determineRiskLevel(score: number, trend: string): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 85 && trend !== 'declining') return 'low';
    if (score >= 70) return 'medium';
    if (score >= 50) return 'high';
    return 'critical';
  }

  private generateHealthRecommendations(
    overall: number, availability: number, reliability: number, 
    performance: number, maintenance: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (overall < 70) {
      recommendations.push("Schedule comprehensive equipment inspection within 48 hours");
    }
    
    if (availability < 80) {
      recommendations.push("Investigate and reduce planned downtime duration");
    }
    
    if (reliability < 75) {
      recommendations.push("Increase preventive maintenance frequency");
      recommendations.push("Review and update maintenance procedures");
    }
    
    if (performance < 75) {
      recommendations.push("Consider equipment upgrade or refurbishment");
    }
    
    if (maintenance < 60) {
      recommendations.push("Implement proactive maintenance program");
      recommendations.push("Train technicians on predictive maintenance techniques");
    }
    
    return recommendations;
  }

  private analyzeFailurePatterns(failureHistory: any[]): { meanTimeBetweenFailures: number; failureRate: number } {
    if (failureHistory.length < 2) {
      return { meanTimeBetweenFailures: 365, failureRate: 0.1 }; // Conservative estimates
    }
    
    // Sort failures by date
    const sortedFailures = failureHistory.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    // Calculate time between failures
    const timeBetweenFailures: number[] = [];
    for (let i = 1; i < sortedFailures.length; i++) {
      const timeDiff = new Date(sortedFailures[i].createdAt).getTime() - 
                      new Date(sortedFailures[i-1].createdAt).getTime();
      timeBetweenFailures.push(timeDiff / (1000 * 60 * 60 * 24)); // Convert to days
    }
    
    const meanTimeBetweenFailures = timeBetweenFailures.reduce((sum, time) => sum + time, 0) / timeBetweenFailures.length;
    const failureRate = 1 / meanTimeBetweenFailures;
    
    return { meanTimeBetweenFailures, failureRate };
  }

  private calculateFailureProbability(
    failureData: { meanTimeBetweenFailures: number; failureRate: number },
    healthScore: number,
    equipment: any
  ): number {
    // Base probability from failure rate
    let probability = failureData.failureRate * 30; // 30-day probability
    
    // Adjust based on health score
    const healthFactor = (100 - healthScore) / 100;
    probability *= (1 + healthFactor);
    
    // Adjust based on criticality
    if (equipment.criticality === 'high') probability *= 1.2;
    if (equipment.criticality === 'low') probability *= 0.8;
    
    return Math.min(1, Math.max(0, probability)) * 100;
  }

  private predictFailureDate(mtbf: number, probability: number): Date {
    // Use exponential distribution to predict failure date
    const lambda = 1 / mtbf;
    const randomValue = Math.random();
    const predictedDays = -Math.log(randomValue) / lambda;
    
    const failureDate = new Date();
    failureDate.setDate(failureDate.getDate() + Math.round(predictedDays));
    
    return failureDate;
  }

  private predictFailureType(failureHistory: any[], equipment: any): string {
    // Analyze most common failure types
    const failureTypes = failureHistory.map(wo => wo.description?.toLowerCase() || '');
    
    if (failureTypes.some(desc => desc.includes('bearing'))) return 'bearing failure';
    if (failureTypes.some(desc => desc.includes('motor'))) return 'motor failure';
    if (failureTypes.some(desc => desc.includes('pump'))) return 'pump failure';
    if (failureTypes.some(desc => desc.includes('electrical'))) return 'electrical failure';
    if (failureTypes.some(desc => desc.includes('mechanical'))) return 'mechanical failure';
    
    return 'general component failure';
  }

  private calculatePredictionConfidence(historyCount: number, healthScore: number): number {
    // Confidence based on data availability and equipment condition
    let confidence = 0;
    
    // Data availability factor
    if (historyCount >= 10) confidence += 40;
    else if (historyCount >= 5) confidence += 25;
    else confidence += 10;
    
    // Health score stability factor
    if (healthScore >= 80) confidence += 30;
    else if (healthScore >= 60) confidence += 20;
    else confidence += 10;
    
    // Time factor (more recent data is more reliable)
    confidence += 30;
    
    return Math.min(100, confidence);
  }

  private determineImpactLevel(criticality: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (criticality?.toLowerCase()) {
      case 'high': return 'critical';
      case 'medium': return 'high';
      case 'low': return 'medium';
      default: return 'medium';
    }
  }

  private generatePredictiveActions(
    probabilityOfFailure: number,
    failureType: string,
    impactLevel: string,
    equipment: any
  ): PredictiveAction[] {
    const actions: PredictiveAction[] = [];
    
    if (probabilityOfFailure > 70) {
      actions.push({
        id: 'urgent-inspection',
        type: 'inspection',
        description: `Immediate detailed inspection of ${equipment.assetTag} - ${failureType} suspected`,
        priority: 'urgent',
        estimatedCost: 500,
        timeToComplete: 4,
        preventionProbability: 85,
        recommendedDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
      });
    }
    
    if (probabilityOfFailure > 50) {
      actions.push({
        id: 'preventive-maintenance',
        type: 'maintenance',
        description: `Accelerated preventive maintenance for ${failureType}`,
        priority: 'high',
        estimatedCost: 1200,
        timeToComplete: 8,
        preventionProbability: 75,
        recommendedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next week
      });
    }
    
    if (impactLevel === 'critical') {
      actions.push({
        id: 'contingency-planning',
        type: 'monitoring',
        description: 'Implement continuous condition monitoring and prepare backup equipment',
        priority: 'high',
        estimatedCost: 2000,
        timeToComplete: 16,
        preventionProbability: 90,
        recommendedDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
      });
    }
    
    return actions;
  }

  private assessDataQuality(workOrderCount: number, equipment: any): 'poor' | 'fair' | 'good' | 'excellent' {
    if (workOrderCount >= 20) return 'excellent';
    if (workOrderCount >= 10) return 'good';
    if (workOrderCount >= 5) return 'fair';
    return 'poor';
  }

  private analyzeCurrentStrategy(workOrders: any[]): 'reactive' | 'preventive' | 'predictive' {
    const preventiveCount = workOrders.filter(wo => wo.type === 'preventive').length;
    const correctiveCount = workOrders.filter(wo => wo.type === 'corrective').length;
    const totalCount = workOrders.length;
    
    if (totalCount === 0) return 'reactive';
    
    const preventiveRatio = preventiveCount / totalCount;
    
    if (preventiveRatio >= 0.7) return 'predictive';
    if (preventiveRatio >= 0.4) return 'preventive';
    return 'reactive';
  }

  private recommendOptimalStrategy(
    healthScore: EquipmentHealthScore,
    prediction: FailurePrediction,
    equipment: any,
    workOrders: any[]
  ): 'reactive' | 'preventive' | 'predictive' {
    // High-value, critical equipment should use predictive
    if (equipment.criticality === 'high' && healthScore.overallScore < 80) {
      return 'predictive';
    }
    
    // Equipment with good data quality can benefit from predictive
    if (prediction.dataQuality === 'excellent' || prediction.dataQuality === 'good') {
      return 'predictive';
    }
    
    // Standard equipment can use preventive
    if (healthScore.overallScore >= 60) {
      return 'preventive';
    }
    
    return 'reactive';
  }

  private calculateCostSavings(
    currentStrategy: string,
    recommendedStrategy: string,
    workOrders: any[],
    equipment: any
  ): MaintenanceOptimization['costSavings'] {
    // Calculate current annual costs
    const correctiveWorkOrders = workOrders.filter(wo => wo.type === 'corrective');
    const currentAnnualCost = correctiveWorkOrders.length * 2000; // Average corrective cost
    const currentDowntime = correctiveWorkOrders.length * 8; // Average downtime hours
    
    // Estimate savings based on strategy improvement
    let costReductionFactor = 1;
    let downtimeReductionFactor = 1;
    
    if (currentStrategy === 'reactive' && recommendedStrategy === 'preventive') {
      costReductionFactor = 0.7; // 30% cost reduction
      downtimeReductionFactor = 0.6; // 40% downtime reduction
    } else if (currentStrategy === 'reactive' && recommendedStrategy === 'predictive') {
      costReductionFactor = 0.5; // 50% cost reduction
      downtimeReductionFactor = 0.4; // 60% downtime reduction
    } else if (currentStrategy === 'preventive' && recommendedStrategy === 'predictive') {
      costReductionFactor = 0.8; // 20% cost reduction
      downtimeReductionFactor = 0.7; // 30% downtime reduction
    }
    
    const newAnnualCost = currentAnnualCost * costReductionFactor;
    const newDowntime = currentDowntime * downtimeReductionFactor;
    
    return {
      annual: currentAnnualCost - newAnnualCost,
      downtimeReduction: currentDowntime - newDowntime,
      maintenanceCostReduction: currentAnnualCost - newAnnualCost,
      productionImprovementValue: (currentDowntime - newDowntime) * 200 // $200/hour production value
    };
  }

  private generateImplementationPlan(
    currentStrategy: string,
    recommendedStrategy: string,
    equipment: any
  ): OptimizationStep[] {
    const steps: OptimizationStep[] = [];
    
    if (recommendedStrategy === 'predictive') {
      steps.push({
        step: 1,
        description: 'Install condition monitoring sensors',
        timeline: '2-4 weeks',
        resources: ['IoT sensors', 'Installation team'],
        cost: 5000,
        expectedBenefit: 'Real-time equipment health data'
      });
      
      steps.push({
        step: 2,
        description: 'Implement data analytics platform',
        timeline: '4-6 weeks',
        resources: ['Analytics software', 'Data engineer'],
        cost: 10000,
        expectedBenefit: 'Automated failure predictions'
      });
      
      steps.push({
        step: 3,
        description: 'Train maintenance team on predictive techniques',
        timeline: '2-3 weeks',
        resources: ['Training program', 'Expert instructor'],
        cost: 3000,
        expectedBenefit: 'Skilled predictive maintenance team'
      });
    }
    
    return steps;
  }

  private calculateMonthlyMetrics(workOrders: any[], monthDate: Date): {
    mtbf: number; mttr: number; availability: number; efficiency: number; cost: number;
  } {
    const failures = workOrders.filter(wo => wo.type === 'corrective');
    const totalHours = 30 * 24; // Hours in month
    const totalDowntime = workOrders.reduce((sum, wo) => sum + (wo.actualDuration || 4), 0);
    
    return {
      mtbf: failures.length > 0 ? totalHours / failures.length : totalHours,
      mttr: failures.length > 0 ? totalDowntime / failures.length : 2,
      availability: ((totalHours - totalDowntime) / totalHours) * 100,
      efficiency: Math.min(100, Math.max(60, 95 - (failures.length * 5))),
      cost: workOrders.length * 1500
    };
  }
}

export const aiPredictiveService = AIPredictiveService.getInstance();