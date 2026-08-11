"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productResearchService = exports.ProductResearchService = void 0;
const openwebninjaService_1 = require("./openwebninjaService");
const supabase_1 = require("../db/supabase");
class ProductResearchService {
    async startResearch(config) {
        const researchId = `res_${Date.now()}`;
        // Create initial record
        const result = {
            id: researchId,
            store_id: config.store_id,
            user_id: config.user_id,
            query: config.category || 'trending products',
            products_found: 0,
            products_imported: 0,
            top_products: [],
            analysis: {
                trending_categories: [],
                price_range: { min: 0, max: 0, avg: 0 },
                avg_rating: 0,
                recommendations: [],
            },
            created_at: new Date().toISOString(),
            status: 'running',
        };
        // Save to database
        await this.saveResearchResult(result);
        // Start research in background
        this.performResearch(researchId, config).catch(err => {
            console.error(`Research ${researchId} failed:`, err);
            this.updateResearchStatus(researchId, 'failed');
        });
        return result;
    }
    async performResearch(researchId, config) {
        try {
            console.log(`🔍 Starting product research for store ${config.store_id}`);
            // 1. Search multiple sources
            const searchParams = {
                query: config.category || 'trending products 2025',
                category: config.category,
                min_price: config.min_price,
                max_price: config.max_price,
                sort_by: 'sales',
                limit: 20,
            };
            const products = await openwebninjaService_1.openWebNinjaService.multiSourceSearch(searchParams);
            console.log(`Found ${products.length} products`);
            // 2. Analyze each product
            const analyzedProducts = [];
            for (const product of products.slice(0, 10)) {
                try {
                    const profitability = await openwebninjaService_1.openWebNinjaService.analyzeProductProfitability(product);
                    analyzedProducts.push({
                        ...product,
                        profitability,
                    });
                }
                catch (err) {
                    console.warn(`Failed to analyze product ${product.id}:`, err);
                }
            }
            // 3. Calculate statistics
            const prices = products.map(p => p.price).filter(p => p > 0);
            const ratings = products.map(p => p.rating || 0).filter(r => r > 0);
            const analysis = {
                trending_categories: this.extractCategories(products),
                price_range: {
                    min: prices.length > 0 ? Math.min(...prices) : 0,
                    max: prices.length > 0 ? Math.max(...prices) : 0,
                    avg: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
                },
                avg_rating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
                recommendations: this.generateRecommendations(analyzedProducts),
            };
            // 4. Update result
            const result = {
                products_found: products.length,
                top_products: analyzedProducts.slice(0, 5),
                analysis,
                status: 'completed',
            };
            await this.updateResearchResult(researchId, result);
            console.log(`✅ Research ${researchId} completed`);
        }
        catch (error) {
            console.error(`Research ${researchId} error:`, error);
            await this.updateResearchStatus(researchId, 'failed');
            throw error;
        }
    }
    extractCategories(products) {
        const categories = new Map();
        // Extract categories from titles and descriptions
        products.forEach(p => {
            const text = `${p.title} ${p.description || ''}`.toLowerCase();
            // Common category keywords
            const categoryKeywords = [
                'electronics', 'phone', 'laptop', 'tablet', 'watch', 'headphone',
                'fashion', 'shoes', 'clothing', 'dress', 'shirt', 'jeans',
                'home', 'kitchen', 'furniture', 'decor', 'garden',
                'beauty', 'skincare', 'makeup', 'hair',
                'toys', 'games', 'baby', 'kids',
                'sports', 'fitness', 'outdoor', 'camping',
                'pet', 'dog', 'cat', 'supplies',
            ];
            categoryKeywords.forEach(keyword => {
                if (text.includes(keyword)) {
                    categories.set(keyword, (categories.get(keyword) || 0) + 1);
                }
            });
        });
        // Return top categories
        return Array.from(categories.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cat]) => cat);
    }
    generateRecommendations(products) {
        const recommendations = [];
        const highProfitProducts = products.filter(p => p.profitability?.profitability === 'high');
        if (highProfitProducts.length > 0) {
            recommendations.push(`${highProfitProducts.length} high-profitability products identified for immediate import`);
        }
        const avgPrice = products.reduce((sum, p) => sum + (p.price || 0), 0) / products.length;
        if (avgPrice < 50) {
            recommendations.push('Low average price point - good for impulse purchases and high volume');
        }
        else if (avgPrice > 100) {
            recommendations.push('Higher price point - focus on quality marketing and customer trust');
        }
        const avgRating = products.reduce((sum, p) => sum + (p.rating || 0), 0) / products.length;
        if (avgRating > 4.5) {
            recommendations.push('Excellent product quality ratings - leverage in marketing materials');
        }
        const sources = new Set(products.map(p => p.source));
        if (sources.size > 1) {
            recommendations.push(`Multi-source availability (${Array.from(sources).join(', ')}) - good for price comparison and backup suppliers`);
        }
        return recommendations;
    }
    async saveResearchResult(result) {
        try {
            await supabase_1.supabase.from('product_research_results').insert(result);
        }
        catch (err) {
            console.error('Failed to save research result:', err);
        }
    }
    async updateResearchResult(researchId, update) {
        try {
            await supabase_1.supabase
                .from('product_research_results')
                .update(update)
                .eq('id', researchId);
        }
        catch (err) {
            console.error('Failed to update research result:', err);
        }
    }
    async updateResearchStatus(researchId, status) {
        await this.updateResearchResult(researchId, { status: status });
    }
    async getResearchHistory(storeId, limit = 10) {
        try {
            const { data, error } = await supabase_1.supabase
                .from('product_research_results')
                .select('*')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error)
                throw error;
            return data || [];
        }
        catch (err) {
            console.error('Failed to get research history:', err);
            return [];
        }
    }
}
exports.ProductResearchService = ProductResearchService;
exports.productResearchService = new ProductResearchService();
//# sourceMappingURL=productResearchService.js.map