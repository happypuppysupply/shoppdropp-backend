import { supabase } from '../db/supabase';
import crypto from 'crypto';

interface ShopifyStore {
  shop: string; // e.g., 'happy-puppy.myshopify.com'
  accessToken: string;
  userCJApiKey?: string;
}

interface ResearchProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  images?: string[];
  cj: {
    productId: string;
    price: number;
    shippingCost: number;
    variants?: any[];
    image?: string;
  };
}

interface ShopifyProduct {
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options?: ShopifyOption[];
}

interface ShopifyVariant {
  title: string;
  price: string;
  sku: string;
  inventory_quantity?: number;
  weight?: number;
  weight_unit?: string;
  option1?: string;
  option2?: string;
  option3?: string;
}

interface ShopifyImage {
  src: string;
  position?: number;
}

interface ShopifyOption {
  name: string;
  values: string[];
  position: number;
}

interface ImportResult {
  success: boolean;
  productId?: string;
  shopifyProductId?: string;
  shopifyHandle?: string;
  error?: string;
}

export class ShopifyImportService {
  private async makeShopifyRequest(
    shop: string,
    accessToken: string,
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<any> {
    const url = `https://${shop}/admin/api/2024-01/${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      ...(body && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get user's Shopify credentials from database
   */
  async getShopifyCredentials(userId: string, storeId: string): Promise<ShopifyStore | null> {
    try {
      const { data: credentials } = await supabase
        .from('credentials')
        .select('encrypted_data')
        .eq('store_id', storeId)
        .eq('type', 'shopify')
        .single();

      if (!credentials) return null;

      // Decrypt credentials (simplified - use proper encryption in production)
      const decrypted = JSON.parse(credentials.encrypted_data);
      
      return {
        shop: decrypted.shop,
        accessToken: decrypted.accessToken,
      };
    } catch (error) {
      console.error('Failed to get Shopify credentials:', error);
      return null;
    }
  }

  /**
   * Get user's CJ API key
   */
  async getCJCredentials(userId: string, storeId: string): Promise<string | null> {
    try {
      const { data: credentials } = await supabase
        .from('credentials')
        .select('encrypted_data')
        .eq('store_id', storeId)
        .eq('type', 'cj_dropshipping')
        .single();

      if (!credentials) return null;

      const decrypted = JSON.parse(credentials.encrypted_data);
      return decrypted.apiKey;
    } catch (error) {
      console.error('Failed to get CJ credentials:', error);
      return null;
    }
  }

  /**
   * Save CJ product to CJ account (needed before importing to Shopify)
   */
  async saveToCJAccount(
    cjApiKey: string,
    cjProductId: string
  ): Promise<boolean> {
    try {
      // Call CJ API to import/associate product with this user
      const response = await fetch('https://cn.cjdropshipping.com/api2.0/v1/product/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CJ-Access-Token': cjApiKey,
        },
        body: JSON.stringify({ pid: cjProductId }),
      });

      const data = await response.json() as { code: number | string };
      return data.code === 200 || data.code === '200';
    } catch (error) {
      console.error('Failed to save to CJ:', error);
      return false;
    }
  }

  /**
   * Transform research product to Shopify format
   */
  private transformToShopify(researchProduct: ResearchProduct): ShopifyProduct {
    const { name, description, price, images, cj } = researchProduct;
    
    // Calculate retail price (CJ cost + markup)
    const cjTotalCost = (cj.price || 0) + (cj.shippingCost || 0);
    const retailPrice = price || Math.round(cjTotalCost * 2.5 * 100) / 100;

    // Generate description
    const bodyHtml = description || `High-quality ${name} sourced from trusted suppliers via CJ Dropshipping.`;

    // Build variants
    const variants: ShopifyVariant[] = [];
    const options: ShopifyOption[] = [];

    if (cj.variants && cj.variants.length > 1) {
      // Has variants (size, color, etc.)
      variants.push(...cj.variants.map((v, i) => ({
        title: v.name || `Option ${i + 1}`,
        price: String(retailPrice),
        sku: `SP-${cj.productId}-${i}`,
        option1: v.name || `Option ${i + 1}`,
        inventory_quantity: 999, // CJ manages inventory
      })));

      options.push({
        name: 'Style',
        values: cj.variants.map(v => v.name || 'Default'),
        position: 1,
      });
    } else {
      // Single variant
      variants.push({
        title: 'Default Title',
        price: String(retailPrice),
        sku: `SP-${cj.productId}`,
        inventory_quantity: 999,
      });
    }

    // Build images
    const productImages: ShopifyImage[] = [];
    if (cj.image) {
      productImages.push({ src: cj.image, position: 1 });
    }
    if (images) {
      images.forEach((img, i) => {
        if (img !== cj.image) {
          productImages.push({ src: img, position: i + 2 });
        }
      });
    }

    return {
      title: name,
      body_html: bodyHtml,
      vendor: 'CJ Dropshipping',
      product_type: this.categorizeProduct(name),
      tags: ['dropshipping', 'cj-dropshipping', 'auto-import'],
      variants,
      options,
      images: productImages.length > 0 ? productImages : [{ src: cj.image || '', position: 1 }],
    };
  }

  /**
   * Categorize product based on name
   */
  private categorizeProduct(name: string): string {
    const categories: Record<string, string> = {
      'toy': 'Toys & Games',
      'pet': 'Pet Supplies',
      'dog': 'Pet Supplies',
      'cat': 'Pet Supplies',
      'home': 'Home & Garden',
      'kitchen': 'Home & Garden',
      'beauty': 'Beauty & Personal Care',
      'makeup': 'Beauty & Personal Care',
      'phone': 'Electronics',
      'laptop': 'Electronics',
      'gadget': 'Electronics',
      'fashion': 'Clothing & Accessories',
      'shoe': 'Clothing & Accessories',
      'bag': 'Clothing & Accessories',
      'jewelry': 'Clothing & Accessories',
      'watch': 'Clothing & Accessories',
      'fitness': 'Health & Wellness',
      'sport': 'Sports & Outdoors',
      'outdoor': 'Sports & Outdoors',
      'tool': 'Tools & Hardware',
      'office': 'Office Products',
      'book': 'Books',
      'art': 'Arts & Crafts',
    };

    const lowerName = name.toLowerCase();
    for (const [keyword, category] of Object.entries(categories)) {
      if (lowerName.includes(keyword)) return category;
    }

    return 'General Products';
  }

  /**
   * Import single product to Shopify
   */
  async importProduct(
    shopifyStore: ShopifyStore,
    researchProduct: ResearchProduct,
    cjApiKey?: string
  ): Promise<ImportResult> {
    try {
      // Step 1: Save to CJ account first (if user has CJ API key)
      if (cjApiKey && researchProduct.cj?.productId) {
        const cjSaved = await this.saveToCJAccount(cjApiKey, researchProduct.cj.productId);
        if (!cjSaved) {
          console.warn('Failed to save to CJ account, continuing anyway');
        }
      }

      // Step 2: Transform to Shopify format
      const shopifyProduct = this.transformToShopify(researchProduct);

      // Step 3: Create product in Shopify
      const result = await this.makeShopifyRequest(
        shopifyStore.shop,
        shopifyStore.accessToken,
        'products.json',
        'POST',
        { product: shopifyProduct }
      );

      return {
        success: true,
        productId: researchProduct.id,
        shopifyProductId: result.product.id,
        shopifyHandle: result.product.handle,
      };

    } catch (error: any) {
      console.error('Shopify import failed:', error);
      return {
        success: false,
        productId: researchProduct.id,
        error: error.message,
      };
    }
  }

  /**
   * Import multiple products
   */
  async importProducts(
    userId: string,
    storeId: string,
    products: ResearchProduct[]
  ): Promise<{
    success: number;
    failed: number;
    results: ImportResult[];
    needsCredentials: boolean;
  }> {
    // Get Shopify credentials
    const shopifyStore = await this.getShopifyCredentials(userId, storeId);
    if (!shopifyStore) {
      return {
        success: 0,
        failed: products.length,
        results: [],
        needsCredentials: true,
      };
    }

    // Get CJ credentials (optional but recommended)
    const cjApiKey = await this.getCJCredentials(userId, storeId);

    const results: ImportResult[] = [];
    let success = 0;
    let failed = 0;

    for (const product of products) {
      try {
        const result = await this.importProduct(shopifyStore, product, cjApiKey || undefined);
        results.push(result);
        
        if (result.success) {
          success++;
        } else {
          failed++;
        }

        // Add delay to respect Shopify rate limits
        await new Promise(r => setTimeout(r, 500));
        
      } catch (error) {
        failed++;
        results.push({
          success: false,
          productId: product.id,
          error: 'Import failed',
        });
      }
    }

    // Save import results
    await this.saveImportRun(userId, storeId, products.length, success, failed, results);

    return {
      success,
      failed,
      results,
      needsCredentials: false,
    };
  }

  /**
   * Save import run to database
   */
  private async saveImportRun(
    userId: string,
    storeId: string,
    total: number,
    success: number,
    failed: number,
    results: ImportResult[]
  ): Promise<void> {
    try {
      const importId = Math.random().toString(36).substring(2, 15);
      await supabase.from('product_imports').insert({
        id: importId,
        user_id: userId,
        store_id: storeId,
        total_products: total,
        success_count: success,
        failed_count: failed,
        results,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to save import run:', err);
    }
  }

  /**
   * Check if credentials are set up
   */
  async checkCredentials(userId: string, storeId: string): Promise<{
    shopify: boolean;
    cj: boolean;
  }> {
    const shopify = await this.getShopifyCredentials(userId, storeId);
    const cj = await this.getCJCredentials(userId, storeId);

    return {
      shopify: !!shopify,
      cj: !!cj,
    };
  }
}

export const shopifyImportService = new ShopifyImportService();
