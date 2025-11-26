// S&OP Calculation Utilities

import type {
  DemandType,
  AITXShop,
  ThirdPartyNetwork,
  SystemMetrics,
  MonthlyDemandForecast,
  MonthlyAllocation,
  ShopAllocation,
  CapacityStatus,
  SurplusStatus,
  UtilizationStatus
} from '../types/sop';
import type { Car } from '../types';

/**
 * Calculate demand from actual unassigned cars in the system
 */
export function calculateDemandFromCars(cars: Car[]): {
  demandTypes: DemandType[];
  carsByReason: Map<string, Car[]>;
  totalUnassigned: number;
} {
  // Filter to unassigned cars (available or scheduled but not yet assigned to a shop)
  const unassignedCars = cars.filter(car =>
    car.status === 'available' || car.status === 'scheduled'
  );

  // Group by reason shopped
  const carsByReason = new Map<string, Car[]>();
  unassignedCars.forEach(car => {
    const reason = car.reasonShopped || 'unspecified';
    if (!carsByReason.has(reason)) {
      carsByReason.set(reason, []);
    }
    carsByReason.get(reason)!.push(car);
  });

  // Map reason shopped to demand types
  const demandTypes: DemandType[] = [
    {
      id: 'qual',
      name: 'Regulatory Qualifications',
      annualVolume: (carsByReason.get('qualification')?.length || 0) * 12, // Annualize current snapshot
      priority: 'HIGH',
      leadTime: 'Due by year-end',
      notes: 'Commodity-based cycles (3-10yr)'
    },
    {
      id: 'assign',
      name: 'Assignments (Pre-Delivery)',
      annualVolume: (carsByReason.get('assignment')?.length || 0) * 12,
      priority: 'MEDIUM',
      leadTime: '90-120 days',
      notes: 'Pre-delivery prep work'
    },
    {
      id: 'return',
      name: 'Returns (Off-Lease)',
      annualVolume: (carsByReason.get('release')?.length || 0) * 12,
      priority: 'MEDIUM',
      leadTime: '60-day notice',
      notes: 'Lease expirations, 75-120 day cycle'
    },
    {
      id: 'project',
      name: 'Project Work',
      annualVolume: (carsByReason.get('project')?.length || 0) * 12,
      priority: 'MEDIUM',
      leadTime: 'Varies',
      notes: 'Customer projects'
    },
    {
      id: 'repair',
      name: 'Repairs',
      annualVolume: (carsByReason.get('repair')?.length || 0) * 12,
      priority: 'HIGH',
      leadTime: 'ASAP',
      notes: 'Damage repairs, failures'
    },
    {
      id: 'maintenance',
      name: 'Scheduled Maintenance',
      annualVolume: (carsByReason.get('maintenance')?.length || 0) * 12,
      priority: 'LOW',
      leadTime: 'Scheduled',
      notes: 'Routine maintenance'
    }
  ];

  return {
    demandTypes,
    carsByReason,
    totalUnassigned: unassignedCars.length
  };
}

/**
 * Get cars grouped by scheduled month (from nextServiceDue)
 */
export function getCarsByScheduledMonth(cars: Car[]): Map<string, Car[]> {
  const carsByMonth = new Map<string, Car[]>();
  const unassignedCars = cars.filter(car =>
    car.status === 'available' || car.status === 'scheduled'
  );

  unassignedCars.forEach(car => {
    let month: string;
    if (car.nextServiceDue) {
      const date = new Date(car.nextServiceDue);
      const monthName = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear().toString().slice(-2);
      month = `${monthName}-${year}`;
    } else {
      // Default to current month if no service date
      const now = new Date();
      const monthName = now.toLocaleString('en-US', { month: 'short' });
      const year = now.getFullYear().toString().slice(-2);
      month = `${monthName}-${year}`;
    }

    if (!carsByMonth.has(month)) {
      carsByMonth.set(month, []);
    }
    carsByMonth.get(month)!.push(car);
  });

  return carsByMonth;
}

/**
 * Generate 18-month labels starting from current month
 * Format: "Mon-YY" (e.g., "Dec-25", "Jan-26")
 */
export function generate18MonthLabels(startDate?: Date): string[] {
  const months: string[] = [];
  const start = startDate || new Date();

  for (let i = 0; i < 18; i++) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const monthName = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    months.push(`${monthName}-${year}`);
  }

  return months;
}

/**
 * Calculate total annual demand from demand types
 */
export function calculateTotalAnnualDemand(demandTypes: DemandType[]): number {
  return demandTypes.reduce((sum, d) => sum + d.annualVolume, 0);
}

/**
 * Calculate AITX total capacity
 */
export function calculateAITXCapacity(shops: AITXShop[]): { monthly: number; annual: number } {
  const monthly = shops.reduce((sum, s) => sum + s.monthlyCapacity, 0);
  return { monthly, annual: monthly * 12 };
}

/**
 * Calculate 3P total capacity
 */
