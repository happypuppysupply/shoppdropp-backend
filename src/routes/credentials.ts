import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';

const router = Router();

// Valid credential types
const VALID_CREDENTIAL_TYPES = ['meta_ads', 'cj_dropshipping', 'research_api', 'shopify', 'openrouter'];

// Save store credentials (API keys for integrations)
router.post(
  '/stores/:storeId',
  authenticate,
  body('type').isIn(VALID_CREDENTIAL_TYPES).withMessage('Invalid credential type'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { storeId } = req.params;
      const { type, apiKey, apiSecret, additionalData } = req.body;

      // Verify store belongs to user
      const store = await db.getStoreById(storeId);
      if (!store || store.user_id !== user.id) {
        return res.status(403).json({ error: 'Store not found or access denied' });
      }

      // Encrypt and save credentials
      const credentialData = {
        api_key: apiKey,
        api_secret: apiSecret,
        ...additionalData,
      };

      await db.saveStoreCredentials(storeId, type, credentialData);

      res.json({
        success: true,
        message: `${type} credentials saved`,
        type,
      });
    } catch (error: any) {
      console.error('Save credentials error:', error);
      res.status(500).json({ error: 'Failed to save credentials' });
    }
  }
);

// Get store credentials (without sensitive data)
router.get('/stores/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(403).json({ error: 'Store not found or access denied' });
    }

    const credentials = await db.getCredentialsByStore(storeId);

    // Return only metadata, not actual API keys
    const safeCredentials = credentials.map((cred: any) => ({
      type: cred.type,
      configured: true,
      updated_at: cred.updated_at,
    }));

    res.json(safeCredentials);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

// Check if specific credential type is configured
router.get('/stores/:storeId/:type', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId, type } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(403).json({ error: 'Store not found or access denied' });
    }

    const credentials = await db.getCredentialsByStore(storeId);
    const credential = credentials.find((c: any) => c.type === type);

    res.json({
      configured: !!credential,
      type,
      updated_at: credential?.updated_at || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check credentials' });
  }
});

export default router;
