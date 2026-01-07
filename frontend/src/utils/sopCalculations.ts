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
  UtilizationStatus,
  DemandRegister,
  DemandRegisterItem,
  DemandRegisterSummary,
  PlanningState,
  WorkType
} from '../types/sop';
import type { Car, Shop } from '../types';

// Priority customers that get special handling
const PRIORITY_CUSTOMERS = ['Priority Customer A', 'Priority Customer B']; // TODO: Make configurable

/**
 * Format a date to "Mon-YY" format
 */
export function formatMonthYear(date: Date): string {
  const monthName = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `${monthName}-${year}`;
}

/**
 * Calculate days until a due date
 */
export function calculateDaysUntilDue(dueDate: string | null): number {
  if (!dueDate) return 999; // No due date = way out
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Determine planning state based on car data
 */
export function determinePlanningState(car: Car): PlanningState {
  // If car is already in shop or completed
  if (car.status === 'in_shop') return 'in_progress';
  if (car.status === 'arrived') return 'in_progress';

  // If car has an assigned shop and scheduled month, it's at least planned
  if (car.assignedShopId && car.projectedCompletionMonth) {
    // Check if it's just scheduled vs committed
    // For now, use status to differentiate
    if (car.status === 'scheduled') return 'scheduled';
    if (car.status === 'planned') return 'planned';
    return 'tentatively_scheduled';
  }

  // If car has a shop but no month, it's tentative
  if (car.assignedShopId) return 'tentatively_scheduled';

  // Default: not planned
  return 'not_planned';
}

/**
 * Build the demand register from actual car data
 * This is the PRIMARY source of demand - based on actual due dates
 */
export function buildDemandRegister(
  cars: Car[],
  shops: Shop[],
  filterYear?: number,
  includeRolling3Months: boolean = true
): DemandRegister {
  const now = new Date();
  const currentYear = filterYear || now.getFullYear();
  const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

  // Calculate rolling 3-month cutoff (into next year if needed)
  const rolling3MonthCutoff = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());

  const items: DemandRegisterItem[] = [];
  const shopMap = new Map(shops.map(s => [s.id, s]));

  // Process each car to determine if it belongs in the demand register
  cars.forEach(car => {
    // Skip retired cars
    if (car.status === 'retired') return;

    // Skip cars already completed (in_shop status handled separately)
    // We want to show in_progress cars too

    // QUALIFICATIONS: Cars with tankQualDueDate due this year or prior (including overdue)
    if (car.tankQualDueDate) {
      const qualDueDate = new Date(car.tankQualDueDate);
      const daysUntil = calculateDaysUntilDue(car.tankQualDueDate);

      // Include if:
      // 1. Due date is in the filter year or earlier (overdue)
      // 2. OR due date is within rolling 3 months (for visibility into next year planning)
      const isInFilterYear = qualDueDate <= yearEnd;
      const isInRolling3Months = includeRolling3Months && qualDueDate <= rolling3MonthCutoff;
      const isOverdue = daysUntil < 0;

      if (isInFilterYear || isInRolling3Months || isOverdue) {
        const shop = car.assignedShopId ? shopMap.get(car.assignedShopId) : null;

        items.push({
          carId: car.id,
          railcarNumber: car.railcarNumber,
          workType: 'full_qualification',
          dueDate: car.tankQualDueDate,
          dueMonth: formatMonthYear(qualDueDate),
          daysUntilDue: daysUntil,
          isOverdue: isOverdue,
          customer: car.customer,
          commodity: car.commodity,
          isTankCar: car.isTankCar,
          planningState: determinePlanningState(car),
          assignedShopId: car.assignedShopId,
          assignedShopName: shop?.name || null,
          scheduledMonth: car.projectedCompletionMonth || null,
          isPriorityCustomer: PRIORITY_CUSTOMERS.includes(car.customer),
          notes: car.notes,
          qualificationType: car.qualificationType,
          tankQualified: car.tankQualified
        });
      }
    }

    // RETURNS: Cars with contractExpiration (lease end dates) in the planning horizon
    // Returns are known 60+ days in advance, so look 6 months ahead
    if (car.contractExpiration) {
      const leaseEndDate = new Date(car.contractExpiration);
      const daysUntil = calculateDaysUntilDue(car.contractExpiration);
      const sixMonthsOut = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

      // Include returns coming in the next 6 months or overdue
      const isInHorizon = leaseEndDate <= sixMonthsOut;
      const isOverdue = daysUntil < 0;

      if ((isInHorizon || isOverdue) && car.status !== 'in_shop') {
        const shop = car.assignedShopId ? shopMap.get(car.assignedShopId) : null;

        // Don't double-count if already added as qualification
        const alreadyAdded = items.some(i => i.carId === car.id && (i.workType === 'full_qualification' || i.workType === 'partial_qualification'));
        if (!alreadyAdded) {
          items.push({
            carId: car.id,
            railcarNumber: car.railcarNumber,
            workType: 'release',
            dueDate: car.contractExpiration,
            dueMonth: formatMonthYear(leaseEndDate),
            daysUntilDue: daysUntil,
            isOverdue: isOverdue,
            customer: car.customer,
            commodity: car.commodity,
            isTankCar: car.isTankCar,
            planningState: determinePlanningState(car),
            assignedShopId: car.assignedShopId,
            assignedShopName: shop?.name || null,
            scheduledMonth: car.projectedCompletionMonth || null,
            isPriorityCustomer: PRIORITY_CUSTOMERS.includes(car.customer),
            notes: car.notes,
            leaseEndDate: car.contractExpiration
          });
        }
      }
    }

    // ASSIGNMENTS: Cars marked for assignment (pre-delivery prep)
    // These come from Commercial team triggers - use reasonShopped
    if (car.reasonShopped?.toLowerCase() === 'assignment' || car.status === 'assignment') {
      const shop = car.assignedShopId ? shopMap.get(car.assignedShopId) : null;
      const dueDate = car.nextServiceDue || null;
      const daysUntil = calculateDaysUntilDue(dueDate);

      // Don't double-count
      const alreadyAdded = items.some(i => i.carId === car.id);
      if (!alreadyAdded) {
        items.push({
          carId: car.id,
          railcarNumber: car.railcarNumber,
          workType: 'assignment',
          dueDate: dueDate,
          dueMonth: dueDate ? formatMonthYear(new Date(dueDate)) : formatMonthYear(now),
          daysUntilDue: daysUntil,
          isOverdue: daysUntil < 0,
          customer: car.customer,
          commodity: car.commodity,
          isTankCar: car.isTankCar,
          planningState: determinePlanningState(car),
          assignedShopId: car.assignedShopId,
          assignedShopName: shop?.name || null,
          scheduledMonth: car.projectedCompletionMonth || null,
          isPriorityCustomer: PRIORITY_CUSTOMERS.includes(car.customer),
          notes: car.notes
        });
      }
    }
  });

  // Sort items: overdue first, then by days until due
  items.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.daysUntilDue - b.daysUntilDue;
  });

  // Build summaries by work type
  const summaries = buildDemandSummaries(items);

  // Calculate totals
  const totalNotPlanned = items.filter(i => i.planningState === 'not_planned').length;
  const totalPlanned = items.filter(i => ['planned', 'tentatively_scheduled', 'awaiting_confirmation'].includes(i.planningState)).length;
  const totalScheduled = items.filter(i => i.planningState === 'scheduled').length;
  const totalOverdue = items.filter(i => i.isOverdue).length;

  return {
    items,
    summaries,
    totalNotPlanned,
    totalPlanned,
    totalScheduled,
    totalOverdue,
    filterYear: currentYear
  };
}

