/**
 * Qual Planner Master Import API Routes
 *
 * Endpoints for uploading and importing Qual Planner Master CSV/Excel files.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  importQualPlannerData,
  parseCSVContent,
  parseExcelContent,
} from '../services/qualPlannerImportService';
import { validateHeaders, formatValidationReport } from '../services/qualPlannerHeaderValidator';
import { stripBOM } from '../services/qualPlannerHeaderValidator';

const router = Router();

// =============================================================================
// MULTER CONFIGURATION
// =============================================================================

// Configure multer for file uploads
const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = [
    'text/csv',
    'text/plain',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  const allowedExtensions = ['.csv', '.xlsx', '.xls'];
  const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: CSV, XLSX. Got: ${file.mimetype}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getFileType(filename: string): 'csv' | 'xlsx' {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return ext === '.xlsx' || ext === '.xls' ? 'xlsx' : 'csv';
}

function getCompanyId(req: Request): string {
  // Get from authenticated user or use default
  return (req as any).user?.companyId || 'default-company';
}

function getUserId(req: Request): string {
  return (req as any).user?.id || 'system';
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/qual-planner/validate
 * Validate headers only without importing
 */
router.post('/validate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const fileType = getFileType(req.file.originalname);
    let headers: string[];

    if (fileType === 'xlsx') {
      const result = await parseExcelContent(req.file.buffer);
      headers = result.headers;
    } else {
      const content = stripBOM(req.file.buffer.toString('utf-8'));
      const result = parseCSVContent(content);
      headers = result.headers;
    }

    const validation = validateHeaders(headers);
    const report = formatValidationReport(validation);

    return res.json({
      success: validation.isValid,
      validation,
      report,
      detectedHeaders: headers,
    });
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({
      success: false,
      error: `Validation failed: ${(error as Error).message}`,
    });
  }
});

/**
 * POST /api/qual-planner/preview
 * Preview import without saving
 */
router.post('/preview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const fileType = getFileType(req.file.originalname);
    const companyId = getCompanyId(req);
    const userId = getUserId(req);

    // Import with dryRun=true
    const result = await importQualPlannerData(
      fileType === 'xlsx' ? req.file.buffer : stripBOM(req.file.buffer.toString('utf-8')),
      fileType,
      {
        companyId,
        userId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        dryRun: true,
        maxRows: 100, // Preview first 100 rows only
      }
    );

    return res.json({
      success: result.success,
      preview: true,
      ...result,
    });
  } catch (error) {
    console.error('Preview error:', error);
    return res.status(500).json({
      success: false,
      error: `Preview failed: ${(error as Error).message}`,
    });
  }
});

/**
 * POST /api/qual-planner/import
 * Full import with database writes
 */
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const fileType = getFileType(req.file.originalname);
    const companyId = getCompanyId(req);
    const userId = getUserId(req);
    const updateExisting = req.body.updateExisting !== 'false';
    const batchSize = parseInt(req.body.batchSize) || 100;

    console.log(`Starting import of ${req.file.originalname} (${req.file.size} bytes)`);

    const result = await importQualPlannerData(
      fileType === 'xlsx' ? req.file.buffer : stripBOM(req.file.buffer.toString('utf-8')),
      fileType,
      {
        companyId,
        userId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        updateExisting,
        dryRun: false,
        batchSize,
      }
    );

    console.log(result.summary);

    return res.json({
      success: result.success,
      ...result,
    });
  } catch (error) {
    console.error('Import error:', error);
    return res.status(500).json({
      success: false,
      error: `Import failed: ${(error as Error).message}`,
    });
  }
});

/**
 * GET /api/qual-planner/sessions
 * List recent import sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { prisma } = await import('../services/db');
    const companyId = getCompanyId(req);
    const limit = parseInt(req.query.limit as string) || 20;

    const sessions = await prisma.importSession.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        status: true,
        totalRows: true,
        validRows: true,
        errorRows: true,
        importedCount: true,
        updatedCount: true,
        skippedCount: true,
        completedAt: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error('Sessions error:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch sessions: ${(error as Error).message}`,
    });
  }
});

/**
 * GET /api/qual-planner/sessions/:id
 * Get details of a specific import session
 */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { prisma } = await import('../services/db');
    const companyId = getCompanyId(req);
    const sessionId = req.params.id;

    const session = await prisma.importSession.findFirst({
      where: {
        id: sessionId,
        companyId,
      },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    return res.json({
      success: true,
      session: {
        ...session,
        validationErrors: JSON.parse(session.validationErrors || '[]'),
        validationWarnings: JSON.parse(session.validationWarnings || '[]'),
        detectedHeaders: JSON.parse(session.detectedHeaders || '[]'),
        fieldMappings: JSON.parse(session.fieldMappings || '{}'),
        unmappedFields: JSON.parse(session.unmappedFields || '[]'),
      },
    });
  } catch (error) {
    console.error('Session error:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch session: ${(error as Error).message}`,
    });
  }
});

