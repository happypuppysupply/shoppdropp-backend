"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeScanner = exports.StoreScanner = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
class StoreScanner {
    async scanStore(url) {
        console.log(`[StoreScanner] ACTUALLY scanning: ${url}`);
        // Try HTTPS first, then HTTP
        let html;
        let finalUrl;
        try {
            console.log(`[StoreScanner] Trying HTTPS...`);
            const response = await axios_1.default.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                },
                timeout: 20000,
                maxRedirects: 5,
                validateStatus: () => true, // Don't throw on any status
            });
            html = response.data;
            finalUrl = response.request?.res?.responseUrl || url;
            console.log(`[StoreScanner] HTTPS success! Status: ${response.status}`);
        }
        catch (sslError) {
            console.log(`[StoreScanner] HTTPS failed (${sslError.message}), trying HTTP...`);
            try {
                const httpUrl = url.replace('https://', 'http://');
                const response = await axios_1.default.get(httpUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    },
                    timeout: 20000,
                    maxRedirects: 5,
                    validateStatus: () => true,
                });
                html = response.data;
                finalUrl = response.request?.res?.responseUrl || httpUrl;
                console.log(`[StoreScanner] HTTP success! Status: ${response.status}`);
            }
            catch (httpError) {
                console.error(`[StoreScanner] Both HTTPS and HTTP failed: ${httpError.message}`);
                throw new Error(`Cannot access ${url}: ${httpError.message}`);
            }
        }
        console.log(`[StoreScanner] Parsing HTML (${html.length} chars)...`);
        const $ = cheerio.load(html);
        // Extract comprehensive data
        const result = {
            url: finalUrl,
            shopifyDomain: this.extractShopifyDomain(finalUrl),
            theme: this.detectTheme($),
            pages: [],
            collections: [],
            navigation: [],
            products: [],
            design: this.detectDesignProfile($),
            customPages: [],
            apps: this.detectApps($),
            seo: {
                title: $('title').text().trim() || '',
                description: $('meta[name="description"]').attr('content'),
                hasOpenGraph: $('meta[property^="og:"]').length > 0,
                hasTwitterCard: $('meta[name^="twitter:"]').length > 0,
                hasStructuredData: $('script[type="application/ld+json"]').length > 0,
                headings: {
                    h1: $('h1').length,
                    h2: $('h2').length,
                    h3: $('h3').length,
                },
            },
        };
        // Detect ALL pages from navigation and links
        console.log(`[StoreScanner] Detecting pages...`);
        result.pages = this.detectPages($, finalUrl);
        result.navigation = this.detectNavigation($);
        result.collections = this.detectCollections($);
        // Try to fetch /collections/all for more products
        try {
            console.log(`[StoreScanner] Fetching collections page...`);
            const collectionsRes = await axios_1.default.get(`${finalUrl}/collections/all`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000,
                validateStatus: () => true,
            });
            if (collectionsRes.status === 200) {
                const $c = cheerio.load(collectionsRes.data);
                const collectionTitle = $c('h1').first().text().trim();
                if (collectionTitle && !result.collections.find(c => c.handle === 'all')) {
                    result.collections.push({ handle: 'all', title: collectionTitle });
                }
                // Count products - look for multiple selectors
                let productCount = $c('[data-product-handle]').length;
                if (productCount === 0)
                    productCount = $c('.product-item').length;
                if (productCount === 0)
                    productCount = $c('.product-card').length;
                if (productCount === 0)
                    productCount = $c('.grid__item').length;
                if (productCount === 0)
                    productCount = $c('[data-product-id]').length;
                // Look for product count in text
                const productCountText = $c('.collection-product-count, .products-count, .results-count').first().text();
                const match = productCountText.match(/(\d+)/);
                if (match) {
                    productCount = parseInt(match[1], 10);
                    console.log(`[StoreScanner] Found ${productCount} products from count text`);
                }
                // Look for pagination to estimate total
                const paginationText = $c('.pagination, .pagination__list').text();
                const pageMatch = paginationText.match(/of\s+(\d+)/i);
                if (pageMatch && productCount > 0) {
                    const totalPages = parseInt(pageMatch[1], 10);
                    const estimatedTotal = productCount * totalPages;
                    console.log(`[StoreScanner] Pagination suggests ~${estimatedTotal} products across ${totalPages} pages`);
                    productCount = estimatedTotal;
                }
                // Look for JSON-LD product data
                const jsonLd = $c('script[type="application/ld+json"]').text();
                const productMatches = jsonLd.match(/"@type":\s*"Product"/g);
                if (productMatches) {
                    console.log(`[StoreScanner] Found ${productMatches.length} products in JSON-LD`);
                    if (productMatches.length > productCount) {
                        productCount = productMatches.length;
                    }
                }
                if (productCount > 0) {
                    console.log(`[StoreScanner] Total products detected: ${productCount}`);
                    // Store product count in the 'all' collection
                    const allCollection = result.collections.find(c => c.handle === 'all');
                    console.log(`[StoreScanner] Found 'all' collection: ${allCollection ? 'YES' : 'NO'}`);
                    if (allCollection) {
                        allCollection.productCount = productCount;
                        console.log(`[StoreScanner] Set productCount to ${productCount}`);
                    }
                }
            }
        }
        catch (e) {
            console.log(`[StoreScanner] Could not fetch collections: ${e.message}`);
        }
        // Also try to get product count from sitemap index
        try {
            console.log(`[StoreScanner] Fetching sitemap...`);
            const sitemapRes = await axios_1.default.get(`${finalUrl}/sitemap.xml`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000,
                validateStatus: () => true,
            });
            console.log(`[StoreScanner] Sitemap status: ${sitemapRes.status}, size: ${sitemapRes.data?.length || 0}`);
            if (sitemapRes.status === 200 && sitemapRes.data) {
                // Check if it's a sitemap index
                if (sitemapRes.data.includes('<sitemapindex')) {
                    // Find product sitemap URLs
                    const productSitemapMatches = sitemapRes.data.match(/<loc>([^<]*sitemap_products[^<]*)<\/loc>/g);
                    if (productSitemapMatches) {
                        let totalProducts = 0;
                        for (const match of productSitemapMatches) {
                            const sitemapUrl = match.replace(/<\/?loc>/g, '');
                            try {
                                const productSitemapRes = await axios_1.default.get(sitemapUrl, {
                                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                                    timeout: 10000,
                                    validateStatus: () => true,
                                });
                                if (productSitemapRes.status === 200) {
                                    const productMatches = productSitemapRes.data.match(/<loc>[^<]*\/products\/[^<]+<\/loc>/g);
                                    if (productMatches) {
                                        totalProducts += productMatches.length;
                                    }
                                }
                            }
                            catch (e) {
                                // Ignore errors for individual sitemaps
                            }
                        }
                        if (totalProducts > 0) {
                            console.log(`[StoreScanner] Sitemap index shows ${totalProducts} total products`);
                            const allCollection = result.collections.find(c => c.handle === 'all');
                            if (allCollection) {
                                allCollection.productCount = totalProducts;
                            }
                        }
                    }
                }
                else {
                    // Regular sitemap
                    const productMatches = sitemapRes.data.match(/<loc>.*\/products\/[^<]+<\/loc>/g);
                    if (productMatches) {
                        console.log(`[StoreScanner] Sitemap shows ${productMatches.length} products`);
                        const allCollection = result.collections.find(c => c.handle === 'all');
                        if (allCollection && (!allCollection.productCount || productMatches.length > allCollection.productCount)) {
                            allCollection.productCount = productMatches.length;
                        }
                    }
                }
            }
        }
        catch (e) {
            console.log(`[StoreScanner] Could not fetch sitemap: ${e.message}`);
        }
        // Detect custom features from homepage content
        const pageText = $('body').text().toLowerCase();
        if (pageText.includes('assessment') || pageText.includes('quiz') || pageText.includes('personality')) {
            if (!result.pages.find(p => p.path.includes('assessment'))) {
                result.pages.push({
                    path: '/assessment',
                    title: 'Assessment',
                    type: 'custom',
                    hasQuiz: true,
                });
            }
        }
        if (pageText.includes('club') || pageText.includes('subscription') || pageText.includes('monthly box')) {
            if (!result.pages.find(p => p.path.includes('club'))) {
                result.pages.push({
                    path: '/club',
                    title: 'Club/Subscription',
                    type: 'custom',
                });
            }
        }
        console.log(`[StoreScanner] Found ${result.pages.length} pages, ${result.collections.length} collections`);
        console.log(`[StoreScanner] Pages: ${result.pages.map(p => p.path).join(', ')}`);
        // Scan custom pages that actually exist
        const customPagePaths = result.pages
            .filter(p => p.type === 'custom' || p.type === 'page')
            .map(p => p.path)
            .filter((v, i, a) => a.indexOf(v) === i);
        console.log(`[StoreScanner] Scanning ${customPagePaths.length} custom pages...`);
        for (const pagePath of customPagePaths.slice(0, 10)) {
            try {
                const pageData = await this.scanSubPage(finalUrl, pagePath);
                if (pageData) {
                    const existingIdx = result.pages.findIndex(p => p.path === pagePath);
                    if (existingIdx >= 0) {
                        result.pages[existingIdx] = { ...result.pages[existingIdx], ...pageData };
                    }
                    else {
                        result.pages.push(pageData);
                    }
                    console.log(`[StoreScanner] Scanned ${pagePath}: found ${pageData.sections?.length || 0} sections, hasForm=${pageData.hasForm}, hasQuiz=${pageData.hasQuiz}`);
                }
            }
            catch (e) {
                console.log(`[StoreScanner] Could not scan ${pagePath}: ${e.message}`);
            }
        }
        // Update customPages list
        result.customPages = result.pages
            .filter(p => p.type === 'custom' || p.type === 'page')
            .map(p => p.path);
        console.log(`[StoreScanner] COMPLETE: ${result.pages.length} total pages, ${result.customPages.length} custom pages detected`);
        console.log(`[StoreScanner] Custom pages: ${result.customPages.join(', ')}`);
        console.log(`[StoreScanner] Apps detected: ${result.apps.join(', ')}`);
        return result;
    }
    detectTheme($) {
        const features = [];
        // Check for common theme features
        if ($('[data-section-type]').length)
            features.push('Sections');
        if ($('.swiper, .slick-slider').length)
            features.push('Carousel');
        if ($('.quick-view').length)
            features.push('Quick View');
        if ($('.mega-menu').length)
            features.push('Mega Menu');
        if ($('[data-product-handle]').length)
            features.push('Product Cards');
        if ($('#predictive-search').length)
            features.push('Predictive Search');
        // Try to detect theme name
        const themeId = $('meta[name="theme-id"]').attr('content') ||
            $('meta[name="shopify-theme-name"]').attr('content') ||
            $('script').text().match(/themeName["']?\s*[:=]\s*["']([^"']+)/)?.[1];
        return {
            name: themeId,
            features,
        };
    }
    detectCollections($) {
        const collections = [];
        const seen = new Set();
        // Helper function to extract product count from text
        const extractProductCount = (text) => {
            if (!text)
                return undefined;
            // Match patterns like "21 products", "21 product", "21 items", "(21)", etc.
            const patterns = [
                /(\d+)\s*(?:product|products|item|items)/i,
                /\((\d+)\)/,
                /:\s*(\d+)\s/,
            ];
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match)
                    return parseInt(match[1], 10);
            }
            return undefined;
        };
        // Find from nav links
        $('a[href*="/collections/"]').each((_, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim();
            if (href && title && !seen.has(href)) {
                seen.add(href);
                const match = href.match(/\/collections\/([^?/]+)/);
                if (match) {
                    // Try to find product count in multiple sources
                    let productCount;
                    const parent = $(el).parent();
                    // Check multiple sources for product count
                    const countSources = [
                        title, // Check the title text itself (e.g., "Dog Beds: 21 products")
                        parent.find('.product-count, .products-count, [data-product-count]').text(),
                        parent.next().text(),
                        parent.parent().find('.product-count, .products-count, .count').text(),
                        $(el).closest('.collection-card, .collection-item, .grid__item').text(),
                    ];
                    for (const countText of countSources) {
                        productCount = extractProductCount(countText);
                        if (productCount)
                            break;
                    }
                    collections.push({
                        handle: match[1],
                        title: title || match[1],
                        productCount,
                    });
                }
            }
        });
        // Find from collection cards/grids with product counts
        $('[data-section-type="collection-list"] .collection-item, .collection-grid-item, .collection-card, .collection-list__item').each((_, el) => {
            const link = $(el).find('a[href*="/collections/"]').first();
            const href = link.attr('href');
            const title = link.text().trim() || $(el).find('h2, h3, .collection-title, .card__heading').first().text().trim();
            if (href && title && !seen.has(href)) {
                seen.add(href);
                const match = href.match(/\/collections\/([^?/]+)/);
                if (match) {
                    // Look for product count anywhere in the card text
                    const cardText = $(el).text();
                    const productCount = extractProductCount(cardText);
                    collections.push({
                        handle: match[1],
                        title: title,
                        productCount,
                    });
                }
            }
        });
        // Also look for collection images/titles that have product counts nearby
        $('.collection-grid-item__title, .collection-card__title, .collection-list__item-title').each((_, el) => {
            const titleEl = $(el);
            const title = titleEl.text().trim();
            const link = titleEl.closest('a[href*="/collections/"]');
            const href = link.attr('href') || titleEl.parent().find('a[href*="/collections/"]').attr('href');
            if (href && title && !seen.has(href)) {
                seen.add(href);
                const match = href.match(/\/collections\/([^?/]+)/);
                if (match) {
                    // Look for count in the same container
                    const container = titleEl.closest('.collection-grid-item, .collection-card, .grid__item, .collection-list__item');
                    const cardText = container.text();
                    const productCount = extractProductCount(cardText) || extractProductCount(title);
                    collections.push({
                        handle: match[1],
                        title: title,
                        productCount,
                    });
                }
            }
        });
        return collections;
    }
    async scanSubPage(baseUrl, path) {
        const fullUrl = `${baseUrl}${path}`;
        console.log(`[StoreScanner] Fetching: ${fullUrl}`);
        try {
            const response = await axios_1.default.get(fullUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                timeout: 10000,
                validateStatus: () => true,
            });
            const $ = cheerio.load(response.data);
            const title = $('h1').first().text().trim() || $('title').text().trim();
            // Detect special content
            const hasForm = $('form, input[type="email"], .klaviyo-form, #klaviyo').length > 0 ||
                $('button[type="submit"]').text().toLowerCase().includes('subscribe') ||
                $('button[type="submit"]').text().toLowerCase().includes('submit');
            const hasQuiz = $('form').text().toLowerCase().includes('quiz') ||
                $('form').text().toLowerCase().includes('assessment') ||
                $('body').text().toLowerCase().includes('find your') ||
                $('.quiz, .assessment, [data-quiz]').length > 0;
            const hasVideo = $('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length > 0;
            // Detect sections
            const sections = [];
            $('[data-section-type]').each((_, el) => {
                const type = $(el).attr('data-section-type');
                if (type)
                    sections.push(type);
            });
            // Detect subscription features
            if ($('body').text().toLowerCase().includes('club') ||
                $('body').text().toLowerCase().includes('subscription') ||
                $('body').text().toLowerCase().includes('monthly') ||
                $('body').text().toLowerCase().includes('membership')) {
                sections.push('subscription');
            }
            return {
                path,
                title,
                type: this.inferPageType(path, title),
                sections: [...new Set(sections)], // Unique
                hasForm,
                hasQuiz,
                hasVideo,
                contentLength: response.data.length,
            };
        }
        catch (error) {
            console.log(`[StoreScanner] Failed to scan ${path}: ${error.message}`);
            return null;
        }
    }
    extractShopifyDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        }
        catch {
            return url;
        }
    }
    detectPages($, baseUrl) {
        const pages = [];
        // Homepage
        pages.push({
            path: '/',
            title: $('title').text() || 'Home',
            type: 'home',
            sections: this.detectSections($),
        });
        // Detect collections from nav
        $('a[href*="/collections/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !pages.find(p => p.path === href)) {
                pages.push({
                    path: href,
                    title: $(el).text().trim(),
                    type: 'collection',
                });
            }
        });
        // Detect product pages
        $('a[href*="/products/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !pages.find(p => p.path === href)) {
                pages.push({
                    path: href,
                    title: $(el).text().trim(),
                    type: 'product',
                });
            }
        });
        // Detect other pages
        $('a[href^="/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href &&
                !href.includes('/collections/') &&
                !href.includes('/products/') &&
                !href.includes('/cart') &&
                !href.includes('/search') &&
                href.length > 1 &&
                !pages.find(p => p.path === href)) {
                const type = this.inferPageType(href, $(el).text());
                pages.push({
                    path: href,
                    title: $(el).text().trim(),
                    type,
                });
            }
        });
        return pages;
    }
    inferPageType(path, title) {
        const lowerPath = path.toLowerCase();
        const lowerTitle = title.toLowerCase();
        if (lowerPath.includes('blog') || lowerPath.includes('news'))
            return 'blog';
        if (lowerPath.includes('cart'))
            return 'cart';
        if (lowerPath.includes('assessment') ||
            lowerPath.includes('quiz') ||
            lowerPath.includes('calculator') ||
            lowerPath.includes('finder'))
            return 'custom';
        return 'page';
    }
    detectSections($) {
        const sections = [];
        // Common Shopify section selectors
        const sectionSelectors = [
            '[data-section-type]',
            '.shopify-section',
            'section[id]',
            '.section',
        ];
        sectionSelectors.forEach(selector => {
            $(selector).each((_, el) => {
                const sectionType = $(el).attr('data-section-type') ||
                    $(el).attr('id') ||
                    $(el).attr('class')?.split(' ')[0];
                if (sectionType && !sections.includes(sectionType)) {
                    sections.push(sectionType);
                }
            });
        });
        return sections;
    }
    detectNavigation($) {
        const nav = [];
        // Header nav
        $('nav a, header a, .header a').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && text && text.length < 50) {
                nav.push({
                    title: text,
                    url: href,
                    position: 'header',
                });
            }
        });
        // Footer nav
        $('footer a, .footer a').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && text && text.length < 50 && !nav.find(n => n.url === href)) {
                nav.push({
                    title: text,
                    url: href,
                    position: 'footer',
                });
            }
        });
        return nav;
    }
    detectDesignProfile($) {
        const profile = {
            style: 'modern',
        };
        // Extract colors from CSS
        const styles = $('style').text();
        const cssVars = styles.match(/--[\w-]+:\s*([^;]+)/g) || [];
        cssVars.forEach((cssVar) => {
            const match = cssVar.match(/--([\w-]+):\s*([^;]+)/);
            if (match) {
                const [, name, value] = match;
                if (name.includes('primary') || name.includes('brand')) {
                    profile.colors = { ...profile.colors, primary: value.trim() };
                }
                if (name.includes('background') || name.includes('bg')) {
                    profile.colors = { ...profile.colors, background: value.trim() };
                }
            }
        });
        // Detect fonts
        const fontFamily = $('body').css('font-family') ||
            styles.match(/font-family:\s*([^;]+)/)?.[1];
        if (fontFamily) {
            profile.typography = { bodyFont: fontFamily };
        }
        // Infer style
        if ($('.minimal, .simple').length > 3)
            profile.style = 'minimal';
        if ($('.playful, .fun').length > 3)
            profile.style = 'playful';
        if ($('.elegant, .luxury').length > 3)
            profile.style = 'elegant';
        return profile;
    }
    detectApps($) {
        const apps = [];
        const html = $.html();
        // Common Shopify app indicators
        if (html.includes('klaviyo'))
            apps.push('Klaviyo');
        if (html.includes('yotpo'))
            apps.push('Yotpo');
        if (html.includes('judge.me'))
            apps.push('Judge.me');
        if (html.includes('loox'))
            apps.push('Loox');
        if (html.includes('recharge'))
            apps.push('ReCharge');
        if (html.includes('bold'))
            apps.push('Bold Apps');
        if (html.includes('smile'))
            apps.push('Smile.io');
        if (html.includes('privy'))
            apps.push('Privy');
        if (html.includes('omnisend'))
            apps.push('Omnisend');
        return apps;
    }
    async scanPage(fullUrl, path) {
        try {
            const response = await axios_1.default.get(fullUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; ShoppDroppBot/1.0)',
                },
                timeout: 10000,
            });
            const $ = cheerio.load(response.data);
            return {
                contentLength: $.text().length,
                hasForm: $('form').length > 0,
                hasQuiz: $('form').length > 0 && ($.text().toLowerCase().includes('quiz') || $.text().toLowerCase().includes('question')),
                hasVideo: $('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length > 0,
                sections: this.detectSections($),
            };
        }
        catch (e) {
            return null;
        }
    }
    // Generate configuration from scan
    generateConfigFromScan(scanResult) {
        const config = {
            designPreferences: {
                layout: 'grid',
                colorScheme: 'custom',
                customColors: scanResult.design.colors,
                typography: scanResult.design.typography?.bodyFont?.includes('serif') ? 'classic' : 'modern',
                style: scanResult.design.style,
                density: 'comfortable',
            },
            pageRequirements: {
                home: {
                    hero: {
                        enabled: scanResult.pages.find(p => p.path === '/')?.sections?.includes('hero') ?? true,
                        type: 'image',
                    },
                    featuredCollections: {
                        enabled: scanResult.collections.length > 0,
                        collections: scanResult.collections.slice(0, 4).map(c => c.handle),
                        layout: 'grid',
                    },
                    featuredProducts: {
                        enabled: true,
                        count: 8,
                        source: 'best_selling',
                    },
                    aboutSection: { enabled: false },
                    testimonials: { enabled: scanResult.apps.includes('Yotpo') || scanResult.apps.includes('Judge.me'), count: 3 },
                    blogSection: { enabled: scanResult.pages.some(p => p.type === 'blog'), count: 3 },
                    newsletter: { enabled: true, placement: 'footer' },
                },
                product: {
                    layout: 'standard',
                    imageGallery: 'thumbnails',
                    description: 'tabs',
                    elements: {
                        price: true,
                        variants: true,
                        quantity: true,
                        addToCart: true,
                        buyNow: true,
                        description: true,
                        specifications: true,
                        reviews: scanResult.apps.includes('Yotpo') || scanResult.apps.includes('Judge.me'),
                        relatedProducts: true,
                        recentlyViewed: true,
                        socialShare: true,
                        sizeGuide: false,
                        shippingInfo: true,
                    },
                    customSections: [],
                },
                collection: {
                    layout: 'grid',
                    columns: 4,
                    filters: {
                        enabled: true,
                        position: 'sidebar',
                        types: ['price', 'availability'],
                    },
                    sorting: true,
                    pagination: 'pages',
                    quickView: true,
                    descriptionPosition: 'top',
                    image: 'large',
                },
                customPages: scanResult.pages
                    .filter(p => p.type === 'custom' || p.type === 'page')
                    .map(p => ({
                    id: p.path.replace(/\//g, ''),
                    title: p.title,
                    handle: p.path.replace(/\//g, ''),
                    type: p.path.includes('assessment') ? 'assessment' :
                        p.path.includes('quiz') ? 'quiz' :
                            p.path.includes('contact') ? 'contact' : 'custom',
                    sections: [{
                            type: 'text',
                            layout: 'contained',
                            background: 'white',
                        }],
                    forms: p.hasForm ? [{
                            id: 'main',
                            title: 'Contact Form',
                            fields: [
                                { id: 'name', type: 'text', label: 'Name', required: true },
                                { id: 'email', type: 'email', label: 'Email', required: true },
                                { id: 'message', type: 'textarea', label: 'Message', required: true },
                            ],
                            submitAction: 'email',
                        }] : undefined,
                })),
            },
            features: {
                search: true,
                filters: true,
                quickView: true,
                wishlist: false,
                reviews: scanResult.apps.includes('Yotpo') || scanResult.apps.includes('Judge.me'),
                relatedProducts: true,
                recentlyViewed: true,
                sizeGuide: false,
                productQuiz: scanResult.pages.some(p => p.path.includes('quiz') || p.path.includes('assessment')),
                chat: scanResult.apps.includes('Tidio') || scanResult.apps.includes('Gorgias'),
            },
            integrations: {
                emailMarketing: scanResult.apps.includes('Klaviyo') ? 'klaviyo' : 'none',
                reviews: scanResult.apps.includes('Yotpo') ? 'yotpo' :
                    scanResult.apps.includes('Judge.me') ? 'judge.me' : 'none',
                analytics: 'google',
                loyalty: scanResult.apps.includes('Smile.io') ? 'smile' : 'none',
            },
        };
        return config;
    }
    generateRealisticMockData(url) {
        // Detect niche from URL
        const urlLower = url.toLowerCase();
        let niche = 'General';
        let productCount = 45;
        let collectionCount = 6;
        if (urlLower.includes('pet') || urlLower.includes('dog') || urlLower.includes('puppy') || urlLower.includes('bark')) {
            niche = 'Pet Supplies';
            productCount = 68;
            collectionCount = 8;
        }
        else if (urlLower.includes('fashion') || urlLower.includes('cloth') || urlLower.includes('wear')) {
            niche = 'Fashion';
            productCount = 120;
            collectionCount = 12;
        }
        else if (urlLower.includes('beauty') || urlLower.includes('skin') || urlLower.includes('cosmetic')) {
            niche = 'Beauty';
            productCount = 85;
            collectionCount = 10;
        }
        else if (urlLower.includes('home') || urlLower.includes('decor') || urlLower.includes('furniture')) {
            niche = 'Home & Garden';
            productCount = 95;
            collectionCount = 9;
        }
        else if (urlLower.includes('tech') || urlLower.includes('electronic') || urlLower.includes('gadget')) {
            niche = 'Electronics';
            productCount = 55;
            collectionCount = 7;
        }
        else if (urlLower.includes('food') || urlLower.includes('snack') || urlLower.includes('gourmet')) {
            niche = 'Food & Gourmet';
            productCount = 42;
            collectionCount = 5;
        }
        else if (urlLower.includes('fitness') || urlLower.includes('gym') || urlLower.includes('sport')) {
            niche = 'Fitness';
            productCount = 75;
            collectionCount = 8;
        }
        // Generate consistent but realistic data
        const domain = new URL(url).hostname.replace('www.', '');
        return {
            url,
            shopifyDomain: domain,
            theme: {
                name: 'Custom Theme',
                features: ['Responsive', 'Quick View', 'Mega Menu']
            },
            pages: [
                { path: '/', title: 'Home', type: 'home', sections: ['hero', 'collections', 'featured'] },
                { path: '/collections/all', title: 'All Products', type: 'collection' },
                { path: '/pages/about', title: 'About Us', type: 'page' },
                { path: '/pages/contact', title: 'Contact', type: 'page' },
                { path: '/blogs/news', title: 'Blog', type: 'blog' },
                { path: '/cart', title: 'Cart', type: 'cart' },
                { path: '/pages/faq', title: 'FAQ', type: 'custom' },
                { path: '/pages/shipping', title: 'Shipping', type: 'custom' },
            ],
            collections: Array(collectionCount).fill(0).map((_, i) => ({
                handle: `collection-${i + 1}`,
                title: `${niche} Collection ${i + 1}`,
                productCount: Math.floor(productCount / collectionCount) + Math.floor(Math.random() * 10),
            })),
            navigation: [
                { title: 'Shop', url: '/collections/all', position: 'header' },
                { title: 'About', url: '/pages/about', position: 'header' },
                { title: 'Blog', url: '/blogs/news', position: 'header' },
                { title: 'Contact', url: '/pages/contact', position: 'header' },
                { title: 'FAQ', url: '/pages/faq', position: 'footer' },
                { title: 'Shipping', url: '/pages/shipping', position: 'footer' },
                { title: 'Returns', url: '/pages/returns', position: 'footer' },
                { title: 'Privacy', url: '/pages/privacy', position: 'footer' },
            ],
            products: Array(Math.min(productCount, 20)).fill(0).map((_, i) => ({
                handle: `product-${i + 1}`,
                title: `${niche} Product ${i + 1}`,
                price: `$${(15 + Math.random() * 85).toFixed(2)}`,
                images: [],
            })),
            design: {
                style: 'modern',
                colors: {
                    primary: '#8B5CF6',
                    secondary: '#EC4899',
                    background: '#FFFFFF',
                    text: '#1F2937',
                    accent: '#F59E0B',
                },
                typography: {
                    headingFont: 'Inter',
                    bodyFont: 'Inter',
                },
                layout: {
                    maxWidth: '1280px',
                    gridColumns: 4,
                    spacing: 'comfortable',
                },
            },
            customPages: ['/pages/faq', '/pages/shipping', '/pages/returns'],
            apps: ['Klaviyo', 'Yotpo', 'Google Analytics'],
            seo: {
                title: `${domain} - ${niche} Store`,
                description: `Shop the best ${niche.toLowerCase()} products at ${domain}`,
                hasStructuredData: true,
                hasOpenGraph: true,
                hasTwitterCard: true,
                headings: { h1: 1, h2: 8, h3: 15 },
            },
        };
    }
}
exports.StoreScanner = StoreScanner;
exports.storeScanner = new StoreScanner();
//# sourceMappingURL=storeScanner.js.map