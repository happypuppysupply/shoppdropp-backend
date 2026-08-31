import { supabase } from '../db/supabase';

const CJ_API_BASE = 'https://cn.cjdropshipping.com/api2.0/v1';

interface CJProduct {
  pid: string;
  productName: string;
  productImage: string;
  productUrl: string;
  sellPrice: number;
  price: number; // CJ cost
  weight: number;
  property?: {
    key?: string;
    value?: string;
  }[];
  variants?: CJVariant[];
  variantKey?: string;
  variantValue?: string;
}

interface CJVariant {
  vid: string;
  variationSku: string;
  variationPrice: number;
  variantImage?: string;
  propertyValue?: string;
  stock: number;
}

interface CJSearchResponse {
  data: {
    list: CJProduct[];
    total: number;
  };
  code?: number;
  message?: string;
}

interface CJProductDetailResponse {
  data: CJProduct;
  code?: number;
  message?: string;
}

interface CJStockResponse {
  data: {
    vid: string;
    stock: number;
  }[];
  code?: number;
  message?: string;
}

interface CJShippingCostRequest {
  products: Array<{
    quantity: number;
    vid: string;
  }>;
  toCountryCode: string;
  toPostalCode?: string;
  isBuyer?: boolean;
}

interface CJShippingCostResponse {
  data: {
    shippingName: string;
    shippingCost: number;
    deliveryMaxDays: number;
    deliveryMinDays: number;
  }[];
  code?: number;
  message?: string;
}

export class CJDropshippingService {
  private apiToken: string | null = null;
  private email: string | null = process.env.CJ_EMAIL || null;
  private password: string | null = process.env.CJ_PASSWORD || null;

  constructor() {
    this.apiToken = process.env.CJ_API_TOKEN || null;
  }

  /**
   * Authenticate with CJ Dropshipping
   */
  async authenticate(): Promise<string> {
    if (this.apiToken) {
      return this.apiToken;
    }

    if (!this.email || !this.password) {
      throw new Error('CJ Dropshipping credentials not configured');
    }

    try {
      const response = await fetch(`${CJ_API_BASE}/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: this.email,
          password: this.password,
        }),
      });

      const data = await response.json();

      if (data.code === 200 && data.data?.accessToken) {
        this.apiToken = data.data.accessToken;
        return this.apiToken;
      }

      throw new Error(data.message || 'CJ authentication failed');
    } catch (error: any) {
      console.error('CJ authentication error:', error);
      throw new Error('Failed to authenticate with CJ Dropshipping');
    }
  }

  /**
   * Search for products on CJ
   */
  async searchProducts(query: string, options: {
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    pageNum?: number;
    pageSize?: number;
  } = {}): Promise<CJProduct[]> {
    const token = await this.authenticate();
    
    const { minPrice, maxPrice, pageNum = 1, pageSize = 20 } = options;
    
    const params = new URLSearchParams();
    params.append('productNameEn', query);
    params.append('pageNum', String(pageNum));
    params.append('pageSize', String(pageSize));
    
    if (minPrice) params.append('minPrice', String(minPrice));
    if (maxPrice) params.append('maxPrice', String(maxPrice));
    
    const response = await fetch(`${CJ_API_BASE}/product/list?${params.toString()}`, {
      headers: {
        'CJ-Access-Token': token,
      },
    });

    const data: CJSearchResponse = await response.json();

    if (data.code !== 200) {
      console.error('CJ search error:', data.message);
      return [];
    }

    return data.data?.list || [];
  }

  /**
   * Get product details by ID
   */
  async getProductDetails(productId: string): Promise<CJProduct | null> {
    const token = await this.authenticate();
    
    const response = await fetch(`${CJ_API_BASE}/product/query?pid=${productId}`, {
      headers: {
        'CJ-Access-Token': token,
      },
    });

    const data: CJProductDetailResponse = await response.json();

    if (data.code !== 200) {
      console.error('CJ product details error:', data.message);
      return null;
    }

    return data.data;
  }

  /**
   * Check price and stock for variants
   */
  async checkInventory(variantIds: string[]): Promise<Record<string, number>> {
    const token = await this.authenticate();
    
    const response = await fetch(`${CJ_API_BASE}/product/stock/variants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CJ-Access-Token': token,
      },
      body: JSON.stringify({
        vids: variantIds,
      }),
    });

    const data: CJStockResponse = await response.json();

