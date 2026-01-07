/**
 * Multi-Year Planning Service
 *
 * Extends the planning horizon to 24-36 months for long-term strategic planning.
 * Provides forecasting, capacity planning, and budget projections across multiple fiscal years.
 */

import { PrismaClient } from '@prisma/client';

// =============================================================================
// TYPES
// =============================================================================

export interface MultiYearPlanConfig {
  companyId: string;
  startMonth: string; // YYYY-MM
  horizonMonths: number; // 24 or 36
  growthRate: number; // Annual growth rate (e.g., 0.05 for 5%)
  inflationRate: number; // Cost inflation rate
}

export interface MonthlyProjection {
  month: string;
  fiscalYear: number;
  quarter: number;
  projected: {
    qualifications: number;
    assignments: number;
    returns: number;
    repairs: number;
    total: number;
  };
  capacity: {
    total: number;
    available: number;
    utilization: number;
  };
  cost: {
    estimated: number;
    inflationAdjusted: number;
  };
  risks: string[];
}

export interface MultiYearProjection {
  config: MultiYearPlanConfig;
  months: MonthlyProjection[];
  fiscalYearSummaries: FiscalYearSummary[];
  quarterlyTrends: QuarterlyTrend[];
  capacityAlerts: CapacityAlert[];
  recommendations: string[];
}

export interface FiscalYearSummary {
  fiscalYear: number;
  totalCars: number;
  totalCost: number;
  avgUtilization: number;
  workTypeBreakdown: Record<string, number>;
  shopDistribution: Record<string, number>;
  customerDistribution: Record<string, number>;
}

export interface QuarterlyTrend {
  quarter: string; // e.g., "Q1 2026"
  fiscalYear: number;
  quarterNumber: number;
  totalCars: number;
  totalCost: number;
  avgUtilization: number;
  changeFromPrevious: number;
}

export interface CapacityAlert {
  month: string;
  shopId: string;
  shopName: string;
  severity: 'warning' | 'critical';
  message: string;
  utilization: number;
  recommendation: string;
}

// =============================================================================
// SERVICE
// =============================================================================

