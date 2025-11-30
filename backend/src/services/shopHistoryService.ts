/**
 * Shop History Service
 *
 * Handles shop versioning and soft-delete for historical data integrity.
 * When a shop name changes, the old shop is marked Inactive and linked
 * to the new shop via a Previous Name field. All historical data
 * references the shop name at the time of the event.
 */

import { prisma } from './db';
import auditService from './auditService';

// =============================================================================
// TYPES
// =============================================================================

export interface ShopRenameInput {
  shopId: string;
  newName: string;
  newCode?: string;
  changeReason: string;
  userId: string;
  userEmail: string;
  companyId: string;
}

export interface ShopDeactivateInput {
  shopId: string;
  changeReason: string;
  successorShopId?: string;
  userId: string;
  userEmail: string;
  companyId: string;
}

export interface ShopHistoryEntry {
  id: string;
  shopId: string;
  name: string;
  code: string;
  version: number;
  validFrom: Date;
  validTo: Date | null;
  status: string;
  changeReason: string;
}

// =============================================================================
// SHOP VERSIONING
// =============================================================================

/**
 * Create a historical snapshot of a shop before changes
 */
export async function createShopSnapshot(
  shopId: string,
  userId: string,
  userEmail: string,
  companyId: string
): Promise<{ success: boolean; historyId?: string; error?: string }> {
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      return { success: false, error: 'Shop not found' };
    }

    // Get current version number
    const latestHistory = await prisma.shopHistory.findFirst({
      where: { shopId },
      orderBy: { version: 'desc' },
    });

    const newVersion = (latestHistory?.version || 0) + 1;

    // Close previous version if exists
    if (latestHistory && !latestHistory.validTo) {
      await prisma.shopHistory.update({
        where: { id: latestHistory.id },
        data: { validTo: new Date() },
      });
    }

    // Create new snapshot
    const history = await prisma.shopHistory.create({
      data: {
        shopId,
        name: shop.name,
        code: shop.code,
        location: shop.location,
        city: shop.city,
        state: shop.state,
        region: shop.region,
        network: shop.network,
        isAitxInternal: shop.isAitxInternal,
        tankQualified: shop.tankQualified,
        capacity: shop.capacity,
        version: newVersion,
        validFrom: new Date(),
        status: 'active',
        changedById: userId,
        changedByEmail: userEmail,
        companyId,
      },
    });

    return { success: true, historyId: history.id };
  } catch (error) {
    console.error('Error creating shop snapshot:', error);
    return { success: false, error: 'Failed to create shop snapshot' };
  }
}

/**
 * Rename a shop with version tracking
 * Creates a new version and links to the previous name
 */
export async function renameShop(
  input: ShopRenameInput
): Promise<{ success: boolean; shop?: unknown; error?: string }> {
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: input.shopId },
    });

    if (!shop) {
      return { success: false, error: 'Shop not found' };
    }

    const oldName = shop.name;
    const oldCode = shop.code;

    // Create snapshot of current state before rename
    await createShopSnapshot(input.shopId, input.userId, input.userEmail, input.companyId);

    // Update the last history entry with rename status
    const lastHistory = await prisma.shopHistory.findFirst({
      where: { shopId: input.shopId },
      orderBy: { version: 'desc' },
    });

    if (lastHistory) {
      await prisma.shopHistory.update({
        where: { id: lastHistory.id },
        data: {
          status: 'renamed',
          changeReason: input.changeReason,
          validTo: new Date(),
        },
      });
    }

    // Update the shop
    const updatedShop = await prisma.shop.update({
      where: { id: input.shopId },
      data: {
        name: input.newName,
        code: input.newCode || shop.code,
      },
    });

    // Create new active history entry
    const newHistory = await prisma.shopHistory.create({
      data: {
        shopId: input.shopId,
        name: input.newName,
        code: input.newCode || shop.code,
        location: shop.location,
        city: shop.city,
        state: shop.state,
        region: shop.region,
        network: shop.network,
        isAitxInternal: shop.isAitxInternal,
        tankQualified: shop.tankQualified,
        capacity: shop.capacity,
        version: (lastHistory?.version || 0) + 1,
        validFrom: new Date(),
        status: 'active',
        previousShopId: lastHistory?.id,
        changeReason: `Renamed from "${oldName}"`,
        changedById: input.userId,
        changedByEmail: input.userEmail,
        companyId: input.companyId,
      },
    });

    // Log audit
    await auditService.logAudit({
      userId: input.userId,
      userEmail: input.userEmail,
      action: 'update',
      entityType: 'Shop',
      entityId: input.shopId,
      entityName: input.newName,
      changes: {
        name: { old: oldName, new: input.newName },
        code: input.newCode ? { old: oldCode, new: input.newCode } : undefined,
      },
      metadata: {
        changeReason: input.changeReason,
        previousHistoryId: lastHistory?.id,
        newHistoryId: newHistory.id,
      },
      companyId: input.companyId,
    });

    return { success: true, shop: updatedShop };
  } catch (error) {
    console.error('Error renaming shop:', error);
    return { success: false, error: 'Failed to rename shop' };
  }
}

