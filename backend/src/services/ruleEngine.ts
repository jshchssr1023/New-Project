import { prisma } from './db';
import shopPerformanceService from './shopPerformanceService';

interface Car {
  id: string;
  vehicleNumber: string;
  railcarNumber?: string; // Alternative name
  carType: string;
  commodity: string;
  customer: string;
  homeRegion: string;
  reasonShopped: string;
  reasonsShopped?: string; // JSON array version
  isTankCar: boolean; // Critical for tank qualification validation
}

// Cache for performance scores to avoid repeated DB calls
const performanceScoreCache = new Map<string, { score: number; concerns: { hasConcerns: boolean; severity: string; reasons: string[] }; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface Shop {
  id: string;
  name: string;
  code: string;
  region: string;
  capacity: number;
  baseCostPerCar: number;
  baseTurnTime: number;
  capabilities: string;
  certifications: string;
  preferredCustomers: string;
  isActive: boolean;
  tankQualified: boolean; // Critical: Can this shop service tank cars?
}

interface ShopRule {
  id: string;
  name: string;
  ruleType: string;
  priority: number;
  isActive: boolean;
  conditions: string;
  actions: string;
}

interface ShopScore {
  shopId: string;
  shopName: string;
  shopCode: string;
  score: number;
  reasons: string[];
  estimatedCost: number;
  estimatedDays: number;
  capacityAvailable: number;
  isRecommended: boolean;
  performanceAlertSeverity?: 'none' | 'warning' | 'critical';
}

interface RuleEngineResult {
  carId: string;
  carNumber: string;
  suggestedShopId: string | null;
  suggestedShopName: string | null;
  allScores: ShopScore[];
  ruleNotes: string;
}

// Default rules if no custom rules are defined
const defaultRules: Omit<ShopRule, 'id'>[] = [
  {
    name: 'Tank Car Qualification',
    ruleType: 'tank_qualification',
    priority: 150, // HIGHEST PRIORITY - tank cars MUST go to qualified shops
    isActive: true,
    conditions: JSON.stringify({ requireTankQualification: true }),
    actions: JSON.stringify({ excludeIfNotQualified: true }),
  },
  {
    name: 'Capacity Check',
    ruleType: 'capacity',
    priority: 100,
    isActive: true,
    conditions: JSON.stringify({ minAvailable: 1 }),
    actions: JSON.stringify({ excludeIfFull: true }),
  },
  {
    name: 'Car Type Capability',
    ruleType: 'car_type',
    priority: 90,
    isActive: true,
    conditions: JSON.stringify({ matchCapabilities: true }),
    actions: JSON.stringify({ bonusScore: 20, penaltyIfMissing: -50 }),
  },
  {
    name: 'Region Preference',
    ruleType: 'region',
    priority: 80,
    isActive: true,
    conditions: JSON.stringify({ matchRegion: true }),
    actions: JSON.stringify({ bonusScore: 15 }),
  },
  {
    name: 'Customer Preference',
    ruleType: 'customer',
    priority: 70,
    isActive: true,
    conditions: JSON.stringify({ matchPreferredCustomer: true }),
    actions: JSON.stringify({ bonusScore: 25 }),
  },
  {
    name: 'Cost Optimization',
    ruleType: 'cost',
    priority: 60,
    isActive: true,
    conditions: JSON.stringify({ preferLowerCost: true }),
    actions: JSON.stringify({ scoreWeight: 0.1 }),
  },
  {
    name: 'Turn Time Optimization',
    ruleType: 'turn_time',
    priority: 50,
    isActive: true,
    conditions: JSON.stringify({ preferFasterTurn: true }),
    actions: JSON.stringify({ scoreWeight: 0.1 }),
  },
  {
    name: 'Shop Performance Score',
    ruleType: 'performance',
    priority: 85, // High priority - after capacity but before other factors
    isActive: true,
    conditions: JSON.stringify({ usePerformanceMetrics: true }),
    actions: JSON.stringify({
      performanceWeight: 0.25, // 25% of score from performance
      penaltyForCritical: -30, // Penalty for shops with critical alerts
      penaltyForWarning: -15, // Penalty for shops with warning alerts
    }),
  },
];

// Helper function to get cached or fresh performance score
async function getShopPerformanceScore(
  shopId: string,
  companyId: string
): Promise<{ score: number; concerns: { hasConcerns: boolean; severity: string; reasons: string[] } }> {
  const cacheKey = `${shopId}-${companyId}`;
  const cached = performanceScoreCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return { score: cached.score, concerns: cached.concerns };
  }

  try {
    const scorecard = await shopPerformanceService.getShopScorecard(shopId, companyId);
    const concerns = shopPerformanceService.hasPerformanceConcerns(scorecard);

    const result = {
      score: scorecard.metrics.performanceScore,
      concerns,
    };

    performanceScoreCache.set(cacheKey, {
      ...result,
      timestamp: now,
    });

    return result;
  } catch (error) {
    // If performance data unavailable, return neutral score
    return {
      score: 50,
      concerns: { hasConcerns: false, severity: 'none', reasons: [] },
    };
  }
}

