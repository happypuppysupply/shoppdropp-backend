import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { researchPipeline } from '../services/researchPipeline';
import { shopifyImportService } from '../services/shopifyImportService';
import { supabase } from '../db/supabase';

const router = Router();

/**
 * POST /api/research/start
 * Start a new research run
 */
router.post(
  '/start',
  authenticate,
  [
    body('onboardingData').isObject().withMessage('onboardingData is required'),
    body('onboardingData.category').isString().notEmpty(),
    body('onboardingData.productCount').isInt({ min: 1, max: 1000 }),
    body('onboardingData.priceRange').isObject(),
  ],
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { onboardingData, storeId } = req.body;

      const researchContext = {
        userId: user.id,
        storeId,
        onboardingData,
      };

      const runId = await researchPipeline.startResearch(researchContext);

      res.json({
        success: true,
        runId,
        message: 'Research started successfully',
      });
    } catch (error: any) {
      console.error('Research start error:', error);
      res.status(500).json({
        error: 'Failed to start research',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/research/:runId/status
 * Get research run status and activities
 */
router.get('/:runId/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = researchPipeline.getRun(runId);

    if (!run) {
      // Try to get from database
      const { data: runData } = await supabase
        .from('research_runs')
        .select('*')
        .eq('id', runId)
        .single();

      if (!runData) {
        return res.status(404).json({ error: 'Research run not found' });
      }

      return res.json({
        success: true,
        run: runData,
      });
    }

    res.json({
      success: true,
      run: {
        id: run.id,
        status: run.status,
        activities: run.activities,
        productsFound: run.productsFound,
        productsVerified: run.productsVerified,
        totalCost: run.totalCost,
        startTime: run.startTime,
        endTime: run.endTime,
        results: run.status === 'completed' ? run.results : undefined,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message,
    });
  }
});

/**
 * GET /api/research/:runId/activities
 * Get all activities for a research run
 */
router.get('/:runId/activities', authenticate, async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const activities = researchPipeline.getActivities(runId);

    res.json({
      success: true,
      runId,
      activities,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get activities',
      message: error.message,
    });
  }
});

/**
 * POST /api/research/import
 * Import research results to Shopify
 */
router.post(
  '/import',
  authenticate,
  [
    body('runId').isString().notEmpty(),
    body('productIds').optional().isArray(), // If not provided, import all
  ],
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { runId, productIds, storeId } = req.body;

      // Get research results
      const run = researchPipeline.getRun(runId);
      if (!run || run.status !== 'completed') {
        return res.status(400).json({
          error: 'Research not complete or not found',
        });
      }

      // Filter products if specific IDs provided
      let productsToImport = run.results;
      if (productIds && productIds.length > 0) {
        productsToImport = productsToImport.filter((p: any) => productIds.includes(p.id));
      }

      if (productsToImport.length === 0) {
        return res.status(400).json({
          error: 'No products selected for import',
        });
      }

      // Import to Shopify
      const importResult = await shopifyImportService.importProducts(
        user.id,
        storeId,
        productsToImport
      );

      if (importResult.needsCredentials) {
        return res.status(400).json({
          error: 'Shopify credentials not configured',
          needsCredentials: true,
          credentialTypes: ['shopify', 'cj'],
        });
      }

      res.json({
        success: true,
        imported: importResult.success,
        failed: importResult.failed,
        total: productsToImport.length,
        results: importResult.results,
      });
    } catch (error: any) {
      console.error('Import error:', error);
      res.status(500).json({
        error: 'Import failed',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/research/check-credentials
 * Check if user has Shopify and CJ credentials configured
 */
router.get('/check-credentials', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const storeId = req.query.storeId as string;

    const creds = await shopifyImportService.checkCredentials(user.id, storeId);

    res.json({
      success: true,
      credentials: creds,
      ready: creds.shopify, // CJ is optional but recommended
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to check credentials',
      message: error.message,
    });
  }
});

/**
 * GET /api/research/history
 * Get research history for a store
 */
router.get('/history/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const { data: runs, error } = await supabase
      .from('research_runs')
      .select('*')
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({
      success: true,
      runs: runs || [],
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get history',
      message: error.message,
    });
  }
});

export default router;