/**
 * Soft-delete a shop (mark as inactive)
 * Optionally link to a successor shop
 */
export async function deactivateShop(
  input: ShopDeactivateInput
): Promise<{ success: boolean; shop?: unknown; error?: string }> {
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: input.shopId },
    });

    if (!shop) {
      return { success: false, error: 'Shop not found' };
    }

    // Create final snapshot
    await createShopSnapshot(input.shopId, input.userId, input.userEmail, input.companyId);

    // Update the last history entry
    const lastHistory = await prisma.shopHistory.findFirst({
      where: { shopId: input.shopId },
      orderBy: { version: 'desc' },
    });

    if (lastHistory) {
      await prisma.shopHistory.update({
        where: { id: lastHistory.id },
        data: {
          status: 'inactive',
          changeReason: input.changeReason,
          successorShopId: input.successorShopId,
          validTo: new Date(),
        },
      });
    }

    // Soft-delete the shop (mark inactive)
    const updatedShop = await prisma.shop.update({
      where: { id: input.shopId },
      data: {
        isActive: false,
        shopStatus: 'inactive',
      },
    });

    // Log audit
    await auditService.logAudit({
      userId: input.userId,
      userEmail: input.userEmail,
      action: 'delete',
      entityType: 'Shop',
      entityId: input.shopId,
      entityName: shop.name,
      changes: {
        isActive: { old: true, new: false },
        shopStatus: { old: shop.shopStatus, new: 'inactive' },
      },
      metadata: {
        changeReason: input.changeReason,
        successorShopId: input.successorShopId,
        softDelete: true,
      },
      companyId: input.companyId,
    });

    return { success: true, shop: updatedShop };
  } catch (error) {
    console.error('Error deactivating shop:', error);
    return { success: false, error: 'Failed to deactivate shop' };
  }
}

/**
 * Merge two shops (one becomes inactive, linked to successor)
 */
export async function mergeShops(
  sourceShopId: string,
  targetShopId: string,
  mergeReason: string,
  userId: string,
  userEmail: string,
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sourceShop = await prisma.shop.findUnique({
      where: { id: sourceShopId },
    });

    const targetShop = await prisma.shop.findUnique({
      where: { id: targetShopId },
    });

    if (!sourceShop || !targetShop) {
      return { success: false, error: 'One or both shops not found' };
    }

    // Create snapshot of source shop
    await createShopSnapshot(sourceShopId, userId, userEmail, companyId);

    // Update source shop history
    const lastHistory = await prisma.shopHistory.findFirst({
      where: { shopId: sourceShopId },
      orderBy: { version: 'desc' },
    });

    if (lastHistory) {
      await prisma.shopHistory.update({
        where: { id: lastHistory.id },
        data: {
          status: 'merged',
          changeReason: mergeReason,
          successorShopId: targetShopId,
          validTo: new Date(),
        },
      });
    }

    // Soft-delete source shop
    await prisma.shop.update({
      where: { id: sourceShopId },
      data: {
        isActive: false,
        shopStatus: 'inactive',
      },
    });

    // Transfer assignments from source to target
    await prisma.car.updateMany({
      where: { assignedShopId: sourceShopId },
      data: { assignedShopId: targetShopId },
    });

    // Log audit
    await auditService.logAudit({
      userId,
      userEmail,
      action: 'update',
      entityType: 'Shop',
      entityId: sourceShopId,
      entityName: `${sourceShop.name} → ${targetShop.name}`,
      changes: {
        merge: { old: sourceShop.name, new: targetShop.name },
      },
      metadata: {
        mergeReason,
        sourceShopId,
        targetShopId,
      },
      companyId,
    });

    return { success: true };
  } catch (error) {
    console.error('Error merging shops:', error);
    return { success: false, error: 'Failed to merge shops' };
  }
}