export class MultiYearPlanningService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Generate a multi-year projection (24-36 months)
   */
  async generateMultiYearProjection(
    config: MultiYearPlanConfig
  ): Promise<MultiYearProjection> {
    const { companyId, startMonth, horizonMonths, growthRate, inflationRate } = config;

    // Get baseline data
    const [shops, historicalData, existingCommitments] = await Promise.all([
      this.getShopsWithCapacity(companyId),
      this.getHistoricalWorkVolume(companyId, 12),
      this.getExistingCommitments(companyId, startMonth, horizonMonths),
    ]);

    // Calculate monthly projections
    const months: MonthlyProjection[] = [];
    const startDate = new Date(`${startMonth}-01`);

    for (let i = 0; i < horizonMonths; i++) {
      const monthDate = new Date(startDate);
      monthDate.setMonth(monthDate.getMonth() + i);
      const monthKey = monthDate.toISOString().slice(0, 7);
      const fiscalYear = monthDate.getFullYear();
      const quarter = Math.floor(monthDate.getMonth() / 3) + 1;

      // Apply growth rate based on months from start
      const yearsFromStart = i / 12;
      const growthFactor = Math.pow(1 + growthRate, yearsFromStart);

      // Get base volume from historical data or existing commitments
      const existingVolume = existingCommitments[monthKey] || {
        qualifications: 0,
        assignments: 0,
        returns: 0,
        repairs: 0,
      };

      const hasExistingData = Object.values(existingVolume).some(v => v > 0);

      // Project work volume
      const projectedVolume = hasExistingData
        ? existingVolume
        : this.projectWorkVolume(historicalData, monthDate, growthFactor);

      // Calculate capacity
      const totalCapacity = shops.reduce((sum, shop) => sum + shop.capacity, 0);
      const totalProjected = Object.values(projectedVolume).reduce((a, b) => a + b, 0);
      const utilization = totalCapacity > 0 ? (totalProjected / totalCapacity) * 100 : 0;

      // Calculate costs with inflation
      const baseCost = this.estimateMonthCost(projectedVolume, shops);
      const inflationFactor = Math.pow(1 + inflationRate, yearsFromStart);
      const inflationAdjustedCost = baseCost * inflationFactor;

      // Identify risks
      const risks: string[] = [];
      if (utilization > 95) {
        risks.push('Critical capacity constraint');
      } else if (utilization > 85) {
        risks.push('High capacity utilization');
      }

      if (i >= 18 && !hasExistingData) {
        risks.push('Projection uncertainty (beyond 18 months)');
      }

      months.push({
        month: monthKey,
        fiscalYear,
        quarter,
        projected: {
          ...projectedVolume,
          total: totalProjected,
        },
        capacity: {
          total: totalCapacity,
          available: Math.max(0, totalCapacity - totalProjected),
          utilization: Math.round(utilization * 10) / 10,
        },
        cost: {
          estimated: Math.round(baseCost),
          inflationAdjusted: Math.round(inflationAdjustedCost),
        },
        risks,
      });
    }

    // Generate summaries
    const fiscalYearSummaries = this.generateFiscalYearSummaries(months, shops);
    const quarterlyTrends = this.generateQuarterlyTrends(months);
    const capacityAlerts = this.identifyCapacityAlerts(months, shops);
    const recommendations = this.generateRecommendations(months, capacityAlerts);

    return {
      config,
      months,
      fiscalYearSummaries,
      quarterlyTrends,
      capacityAlerts,
      recommendations,
    };
  }

  /**
   * Get shops with capacity data
   */
  private async getShopsWithCapacity(companyId: string) {
    return this.prisma.shop.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        region: true,
        capacity: true,
        qualCapacity: true,
        assignCapacity: true,
        releaseCapacity: true,
        repairCapacity: true,
        baseCostPerCar: true,
      },
    });
  }

  /**
   * Get historical work volume for baseline
   */
  private async getHistoricalWorkVolume(companyId: string, monthsBack: number) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);
    const startMonth = startDate.toISOString().slice(0, 7);

    const assignments = await this.prisma.planAssignment.groupBy({
      by: ['scheduledMonth'],
      where: {
        plan: { companyId },
        scheduledMonth: { gte: startMonth },
      },
      _count: true,
    });

    const volumeByMonth: Record<string, number> = {};
    assignments.forEach((a: { scheduledMonth: string; _count: number }) => {
      volumeByMonth[a.scheduledMonth] = a._count;
    });

    // Calculate averages
    const values = Object.values(volumeByMonth);
    const avgMonthly = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    return {
      byMonth: volumeByMonth,
      avgMonthly: Math.round(avgMonthly),
      totalMonths: values.length,
    };
  }

  /**
   * Get existing commitments from MasterPlan
   */
  private async getExistingCommitments(
    companyId: string,
    startMonth: string,
    horizonMonths: number
  ): Promise<Record<string, { qualifications: number; assignments: number; returns: number; repairs: number }>> {
    const endDate = new Date(`${startMonth}-01`);
    endDate.setMonth(endDate.getMonth() + horizonMonths);
    const endMonth = endDate.toISOString().slice(0, 7);

    const commitments = await this.prisma.masterPlanCommitment.findMany({
      where: {
        masterPlan: {
          companyId,
          status: { in: ['active', 'approved'] },
        },
        scheduledMonth: {
          gte: startMonth,
          lte: endMonth,
        },
      },
      select: {
        scheduledMonth: true,
        workTypes: true,
      },
    });

    const result: Record<string, { qualifications: number; assignments: number; returns: number; repairs: number }> = {};

    commitments.forEach((c) => {
      if (!result[c.scheduledMonth]) {
        result[c.scheduledMonth] = { qualifications: 0, assignments: 0, returns: 0, repairs: 0 };
      }

      try {
        const workTypes = JSON.parse(c.workTypes) as string[];
        workTypes.forEach((wt) => {
          if (wt === 'qualification') result[c.scheduledMonth].qualifications++;
          else if (wt === 'assignment') result[c.scheduledMonth].assignments++;
          else if (wt === 'return') result[c.scheduledMonth].returns++;
          else if (wt === 'repair') result[c.scheduledMonth].repairs++;
        });
      } catch {
        result[c.scheduledMonth].qualifications++;
      }
    });

    return result;
  }

  /**
   * Project work volume for a month
   */
  private projectWorkVolume(
    historical: { avgMonthly: number },
    monthDate: Date,
    growthFactor: number
  ) {
    const baseVolume = historical.avgMonthly || 20;
    const adjustedVolume = Math.round(baseVolume * growthFactor);

    // Typical work type distribution
    return {
      qualifications: Math.round(adjustedVolume * 0.35),
      assignments: Math.round(adjustedVolume * 0.25),
      returns: Math.round(adjustedVolume * 0.25),
      repairs: Math.round(adjustedVolume * 0.15),
    };
  }

  /**
   * Estimate monthly cost
   */
  private estimateMonthCost(
    volume: { qualifications: number; assignments: number; returns: number; repairs: number },
    shops: Array<{ baseCostPerCar: number }>
  ): number {
    const avgCostPerCar = shops.length > 0
      ? shops.reduce((sum, s) => sum + s.baseCostPerCar, 0) / shops.length
      : 15000;

    const total = volume.qualifications + volume.assignments + volume.returns + volume.repairs;
    return total * avgCostPerCar;
  }

  /**
   * Generate fiscal year summaries
   */
  private generateFiscalYearSummaries(
    months: MonthlyProjection[],
    shops: Array<{ name: string }>
  ): FiscalYearSummary[] {
    const byYear: Record<number, MonthlyProjection[]> = {};

    months.forEach((m) => {
      if (!byYear[m.fiscalYear]) byYear[m.fiscalYear] = [];
      byYear[m.fiscalYear].push(m);
    });

    return Object.entries(byYear).map(([yearStr, yearMonths]) => {
      const fiscalYear = parseInt(yearStr);
      const totalCars = yearMonths.reduce((sum, m) => sum + m.projected.total, 0);
      const totalCost = yearMonths.reduce((sum, m) => sum + m.cost.inflationAdjusted, 0);
      const avgUtilization = yearMonths.reduce((sum, m) => sum + m.capacity.utilization, 0) / yearMonths.length;

      const workTypeBreakdown: Record<string, number> = {
        qualifications: yearMonths.reduce((sum, m) => sum + m.projected.qualifications, 0),
        assignments: yearMonths.reduce((sum, m) => sum + m.projected.assignments, 0),
        returns: yearMonths.reduce((sum, m) => sum + m.projected.returns, 0),
        repairs: yearMonths.reduce((sum, m) => sum + m.projected.repairs, 0),
      };

      // Distribute evenly across shops (simplified)
      const shopDistribution: Record<string, number> = {};
      shops.forEach((shop) => {
        shopDistribution[shop.name] = Math.round(totalCars / shops.length);
      });

      return {
        fiscalYear,
        totalCars,
        totalCost: Math.round(totalCost),
        avgUtilization: Math.round(avgUtilization * 10) / 10,
        workTypeBreakdown,
        shopDistribution,
        customerDistribution: {}, // Would need customer data
      };
    });
  }

  /**
   * Generate quarterly trends
   */
  private generateQuarterlyTrends(months: MonthlyProjection[]): QuarterlyTrend[] {
    const byQuarter: Record<string, MonthlyProjection[]> = {};

    months.forEach((m) => {
      const key = `Q${m.quarter} ${m.fiscalYear}`;
      if (!byQuarter[key]) byQuarter[key] = [];
      byQuarter[key].push(m);
    });

    const trends: QuarterlyTrend[] = [];
    let previousTotal = 0;

    Object.entries(byQuarter).forEach(([quarter, qMonths]) => {
      const totalCars = qMonths.reduce((sum, m) => sum + m.projected.total, 0);
      const totalCost = qMonths.reduce((sum, m) => sum + m.cost.inflationAdjusted, 0);
      const avgUtilization = qMonths.reduce((sum, m) => sum + m.capacity.utilization, 0) / qMonths.length;

      const changeFromPrevious = previousTotal > 0
        ? ((totalCars - previousTotal) / previousTotal) * 100
        : 0;

      trends.push({
        quarter,
        fiscalYear: qMonths[0].fiscalYear,
        quarterNumber: qMonths[0].quarter,
        totalCars,
        totalCost: Math.round(totalCost),
        avgUtilization: Math.round(avgUtilization * 10) / 10,
        changeFromPrevious: Math.round(changeFromPrevious * 10) / 10,
      });

      previousTotal = totalCars;
    });

    return trends;
  }

  /**
   * Identify capacity alerts
   */
  private identifyCapacityAlerts(
    months: MonthlyProjection[],
    shops: Array<{ id: string; name: string; capacity: number }>
  ): CapacityAlert[] {
    const alerts: CapacityAlert[] = [];

    months.forEach((m) => {
      if (m.capacity.utilization > 90) {
        // Find shops that would be most affected
        shops.forEach((shop) => {
          alerts.push({
            month: m.month,
            shopId: shop.id,
            shopName: shop.name,
            severity: m.capacity.utilization > 95 ? 'critical' : 'warning',
            message: `Projected ${m.capacity.utilization.toFixed(1)}% utilization in ${m.month}`,
            utilization: m.capacity.utilization,
            recommendation: m.capacity.utilization > 95
              ? 'Consider adding capacity or redistributing work to other shops'
              : 'Monitor closely and prepare contingency plans',
          });
        });
      }
    });

    return alerts.slice(0, 20); // Limit to top 20 alerts
  }

  /**
   * Generate strategic recommendations
   */
  private generateRecommendations(
    months: MonthlyProjection[],
    alerts: CapacityAlert[]
  ): string[] {
    const recommendations: string[] = [];

    // Check overall utilization trend
    const avgUtilization = months.reduce((sum, m) => sum + m.capacity.utilization, 0) / months.length;
    if (avgUtilization > 85) {
      recommendations.push('Consider expanding shop network capacity - average utilization exceeds 85%');
    } else if (avgUtilization < 60) {
      recommendations.push('Capacity underutilization detected - review shop network optimization');
    }

    // Check for seasonal patterns
    const q1Util = months.filter(m => m.quarter === 1).reduce((sum, m) => sum + m.capacity.utilization, 0) / 3;
    const q3Util = months.filter(m => m.quarter === 3).reduce((sum, m) => sum + m.capacity.utilization, 0) / 3;
    if (Math.abs(q1Util - q3Util) > 20) {
      recommendations.push('Significant seasonal variation detected - consider flexible staffing arrangements');
    }

    // Cost growth
    const firstYearCost = months.slice(0, 12).reduce((sum, m) => sum + m.cost.inflationAdjusted, 0);
    const lastYearCost = months.slice(-12).reduce((sum, m) => sum + m.cost.inflationAdjusted, 0);
    const costGrowth = ((lastYearCost - firstYearCost) / firstYearCost) * 100;
    if (costGrowth > 15) {
      recommendations.push(`Projected ${costGrowth.toFixed(1)}% cost increase over planning horizon - review cost optimization strategies`);
    }

    // Capacity alerts
    if (alerts.filter(a => a.severity === 'critical').length > 5) {
      recommendations.push('Multiple critical capacity constraints identified - prioritize capacity expansion');
    }

    return recommendations;
  }

  /**
   * Get multi-year budget projection
   */
  async getBudgetProjection(
    companyId: string,
    startMonth: string,
    horizonMonths: number
  ): Promise<{
    totalBudget: number;
    byYear: Record<string, number>;
    byQuarter: Record<string, number>;
    byWorkType: Record<string, number>;
  }> {
    const projection = await this.generateMultiYearProjection({
      companyId,
      startMonth,
      horizonMonths,
      growthRate: 0.03, // 3% default growth
      inflationRate: 0.025, // 2.5% default inflation
    });

    const byYear: Record<string, number> = {};
    const byQuarter: Record<string, number> = {};
    const byWorkType: Record<string, number> = {
      qualifications: 0,
      assignments: 0,
      returns: 0,
      repairs: 0,
    };

    projection.months.forEach((m) => {
      // By year
      const yearKey = m.fiscalYear.toString();
      byYear[yearKey] = (byYear[yearKey] || 0) + m.cost.inflationAdjusted;

      // By quarter
      const qKey = `Q${m.quarter} ${m.fiscalYear}`;
      byQuarter[qKey] = (byQuarter[qKey] || 0) + m.cost.inflationAdjusted;

      // By work type (estimate based on volume distribution)
      const total = m.projected.total || 1;
      byWorkType.qualifications += m.cost.inflationAdjusted * (m.projected.qualifications / total);
      byWorkType.assignments += m.cost.inflationAdjusted * (m.projected.assignments / total);
      byWorkType.returns += m.cost.inflationAdjusted * (m.projected.returns / total);
      byWorkType.repairs += m.cost.inflationAdjusted * (m.projected.repairs / total);
    });

    return {
      totalBudget: Math.round(projection.months.reduce((sum, m) => sum + m.cost.inflationAdjusted, 0)),
      byYear: Object.fromEntries(Object.entries(byYear).map(([k, v]) => [k, Math.round(v)])),
      byQuarter: Object.fromEntries(Object.entries(byQuarter).map(([k, v]) => [k, Math.round(v)])),
      byWorkType: Object.fromEntries(Object.entries(byWorkType).map(([k, v]) => [k, Math.round(v)])),
    };
  }
}

export function createMultiYearPlanningService(prisma: PrismaClient): MultiYearPlanningService {
  return new MultiYearPlanningService(prisma);
}

export default MultiYearPlanningService;
