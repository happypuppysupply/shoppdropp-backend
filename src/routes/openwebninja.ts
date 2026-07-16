import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';
import axios from 'axios';

const router = Router();

const OPENWEBNINJA_BASE_URL = 'https://api.openwebninja.com';

// Service configurations with their test endpoints
const SERVICE_CONFIGS = {
  amazon: { 
    name: 'Real-Time Amazon Data',
    searchEndpoint: '/realtime-amazon-data/search',
    testParam: { query: 'test', page: 1 }
  },
  walmart: { 
    name: 'Real-Time Walmart Data',
    searchEndpoint: '/real-time-walmart-data/search',
    testParam: { query: 'test', page: 1 }
  },
  ebay: { 
    name: 'Real-Time eBay Data',
    searchEndpoint: '/real-time-ebay-data/search',
    testParam: { query: 'test', page: 1 }
  },
  product_search: { 
    name: 'Real-Time Product Search',
    searchEndpoint: '/realtime-product-search/search-light-v2',
    testParam: { q: 'test', page: 1 }
  },
  ecommerce: { 
    name: 'Real-Time E-commerce Data',
    searchEndpoint: '/realtime-ecommerce-data/amazon/search',
    testParam: { query: 'test', page: 1 }
  },
};

type ServiceType = keyof typeof SERVICE_CONFIGS;

// Configure a specific OpenWeb Ninja API
router.post(
  '/configure/:service',
  authenticate,
  body('apiKey').notEmpty().withMessage('API key is required'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { apiKey } = req.body;
      const { service } = req.params;
      const { storeId } = req.query;

      // Validate service
      if (!SERVICE_CONFIGS[service as ServiceType]) {
        return res.status(400).json({ 
          error: 'Invalid service', 
          validServices: Object.keys(SERVICE_CONFIGS) 
        });
      }

      // Validate the API key with a test call
      const isValid = await validateApiKey(apiKey, service as ServiceType);
      if (!isValid) {
        return res.status(400).json({ error: `Invalid API key for ${service}` });
      }

      // Find store
      const stores = await db.getStoresByUser(user.id);
      const targetStore = storeId 
        ? stores.find(s => s.id === storeId)
        : stores[0];

      if (!targetStore) {
        return res.status(404).json({ error: 'Store not found' });
      }

      // Save to credentials with service-specific type
      await db.upsertCredentials({
        store_id: targetStore.id,
        service_type: `openwebninja_${service}`,
        api_key: apiKey,
      });

      res.json({ 
        success: true, 
        message: `OpenWeb Ninja ${SERVICE_CONFIGS[service as ServiceType].name} configured`,
        service,
        storeId: targetStore.id,
      });
    } catch (error: any) {
      console.error('OpenWeb Ninja config error:', error);
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  }
);

// Configure all OpenWeb Ninja APIs at once
router.post(
  '/configure-all',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { apiKeys, storeId } = req.body; // apiKeys: { amazon?: string, walmart?: string, ... }

      if (!apiKeys || typeof apiKeys !== 'object') {
        return res.status(400).json({ error: 'apiKeys object is required' });
      }

      // Find store
      const stores = await db.getStoresByUser(user.id);
      const targetStore = storeId 
        ? stores.find(s => s.id === storeId)
        : stores[0];

      if (!targetStore) {
        return res.status(404).json({ error: 'Store not found' });
      }

      const results: Record<string, { success: boolean; error?: string }> = {};

      // Configure each provided API key
      for (const [service, apiKey] of Object.entries(apiKeys)) {
        if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
          continue; // Skip empty keys
        }

        if (!SERVICE_CONFIGS[service as ServiceType]) {
          results[service] = { success: false, error: 'Invalid service' };
          continue;
        }

        try {
          // Validate the API key
          const isValid = await validateApiKey(apiKey, service as ServiceType);
          if (!isValid) {
            results[service] = { success: false, error: 'Invalid API key' };
            continue;
          }

          // Save to credentials
          await db.upsertCredentials({
            store_id: targetStore.id,
            service_type: `openwebninja_${service}`,
            api_key: apiKey,
          });

          results[service] = { success: true };
        } catch (e: any) {
          results[service] = { success: false, error: e.message };
        }
      }

      res.json({ 
        success: true, 
        message: 'OpenWeb Ninja APIs configured',
        results,
        storeId: targetStore.id,
      });
    } catch (error: any) {
      console.error('OpenWeb Ninja configure-all error:', error);
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  }
);

