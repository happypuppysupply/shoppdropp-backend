export interface StoreScanResult {
    url: string;
    shopifyDomain: string;
    theme: {
        name?: string;
        version?: string;
        features: string[];
    };
    pages: ScannedPage[];
    collections: ScannedCollection[];
    navigation: ScannedNav[];
    products: ScannedProduct[];
    design: StoreDesignProfile;
    customPages: string[];
    apps: string[];
    seo: SEOProfile;
}
export interface ScannedPage {
    path: string;
    title: string;
    type: 'home' | 'collection' | 'product' | 'page' | 'blog' | 'cart' | 'custom';
    sections?: string[];
    hasForm?: boolean;
    hasQuiz?: boolean;
    hasVideo?: boolean;
    contentLength?: number;
}
export interface ScannedCollection {
    handle: string;
    title: string;
    productCount?: number;
    description?: string;
    image?: string;
}
export interface ScannedNav {
    title: string;
    url: string;
    items?: ScannedNav[];
    position: 'header' | 'footer' | 'sidebar';
}
export interface ScannedProduct {
    handle: string;
    title: string;
    price?: string;
    images: string[];
    description?: string;
    tags?: string[];
    variants?: number;
}
export interface StoreDesignProfile {
    colors: {
        primary?: string;
        secondary?: string;
        background?: string;
        text?: string;
        accent?: string;
    };
    typography: {
        headingFont?: string;
        bodyFont?: string;
    };
    layout: {
        maxWidth?: string;
        gridColumns?: number;
        spacing?: string;
    };
    style: 'minimal' | 'bold' | 'elegant' | 'playful' | 'modern' | 'classic';
}
export interface SEOProfile {
    title: string;
    description?: string;
    hasStructuredData: boolean;
    hasOpenGraph: boolean;
    hasTwitterCard: boolean;
    headings: {
        h1: number;
        h2: number;
        h3: number;
    };
}
export interface StoreConfiguration {
    storeId: string;
    userId: string;
    scanSource?: {
        url: string;
        scanResult?: StoreScanResult;
    };
    designPreferences: {
        layout: 'grid' | 'masonry' | 'list' | 'carousel';
        colorScheme: 'light' | 'dark' | 'auto' | 'custom';
        customColors?: {
            primary: string;
            secondary: string;
            background: string;
            text: string;
        };
        typography: 'modern' | 'classic' | 'playful' | 'minimal';
        style: 'minimal' | 'bold' | 'elegant' | 'playful' | 'modern' | 'classic';
        density: 'compact' | 'comfortable' | 'spacious';
    };
    pageRequirements: {
        home: HomePageConfig;
        product: ProductPageConfig;
        collection: CollectionPageConfig;
        customPages: CustomPageConfig[];
    };
    features: {
        search: boolean;
        filters: boolean;
        quickView: boolean;
        wishlist: boolean;
        reviews: boolean;
        relatedProducts: boolean;
        recentlyViewed: boolean;
        sizeGuide: boolean;
        productQuiz: boolean;
        chat: boolean;
    };
    integrations: {
        emailMarketing?: 'klaviyo' | 'mailchimp' | 'none';
        reviews?: 'yotpo' | 'judge.me' | 'loox' | 'none';
        analytics?: 'google' | 'facebook' | 'both';
        loyalty?: 'smile' | 'loyaltylion' | 'none';
    };
    content: {
        aboutPage?: string;
        faqSections?: FAQSection[];
        shippingPolicy?: string;
        returnPolicy?: string;
        contactInfo?: {
            email: string;
            phone?: string;
            address?: string;
        };
    };
}
export interface HomePageConfig {
    hero: {
        enabled: boolean;
        type: 'image' | 'video' | 'slider' | 'split';
        headline?: string;
        subheadline?: string;
        ctaText?: string;
        ctaLink?: string;
    };
    featuredCollections: {
        enabled: boolean;
        collections: string[];
        layout: 'grid' | 'carousel';
    };
    featuredProducts: {
        enabled: boolean;
        count: number;
        source: 'manual' | 'best_selling' | 'newest';
    };
    aboutSection: {
        enabled: boolean;
        content?: string;
    };
    testimonials: {
        enabled: boolean;
        count: number;
    };
    blogSection: {
        enabled: boolean;
        count: number;
    };
    newsletter: {
        enabled: boolean;
        placement: 'footer' | 'popup' | 'section';
    };
}
export interface ProductPageConfig {
    layout: 'standard' | 'sticky' | 'accordion' | 'tabs';
    imageGallery: 'thumbnails' | 'slider' | 'grid' | 'zoom';
    description: 'plain' | 'tabs' | 'accordion';
    elements: {
        price: boolean;
        variants: boolean;
        quantity: boolean;
        addToCart: boolean;
        buyNow: boolean;
        description: boolean;
        specifications: boolean;
        reviews: boolean;
        relatedProducts: boolean;
        recentlyViewed: boolean;
        socialShare: boolean;
        sizeGuide: boolean;
        shippingInfo: boolean;
    };
    customSections: {
        title: string;
        content: string;
        position: 'above_description' | 'below_description' | 'above_add_to_cart';
    }[];
}
export interface CollectionPageConfig {
    layout: 'grid' | 'list';
    columns: 2 | 3 | 4 | 5;
    filters: {
        enabled: boolean;
        position: 'sidebar' | 'top' | 'drawer';
        types: ('price' | 'availability' | 'vendor' | 'tags' | 'variants')[];
    };
    sorting: boolean;
    pagination: 'pages' | 'load_more' | 'infinite';
    quickView: boolean;
    descriptionPosition: 'top' | 'bottom' | 'sidebar';
    image: 'large' | 'medium' | 'small' | 'none';
}
export interface CustomPageConfig {
    id: string;
    title: string;
    handle: string;
    type: 'assessment' | 'quiz' | 'calculator' | 'landing' | 'about' | 'contact' | 'faq' | 'custom';
    purpose?: string;
    sections: PageSection[];
    forms?: FormConfig[];
}
export interface PageSection {
    type: 'hero' | 'text' | 'image' | 'video' | 'products' | 'collection' | 'form' | 'testimonials' | 'features' | 'cta';
    content?: string;
    image?: string;
    layout?: 'full' | 'split' | 'contained';
    background?: 'white' | 'light' | 'dark' | 'gradient' | 'image';
}
export interface FormConfig {
    id: string;
    title: string;
    fields: FormField[];
    submitAction: 'email' | 'webhook' | 'redirect';
    submitDestination?: string;
}
export interface FormField {
    id: string;
    type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number' | 'date';
    label: string;
    required: boolean;
    options?: string[];
    placeholder?: string;
}
export interface FAQSection {
    title: string;
    questions: {
        question: string;
        answer: string;
    }[];
}
export declare class StoreScanner {
    scanStore(url: string): Promise<StoreScanResult>;
    private detectTheme;
    private detectCollections;
    private scanSubPage;
    private extractShopifyDomain;
    private detectPages;
    private inferPageType;
    private detectSections;
    private detectNavigation;
    private detectDesignProfile;
    private detectApps;
    private scanPage;
    generateConfigFromScan(scanResult: StoreScanResult): Partial<StoreConfiguration>;
    private generateRealisticMockData;
}
export declare const storeScanner: StoreScanner;
//# sourceMappingURL=storeScanner.d.ts.map