import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { db, supabase } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';
import { WorkerManager } from '../services/workerManager';

const router = Router();
const workerManager = new WorkerManager();

// Get all stores for user
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const stores = await db.getStoresByUser(req.user!.id);
    res.json(stores);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
});

// Create store
router.post('/', authenticate, [
  body('name').trim().notEmpty(),
  body('url').isURL(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { name, url } = req.body;
    
    const store = await db.createStore({
      id: uuidv4(),
      user_id: req.user!.id,
      name,
      url,
      platform: 'shopify',
      status: 'pending',
    });

    // Provision worker (mock for now)
    await workerManager.provisionWorker(req.user!.id, store.id);

    res.json(store);
  } catch (error) {
    console.error('Create store error:', error);
    res.status(500).json({ error: 'Failed to create store' });
  }
});

// Get store by ID
router.get('/:id', authenticate, [
  param('id').isUUID(),
], async (req: Request, res: Response) => {
  try {
    const store = await db.getStoreById(req.params.id);
    if (!store || store.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Store not found' });
    }
    res.json(store);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch store' });
  }
});

// Save API credentials
router.post('/:id/credentials', authenticate, [
  param('id').isUUID(),
  body('type').isIn(['shopify', 'meta_ads', 'autods']),
  body('credentials').isObject(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { type, credentials } = req.body;
    const store = await db.getStoreById(req.params.id);
    
    if (!store || store.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // In production, encrypt these credentials
    const encryptedData = JSON.stringify(credentials);

    await db.upsertCredentials({
      id: uuidv4(),
      store_id: store.id,
      type,
      encrypted_data: encryptedData,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save credentials' });
  }
});

// Get credentials for store
router.get('/:id/credentials', authenticate, [
  param('id').isUUID(),
], async (req: Request, res: Response) => {
  try {
    const store = await db.getStoreById(req.params.id);
    if (!store || store.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const creds = await db.getCredentialsByStore(store.id);
    // Return types only, not actual credentials (for security)
    res.json(creds.map(c => ({ type: c.type, hasCredentials: true })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

// Delete store
router.delete('/:id', authenticate, [
  param('id').isUUID(),
], async (req: Request, res: Response) => {
  try {
    const store = await db.getStoreById(req.params.id);
    if (!store || store.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Delete from Supabase
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete store' });
  }
});

export default router;