// Get OpenWeb Ninja config for all services
router.get('/config', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.query;

    const stores = await db.getStoresByUser(user.id);
    const targetStore = storeId 
      ? stores.find(s => s.id === storeId)
      : stores[0];

    if (!targetStore) {
      return res.json({ configured: false, services: {} });
    }

    const creds = await db.getCredentialsByStore(targetStore.id);
    const services: Record<string, boolean> = {};
    
    // Check each service
    for (const service of Object.keys(SERVICE_CONFIGS)) {
      const serviceCreds = creds.find(c => c.service_type === `openwebninja_${service}`);
      services[service] = !!serviceCreds?.api_key;
    }

    const anyConfigured = Object.values(services).some(v => v);

    res.json({
      configured: anyConfigured,
      services,
      storeId: targetStore.id,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Search products across platforms
router.post('/search', authenticate, [
  body('platform').isIn(['amazon', 'walmart', 'ebay', 'product_search', 'ecommerce']).withMessage('Invalid platform'),
  body('query').notEmpty().withMessage('Query is required'),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = (req as any).user;
    const { platform, query, page = 1, country = 'US', sort_by = 'RELEVANCE' } = req.body;
    const { storeId } = req.query;

    // Map platform to service
    const serviceMap: Record<string, ServiceType> = {
      amazon: 'amazon',
      walmart: 'walmart',
      ebay: 'ebay',
      product_search: 'product_search',
      ecommerce: 'ecommerce',
    };

    const service = serviceMap[platform];

    // Get API key from store credentials
    const stores = await db.getStoresByUser(user.id);
    const targetStore = storeId 
      ? stores.find(s => s.id === storeId)
      : stores[0];

    if (!targetStore) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const creds = await db.getCredentialsByStore(targetStore.id);
    const serviceCreds = creds.find(c => c.service_type === `openwebninja_${service}`);
    
    if (!serviceCreds?.api_key) {
      return res.status(400).json({ 
        error: `OpenWeb Ninja ${SERVICE_CONFIGS[service].name} not configured. Please add your API key in Settings > Integrations.`
      });
    }

    // Build request
    const config = SERVICE_CONFIGS[service];
    let params: any = {};

    if (service === 'product_search') {
      params = { q: query, page };
    } else {
      params = { query, country, sort_by, page };
    }

    const response = await axios.get(`${OPENWEBNINJA_BASE_URL}${config.searchEndpoint}`, {
      headers: {
        'X-API-Key': serviceCreds.api_key,
      },
      params,
      timeout: 30000,
    });

    res.json({
      success: true,
      platform,
      query,
      results: response.data,
    });
  } catch (error: any) {
    console.error('OpenWeb Ninja search error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Search failed',
      details: error.response?.data?.message || error.message,
    });
  }
});

// Get product details
router.get('/product/:platform/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { platform, id } = req.params;
    const { storeId } = req.query;

    // Map platform to service
    const serviceMap: Record<string, ServiceType> = {
      amazon: 'amazon',
      walmart: 'walmart',
      ebay: 'ebay',
    };

    const service = serviceMap[platform];
    if (!service) {
      return res.status(400).json({ error: 'Invalid platform for product details' });
    }

    // Get API key
    const stores = await db.getStoresByUser(user.id);
    const targetStore = storeId 
      ? stores.find(s => s.id === storeId)
      : stores[0];

    if (!targetStore) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const creds = await db.getCredentialsByStore(targetStore.id);
    const serviceCreds = creds.find(c => c.service_type === `openwebninja_${service}`);
    
    if (!serviceCreds?.api_key) {
      return res.status(400).json({ 
        error: `OpenWeb Ninja ${SERVICE_CONFIGS[service].name} not configured`
      });
    }

    // Build endpoint
    let endpoint = '';
    let params: any = {};

    switch (platform) {
      case 'amazon':
        endpoint = '/realtime-amazon-data/product-details';
        params = { asin: id };
        break;
      case 'walmart':
        endpoint = '/real-time-walmart-data/product-details';
        params = { id };
        break;
      case 'ebay':
        endpoint = '/real-time-ebay-data/product-details';
        params = { item_id: id };
        break;
    }

    const response = await axios.get(`${OPENWEBNINJA_BASE_URL}${endpoint}`, {
      headers: {
        'X-API-Key': serviceCreds.api_key,
      },
      params,
      timeout: 30000,
    });

    res.json({
      success: true,
      platform,
      productId: id,
      data: response.data,
    });
  } catch (error: any) {
    console.error('Product details error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch product details',
      details: error.response?.data?.message || error.message,
    });
  }
});