/**
 * Build summaries for each work type
 */
function buildDemandSummaries(items: DemandRegisterItem[]): DemandRegisterSummary[] {
  const workTypes: { type: WorkType; label: string }[] = [
    { type: 'qualification', label: 'Regulatory Qualifications' },
    { type: 'assignment', label: 'Assignments (Pre-Delivery)' },
    { type: 'return', label: 'Returns (Off-Lease)' },
    { type: 'repair', label: 'Repairs' },
    { type: 'maintenance', label: 'Scheduled Maintenance' },
    { type: 'project', label: 'Project Work' }
  ];

  return workTypes.map(({ type, label }) => {
    const typeItems = items.filter(i => i.workType === type);
    const byMonth = new Map<string, number>();

    typeItems.forEach(item => {
      const month = item.dueMonth;
      byMonth.set(month, (byMonth.get(month) || 0) + 1);
    });

    return {
      workType: type,
      label,
      total: typeItems.length,
      notPlanned: typeItems.filter(i => i.planningState === 'not_planned').length,
      tentativelyScheduled: typeItems.filter(i => i.planningState === 'tentatively_scheduled').length,
      awaitingConfirmation: typeItems.filter(i => i.planningState === 'awaiting_confirmation').length,
      planned: typeItems.filter(i => i.planningState === 'planned').length,
      scheduled: typeItems.filter(i => i.planningState === 'scheduled').length,
      overdue: typeItems.filter(i => i.isOverdue).length,
      byMonth
    };
  }).filter(s => s.total > 0); // Only include work types that have items
}

