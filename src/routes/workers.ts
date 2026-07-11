import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';

const router = Router();

// Get all workers for user
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const workers = await db.getWorkersByUser(user.id);
    res.json(workers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// Get worker status
router.get('/:id/status', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const worker = await db.getWorkerById(req.params.id);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    res.json({
      id: worker.id,
      status: worker.status,
      store_id: worker.store_id,
      last_heartbeat: worker.last_heartbeat,
      created_at: worker.created_at,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch worker status' });
  }
});

export default router;