export async function evaluateShopForCar(
  prisma: any,
  car: Car,
  shop: Shop,
  month: string,
  rules: ShopRule[],
  shopCapacity: Map<string, number>,
  companyId?: string
): Promise<ShopScore> {
  let score = 50; // Base score
  const reasons: string[] = [];
  let performanceAlertSeverity: 'none' | 'warning' | 'critical' = 'none';

  // Parse shop JSON fields with safe fallbacks
  let capabilities: string[] = [];
  let preferredCustomers: string[] = [];
  try {
    capabilities = shop.capabilities ? JSON.parse(shop.capabilities) : [];
  } catch {
    capabilities = [];
  }
  try {
    preferredCustomers = shop.preferredCustomers ? JSON.parse(shop.preferredCustomers) : [];
  } catch {
    preferredCustomers = [];
  }

  // Get available capacity
  const currentLoad = shopCapacity.get(shop.id) || 0;
  const capacityAvailable = shop.capacity - currentLoad;

  // Apply each rule
  for (const rule of rules.filter(r => r.isActive).sort((a, b) => b.priority - a.priority)) {
    let conditions: Record<string, unknown> = {};
    let actions: Record<string, unknown> = {};
    try {
      conditions = JSON.parse(rule.conditions);
      actions = JSON.parse(rule.actions);
    } catch {
      // Skip malformed rules
      continue;
    }

    switch (rule.ruleType) {
      case 'tank_qualification':
        // CRITICAL: Tank cars MUST go to tank-qualified shops
        if (car.isTankCar && conditions.requireTankQualification) {
          if (!shop.tankQualified) {
            if (actions.excludeIfNotQualified) {
              score = -2000; // Absolutely exclude this shop
              reasons.push(`EXCLUDED: Shop not qualified for tank cars`);
            }
          } else {
            // Bonus for being tank-qualified when car needs it
            score += 10;
            reasons.push(`Tank car qualified`);
          }
        }
        break;

      case 'capacity':
        if (capacityAvailable < (conditions.minAvailable || 1)) {
          if (actions.excludeIfFull) {
            score = -1000; // Exclude this shop
            reasons.push(`No capacity available (${currentLoad}/${shop.capacity})`);
          }
        } else {
          // Bonus for more available capacity
          const capacityBonus = Math.min(10, capacityAvailable * 2);
          score += capacityBonus;
          reasons.push(`Capacity available: ${capacityAvailable}`);
        }
        break;

      case 'performance':
        if (companyId && conditions.usePerformanceMetrics) {
          try {
            const perfData = await getShopPerformanceScore(shop.id, companyId);

            // Add weighted performance score
            const perfWeight = actions.performanceWeight || 0.25;
            const perfBonus = (perfData.score - 50) * perfWeight; // Normalize around 50
            score += perfBonus;

            // Apply penalties for shops with alerts
            if (perfData.concerns.hasConcerns) {
              if (perfData.concerns.severity === 'critical') {
                score += actions.penaltyForCritical || -30;
                performanceAlertSeverity = 'critical';
                reasons.push(`⚠️ Critical performance issues: ${perfData.concerns.reasons[0]}`);
              } else if (perfData.concerns.severity === 'warning') {
                score += actions.penaltyForWarning || -15;
                performanceAlertSeverity = 'warning';
                reasons.push(`⚡ Performance warning: ${perfData.concerns.reasons[0]}`);
              }
            } else if (perfData.score >= 70) {
              reasons.push(`✓ Strong performance record (${perfData.score.toFixed(0)})`);
            }
          } catch (error) {
            // Performance data unavailable, continue without penalty
          }
        }
        break;

      case 'car_type':
        if (capabilities.length > 0) {
          if (capabilities.includes(car.carType)) {
            score += actions.bonusScore || 20;
            reasons.push(`Handles ${car.carType}`);
          } else {
            score += actions.penaltyIfMissing || -50;
            reasons.push(`Does not handle ${car.carType}`);
          }
        }
        break;

      case 'region':
        if (car.homeRegion && shop.region) {
          if (car.homeRegion === shop.region) {
            score += actions.bonusScore || 15;
            reasons.push(`Same region: ${shop.region}`);
          }
        }
        break;

      case 'customer':
        if (preferredCustomers.length > 0 && car.customer) {
          if (preferredCustomers.includes(car.customer)) {
            score += actions.bonusScore || 25;
            reasons.push(`Preferred customer: ${car.customer}`);
          }
        }
        break;

      case 'cost':
        // Lower cost is better - normalize against average
        const costScore = Math.max(0, 20 - (shop.baseCostPerCar / 1000));
        score += costScore * (actions.scoreWeight || 0.1);
        break;

      case 'turn_time':
        // Faster turn time is better
        const turnScore = Math.max(0, 20 - (shop.baseTurnTime / 2));
        score += turnScore * (actions.scoreWeight || 0.1);
        break;
    }
  }

  return {
    shopId: shop.id,
    shopName: shop.name,
    shopCode: shop.code,
    score: Math.round(score * 10) / 10,
    reasons,
    estimatedCost: shop.baseCostPerCar,
    estimatedDays: shop.baseTurnTime,
    capacityAvailable,
    isRecommended: score > 60,
    performanceAlertSeverity,
  };
}