export function calculate3PCapacity(networks: ThirdPartyNetwork[]): { monthly: number; annual: number } {
  const monthly = networks.reduce((sum, n) => sum + n.monthlyCapacity, 0);
  return { monthly, annual: monthly * 12 };
}

/**
 * Calculate system-level metrics for dashboard
 */
export function calculateSystemMetrics(
  demandTypes: DemandType[],
  aitxShops: AITXShop[],
  thirdPartyNetworks: ThirdPartyNetwork[]
): SystemMetrics {
  const totalAnnualDemand = calculateTotalAnnualDemand(demandTypes);
  const aitxCapacity = calculateAITXCapacity(aitxShops);
  const thirdPartyCapacity = calculate3PCapacity(thirdPartyNetworks);

  const totalSystemCapacity = aitxCapacity.annual + thirdPartyCapacity.annual;
  const capacitySurplusDeficit = totalSystemCapacity - totalAnnualDemand;
  const systemUtilizationRate = totalAnnualDemand / totalSystemCapacity;

  // Calculate percentages based on demand allocation (assuming AITX fills first)
  const aitxAllocation = Math.min(aitxCapacity.annual, totalAnnualDemand);
  const aitxPercentage = totalAnnualDemand > 0 ? aitxAllocation / totalAnnualDemand : 0;
  const thirdPartyPercentage = 1 - aitxPercentage;

  // Status indicators
  const capacityStatus: CapacityStatus = totalSystemCapacity >= totalAnnualDemand ? 'Sufficient' : 'SHORTAGE';
  const surplusStatus: SurplusStatus = capacitySurplusDeficit >= 0 ? 'Surplus' : 'DEFICIT';
  const utilizationStatus: UtilizationStatus = systemUtilizationRate <= 0.90 ? 'Healthy' : 'Over-Utilized';

  return {
    totalAnnualDemand,
    aitxAnnualCapacity: aitxCapacity.annual,
    thirdPartyAnnualCapacity: thirdPartyCapacity.annual,
    totalSystemCapacity,
    capacitySurplusDeficit,
    systemUtilizationRate,
    aitxPercentage,
    thirdPartyPercentage,
    capacityStatus,
    surplusStatus,
    utilizationStatus,
    monthlyDemand: totalAnnualDemand / 12,
    monthlyCapacity: (aitxCapacity.monthly + thirdPartyCapacity.monthly)
  };
}

/**
 * Generate monthly demand forecast
 */
export function generateMonthlyForecast(
  demandTypes: DemandType[],
  existingOverrides?: MonthlyDemandForecast[]
): MonthlyDemandForecast[] {
  const months = generate18MonthLabels();
  const overrideMap = new Map(existingOverrides?.map(o => [o.month, o]) || []);

  return months.map(month => {
    const override = overrideMap.get(month);
    if (override?.isOverride) {
      return override;
    }

    const qualifications = demandTypes.find(d => d.id === 'qual')?.annualVolume || 0;
    const assignments = demandTypes.find(d => d.id === 'assign')?.annualVolume || 0;
    const returns = demandTypes.find(d => d.id === 'return')?.annualVolume || 0;
    const external = demandTypes.find(d => d.id === 'external')?.annualVolume || 0;

    return {
      month,
      qualifications: Math.round(qualifications / 12),
      assignments: Math.round(assignments / 12),
      returns: Math.round(returns / 12),
      external: Math.round(external / 12),
      total: Math.round((qualifications + assignments + returns + external) / 12),
      isOverride: false
    };
  });
}

/**
 * Generate default monthly allocations based on demand and capacity
 */
export function generateMonthlyAllocations(
  demandForecasts: MonthlyDemandForecast[],
  aitxShops: AITXShop[],
  thirdPartyNetworks: ThirdPartyNetwork[]
): MonthlyAllocation[] {
  return demandForecasts.map(forecast => {
    const shopAllocations: ShopAllocation[] = [];
    let remainingDemand = forecast.total;

    // First, allocate to AITX shops (up to utilization target)
    let aitxSubtotal = 0;
    for (const shop of aitxShops) {
      const targetAllocation = Math.floor(shop.monthlyCapacity * shop.utilizationTarget);
      const allocation = Math.min(targetAllocation, remainingDemand);
      shopAllocations.push({
        shopId: shop.id,
        shopName: shop.location,
        cars: allocation,
        isAITX: true
      });
      aitxSubtotal += allocation;
      remainingDemand -= allocation;
    }

    // Then, allocate to 3P networks
    let thirdPartySubtotal = 0;
    for (const network of thirdPartyNetworks) {
      const availableCapacity = Math.floor(network.monthlyCapacity * network.availabilityFactor);
      const allocation = Math.min(availableCapacity, remainingDemand);
      shopAllocations.push({
        shopId: network.id,
        shopName: network.name,
        cars: allocation,
        isAITX: false
      });
      thirdPartySubtotal += allocation;
      remainingDemand -= allocation;
    }

    const totalPlanned = aitxSubtotal + thirdPartySubtotal;
    const totalCapacity = aitxShops.reduce((sum, s) => sum + s.monthlyCapacity, 0) +
                          thirdPartyNetworks.reduce((sum, n) => sum + n.monthlyCapacity, 0);

    return {
      month: forecast.month,
      shopAllocations,
      aitxSubtotal,
      thirdPartySubtotal,
      totalPlanned,
      demandForMonth: forecast.total,
      unallocatedDemand: Math.max(0, forecast.total - totalPlanned),
      systemUtilization: forecast.total / totalCapacity
    };
  });
}

