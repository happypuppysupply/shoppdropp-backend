"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShopifyService = exports.ShopifyService = void 0;
const axios_1 = __importDefault(require("axios"));
class ShopifyService {
    client;
    shopDomain;
    constructor(config) {
        this.shopDomain = config.shopDomain.replace('.myshopify.com', '');
        const apiVersion = config.apiVersion || '2024-01';
        this.client = axios_1.default.create({
            baseURL: `https://${this.shopDomain}.myshopify.com/admin/api/${apiVersion}`,
            headers: {
                'X-Shopify-Access-Token': config.accessToken,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        // Rate limiting: 2 calls/second for standard, 4/second for Plus
        this.setupRateLimiting();
    }
    setupRateLimiting() {
        let lastRequestTime = 0;
        const minInterval = 500; // 500ms between requests = 2/second
        this.client.interceptors.request.use(async (config) => {
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            if (timeSinceLastRequest < minInterval) {
                await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
            }
            lastRequestTime = Date.now();
            return config;
        });
    }
    // ============ PRODUCTS ============
    async getProducts(limit = 50, pageInfo) {
        const params = { limit };
        if (pageInfo)
            params.page_info = pageInfo;
        const response = await this.client.get('/products.json', { params });
        return {
            products: response.data.products,
            pageInfo: this.extractPageInfo(response.headers['link']),
        };
    }
    async getProduct(productId) {
        const response = await this.client.get(`/products/${productId}.json`);
        return response.data.product;
    }
    async createProduct(product) {
        const response = await this.client.post('/products.json', { product });
        return response.data.product;
    }
    async updateProduct(productId, product) {
        const response = await this.client.put(`/products/${productId}.json`, { product });
        return response.data.product;
    }
    async deleteProduct(productId) {
        await this.client.delete(`/products/${productId}.json`);
    }
    // ============ ORDERS ============
    async getOrders(status, limit = 50) {
        const params = { limit };
        if (status && status !== 'any')
            params.status = status;
        const response = await this.client.get('/orders.json', { params });
        return response.data.orders;
    }
    async getOrder(orderId) {
        const response = await this.client.get(`/orders/${orderId}.json`);
        return response.data.order;
    }
    async fulfillOrder(orderId, trackingNumber, trackingCompany) {
        const fulfillment = {
            order_id: orderId,
            tracking_number: trackingNumber,
            tracking_company: trackingCompany,
            notify_customer: true,
        };
        const response = await this.client.post(`/orders/${orderId}/fulfillments.json`, { fulfillment });
        return response.data.fulfillment;
    }
    // ============ INVENTORY ============
    async updateInventory(inventoryItemId, locationId, quantity) {
        const response = await this.client.post('/inventory_levels/set.json', {
            location_id: locationId,
            inventory_item_id: inventoryItemId,
            available: quantity,
        });
        return response.data;
    }
    async getInventoryLevels(inventoryItemIds) {
        const response = await this.client.get('/inventory_levels.json', {
            params: { inventory_item_ids: inventoryItemIds.join(',') },
        });
        return response.data.inventory_levels;
    }
    // ============ THEMES ============
    async getThemes() {
        const response = await this.client.get('/themes.json');
        return response.data.themes;
    }
    async getTheme(themeId) {
        const response = await this.client.get(`/themes/${themeId}.json`);
        return response.data.theme;
    }
    async updateThemeAsset(themeId, key, content) {
        const asset = {
            key,
            value: content,
        };
        const response = await this.client.put(`/themes/${themeId}/assets.json`, { asset });
        return response.data.asset;
    }
    // ============ SHOP INFO ============
    async getShopInfo() {
        const response = await this.client.get('/shop.json');
        return response.data.shop;
    }
    // ============ WEBHOOKS ============
    async createWebhook(topic, address) {
        const webhook = {
            topic,
            address,
            format: 'json',
        };
        const response = await this.client.post('/webhooks.json', { webhook });
        return response.data.webhook;
    }
    async getWebhooks() {
        const response = await this.client.get('/webhooks.json');
        return response.data.webhooks;
    }
    // ============ HELPER METHODS ============
    extractPageInfo(linkHeader) {
        if (!linkHeader)
            return undefined;
        const match = linkHeader.match(/page_info=([^&>]+)/);
        return match ? match[1] : undefined;
    }
    // Bulk operations for AI workers
    async bulkUpdateProducts(updates) {
        // Process in batches of 10 to respect rate limits
        const batchSize = 10;
        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            await Promise.all(batch.map(update => this.updateProduct(update.id, update)));
        }
    }
    async syncInventoryFromSupplier(supplierUpdates) {
        // Get all products
        const { products } = await this.getProducts(250);
        // Create SKU to variant map
        const skuMap = new Map();
        for (const product of products) {
            for (const variant of product.variants) {
                skuMap.set(variant.sku, variant);
            }
        }
        // Update matching variants
        for (const update of supplierUpdates) {
            const variant = skuMap.get(update.sku);
            if (variant) {
                await this.client.put(`/variants/${variant.id}.json`, {
                    variant: {
                        id: variant.id,
                        inventory_quantity: update.quantity,
                        ...(update.price && { price: update.price.toString() }),
                    },
                });
            }
        }
    }
}
exports.ShopifyService = ShopifyService;
const createShopifyService = (config) => new ShopifyService(config);
exports.createShopifyService = createShopifyService;
//# sourceMappingURL=shopifyService.js.map