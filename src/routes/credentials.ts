import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { supabase } from '../db/supabase';

// Simple encryption - in production use proper encryption (see encryption.ts)
function encrypt(text: any): string {
  return btoa(text);
}
function decrypt(text: string): any {
  return atob(text);
}

const router = Router();

/**
 * GET /api/credentials/:storeId
 * Get all credentials for a store
 */
router.get('/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Get credentials (encrypted)
    const { data: credentials, error } = await supabase
      .from('credentials')
      .select('service_type, api_key_encrypted, created_at')
      .eq('store_id', storeId);

    if (error) throw error;

    // Return credential types (without the actual data for security)
    const configuredTypes = (credentials || []).map(c => c.service_type);

    res.json({
      success: true,
      configured: configuredTypes,
      // Don't return actual credentials in response
    });
  } catch (error: any) {
    console.error('Credentials fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

/**
 * GET /api/credentials/:storeId/:type
 * Get a specific credential type
 */
router.get('/:storeId/:type', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId, type } = req.params;

    // Verify user owns this store
    const { data: store } = await supabase
      .from('stores')
      .select('user_id')
      .eq('id', storeId)
      .single();

    if (!store || store.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get credential
    const { data: credential } = await supabase
      .from('credentials')
      .select('api_key_encrypted')
      .eq('store_id', storeId)
      .eq('service_type', type)
      .single();

    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Decrypt and return
    const decrypted = decrypt(credential.api_key_encrypted);

    res.json({
      success: true,
      type,
      data: decrypted,
    });
  } catch (error: any) {
    console.error('Credential fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch credential' });
  }
});

/**
 * POST /api/credentials
 * Create or update a credential
 */
router.post(
  '/',
  authenticate,
  [
    body('type').isString().notEmpty().withMessage('Credential type is required'),
    body('storeId').isString().notEmpty().withMessage('Store ID is required'),
    body('data').isObject().withMessage('Credential data is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { type, storeId, data } = req.body;

      // Verify user owns this store
      const { data: store } = await supabase
        .from('stores')
        .select('user_id')
        .eq('id', storeId)
        .single();

      if (!store || store.user_id !== user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Encrypt the credential data
      const encrypted = encrypt(JSON.stringify(data));

      // Upsert credential
      const { data: savedCredential, error } = await supabase
        .from('credentials')
        .upsert(
          {
            user_id: user.id,
            store_id: storeId,
            service_type: type,
            api_key_encrypted: encrypted,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'store_id,service_type' }
        )
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        message: `Credential saved successfully`,
        type,
      });
    } catch (error: any) {
      console.error('Credential save error:', error);
      res.status(500).json({ error: 'Failed to save credential' });
    }
  }
);

/**
 * DELETE /api/credentials/:storeId/:type
 * Delete a credential
 */
router.delete('/:storeId/:type', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId, type } = req.params;

    // Verify user owns this store
    const { data: store } = await supabase
      .from('stores')
      .select('user_id')
      .eq('id', storeId)
      .single();

    if (!store || store.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete credential
    const { error } = await supabase
      .from('credentials')
      .delete()
      .eq('store_id', storeId)
      .eq('service_type', type);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Credential deleted successfully',
    });
  } catch (error: any) {
    console.error('Credential delete error:', error);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

/**
 * POST /api/credentials/test
 * Test credentials before saving
 */
router.post(
  '/test',
  authenticate,
  [
    body('service_type').isString().notEmpty(),
    body('data').isObject(),
  ],
  async (req: Request, res: Response) => {
    try {
      const { type, data } = req.body;

      let testResult: any = { success: false };

      switch (type) {
        case 'shopify':
          // Test Shopify connection
          testResult = await testShopify(data);
          break;
        case 'cj_dropshipping':
          // Test CJ Dropshipping connection
          testResult = await testCJDropshipping(data);
          break;
        default:
          return res.status(400).json({ error: 'Unknown credential type' });
      }

      res.json(testResult);
    } catch (error: any) {
      console.error('Credential test error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Helper functions

async function testShopify(creds: any): Promise<any> {
  try {
    const response = await fetch(
      `https://${creds.shop}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': creds.accessToken,
        },
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: 'Invalid Shopify credentials',
      };
    }

    const data = await response.json() as { shop: { name: string; domain: string; plan_name: string } };

    return {
      success: true,
      shop: data.shop.name,
      domain: data.shop.domain,
      plan: data.shop.plan_name,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testCJDropshipping(creds: any): Promise<any> {
  try {
    const response = await fetch(
      'https://cn.cjdropshipping.com/api2.0/v1/user/info',
      {
        headers: {
          'CJ-Access-Token': creds.apiKey,
        },
      }
    );

    const data = await response.json() as { code: number; data?: { email: string; name: string; balance: number }; message?: string };

    if (data.code === 200) {
      return {
        success: true,
        email: data.data?.email || '',
        name: data.data?.name || '',
        balance: data.data?.balance || 0,
      };
    }

    return {
      success: false,
      error: data.message || 'Invalid CJ credentials',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export default router;
