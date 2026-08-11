"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCJDropshippingService = exports.CJDropshippingService = void 0;
const axios_1 = __importDefault(require("axios"));
class CJDropshippingService {
    client;
    constructor(config) {
        this.client = axios_1.default.create({
            baseURL: 'https://api.cjdropshipping.com/api2.0/v1',
            headers: {
                'CJ-Access-Token': config.apiKey,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
    }
    // ============ PRODUCT SEARCH ============
    async searchProducts(params) {
        const response = await this.client.post('/product/list', {
            categoryName: params.categoryName,
            productName: params.keywords,
            minPrice: params.minPrice,
            maxPrice: params.maxPrice,
            pageNum: params.pageNum || 1,
            pageSize: params.pageSize || 20,
            sort: params.sort,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to search products');
        }
        return {
            products: response.data.data.list || [],
            total: response.data.data.total || 0,
        };
    }
    async getProductDetails(pid) {
        const response = await this.client.post('/product/query', {
            pid,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get product details');
        }
        return response.data.data;
    }
    async getProductVariants(pid) {
        const response = await this.client.post('/variant/query', {
            pid,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get variants');
        }
        return response.data.data || [];
    }
    // ============ INVENTORY ============
    async getInventory(pids) {
        const response = await this.client.post('/inventory/query', {
            pids,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get inventory');
        }
        return response.data.data || [];
    }
    async checkStock(pid, vid) {
        const inventory = await this.getInventory([pid]);
        if (vid) {
            const item = inventory.find(i => i.vid === vid);
            return item?.quantity || 0;
        }
        return inventory.reduce((sum, item) => sum + item.quantity, 0);
    }
    // ============ ORDERS ============
    async createOrder(order) {
        const response = await this.client.post('/shopping/order/createOrder', order);
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to create order');
        }
        return response.data.data;
    }
    async getOrders(params) {
        const response = await this.client.post('/order/list', {
            startDate: params.startDate,
            endDate: params.endDate,
            status: params.status,
            pageNum: params.pageNum || 1,
            pageSize: params.pageSize || 20,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get orders');
        }
        return {
            orders: response.data.data.list || [],
            total: response.data.data.total || 0,
        };
    }
    async getOrderDetails(orderId) {
        const response = await this.client.post('/order/query', {
            orderId,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get order details');
        }
        return response.data.data;
    }
    async cancelOrder(orderId) {
        const response = await this.client.post('/order/cancel', {
            orderId,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to cancel order');
        }
    }
    // ============ SHIPPING ============
    async calculateShipping(params) {
        const response = await this.client.post('/logistic/freightCalculate', params);
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to calculate shipping');
        }
        return response.data.data || [];
    }
    async getShippingMethods(countryCode) {
        const response = await this.client.post('/logistic/methods', {
            countryCode,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get shipping methods');
        }
        return response.data.data || [];
    }
    // ============ CONNECTED STORES ============
    async getConnectedStores() {
        const response = await this.client.post('/store/list');
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get stores');
        }
        return response.data.data || [];
    }
    async connectShopifyStore(shopifyDomain, accessToken) {
        const response = await this.client.post('/shopify/auth', {
            shopUrl: shopifyDomain,
            accessToken,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to connect Shopify store');
        }
    }
    // ============ LISTS/WISHLIST ============
    async addToList(pid, vid) {
        const response = await this.client.post('/product/addToList', {
            pid,
            vid,
        });
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to add to list');
        }
    }
    async getList() {
        const response = await this.client.post('/product/listByUser');
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get list');
        }
        return response.data.data || [];
    }
    // ============ AI WORKER METHODS ============
    async findWinningProducts(params) {
        // Search products with filters for "winning" indicators
        const { products } = await this.searchProducts({
            categoryName: params.category,
            minPrice: params.minPrice,
            maxPrice: params.maxPrice,
            pageSize: 50,
            sort: 'listedNum_desc', // Sort by popularity
        });
        // Filter by minimum listings (popularity indicator)
        return products.filter(p => (p.listedNum || 0) >= (params.minListedNum || 100));
    }
    async syncInventoryToShopify(shopifyService, mappings) {
        // Get current CJ inventory
        const pids = mappings.map(m => m.pid);
        const inventory = await this.getInventory(pids);
        // Update Shopify inventory
        for (const mapping of mappings) {
            const cjInventory = inventory.find(i => i.pid === mapping.pid);
            if (cjInventory) {
                await shopifyService.updateInventory(mapping.shopifyVariantId, 0, // location ID would come from Shopify
                cjInventory.quantity);
            }
        }
    }
    async fulfillShopifyOrder(shopifyOrder, cjProducts) {
        // Create CJ order from Shopify order
        const address = shopifyOrder.shipping_address || shopifyOrder.customer?.default_address;
        if (!address) {
            throw new Error('No shipping address available');
        }
        const cjOrder = await this.createOrder({
            orderSn: shopifyOrder.name,
            toCountry: address.country_code || address.country,
            toProvince: address.province,
            toCity: address.city,
            toAddress: address.address1,
            toAddress2: address.address2,
            toZip: address.zip,
            toName: `${address.first_name} ${address.last_name}`,
            toEmail: shopifyOrder.email,
            toTel: address.phone || '0000000000',
            products: cjProducts,
            remark: `Shopify Order: ${shopifyOrder.name}`,
        });
        return cjOrder.orderId;
    }
    // ============ CATEGORIES ============
    async getCategories() {
        const response = await this.client.post('/product/getCategory');
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get categories');
        }
        return response.data.data || [];
    }
    // ============ UTILITY ============
    async getUserInfo() {
        const response = await this.client.post('/user/info');
        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to get user info');
        }
        return response.data.data;
    }
    async getBalance() {
        const userInfo = await this.getUserInfo();
        return userInfo.balance || 0;
    }
}
exports.CJDropshippingService = CJDropshippingService;
const createCJDropshippingService = (config) => new CJDropshippingService(config);
exports.createCJDropshippingService = createCJDropshippingService;
//# sourceMappingURL=cjDropshippingService.js.map