/**
 * Calculate demand type percentages
 */
export function calculateDemandPercentages(demandTypes: DemandType[]): DemandType[] {
  const total = calculateTotalAnnualDemand(demandTypes);
  return demandTypes.map(d => ({
    ...d,
    percentOfTotal: total > 0 ? (d.annualVolume / total) * 100 : 0
  }));
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format percentage
 */
export function formatPercent(num: number, decimals: number = 1): string {
  return `${(num * 100).toFixed(decimals)}%`;
}

/**
 * Validate allocations - check for errors
 */
export function validateAllocations(
  allocations: MonthlyAllocation[],
  aitxShops: AITXShop[],
  thirdPartyNetworks: ThirdPartyNetwork[]
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const allocation of allocations) {
    // Check for unallocated demand
    if (allocation.unallocatedDemand > 0) {
      warnings.push(`${allocation.month}: ${allocation.unallocatedDemand} cars unallocated`);
    }

    // Check for over-capacity allocations
    for (const shopAlloc of allocation.shopAllocations) {
      if (shopAlloc.isAITX) {
        const shop = aitxShops.find(s => s.id === shopAlloc.shopId);
        if (shop && shopAlloc.cars > shop.monthlyCapacity) {
          errors.push(`${allocation.month}: ${shop.location} exceeds capacity (${shopAlloc.cars}/${shop.monthlyCapacity})`);
        }
      } else {
        const network = thirdPartyNetworks.find(n => n.id === shopAlloc.shopId);
        if (network && shopAlloc.cars > network.monthlyCapacity) {
          errors.push(`${allocation.month}: ${network.name} exceeds capacity (${shopAlloc.cars}/${network.monthlyCapacity})`);
        }
      }
    }

    // Check utilization
    if (allocation.systemUtilization > 0.95) {
      warnings.push(`${allocation.month}: System utilization at ${formatPercent(allocation.systemUtilization)} - near capacity`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Export data to Excel-compatible format
 */
export function exportToExcelData(
  demandTypes: DemandType[],
  aitxShops: AITXShop[],
  thirdPartyNetworks: ThirdPartyNetwork[],
  allocations: MonthlyAllocation[]
): {
  demandSheet: Record<string, unknown>[];
  capacitySheet: Record<string, unknown>[];
  allocationSheet: Record<string, unknown>[];
} {
  // Demand data
  const demandSheet = demandTypes.map(d => ({
    'Demand Type': d.name,
    'Annual Volume': d.annualVolume,
    'Monthly Average': Math.round(d.annualVolume / 12),
    'Priority': d.priority,
    'Lead Time': d.leadTime,
    'Notes': d.notes
  }));

  // Capacity data
  const capacitySheet = [
    ...aitxShops.map(s => ({
      'Type': 'AITX',
      'Name': s.location,
      'Car Types': s.carTypes,
      'Monthly Capacity': s.monthlyCapacity,
      'Annual Capacity': s.annualCapacity,
      'Utilization Target': `${s.utilizationTarget * 100}%`,
      'Cost Index': s.costIndex,
      'Tank Qualified': s.isTankQualified ? 'Yes' : 'No'
    })),
    ...thirdPartyNetworks.map(n => ({
      'Type': '3P',
      'Name': n.name,
      'Car Types': n.carTypes,
      'Monthly Capacity': n.monthlyCapacity,
      'Annual Capacity': n.annualCapacity,
      'Utilization Target': `${n.availabilityFactor * 100}%`,
      'Cost Index': n.costIndex,
      'Tank Qualified': n.carTypes === 'Tank & Freight' ? 'Yes' : 'No'
    }))
  ];

  // Allocation data (pivot table style)
  const allocationSheet = allocations.map(a => {
    const row: Record<string, unknown> = { 'Month': a.month };
    a.shopAllocations.forEach(sa => {
      row[sa.shopName] = sa.cars;
    });
    row['AITX Total'] = a.aitxSubtotal;
    row['3P Total'] = a.thirdPartySubtotal;
    row['Grand Total'] = a.totalPlanned;
    row['Demand'] = a.demandForMonth;
    row['Unallocated'] = a.unallocatedDemand;
    row['Utilization'] = `${(a.systemUtilization * 100).toFixed(1)}%`;
    return row;
  });

  return { demandSheet, capacitySheet, allocationSheet };
}
