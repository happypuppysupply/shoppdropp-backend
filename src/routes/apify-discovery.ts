import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { apifyActorDiscovery } from '../services/apifyActorDiscovery';

const router = Router();

/**
 * POST /api/apify/discover
 * Run the automatic actor discovery process
 * This will search Apify Store and select the best actors for ShoppDropp
 */
router.post('/discover', authenticate, async (req: Request, res: Response) => {
  try {
    console.log('🔍 Starting Apify actor discovery process...');
    
    const config = await apifyActorDiscovery.generateActorConfiguration();
    
    // Save to database (if configured)
    // await apifyActorDiscovery.saveDiscoveredActors(config);
    
    res.json({
      success: true,
      message: 'Actor discovery complete',
      config: {
        totalPhases: config.totalPhases,
        totalEstimatedCost: config.totalEstimatedCost,
        generatedAt: config.generatedAt,
        phases: config.phases,
        estimatedCosts: config.estimatedCosts,
      },
    });
  } catch (error: any) {
    console.error('Actor discovery error:', error);
    res.status(500).json({
      error: 'Failed to discover actors',
      message: error.message,
    });
  }
});

/**
 * GET /api/apify/config
 * Get the current actor configuration
 */
router.get('/config', authenticate, async (req: Request, res: Response) => {
  try {
    // In production, this would fetch from database
    // For now, regenerate it
    const config = await apifyActorDiscovery.generateActorConfiguration();
    
    res.json({
      success: true,
      config,
    });
  } catch (error: any) {
    console.error('Config fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch actor configuration',
      message: error.message,
    });
  }
});

/**
 * POST /api/apify/test-actor
 * Test a specific actor
 */
router.post('/test-actor', authenticate, async (req: Request, res: Response) => {
  try {
    const { actorId, input } = req.body;
    
    if (!actorId) {
      return res.status(400).json({ error: 'actorId is required' });
    }
    
    const result = await apifyActorDiscovery.testActor(actorId, input || {});
    
    res.json({
      success: result.success,
      result,
    });
  } catch (error: any) {
    console.error('Actor test error:', error);
    res.status(500).json({
      error: 'Failed to test actor',
      message: error.message,
    });
  }
});

export default router;