/**
 * GET /api/qual-planner/sessions/:id/errors
 * Download error report as CSV
 */
router.get('/sessions/:id/errors', async (req: Request, res: Response) => {
  try {
    const { prisma } = await import('../services/db');
    const companyId = getCompanyId(req);
    const sessionId = req.params.id;

    const session = await prisma.importSession.findFirst({
      where: {
        id: sessionId,
        companyId,
      },
      select: {
        fileName: true,
        validationErrors: true,
      },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    const errors = JSON.parse(session.validationErrors || '[]');

    // Generate CSV
    const csvLines = [
      'Row,Car Mark,Field,Error Message',
      ...errors.map((e: any) =>
        `${e.row},"${e.carMark || ''}","${e.field || ''}","${(e.message || '').replace(/"/g, '""')}"`
      ),
    ];

    const csv = csvLines.join('\n');
    const filename = `errors_${session.fileName.replace(/\.[^/.]+$/, '')}_${sessionId}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    console.error('Error report error:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to generate error report: ${(error as Error).message}`,
    });
  }
});

/**
 * GET /api/qual-planner/template
 * Download import template CSV
 */
router.get('/template', (_req: Request, res: Response) => {
  // Generate a template with all expected headers
  const headers = [
    'Lessee Name',
    'Car Mark',
    'FMS Lessee Number',
    'Contract',
    'Contract Expiration',
    'Primary Commodity',
    'CSR',
    'CSL',
    'Commericial', // Note: Keep typo to match source
    'Past Region',
    '2026 Region',
    'Jacketed',
    'Lined',
    'Lining Type',
    'Car Age',
    'Mark',
    'Number',
    'Mark2',
    'Car Type Level 2',
    'Full/Partial Qual',
    'Reason Shopped',
    'Perform Tank Qual',
    'Scheduled',
    'Current Status',
    'Adjusted Status',
    'Plan Status',
  ];

  // Example row
  const exampleRow = [
    'ACME Corp',
    'SHQX006002',
    '3531',
    '020045 0001',
    '2/28/2026',
    'CASTOR OIL',
    'John Smith',
    'Jane Doe',
    'Bob Johnson',
    'Midwest',
    'Midwest',
    'Jacketed',
    'Unlined',
    '',
    '13',
    'SHQX',
    '006002',
    '',
    'General Service Tank',
    'Full Qual',
    'TANK QUALIFICATION',
    'Yes',
    'Planned Shopping',
    'Active',
    '2026',
    'To Be Routed',
  ];

  const csv = [
    headers.join(','),
    exampleRow.map(v => `"${v}"`).join(','),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="qual_planner_template.csv"');
  return res.send(csv);
});

/**
 * GET /api/qual-planner/schema
 * Get the expected schema information
 */
router.get('/schema', async (_req: Request, res: Response) => {
  try {
    const {
      ALL_CANONICAL_HEADERS,
      REQUIRED_HEADERS,
      KEY_PLANNING_HEADERS,
      HEADER_TO_DB_COLUMN,
      SHOP_HEADERS,
    } = await import('../services/qualPlannerSchema');

    return res.json({
      success: true,
      schema: {
        totalColumns: ALL_CANONICAL_HEADERS.length,
        requiredHeaders: REQUIRED_HEADERS,
        keyPlanningHeaders: KEY_PLANNING_HEADERS,
        shopHeaders: SHOP_HEADERS.filter(h => h !== 'Column1'),
        headerToDbColumn: HEADER_TO_DB_COLUMN,
      },
    });
  } catch (error) {
    console.error('Schema error:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to get schema: ${(error as Error).message}`,
    });
  }
});

export default router;