// =============================================================================
// HISTORY RETRIEVAL
// =============================================================================

/**
 * Get full history for a shop
 */
export async function getShopHistory(shopId: string): Promise<ShopHistoryEntry[]> {
  const history = await prisma.shopHistory.findMany({
    where: { shopId },
    orderBy: { version: 'asc' },
  });

  return history.map((h) => ({
    id: h.id,
    shopId: h.shopId,
    name: h.name,
    code: h.code,
    version: h.version,
    validFrom: h.validFrom,
    validTo: h.validTo,
    status: h.status,
    changeReason: h.changeReason,
  }));
}

/**
 * Get shop name at a specific point in time
 * Used for historical reports to show the name that was active at that time
 */
export async function getShopNameAtTime(
  shopId: string,
  timestamp: Date
): Promise<string | null> {
  // First try to find the active version at that time
  const history = await prisma.shopHistory.findFirst({
    where: {
      shopId,
      validFrom: { lte: timestamp },
      OR: [
        { validTo: null },
        { validTo: { gt: timestamp } },
      ],
    },
    orderBy: { version: 'desc' },
  });

  if (history) {
    return history.name;
  }

  // Fall back to current shop name
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { name: true },
  });

  return shop?.name || null;
}

/**
 * Get shop code at a specific point in time
 */
export async function getShopCodeAtTime(
  shopId: string,
  timestamp: Date
): Promise<string | null> {
  const history = await prisma.shopHistory.findFirst({
    where: {
      shopId,
      validFrom: { lte: timestamp },
      OR: [
        { validTo: null },
        { validTo: { gt: timestamp } },
      ],
    },
    orderBy: { version: 'desc' },
  });

  if (history) {
    return history.code;
  }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { code: true },
  });

  return shop?.code || null;
}

/**
 * Get all shops that were active at a specific time
 */
export async function getActiveShopsAtTime(
  companyId: string,
  timestamp: Date
): Promise<ShopHistoryEntry[]> {
  const history = await prisma.shopHistory.findMany({
    where: {
      companyId,
      validFrom: { lte: timestamp },
      OR: [
        { validTo: null },
        { validTo: { gt: timestamp } },
      ],
      status: 'active',
    },
    orderBy: { name: 'asc' },
  });

  return history.map((h) => ({
    id: h.id,
    shopId: h.shopId,
    name: h.name,
    code: h.code,
    version: h.version,
    validFrom: h.validFrom,
    validTo: h.validTo,
    status: h.status,
    changeReason: h.changeReason,
  }));
}

/**
 * Find successor shop chain (for renamed/merged shops)
 */
export async function getSuccessorChain(
  shopId: string
): Promise<string[]> {
  const chain: string[] = [shopId];
  let currentId = shopId;

  while (true) {
    const history = await prisma.shopHistory.findFirst({
      where: {
        shopId: currentId,
        status: { in: ['renamed', 'merged'] },
        successorShopId: { not: null },
      },
      orderBy: { version: 'desc' },
    });

    if (!history || !history.successorShopId) break;

    chain.push(history.successorShopId);
    currentId = history.successorShopId;
  }

  return chain;
}

/**
 * Find the current active shop ID for a potentially renamed/merged shop
 */
export async function getCurrentShopId(
  historicalShopId: string
): Promise<string> {
  const chain = await getSuccessorChain(historicalShopId);
  return chain[chain.length - 1];
}

/**
 * Get all previous names for a shop
 */
export async function getPreviousNames(shopId: string): Promise<string[]> {
  const history = await prisma.shopHistory.findMany({
    where: { shopId },
    orderBy: { version: 'asc' },
    select: { name: true },
  });

  return [...new Set(history.map((h) => h.name))];
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createShopSnapshot,
  renameShop,
  deactivateShop,
  mergeShops,
  getShopHistory,
  getShopNameAtTime,
  getShopCodeAtTime,
  getActiveShopsAtTime,
  getSuccessorChain,
  getCurrentShopId,
  getPreviousNames,
};
