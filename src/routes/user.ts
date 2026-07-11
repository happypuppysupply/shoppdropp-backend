import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';

const router = Router();

// Save GitHub credentials
router.post('/github', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { token, username } = req.body;

    await db.saveUserCredential(user.id, 'github', {
      token,
      username,
    });

    res.json({ success: true, connected: true, username });
  } catch (error: any) {
    console.error('GitHub save error:', error);
    res.status(500).json({ error: 'Failed to save GitHub credentials' });
  }
});

// Get GitHub credentials (without token)
router.get('/github', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const cred = await db.getUserCredential(user.id, 'github');
    
    if (!cred) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      username: cred.data?.username,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch GitHub credentials' });
  }
});

// Save Vercel credentials
router.post('/vercel', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { token, team_id } = req.body;

    await db.saveUserCredential(user.id, 'vercel', {
      token,
      team_id,
    });

    res.json({ success: true, connected: true });
  } catch (error: any) {
    console.error('Vercel save error:', error);
    res.status(500).json({ error: 'Failed to save Vercel credentials' });
  }
});

// Get Vercel credentials (without token)
router.get('/vercel', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const cred = await db.getUserCredential(user.id, 'vercel');
    
    if (!cred) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      has_team: !!cred.data?.team_id,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Vercel credentials' });
  }
});

export default router;