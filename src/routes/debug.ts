import { Router, Request, Response } from 'express';

const router = Router();

// Simple no-auth test
router.get('/test', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Echo back what auth header was received
router.get('/auth-check', (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  res.json({
    hasAuth: !!auth,
    authHeader: auth ? auth.substring(0, 30) + '...' : null,
    message: auth ? 'Token received' : 'NO TOKEN - Frontend not sending Authorization header'
  });
});

export default router;