export async function recommendShopsForCar(
  prisma: any,
  companyId: string,
  car: Car,
  month: string
): Promise<RuleEngineResult> {
  // Get all active shops
  const shops = await prisma.shop.findMany({
    where: {
      companyId,
      isActive: true,
    },
  });

  // Always use default rules (built-in logic for capacity, tank qualification, etc.)
  const rules = defaultRules.map((r, i) => ({ ...r, id: `default-${i}` })) as ShopRule[];

  // Get current capacity usage for the month
  const assignments = await prisma.planAssignment.groupBy({
    by: ['shopId'],
    where: {
      scheduledMonth: month,
      shop: { companyId },
    },
    _count: { id: true },
  });

  const shopCapacity = new Map<string, number>(assignments.map(a => [a.shopId, a._count.id]));

  // Score each shop
  const scores: ShopScore[] = [];
  for (const shop of shops) {
    const score = await evaluateShopForCar(prisma, car, shop as Shop, month, rules, shopCapacity, companyId);
    if (score.score > -100) { // Include shops that aren't completely excluded
      scores.push(score);
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Get best shop
  const bestShop = scores.find(s => s.score > 0);

  return {
    carId: car.id,
    carNumber: car.vehicleNumber,
    suggestedShopId: bestShop?.shopId || null,
    suggestedShopName: bestShop?.shopName || null,
    allScores: scores,
    ruleNotes: bestShop
      ? `Recommended: ${bestShop.shopName} (Score: ${bestShop.score}). ${bestShop.reasons.join('; ')}`
      : 'No suitable shop found',
  };
}

export async function recommendShopsForMultipleCars(
  prisma: any,
  companyId: string,
  cars: Car[],
  month: string
): Promise<RuleEngineResult[]> {
  const results: RuleEngineResult[] = [];

  // Process in batches to update capacity as we go
  const runningCapacity = new Map<string, number>();

  // Get initial capacity
  const assignments = await prisma.planAssignment.groupBy({
    by: ['shopId'],
    where: {
      scheduledMonth: month,
      shop: { companyId },
    },
    _count: { id: true },
  });

  assignments.forEach(a => runningCapacity.set(a.shopId, a._count.id));

  for (const car of cars) {
    const result = await recommendShopsForCar(prisma, companyId, car, month);

    // Update running capacity if a shop was recommended
    if (result.suggestedShopId) {
      const current = runningCapacity.get(result.suggestedShopId) || 0;
      runningCapacity.set(result.suggestedShopId, current + 1);
    }

    results.push(result);
  }

  return results;
}

export { defaultRules };