// Trending products search
router.post('/trending', authenticate, [
  body('category').optional(),
], async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { category, limit = 20 } = req.body;
    const { storeId } = req.query;

    // Get API key (prefer Amazon if available)
    const stores = await db.getStoresByUser(user.id);
    const targetStore = storeId 
      ? stores.find(s => s.id === storeId)
      : stores[0];

    if (!targetStore) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const creds = await db.getCredentialsByStore(targetStore.id);
    
    // Try to find any configured service
    let serviceCreds = creds.find(c => c.service_type === 'openwebninja_amazon');
    if (!serviceCreds) {
      serviceCreds = creds.find(c => c.service_type.startsWith('openwebninja_'));
    }
    
    if (!serviceCreds?.api_key) {
      return res.status(400).json({ 
        error: 'No OpenWeb Ninja APIs configured. Please add at least one API key in Settings > Integrations.'
      });
    }

    // Search for trending products (high sales volume indicators)
    const queries = category 
      ? [`${category} bestseller`, `${category} trending`]
      : ['bestseller', 'trending products', 'top rated'];

    const results = await Promise.all(
      queries.map(q => 
        axios.get(`${OPENWEBNINJA_BASE_URL}/realtime-amazon-data/search`, {
          headers: { 'X-API-Key': serviceCreds!.api_key },
          params: { query: q, sort_by: 'RELEVANCE', page: 1 },
          timeout: 30000,
        })
      )
    );

    // Combine and deduplicate results
    const allProducts = results.flatMap(r => r.data.data?.products || []);
    const uniqueProducts = allProducts.filter((p, i, arr) => 
      arr.findIndex((t: any) => t.asin === p.asin) === i
    );

    // Sort by sales volume/ratings
    const sorted = uniqueProducts
      .sort((a: any, b: any) => {
        const aSales = parseInt(a.sales_volume?.replace(/[^0-9]/g, '') || '0');
        const bSales = parseInt(b.sales_volume?.replace(/[^0-9]/g, '') || '0');
        return bSales - aSales;
      })
      .slice(0, limit);

    res.json({
      success: true,
      category: category || 'general',
      trending: sorted,
      total: sorted.length,
    });
  } catch (error: any) {
    console.error('Trending search error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch trending products',
      details: error.response?.data?.message || error.message,
    });
  }
});

// Validate API key helper
async function validateApiKey(apiKey: string, service: ServiceType): Promise<boolean> {
  try {
    const config = SERVICE_CONFIGS[service];
    const response = await axios.get(`${OPENWEBNINJA_BASE_URL}${config.searchEndpoint}`, {
      headers: { 'X-API-Key': apiKey },
      params: config.testParam,
      timeout: 10000,
    });
    return response.status === 200;
  } catch (error: any) {
    // Check if it's an auth error vs other error
    if (error.response?.status === 401 || error.response?.status === 403) {
      return false;
    }
    // For other errors, assume key might be valid (rate limits, etc)
    return true;
  }
}

export default router;
