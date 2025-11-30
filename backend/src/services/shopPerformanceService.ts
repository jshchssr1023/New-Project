// Shop Performance Scorecard Service
// Calculates TAT, OTP, Dwell Time, Rework Rate, Cost Variance
import { prisma } from './db';

// Weight configuration for composite score
const PERFORMANCE_WEIGHTS = {
  onTimeRate: 0.25,      // On-Time Performance
  turnTimeScore: 0.20,   // Turn Time (lower is better)
  dwellTimeScore: 0.15,  // Dwell Time (lower is better)
  reworkRate: 0.15,      // Rework/Failure Rate (lower is better)
  costVariance: 0.25,    // Cost Variance (closer to 0 is better)
};

// Network averages for comparison (will be calculated dynamically)
interface NetworkAverages {
  avgTurnTime: number;
  avgDwellTime: number;
  avgOnTimeRate: number;
  avgReworkRate: number;
  avgCostVariance: number;
}

// Calculate network-wide averages for benchmarking
async function calculateNetworkAverages(companyId: string): Promise<NetworkAverages> {
  const performances = await prisma.shopPerformance.findMany({
    where: { companyId, periodType: 'monthly' },
    orderBy: { createdAt: 'desc' },
    take: 100, // Last 100 monthly records
  });

  if (performances.length === 0) {
    return {
      avgTurnTime: 14,
      avgDwellTime: 2,
      avgOnTimeRate: 80,
      avgReworkRate: 5,
      avgCostVariance: 10,
    };
  }

  const sum = performances.reduce(
    (acc, p) => ({
      turnTime: acc.turnTime + p.averageTurnTime,
      dwellTime: acc.dwellTime + p.averageDwellTime,
      onTimeRate: acc.onTimeRate + p.onTimeRate,
      reworkRate: acc.reworkRate + p.reworkRate,
      costVariance: acc.costVariance + Math.abs(p.costVariance),
    }),
    { turnTime: 0, dwellTime: 0, onTimeRate: 0, reworkRate: 0, costVariance: 0 }
  );

  return {
    avgTurnTime: sum.turnTime / performances.length,
    avgDwellTime: sum.dwellTime / performances.length,
    avgOnTimeRate: sum.onTimeRate / performances.length,
    avgReworkRate: sum.reworkRate / performances.length,
    avgCostVariance: sum.costVariance / performances.length,
  };
}

// Calculate turn time score (0-100, lower turn time = higher score)
function calculateTurnTimeScore(turnTime: number, networkAvg: number): number {
  if (turnTime === 0) return 100;
  const ratio = networkAvg / turnTime;
  return Math.min(100, Math.max(0, ratio * 50 + 50));
}

// Calculate dwell time score (0-100, lower dwell = higher score)
function calculateDwellTimeScore(dwellTime: number, networkAvg: number): number {
  if (dwellTime === 0) return 100;
  const ratio = networkAvg / dwellTime;
  return Math.min(100, Math.max(0, ratio * 50 + 50));
}

// Calculate cost variance score (0-100, closer to 0% variance = higher score)
function calculateCostVarianceScore(variance: number): number {
  // -20% to +20% gets normalized to 0-100 score
  const absVariance = Math.abs(variance);
  if (absVariance >= 50) return 0;
  return 100 - (absVariance * 2);
}

// Calculate composite performance score
function calculateCompositeScore(
  onTimeRate: number,
  turnTimeScore: number,
  dwellTimeScore: number,
  reworkRate: number,
  costVarianceScore: number
): number {
  // Rework rate needs to be inverted (lower is better)
  const reworkScore = Math.max(0, 100 - (reworkRate * 10));

  return (
    onTimeRate * PERFORMANCE_WEIGHTS.onTimeRate +
    turnTimeScore * PERFORMANCE_WEIGHTS.turnTimeScore +
    dwellTimeScore * PERFORMANCE_WEIGHTS.dwellTimeScore +
    reworkScore * PERFORMANCE_WEIGHTS.reworkRate +
    costVarianceScore * PERFORMANCE_WEIGHTS.costVariance
  );
}

