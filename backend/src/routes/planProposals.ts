/**
 * Plan Proposal Routes
 *
 * API endpoints for the customer approval workflow.
 * Supports the workflow: Create Plan → Send to Customer → Get Approval → Schedule
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import planProposalService from '../services/planProposalService';
import { ProposalStatus } from '../types/prismaTypes';
import { getParam } from '../utils/routeParams';

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const createProposalSchema = z.object({
  scenarioId: z.string().uuid(),
  customerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const sendProposalSchema = z.object({
  sentToEmail: z.string().email(),
  sentToName: z.string().min(1),
});

const recordApprovalSchema = z.object({
  approvedBy: z.string().min(1),
  approverEmail: z.string().email().optional(),
  approverTitle: z.string().optional(),
  responseNotes: z.string().optional(),
});

const recordRejectionSchema = z.object({
  rejectionReason: z.string().min(1),
  responseNotes: z.string().optional(),
});

const requestRevisionSchema = z.object({
  responseNotes: z.string().min(1),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/proposals
 * List all proposals with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { companyId: string } }).user;
    if (!user?.companyId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { customerId, status, sentAfter, sentBefore } = req.query;

    const filters = {
      companyId: user.companyId,
      customerId: customerId as string | undefined,
      status: status
        ? (status as string).includes(',')
          ? ((status as string).split(',') as ProposalStatus[])
          : (status as ProposalStatus)
        : undefined,
      sentAfter: sentAfter ? new Date(sentAfter as string) : undefined,
      sentBefore: sentBefore ? new Date(sentBefore as string) : undefined,
    };

    const proposals = await planProposalService.listProposals(filters);
    res.json(proposals);
  } catch (error) {
    console.error('Error listing proposals:', error);
    res.status(500).json({ error: 'Failed to list proposals' });
  }
});

/**
 * GET /api/proposals/stats
 * Get proposal statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { companyId: string } }).user;
    if (!user?.companyId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await planProposalService.getProposalStats(user.companyId);
    res.json(stats);
  } catch (error) {
    console.error('Error getting proposal stats:', error);
    res.status(500).json({ error: 'Failed to get proposal statistics' });
  }
});

/**
 * GET /api/proposals/scheduling-queue
 * Get approved proposals awaiting scheduling
 */
router.get('/scheduling-queue', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { companyId: string } }).user;
    if (!user?.companyId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const queue = await planProposalService.getSchedulingQueue(user.companyId);
    res.json(queue);
  } catch (error) {
    console.error('Error getting scheduling queue:', error);
    res.status(500).json({ error: 'Failed to get scheduling queue' });
  }
});

/**
 * GET /api/proposals/:id
 * Get a single proposal by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const proposal = await planProposalService.getProposal(id);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json(proposal);
  } catch (error) {
    console.error('Error getting proposal:', error);
    res.status(500).json({ error: 'Failed to get proposal' });
  }
});

/**
 * POST /api/proposals
 * Create a new proposal from a scenario
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { id: string; companyId: string } }).user;
    if (!user?.companyId || !user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validationResult = createProposalSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { scenarioId, customerId, name, description, expiresAt } = validationResult.data;

    const proposal = await planProposalService.createProposal({
      scenarioId,
      customerId,
      name,
      description,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdById: user.id,
      companyId: user.companyId,
    });

    res.status(201).json(proposal);
  } catch (error) {
    console.error('Error creating proposal:', error);
    const message = error instanceof Error ? error.message : 'Failed to create proposal';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/proposals/:id/send
 * Send a proposal to the customer
 */
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const id = getParam(req.params.id);

    const validationResult = sendProposalSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { sentToEmail, sentToName } = validationResult.data;

    const proposal = await planProposalService.sendProposal({
      proposalId: id,
      sentById: user.id,
      sentToEmail,
      sentToName,
    });

    res.json(proposal);
  } catch (error) {
    console.error('Error sending proposal:', error);
    const message = error instanceof Error ? error.message : 'Failed to send proposal';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/proposals/:id/approve
 * Record customer approval
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);

    const validationResult = recordApprovalSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const proposal = await planProposalService.recordApproval({
      proposalId: id,
      approvedBy: validationResult.data.approvedBy,
      approverEmail: validationResult.data.approverEmail,
      approverTitle: validationResult.data.approverTitle,
      responseNotes: validationResult.data.responseNotes,
    });

    res.json(proposal);
  } catch (error) {
    console.error('Error approving proposal:', error);
    const message = error instanceof Error ? error.message : 'Failed to record approval';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/proposals/:id/reject
 * Record customer rejection
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);

    const validationResult = recordRejectionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const proposal = await planProposalService.recordRejection({
      proposalId: id,
      rejectionReason: validationResult.data.rejectionReason,
      responseNotes: validationResult.data.responseNotes,
    });

    res.json(proposal);
  } catch (error) {
    console.error('Error rejecting proposal:', error);
    const message = error instanceof Error ? error.message : 'Failed to record rejection';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/proposals/:id/request-revision
 * Record customer revision request
 */
router.post('/:id/request-revision', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);

    const validationResult = requestRevisionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const proposal = await planProposalService.requestRevision({
      proposalId: id,
      responseNotes: validationResult.data.responseNotes,
    });

    res.json(proposal);
  } catch (error) {
    console.error('Error requesting revision:', error);
    const message = error instanceof Error ? error.message : 'Failed to request revision';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/proposals/:id/revise
 * Create a revised version of a proposal
 */
router.post('/:id/revise', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const id = getParam(req.params.id);
    const proposal = await planProposalService.createRevision(id, user.id);

    res.status(201).json(proposal);
  } catch (error) {
    console.error('Error creating revision:', error);
    const message = error instanceof Error ? error.message : 'Failed to create revision';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/proposals/:id/schedule
 * Schedule an approved proposal (convert to CarFlowPlans)
 */
router.post('/:id/schedule', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const id = getParam(req.params.id);
    const result = await planProposalService.scheduleProposal({
      proposalId: id,
      scheduledById: user.id,
    });

    res.json(result);
  } catch (error) {
    console.error('Error scheduling proposal:', error);
    const message = error instanceof Error ? error.message : 'Failed to schedule proposal';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/proposals/:id/cancel
 * Cancel a proposal
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const proposal = await planProposalService.cancelProposal(id);
    res.json(proposal);
  } catch (error) {
    console.error('Error cancelling proposal:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel proposal';
    res.status(400).json({ error: message });
  }
});

export default router;
