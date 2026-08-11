export interface ShopifyConfig {
    shopDomain: string;
    accessToken: string;
    apiVersion?: string;
}
export interface ShopifyProduct {
    id: number;
    title: string;
    body_html: string;
    vendor: string;
    product_type: string;
    tags: string[];
    variants: ShopifyVariant[];
    images: ShopifyImage[];
    status: 'active' | 'draft' | 'archived';
    created_at: string;
    updated_at: string;
}
export interface ShopifyVariant {
    id: number;
    product_id: number;
    title: string;
    price: string;
    sku: string;
    inventory_quantity: number;
    inventory_policy: string;
    fulfillment_service: string;
    requires_shipping: boolean;
    taxable: boolean;
    grams: number;
}
export interface ShopifyImage {
    id: number;
    product_id: number;
    position: number;
    src: string;
    alt: string;
}
export interface ShopifyOrder {
    id: number;
    name: string;
    email: string;
    financial_status: string;
    fulfillment_status: string | null;
    total_price: string;
    subtotal_price: string;
    total_tax: string;
    currency: string;
    line_items: ShopifyLineItem[];
    customer?: ShopifyCustomer;
    created_at: string;
}
export interface ShopifyLineItem {
    id: number;
    product_id: number;
    variant_id: number;
    quantity: number;
    price: string;
    title: string;
}
export interface ShopifyCustomer {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
}
export declare class ShopifyService {
    private client;
    private shopDomain;
    constructor(config: ShopifyConfig);
    private setupRateLimiting;
    getProducts(limit?: number, pageInfo?: string): Promise<{
        products: ShopifyProduct[];
        pageInfo?: string;
    }>;
    getProduct(productId: number): Promise<ShopifyProduct>;
    createProduct(product: Partial<ShopifyProduct>): Promise<ShopifyProduct>;
    updateProduct(productId: number, product: Partial<ShopifyProduct>): Promise<ShopifyProduct>;
    deleteProduct(productId: number): Promise<void>;
    getOrders(status?: 'open' | 'closed' | 'cancelled' | 'any', limit?: number): Promise<ShopifyOrder[]>;
    getOrder(orderId: number): Promise<ShopifyOrder>;
    fulfillOrder(orderId: number, trackingNumber?: string, trackingCompany?: string): Promise<any>;
    updateInventory(inventoryItemId: number, locationId: number, quantity: number): Promise<void>;
    getInventoryLevels(inventoryItemIds: number[]): Promise<any[]>;
    getThemes(): Promise<any[]>;
    getTheme(themeId: number): Promise<any>;
    updateThemeAsset(themeId: number, key: string, content: string): Promise<any>;
    getShopInfo(): Promise<any>;
    createWebhook(topic: string, address: string): Promise<any>;
    getWebhooks(): Promise<any[]>;
    private extractPageInfo;
    bulkUpdateProducts(updates: {
        id: number;
        title?: string;
        body_html?: string;
        tags?: string[];
    }[]): Promise<void>;
    syncInventoryFromSupplier(supplierUpdates: {
        sku: string;
        quantity: number;
        price?: number;
    }[]): Promise<void>;
}
export declare const createShopifyService: (config: ShopifyConfig) => ShopifyService;
//# sourceMappingURL=shopifyService.d.ts.map