// Calculate performance metrics for a shop over a period
export async function calculateShopPerformance(
  shopId: string,
  periodStart: Date,
  periodEnd: Date,
  periodType: 'monthly' | 'quarterly' | 'yearly',
  companyId: string
) {
  // Get all completed assignments for this shop in the period
  const assignments = await prisma.planAssignment.findMany({
    where: {
      shopId,
      status: 'completed',
      updatedAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    include: {
      car: true,
    },
  });

  // Get the shop for base metrics
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error('Shop not found');

  // Calculate metrics
  let totalTurnTime = 0;
  let totalDwellTime = 0;
  let onTimeCount = 0;
  let totalEstimated = 0;
  let totalActual = 0;
  const turnTimeByType: Record<string, { total: number; count: number }> = {};

  for (const assignment of assignments) {
    // Turn time calculation
    if (assignment.car.shopEntryDate) {
      const entryDate = new Date(assignment.car.shopEntryDate);
      const completionDate = new Date(assignment.updatedAt);
      const turnTime = Math.ceil((completionDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      totalTurnTime += turnTime;

      // By repair type
      const repairType = assignment.car.reasonShopped || 'general';
      if (!turnTimeByType[repairType]) {
        turnTimeByType[repairType] = { total: 0, count: 0 };
      }
      turnTimeByType[repairType].total += turnTime;
      turnTimeByType[repairType].count += 1;

      // Dwell time (estimate based on difference from shop's base turn time)
      const expectedWorkDays = shop.baseTurnTime * shop.turnTimeMultiplier;
      const dwellTime = Math.max(0, turnTime - expectedWorkDays);
      totalDwellTime += dwellTime;
    }

    // On-time check (completed before projected month end)
    if (assignment.scheduledMonth) {
      const [year, month] = assignment.scheduledMonth.split('-').map(Number);
      const projectedEnd = new Date(year, month, 0); // Last day of month
      if (new Date(assignment.updatedAt) <= projectedEnd) {
        onTimeCount++;
      }
    }

    // Cost tracking
    totalEstimated += assignment.estimatedCost || 0;
    // Actual cost would come from invoicing - use estimated for now
    totalActual += assignment.estimatedCost || 0;
  }

  // Calculate rework rate (cars returning within 90 days)
  const reworkCars = await prisma.planAssignment.count({
    where: {
      shopId,
      status: 'completed',
      car: {
        assignments: {
          some: {
            id: { not: { in: assignments.map(a => a.id) } },
            shopId,
            status: 'completed',
            updatedAt: {
              gte: new Date(periodStart.getTime() - 90 * 24 * 60 * 60 * 1000),
              lte: periodEnd,
            },
          },
        },
      },
    },
  });

  const totalCompleted = assignments.length;
  const averageTurnTime = totalCompleted > 0 ? totalTurnTime / totalCompleted : 0;
  const averageDwellTime = totalCompleted > 0 ? totalDwellTime / totalCompleted : 0;
  const onTimeRate = totalCompleted > 0 ? (onTimeCount / totalCompleted) * 100 : 0;
  const reworkRate = totalCompleted > 0 ? (reworkCars / totalCompleted) * 100 : 0;
  const costVariance = totalEstimated > 0
    ? ((totalActual - totalEstimated) / totalEstimated) * 100
    : 0;

  // Calculate turn time by repair type
  const turnTimeByRepairType: Record<string, number> = {};
  for (const [type, data] of Object.entries(turnTimeByType)) {
    turnTimeByRepairType[type] = data.count > 0 ? data.total / data.count : 0;
  }

  // Get network averages for scoring
  const networkAvg = await calculateNetworkAverages(companyId);

  // Calculate component scores
  const turnTimeScore = calculateTurnTimeScore(averageTurnTime, networkAvg.avgTurnTime);
  const dwellTimeScore = calculateDwellTimeScore(averageDwellTime, networkAvg.avgDwellTime);
  const costVarianceScore = calculateCostVarianceScore(costVariance);

  // Calculate composite score
  const performanceScore = calculateCompositeScore(
    onTimeRate,
    turnTimeScore,
    dwellTimeScore,
    reworkRate,
    costVarianceScore
  );

  // Save or update performance record
  const performance = await prisma.shopPerformance.upsert({
    where: {
      shopId_periodStart_periodEnd_periodType: {
        shopId,
        periodStart,
        periodEnd,
        periodType,
      },
    },
    create: {
      shopId,
      periodStart,
      periodEnd,
      periodType,
      averageTurnTime,
      turnTimeByRepairType: JSON.stringify(turnTimeByRepairType),
      totalCompleted,
      onTimeCompleted: onTimeCount,
      onTimeRate,
      averageDwellTime,
      totalReleased: totalCompleted,
      reworkCount: reworkCars,
      reworkRate,
      totalEstimatedCost: totalEstimated,
      totalActualCost: totalActual,
      costVariance,
      performanceScore,
      companyId,
    },
    update: {
      averageTurnTime,
      turnTimeByRepairType: JSON.stringify(turnTimeByRepairType),
      totalCompleted,
      onTimeCompleted: onTimeCount,
      onTimeRate,
      averageDwellTime,
      totalReleased: totalCompleted,
      reworkCount: reworkCars,
      reworkRate,
      totalEstimatedCost: totalEstimated,
      totalActualCost: totalActual,
      costVariance,
      performanceScore,
    },
  });

  return performance;
}

// Get current performance scorecard for a shop
export async function getShopScorecard(shopId: string, companyId: string) {
  // Get latest performance record
  const latestPerformance = await prisma.shopPerformance.findFirst({
    where: { shopId, companyId },
    orderBy: { periodEnd: 'desc' },
  });

  // Get the shop details
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error('Shop not found');

  // Get network averages for comparison
  const networkAvg = await calculateNetworkAverages(companyId);

  // If no performance data, return estimated metrics based on shop config
  if (!latestPerformance) {
    const estimatedTurnTime = shop.baseTurnTime * shop.turnTimeMultiplier;
    return {
      shop: {
        id: shop.id,
        name: shop.name,
        code: shop.code,
        network: shop.network,
        region: shop.region,
      },
      metrics: {
        averageTurnTime: estimatedTurnTime,
        turnTimeByRepairType: {},
        onTimeRate: 0,
        averageDwellTime: 0,
        reworkRate: 0,
        costVariance: 0,
        performanceScore: 50, // Default neutral score
      },
      comparison: {
        turnTimeVsNetwork: estimatedTurnTime - networkAvg.avgTurnTime,
        onTimeVsNetwork: 0 - networkAvg.avgOnTimeRate,
        dwellTimeVsNetwork: 0 - networkAvg.avgDwellTime,
        reworkVsNetwork: 0 - networkAvg.avgReworkRate,
        costVarianceVsNetwork: 0 - networkAvg.avgCostVariance,
      },
      alerts: [],
      periodType: 'estimated',
      periodStart: null,
      periodEnd: null,
    };
  }

  // Parse turn time by type
  const turnTimeByRepairType = JSON.parse(latestPerformance.turnTimeByRepairType);

  // Generate alerts
  const alerts: { type: 'warning' | 'critical'; message: string }[] = [];

  // Check turn time vs network average
  if (latestPerformance.averageTurnTime > networkAvg.avgTurnTime * 1.5) {
    alerts.push({
      type: 'critical',
      message: `Turn time (${latestPerformance.averageTurnTime.toFixed(1)} days) is >50% above network average`,
    });
  } else if (latestPerformance.averageTurnTime > networkAvg.avgTurnTime * 1.2) {
    alerts.push({
      type: 'warning',
      message: `Turn time (${latestPerformance.averageTurnTime.toFixed(1)} days) is >20% above network average`,
    });
  }

  // Check on-time rate
  if (latestPerformance.onTimeRate < 70) {
    alerts.push({
      type: 'critical',
      message: `On-time rate (${latestPerformance.onTimeRate.toFixed(0)}%) is below 70% threshold`,
    });
  } else if (latestPerformance.onTimeRate < 85) {
    alerts.push({
      type: 'warning',
      message: `On-time rate (${latestPerformance.onTimeRate.toFixed(0)}%) is below 85% target`,
    });
  }

  // Check rework rate
  if (latestPerformance.reworkRate > 10) {
    alerts.push({
      type: 'critical',
      message: `Rework rate (${latestPerformance.reworkRate.toFixed(1)}%) exceeds 10% threshold`,
    });
  } else if (latestPerformance.reworkRate > 5) {
    alerts.push({
      type: 'warning',
      message: `Rework rate (${latestPerformance.reworkRate.toFixed(1)}%) is above 5% target`,
    });
  }

  // Check cost variance
  if (Math.abs(latestPerformance.costVariance) > 20) {
    alerts.push({
      type: 'critical',
      message: `Cost variance (${latestPerformance.costVariance > 0 ? '+' : ''}${latestPerformance.costVariance.toFixed(1)}%) exceeds 20%`,
    });
  } else if (Math.abs(latestPerformance.costVariance) > 10) {
    alerts.push({
      type: 'warning',
      message: `Cost variance (${latestPerformance.costVariance > 0 ? '+' : ''}${latestPerformance.costVariance.toFixed(1)}%) is above 10% target`,
    });
  }

  return {
    shop: {
      id: shop.id,
      name: shop.name,
      code: shop.code,
      network: shop.network,
      region: shop.region,
    },
    metrics: {
      averageTurnTime: latestPerformance.averageTurnTime,
      turnTimeByRepairType,
      onTimeRate: latestPerformance.onTimeRate,
      averageDwellTime: latestPerformance.averageDwellTime,
      reworkRate: latestPerformance.reworkRate,
      costVariance: latestPerformance.costVariance,
      performanceScore: latestPerformance.performanceScore,
    },
    comparison: {
      turnTimeVsNetwork: latestPerformance.averageTurnTime - networkAvg.avgTurnTime,
      onTimeVsNetwork: latestPerformance.onTimeRate - networkAvg.avgOnTimeRate,
      dwellTimeVsNetwork: latestPerformance.averageDwellTime - networkAvg.avgDwellTime,
      reworkVsNetwork: latestPerformance.reworkRate - networkAvg.avgReworkRate,
      costVarianceVsNetwork: Math.abs(latestPerformance.costVariance) - networkAvg.avgCostVariance,
    },
    alerts,
    periodType: latestPerformance.periodType,
    periodStart: latestPerformance.periodStart,
    periodEnd: latestPerformance.periodEnd,
  };
}

// Get all shop scorecards for the network
export async function getNetworkScorecard(companyId: string) {
  const shops = await prisma.shop.findMany({
    where: { companyId, isActive: true },
  });

  const scorecards = await Promise.all(
    shops.map(shop => getShopScorecard(shop.id, companyId))
  );

  const networkAvg = await calculateNetworkAverages(companyId);

  return {
    shops: scorecards,
    networkAverages: networkAvg,
    summary: {
      totalShops: shops.length,
      averagePerformanceScore: scorecards.reduce((sum, s) => sum + s.metrics.performanceScore, 0) / scorecards.length,
      shopsWithWarnings: scorecards.filter(s => s.alerts.some(a => a.type === 'warning')).length,
      shopsWithCriticalAlerts: scorecards.filter(s => s.alerts.some(a => a.type === 'critical')).length,
    },
  };
}

// Get weighted shop score for scenario builder
export function getWeightedShopScore(scorecard: Awaited<ReturnType<typeof getShopScorecard>>): number {
  return scorecard.metrics.performanceScore;
}

// Check if shop has performance concerns (for planning grid alerts)
export function hasPerformanceConcerns(scorecard: Awaited<ReturnType<typeof getShopScorecard>>): {
  hasConcerns: boolean;
  severity: 'none' | 'warning' | 'critical';
  reasons: string[];
} {
  const criticalAlerts = scorecard.alerts.filter(a => a.type === 'critical');
  const warningAlerts = scorecard.alerts.filter(a => a.type === 'warning');

  if (criticalAlerts.length > 0) {
    return {
      hasConcerns: true,
      severity: 'critical',
      reasons: criticalAlerts.map(a => a.message),
    };
  }

  if (warningAlerts.length > 0) {
    return {
      hasConcerns: true,
      severity: 'warning',
      reasons: warningAlerts.map(a => a.message),
    };
  }

  return {
    hasConcerns: false,
    severity: 'none',
    reasons: [],
  };
}

export default {
  calculateShopPerformance,
  getShopScorecard,
  getNetworkScorecard,
  getWeightedShopScore,
  hasPerformanceConcerns,
  PERFORMANCE_WEIGHTS,
};