    if (data.code !== 200) {
      console.error('CJ stock check error:', data.message);
      return {};
    }

    const stockMap: Record<string, number> = {};
    data.data.forEach(item => {
      stockMap[item.vid] = item.stock;
    });

    return stockMap;
  }

  /**
   * Calculate shipping cost
   */
  async calculateShipping(
    products: Array<{ variantId: string; quantity: number }>,
    countryCode: string,
    postalCode?: string
  ): Promise<CJShippingCostResponse['data']> {
    const token = await this.authenticate();
    
    const request: CJShippingCostRequest = {
      products: products.map(p => ({
        quantity: p.quantity,
        vid: p.variantId,
      })),
      toCountryCode: countryCode,
      ...(postalCode && { toPostalCode: postalCode }),
      isBuyer: true,
    };

    const response = await fetch(`${CJ_API_BASE}/shipping-cost2/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CJ-Access-Token': token,
      },
      body: JSON.stringify(request),
    });

    const data: CJShippingCostResponse = await response.json();

    if (data.code !== 200) {
      console.error('CJ shipping calculation error:', data.message);
      return [];
    }

    return data.data || [];
  }

  /**
   * Calculate profit margin
   */
  async calculateProfit(
    cjProduct: CJProduct,
    targetPrice: number,
    countryCode: string = 'US'
  ): Promise<{
    cost: number;
    shipping: number;
    totalCost: number;
    profit: number;
    margin: number;
    profitability: 'high' | 'medium' | 'low';
  }> {
    const variant = cjProduct.variants?.[0];
    if (!variant) {
      throw new Error('No variants available');
    }

    // Get shipping cost
    const shippingOptions = await this.calculateShipping(
      [{ variantId: variant.vid, quantity: 1 }],
      countryCode
    );

    const cheapestShipping = shippingOptions.sort((a, b) => a.shippingCost - b.shippingCost)[0];
    const shippingCost = cheapestShipping?.shippingCost || 0;

    const cjCost = variant.variationPrice;
    const totalCost = cjCost + shippingCost;
    const profit = targetPrice - totalCost;
    const marginPercent = (profit / targetPrice) * 100;

    let profitability: 'high' | 'medium' | 'low' = 'low';
    if (marginPercent > 40) profitability = 'high';
    else if (marginPercent > 20) profitability = 'medium';

    return {
      cost: cjCost,
      shipping: shippingCost,
      totalCost,
      profit,
      margin: marginPercent,
      profitability,
    };
  }

  /**
   * Quick check if a product is available on CJ
   */
  async isProductAvailable(productName: string): Promise<boolean> {
    try {
      const results = await this.searchProducts(productName, { pageSize: 1 });
      return results.length > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check multiple products for CJ availability
   * This is used during research to filter only CJ-available products
   */
  async checkMultipleProducts(productNames: string[]): Promise<{
    name: string;
    available: boolean;
    cjProduct: CJProduct | null;
    cjPrice?: number;
    shippingCost?: number;
  }[]> {
    const results = [];

    for (const name of productNames) {
      try {
        // Search for this product
        const cjProducts = await this.searchProducts(name, { pageSize: 1 });
        
        if (cjProducts.length > 0) {
          const cjProduct = cjProducts[0];
          const variant = cjProduct.variants?.[0];
          
          if (variant) {
            // Quick shipping estimate
            const shippingOptions = await this.calculateShipping(
              [{ variantId: variant.vid, quantity: 1 }],
              'US'
            );
            const shipping = shippingOptions[0]?.shippingCost || 0;

            results.push({
              name,
              available: true,
              cjProduct,
              cjPrice: variant.variationPrice,
              shippingCost: shipping,
            });
          } else {
            results.push({
              name,
              available: true,
              cjProduct,
            });
          }
        } else {
          results.push({
            name,
            available: false,
            cjProduct: null,
          });
        }

        // Small delay to be nice to API
        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        console.error(`CJ check failed for ${name}:`, error);
        results.push({
          name,
          available: false,
          cjProduct: null,
        });
      }
    }

    return results;
  }

  /**
   * Import product to CJ (for actual orders)
   */
  async importProduct(productId: string): Promise<any> {
    const token = await this.authenticate();
    
    const response = await fetch(`${CJ_API_BASE}/product/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CJ-Access-Token': token,
      },
      body: JSON.stringify({
        pid: productId,
      }),
    });

    return response.json();
  }
}

// Export singleton
export const cjDropshippingService = new CJDropshippingService();
