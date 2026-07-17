import { Router, Request, Response } from 'express';
import { db } from '../db/supabase';

const router = Router();

// Ensure store exists for user
router.post('/ensure-store', async (req: Request, res: Response) => {
  try {
    const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
    const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
    
    // Check if store exists
    let store = await db.getStoreById(storeId);
    
    if (!store) {
      // Create the store
      store = await db.createStore({
        id: storeId,
        user_id: userId,
        name: 'Happy Puppy Supply',
        url: 'https://happypuppysupply.com',
        platform: 'shopify',
        status: 'active',
        worker_id: null,
      });
      console.log('[Setup] Created store:', store.id);
    } else {
      console.log('[Setup] Store already exists:', store.id);
    }
    
    res.json({
      success: true,
      store: {
        id: store.id,
        name: store.name,
        url: store.url,
        status: store.status,
        worker_id: store.worker_id,
      }
    });
  } catch (error: any) {
    console.error('[Setup] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
