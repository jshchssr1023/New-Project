/**
 * Shop Rules API Routes
 *
 * Provides CRUD operations for shop assignment rules and rule testing.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../services/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { defaultRules, recommendShopsForCar } from '../services/ruleEngine';

const router = Router();

// Rule types with their configuration schemas
const RULE_TYPE_SCHEMAS = {
  capacity: {
    label: 'Capacity Check',
    description: 'Check shop capacity before assignment',
    conditions: [
      { key: 'minAvailable', type: 'number', label: 'Minimum Spots Available', default: 1 }
    ],
    actions: [
      { key: 'excludeIfFull', type: 'boolean', label: 'Exclude if at Capacity', default: true },
      { key: 'bonusScore', type: 'number', label: 'Bonus Score per Available Spot', default: 2 }
    ]
  },
  car_type: {
    label: 'Car Type Capability',
    description: 'Match car types to shop capabilities',
    conditions: [
      { key: 'matchCapabilities', type: 'boolean', label: 'Require Capability Match', default: true },
      { key: 'carTypes', type: 'array', label: 'Specific Car Types', default: [] }
    ],
    actions: [
      { key: 'bonusScore', type: 'number', label: 'Bonus Score if Matched', default: 20 },
      { key: 'penaltyIfMissing', type: 'number', label: 'Penalty if Not Matched', default: -50 }
    ]
  },
  region: {
    label: 'Region Preference',
    description: 'Prefer shops in the same region as the car',
    conditions: [
      { key: 'matchRegion', type: 'boolean', label: 'Match Home Region', default: true },
      { key: 'specificRegions', type: 'array', label: 'Specific Regions', default: [] }
    ],
    actions: [
      { key: 'bonusScore', type: 'number', label: 'Bonus Score for Same Region', default: 15 }
    ]
  },
  customer: {
    label: 'Customer Preference',
    description: 'Route cars to shops that prefer certain customers',
    conditions: [
      { key: 'matchPreferredCustomer', type: 'boolean', label: 'Match Preferred Customers', default: true },
      { key: 'specificCustomers', type: 'array', label: 'Specific Customers', default: [] }
    ],
    actions: [
      { key: 'bonusScore', type: 'number', label: 'Bonus Score for Match', default: 25 }
    ]
  },
  cost: {
    label: 'Cost Optimization',
    description: 'Prefer shops with lower costs',
    conditions: [
      { key: 'preferLowerCost', type: 'boolean', label: 'Prefer Lower Cost Shops', default: true },
      { key: 'maxCost', type: 'number', label: 'Maximum Cost per Car', default: 0 }
    ],
    actions: [
      { key: 'scoreWeight', type: 'number', label: 'Score Weight (0-1)', default: 0.1 }
    ]
  },
  turn_time: {
    label: 'Turn Time Optimization',
    description: 'Prefer shops with faster turnaround',
    conditions: [
      { key: 'preferFasterTurn', type: 'boolean', label: 'Prefer Faster Turn Time', default: true },
      { key: 'maxDays', type: 'number', label: 'Maximum Turn Days', default: 0 }
    ],
    actions: [
      { key: 'scoreWeight', type: 'number', label: 'Score Weight (0-1)', default: 0.1 }
    ]
  },
  performance: {
    label: 'Shop Performance',
    description: 'Consider shop performance metrics',
    conditions: [
      { key: 'usePerformanceMetrics', type: 'boolean', label: 'Use Performance Metrics', default: true },
      { key: 'minPerformanceScore', type: 'number', label: 'Minimum Performance Score', default: 0 }
    ],
    actions: [
      { key: 'performanceWeight', type: 'number', label: 'Performance Weight (0-1)', default: 0.25 },
      { key: 'penaltyForCritical', type: 'number', label: 'Penalty for Critical Issues', default: -30 },
      { key: 'penaltyForWarning', type: 'number', label: 'Penalty for Warnings', default: -15 }
    ]
  },
  custom: {
    label: 'Custom Rule',
    description: 'Define custom conditions and actions',
    conditions: [],
    actions: []
  }
};

// Get rule type schemas
router.get('/schemas', authenticateToken, async (req: Request, res: Response) => {
  res.json(RULE_TYPE_SCHEMAS);
});

// Get all rules for company
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  try {
    const rules = await prisma.shopRule.findMany({
      where: { companyId },
      orderBy: { priority: 'desc' },
    });

    // Parse JSON fields
    const parsedRules = rules.map(rule => ({
      ...rule,
      conditions: JSON.parse(rule.conditions),
      actions: JSON.parse(rule.actions),
      schema: RULE_TYPE_SCHEMAS[rule.ruleType as keyof typeof RULE_TYPE_SCHEMAS] || RULE_TYPE_SCHEMAS.custom
    }));

    res.json(parsedRules);
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// Get default rules (as template)
router.get('/defaults', authenticateToken, async (req: Request, res: Response) => {
  const defaultsWithSchemas = defaultRules.map((rule, index) => ({
    id: `default-${index}`,
    ...rule,
    conditions: JSON.parse(rule.conditions),
    actions: JSON.parse(rule.actions),
    schema: RULE_TYPE_SCHEMAS[rule.ruleType as keyof typeof RULE_TYPE_SCHEMAS] || RULE_TYPE_SCHEMAS.custom
  }));

  res.json(defaultsWithSchemas);
});

// Create a new rule
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  const { name, description, ruleType, priority, isActive, conditions, actions } = req.body;

  if (!name || !ruleType) {
    return res.status(400).json({ error: 'Name and rule type are required' });
  }

  try {
    const rule = await prisma.shopRule.create({
      data: {
        name,
        description: description || '',
        ruleType,
        priority: priority ?? 50,
        isActive: isActive ?? true,
        conditions: JSON.stringify(conditions || {}),
        actions: JSON.stringify(actions || {}),
        companyId,
      },
    });

    res.status(201).json({
      ...rule,
      conditions: JSON.parse(rule.conditions),
      actions: JSON.parse(rule.actions),
    });
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// Update a rule
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const { id } = req.params;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  const { name, description, ruleType, priority, isActive, conditions, actions } = req.body;

  try {
    // Verify rule belongs to company
    const existing = await prisma.shopRule.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const rule = await prisma.shopRule.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        description: description ?? existing.description,
        ruleType: ruleType ?? existing.ruleType,
        priority: priority ?? existing.priority,
        isActive: isActive ?? existing.isActive,
        conditions: conditions ? JSON.stringify(conditions) : existing.conditions,
        actions: actions ? JSON.stringify(actions) : existing.actions,
      },
    });

    res.json({
      ...rule,
      conditions: JSON.parse(rule.conditions),
      actions: JSON.parse(rule.actions),
    });
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// Delete a rule
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const { id } = req.params;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  try {
    const existing = await prisma.shopRule.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    await prisma.shopRule.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// Reorder rules (update priorities)
router.post('/reorder', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  const { ruleIds } = req.body as { ruleIds: string[] };

  if (!Array.isArray(ruleIds)) {
    return res.status(400).json({ error: 'ruleIds array required' });
  }

  try {
    // Update priorities in order (highest first)
    const updates = ruleIds.map((id, index) =>
      prisma.shopRule.updateMany({
        where: { id, companyId },
        data: { priority: 100 - index },
      })
    );

    await prisma.$transaction(updates);

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering rules:', error);
    res.status(500).json({ error: 'Failed to reorder rules' });
  }
});

// Toggle rule active status
router.post('/:id/toggle', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const { id } = req.params;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  try {
    const existing = await prisma.shopRule.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const rule = await prisma.shopRule.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    res.json({
      ...rule,
      conditions: JSON.parse(rule.conditions),
      actions: JSON.parse(rule.actions),
    });
  } catch (error) {
    console.error('Error toggling rule:', error);
    res.status(500).json({ error: 'Failed to toggle rule' });
  }
});

// Test rules against a car
router.post('/test', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  const { carId, month } = req.body;

  if (!carId || !month) {
    return res.status(400).json({ error: 'carId and month required' });
  }

  try {
    // Get the car
    const car = await prisma.car.findFirst({
      where: { id: carId, companyId },
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // Run rule engine
    const result = await recommendShopsForCar(
      prisma,
      companyId,
      {
        id: car.id,
        vehicleNumber: car.vehicleNumber,
        carType: car.carType,
        commodity: car.commodity || '',
        customer: car.customer || '',
        homeRegion: car.homeRegion || '',
        reasonShopped: '',
      },
      month
    );

    res.json(result);
  } catch (error) {
    console.error('Error testing rules:', error);
    res.status(500).json({ error: 'Failed to test rules' });
  }
});

// Reset to default rules
router.post('/reset-defaults', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  try {
    // Delete existing rules
    await prisma.shopRule.deleteMany({
      where: { companyId },
    });

    // Create default rules
    const createdRules = await prisma.$transaction(
      defaultRules.map(rule =>
        prisma.shopRule.create({
          data: {
            name: rule.name,
            description: '',
            ruleType: rule.ruleType,
            priority: rule.priority,
            isActive: rule.isActive,
            conditions: rule.conditions,
            actions: rule.actions,
            companyId,
          },
        })
      )
    );

    const parsedRules = createdRules.map(rule => ({
      ...rule,
      conditions: JSON.parse(rule.conditions),
      actions: JSON.parse(rule.actions),
    }));

    res.json(parsedRules);
  } catch (error) {
    console.error('Error resetting rules:', error);
    res.status(500).json({ error: 'Failed to reset rules' });
  }
});

export default router;
