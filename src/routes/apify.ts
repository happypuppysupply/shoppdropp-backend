import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { apifyService, POPULAR_TIKTOK_ACTORS, POPULAR_REDDIT_ACTORS, POPULAR_GOOGLE_ACTORS, POPULAR_AMAZON_ACTORS } from '../services/apifyService';

const router = Router();

/**
 * GET /api/apify/search
 * Search for actors in the Apify Store
 */
router.get('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string || '';
    const sortBy = req.query.sortBy as 'relevance' | 'popularity' | 'name' || 'relevance';
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 20;
    const verified = req.query.verified === 'true';

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const results = await apifyService.searchActors(query, {
      sortBy,
      offset,
      limit,
      verified,
    });

    res.json({
      success: true,
      query,
      results: {
        total: results.total,
        count: results.count,
        actors: results.items.map(actor => ({
          id: actor.id,
          name: actor.name,
          title: actor.title,
          description: actor.description,
          username: actor.username,
          isPublic: actor.isPublic,
          categories: actor.categories,
          stats: actor.stats,
          pricing: actor.currentPricing,
        })),
      },
    });
  } catch (error: any) {
    console.error('Apify search error:', error);
    res.status(500).json({ 
      error: 'Failed to search Apify actors',
      message: error.message,
    });
  }
});

/**
 * GET /api/apify/actors/:actorId
 * Get details of a specific actor
 */
router.get('/actors/:actorId', authenticate, async (req: Request, res: Response) => {
  try {
    const { actorId } = req.params;
    
    const actor = await apifyService.getActor(actorId);

    res.json({
      success: true,
      actor: {
        id: actor.id,
        userId: actor.userId,
        name: actor.name,
        title: actor.title,
        description: actor.description,
        username: actor.username,
        isPublic: actor.isPublic,
        categories: actor.categories,
        stats: actor.stats,
        pricing: actor.currentPricing,
      },
    });
  } catch (error: any) {
    console.error('Apify actor fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch actor details',
      message: error.message,
    });
  }
});

/**
 * GET /api/apify/categories
 * Get actor categories
 */
router.get('/categories', authenticate, async (req: Request, res: Response) => {
  try {
    const categories = await apifyService.getCategories();

    res.json({
      success: true,
      categories,
    });
  } catch (error: any) {
    console.error('Apify categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/apify/top
 * Get top/popular actors
 */
router.get('/top', authenticate, async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string;
    const limit = parseInt(req.query.limit as string) || 20;

    const actors = await apifyService.getTopActors(category, limit);

    res.json({
      success: true,
      category: category || 'all',
      actors: actors.map(actor => ({
        id: actor.id,
        name: actor.name,
        title: actor.title,
        description: actor.description,
        stats: actor.stats,
        pricing: actor.currentPricing,
      })),
    });
  } catch (error: any) {
    console.error('Apify top actors error:', error);
    res.status(500).json({ error: 'Failed to fetch top actors' });
  }
});

/**
 * POST /api/apify/run
 * Run an actor
 */
router.post(
  '/run',
  authenticate,
  [
    body('actorId').isString().withMessage('Actor ID is required'),
    body('input').optional().isObject(),
    body('options').optional().isObject(),
  ],
  async (req: Request, res: Response) => {
    try {
      const { actorId, input, options = {} } = req.body;
      
      const run = await apifyService.runActor(actorId, input, {
        memory: options.memory,
        timeout: options.timeout,
        waitForFinish: options.waitForFinish,
        waitSecs: options.waitSecs,
      });

      res.json({
        success: true,
        run: {
          id: run.id,
          actId: run.actId,
          actName: run.actName,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          defaultDatasetId: run.defaultDatasetId,
          defaultKeyValueStoreId: run.defaultKeyValueStoreId,
        },
      });
    } catch (error: any) {
      console.error('Apify run error:', error);
      res.status(500).json({ 
        error: 'Failed to run actor',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/apify/run/:runId
 * Get run status
 */
router.get('/run/:runId', authenticate, async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    
    const run = await apifyService.getRunStatus(runId);

    res.json({
      success: true,
      run: {
        id: run.id,
        actId: run.actId,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        defaultDatasetId: run.defaultDatasetId,
      },
    });
  } catch (error: any) {
    console.error('Apify run status error:', error);
    res.status(500).json({ 
      error: 'Failed to get run status',
      message: error.message,
    });
  }
});

/**
 * GET /api/apify/dataset/:datasetId
 * Get dataset items
 */
router.get('/dataset/:datasetId', authenticate, async (req: Request, res: Response) => {
  try {
    const { datasetId } = req.params;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 250;
    const fields = req.query.fields as string | undefined;

    const items = await apifyService.getDatasetItems(datasetId, {
      offset,
      limit,
      clean: true,
      ...(fields && { fields: fields.split(',') }),
    });

    res.json({
      success: true,
      datasetId,
      count: items.length,
      items,
    });
  } catch (error: any) {
    console.error('Apify dataset error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dataset',
      message: error.message,
    });
  }
});

/**
 * GET /api/apify/popular
 * Get curated list of popular actors for product research
 */
router.get('/popular', authenticate, async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as string || 'all';
    
    let actors: any[] = [];
    
    switch (platform) {
      case 'tiktok':
        actors = POPULAR_TIKTOK_ACTORS;
        break;
      case 'reddit':
        actors = POPULAR_REDDIT_ACTORS;
        break;
      case 'google':
      case 'trends':
        actors = POPULAR_GOOGLE_ACTORS;
        break;
      case 'amazon':
        actors = POPULAR_AMAZON_ACTORS;
        break;
      default:
        // All platforms
        actors = [
          ...POPULAR_TIKTOK_ACTORS,
          ...POPULAR_REDDIT_ACTORS,
          ...POPULAR_GOOGLE_ACTORS,
          ...POPULAR_AMAZON_ACTORS,
        ];
    }

    res.json({
      success: true,
      platform,
      actors,
    });
  } catch (error: any) {
    console.error('Apify popular error:', error);
    res.status(500).json({ error: 'Failed to fetch popular actors' });
  }
});

/**
 * POST /api/apify/estimate-cost
 * Estimate runtime cost for an actor
 */
router.post(
  '/estimate-cost',
  authenticate,
  [
    body('actorId').isString().withMessage('Actor ID is required'),
    body('estimatedDurationMinutes').optional().isInt({ min: 1, max: 60 }),
  ],
  async (req: Request, res: Response) => {
    try {
      const { actorId, estimatedDurationMinutes = 1 } = req.body;
      
      const cost = await apifyService.estimateRunCost(actorId, estimatedDurationMinutes);

      res.json({
        success: true,
        actorId,
        estimatedDurationMinutes,
        estimatedCostUsd: cost,
      });
    } catch (error: any) {
      console.error('Apify cost estimate error:', error);
      res.status(500).json({ 
        error: 'Failed to estimate cost',
        message: error.message,
      });
    }
  }
);

export default router;