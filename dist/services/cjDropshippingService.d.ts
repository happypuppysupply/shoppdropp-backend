export interface CJConfig {
    apiKey: string;
    email?: string;
}
export interface CJProduct {
    pid: string;
    name: string;
    description?: string;
    categoryName?: string;
    price: number;
    originalPrice?: number;
    imageUrl: string;
    images?: string[];
    variants?: CJVariant[];
    weight?: string;
    warehouseName?: string;
    sourceFrom?: string;
    listedNum?: number;
}
export interface CJVariant {
    vid: string;
    variantSku: string;
    variantName: string;
    variantImage?: string;
    variantPrice: number;
    variantUnitWeight?: string;
    variantProperty?: CJVariantProperty[];
}
export interface CJVariantProperty {
    name: string;
    value: string;
}
export interface CJOrder {
    orderId: string;
    status: string;
    totalAmount: number;
    shippingCost?: number;
    products: CJOrderProduct[];
    shippingAddress: CJAddress;
    createdAt: string;
    updatedAt: string;
}
export interface CJOrderProduct {
    pid: string;
    vid: string;
    quantity: number;
    price: number;
    variantSku: string;
}
export interface CJAddress {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    country: string;
    zip: string;
    phone: string;
    email?: string;
}
export interface CJInventoryItem {
    pid: string;
    vid: string;
    variantSku: string;
    quantity: number;
    warehouseName: string;
}
export declare class CJDropshippingService {
    private client;
    constructor(config: CJConfig);
    searchProducts(params: {
        categoryName?: string;
        keywords?: string;
        minPrice?: number;
        maxPrice?: number;
        pageNum?: number;
        pageSize?: number;
        sort?: string;
    }): Promise<{
        products: CJProduct[];
        total: number;
    }>;
    getProductDetails(pid: string): Promise<CJProduct>;
    getProductVariants(pid: string): Promise<CJVariant[]>;
    getInventory(pids: string[]): Promise<CJInventoryItem[]>;
    checkStock(pid: string, vid?: string): Promise<number>;
    createOrder(order: {
        orderSn: string;
        toCountry: string;
        toProvince: string;
        toCity: string;
        toAddress: string;
        toAddress2?: string;
        toZip: string;
        toName: string;
        toEmail?: string;
        toTel: string;
        products: {
            pid: string;
            vid: string;
            quantity: number;
        }[];
        remark?: string;
    }): Promise<any>;
    getOrders(params: {
        startDate?: string;
        endDate?: string;
        status?: string;
        pageNum?: number;
        pageSize?: number;
    }): Promise<{
        orders: CJOrder[];
        total: number;
    }>;
    getOrderDetails(orderId: string): Promise<CJOrder>;
    cancelOrder(orderId: string): Promise<void>;
    calculateShipping(params: {
        startWarehouse: string;
        countryCode: string;
        products: {
            pid: string;
            vid: string;
            quantity: number;
        }[];
    }): Promise<any[]>;
    getShippingMethods(countryCode: string): Promise<any[]>;
    getConnectedStores(): Promise<any[]>;
    connectShopifyStore(shopifyDomain: string, accessToken: string): Promise<void>;
    addToList(pid: string, vid?: string): Promise<void>;
    getList(): Promise<CJProduct[]>;
    findWinningProducts(params: {
        category?: string;
        minPrice?: number;
        maxPrice?: number;
        minListedNum?: number;
    }): Promise<CJProduct[]>;
    syncInventoryToShopify(shopifyService: any, mappings: {
        pid: string;
        shopifyProductId: number;
        shopifyVariantId: number;
    }[]): Promise<void>;
    fulfillShopifyOrder(shopifyOrder: any, cjProducts: {
        pid: string;
        vid: string;
        quantity: number;
    }[]): Promise<string>;
    getCategories(): Promise<any[]>;
    getUserInfo(): Promise<any>;
    getBalance(): Promise<number>;
}
export declare const createCJDropshippingService: (config: CJConfig) => CJDropshippingService;
//# sourceMappingURL=cjDropshippingService.d.ts.map