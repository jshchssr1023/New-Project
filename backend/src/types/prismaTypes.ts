/**
 * Local type definitions for Prisma models
 * Used when Prisma client generation is unavailable
 */

export interface MasterPlan {
  id: string;
  companyId: string;
  planName: string;
  fiscalYear: number;
  version: number;
  status: string;
  baseScenarioId: string | null;
  approvedAt: Date | null;
  approvedById: string | null;
  validFrom: Date;
  validTo: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MasterPlanCommitment {
  id: string;
  masterPlanId: string;
  carId: string;
  shopId: string;
  customerId: string | null;
  scheduledMonth: string;
  serviceType: string;
  estimatedCost: number;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// Re-export Prisma namespace for type compatibility
export namespace Prisma {
  export interface MasterPlanWhereInput {
    id?: string | { in?: string[]; not?: string; equals?: string };
    companyId?: string;
    fiscalYear?: number | { gte?: number; lte?: number };
    status?: string | { in?: string[] };
    validFrom?: Date | { gte?: Date; lte?: Date };
    validTo?: Date | { gte?: Date; lte?: Date };
    [key: string]: unknown;
  }

  export interface MasterPlanCommitmentCreateManyInput {
    id?: string;
    masterPlanId: string;
    carId: string;
    shopId: string;
    customerId?: string | null;
    scheduledMonth: string;
    serviceType?: string;
    estimatedCost?: number;
    notes?: string | null;
    status?: string;
  }
}