/**
 * Get demand register items grouped by month
 */
export function getDemandByMonth(register: DemandRegister): Map<string, DemandRegisterItem[]> {
  const byMonth = new Map<string, DemandRegisterItem[]>();

  register.items.forEach(item => {
    const month = item.dueMonth;
    if (!byMonth.has(month)) {
      byMonth.set(month, []);
    }
    byMonth.get(month)!.push(item);
  });

  return byMonth;
}

/**
 * Filter demand register by work type
 */
export function filterDemandByWorkType(register: DemandRegister, workType: WorkType): DemandRegisterItem[] {
  return register.items.filter(i => i.workType === workType);
}

/**
 * Filter demand register by planning state
 */
export function filterDemandByState(register: DemandRegister, state: PlanningState): DemandRegisterItem[] {
  return register.items.filter(i => i.planningState === state);
}

/**
 * Calculate demand from actual unassigned cars in the system
 * UPDATED: Now uses tankQualDueDate for qualifications instead of reasonShopped
 */
export function calculateDemandFromCars(cars: Car[], shops: Shop[] = [], filterYear?: number): {
  demandTypes: DemandType[];
  carsByReason: Map<string, Car[]>;
  totalUnassigned: number;
  demandRegister: DemandRegister;
} {
  // Build the demand register first
  const demandRegister = buildDemandRegister(cars, shops, filterYear);

  // Group items by work type for backward compatibility
  const carsByReason = new Map<string, Car[]>();

  // Get the actual cars for each work type from the demand register
  const fullQualCars = cars.filter(c => demandRegister.items.some(i => i.carId === c.id && i.workType === 'full_qualification'));
  const partialQualCars = cars.filter(c => demandRegister.items.some(i => i.carId === c.id && i.workType === 'partial_qualification'));
  const assignCars = cars.filter(c => demandRegister.items.some(i => i.carId === c.id && i.workType === 'assignment'));
  const releaseCars = cars.filter(c => demandRegister.items.some(i => i.carId === c.id && i.workType === 'release'));

  carsByReason.set('full_qualification', fullQualCars);
  carsByReason.set('partial_qualification', partialQualCars);
  carsByReason.set('assignment', assignCars);
  carsByReason.set('release', releaseCars);

  // Build demand types from actual counts
  const demandTypes: DemandType[] = [
    {
      id: 'full_qualification',
      name: 'Full Qualifications',
      annualVolume: fullQualCars.length, // Actual count, not annualized
      priority: 'HIGH',
      leadTime: 'Due by year-end',
      notes: `${demandRegister.summaries.find(s => s.workType === 'full_qualification')?.overdue || 0} overdue`
    },
    {
      id: 'partial_qualification',
      name: 'Partial Qualifications',
      annualVolume: partialQualCars.length,
      priority: 'HIGH',
      leadTime: 'Due by year-end',
      notes: `${demandRegister.summaries.find(s => s.workType === 'partial_qualification')?.overdue || 0} overdue`
    },
    {
      id: 'assignment',
      name: 'Assignments (Pre-Delivery)',
      annualVolume: assignCars.length,
      priority: 'MEDIUM',
      leadTime: '8-16 weeks',
      notes: 'Pre-delivery prep work'
    },
    {
      id: 'release',
      name: 'Releases (Off-Lease)',
      annualVolume: releaseCars.length,
      priority: 'MEDIUM',
      leadTime: '60+ day notice',
      notes: 'Lease expirations - 3-6 month horizon'
    }
  ];

  // Add other work types if they have items
  const otherTypes = demandRegister.summaries.filter(s =>
    !['full_qualification', 'partial_qualification', 'assignment', 'release'].includes(s.workType)
  );

  otherTypes.forEach(summary => {
    demandTypes.push({
      id: summary.workType,
      name: summary.label,
      annualVolume: summary.total,
      priority: summary.workType === 'repair' ? 'HIGH' : 'LOW',
      leadTime: 'Varies',
      notes: ''
    });
  });

  return {
    demandTypes,
    carsByReason,
    totalUnassigned: demandRegister.totalNotPlanned,
    demandRegister
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
