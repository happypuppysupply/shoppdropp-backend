"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShopScorer = exports.ShopScorer = void 0;
class ShopScorer {
    calculateScore(scanResult, plan) {
        const metrics = this.extractMetrics(scanResult, plan);
        const design = this.scoreDesign(scanResult, plan);
        const products = this.scoreProducts(scanResult, plan, metrics);
        const seo = this.scoreSEO(scanResult, plan);
        const performance = this.scorePerformance(scanResult, metrics);
        const conversion = this.scoreConversion(scanResult, metrics);
        const social = this.scoreSocial(scanResult, plan, metrics);
        const overall = Math.round((design.score + products.score + seo.score + performance.score + conversion.score + social.score) / 6);
        return {
            overall,
            grade: this.getGrade(overall),
            breakdown: { design, products, seo, performance, conversion, social },
            metrics,
            benchmarks: this.calculateBenchmarks(overall, scanResult),
            recommendations: this.generateRecommendations(design, products, seo, performance, conversion, social),
            competitiveAnalysis: {
                yourScore: overall,
                competitorAvg: Math.max(overall - 15, 45),
                ranking: overall > 75 ? 1 : overall > 60 ? 2 : 3,
                advantages: plan.analysis.competitiveAdvantages.slice(0, 3),
                gaps: plan.analysis.improvementOpportunities.slice(0, 3),
            },
        };
    }
    extractMetrics(scanResult, plan) {
        const productPages = scanResult.pages.filter(p => p.type === 'product');
        const prices = plan.productStrategy.winningProducts.map(p => p.targetPrice);
        return {
            totalProducts: productPages.length || plan.productStrategy.winningProducts.length * 2,
            totalCollections: scanResult.collections.length,
            totalPages: scanResult.pages.length,
            customPages: scanResult.pages.filter(p => p.type === 'custom').length,
            appsInstalled: scanResult.apps.length,
            avgProductPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
            priceRange: {
                min: prices.length ? Math.min(...prices) : 0,
                max: prices.length ? Math.max(...prices) : 0
            },
            hasBlog: scanResult.pages.some(p => p.path.includes('blog')),
            hasReviews: scanResult.apps.some(a => a.toLowerCase().includes('review') || a.toLowerCase().includes('yotpo')),
            hasEmailCapture: scanResult.apps.some(a => a.toLowerCase().includes('klaviyo') || a.toLowerCase().includes('email')),
            hasSocialProof: scanResult.pages.some(p => p.hasTestimonials),
            loadTimeEstimate: this.estimateLoadTime(scanResult),
            mobileOptimized: scanResult.design.style !== 'outdated',
            hasSSL: scanResult.url.startsWith('https'),
            pageDepth: Math.max(...scanResult.pages.map(p => p.path.split('/').length)),
            navigationItems: scanResult.navigation.length,
        };
    }
    scoreDesign(scanResult, plan) {
        let score = 70;
        const issues = [];
        const improvements = [];
        // Modern design check
        if (plan.designRecommendations.style === 'modern')
            score += 10;
        else if (plan.designRecommendations.style === 'outdated') {
            score -= 15;
            issues.push('Design appears outdated');
            improvements.push('Update to modern minimalist design');
        }
        // Color scheme
        if (plan.designRecommendations.colorPalette)
            score += 5;
        // Custom pages
        if (scanResult.pages.filter(p => p.type === 'custom').length > 0) {
            score += 10;
        }
        else {
            issues.push('No custom landing pages');
            improvements.push('Add custom pages for campaigns');
        }
        // Navigation
        if (scanResult.navigation.length >= 4 && scanResult.navigation.length <= 7) {
            score += 5;
        }
        else if (scanResult.navigation.length > 7) {
            issues.push('Navigation is cluttered');
            improvements.push('Simplify navigation to 5-7 items');
        }
        score = Math.min(100, Math.max(0, score));
        return {
            score,
            maxScore: 100,
            grade: this.getGrade(score),
            label: 'Design & UX',
            details: [
                `Style: ${plan.designRecommendations.style}`,
                `Custom pages: ${scanResult.pages.filter(p => p.type === 'custom').length}`,
                `Navigation items: ${scanResult.navigation.length}`,
            ],
            issues,
            improvements,
        };
    }
    scoreProducts(scanResult, plan, metrics) {
        let score = 60;
        const issues = [];
        const improvements = [];
        const productCount = metrics.totalProducts;
        if (productCount >= 50)
            score += 20;
        else if (productCount >= 20)
            score += 15;
        else if (productCount >= 10)
            score += 10;
        else {
            score -= 10;
            issues.push('Limited product catalog');
            improvements.push('Expand to at least 20 products');
        }
        // Collection organization
        if (metrics.totalCollections >= 5)
            score += 10;
        else if (metrics.totalCollections >= 3)
            score += 5;
        else {
            issues.push('Few product collections');
            improvements.push('Create 5+ collections for better organization');
        }
        // Price range
        if (metrics.priceRange.max > metrics.priceRange.min * 3)
            score += 5;
        // Winning products identified
        if (plan.productStrategy.winningProducts.length >= 5)
            score += 10;
        score = Math.min(100, Math.max(0, score));
        return {
            score,
            maxScore: 100,
            grade: this.getGrade(score),
            label: 'Product Catalog',
            details: [
                `Total products: ~${productCount}`,
                `Collections: ${metrics.totalCollections}`,
                `Winning products identified: ${plan.productStrategy.winningProducts.length}`,
                `Price range: $${metrics.priceRange.min} - $${metrics.priceRange.max}`,
            ],
            issues,
            improvements,
        };
    }
    scoreSEO(scanResult, plan) {
        let score = 50;
        const issues = [];
        const improvements = [];
        // Meta descriptions
        const pagesWithMeta = scanResult.pages.filter(p => p.metaDescription).length;
        if (pagesWithMeta / scanResult.pages.length > 0.8)
            score += 15;
        else {
            issues.push('Many pages missing meta descriptions');
            improvements.push('Add meta descriptions to all pages');
        }
        // Blog content
        if (scanResult.pages.some(p => p.path.includes('blog'))) {
            score += 15;
        }
        else {
            issues.push('No blog content');
            improvements.push('Start a blog for SEO traffic');
        }
        // Content gaps
        if (plan.analysis.contentGaps.length < 3)
            score += 10;
        else {
            issues.push('Multiple content gaps identified');
            improvements.push('Create content for: ' + plan.analysis.contentGaps.slice(0, 2).join(', '));
        }
        // SSL
        if (scanResult.url.startsWith('https'))
            score += 10;
        score = Math.min(100, Math.max(0, score));
        return {
            score,
            maxScore: 100,
            grade: this.getGrade(score),
            label: 'SEO & Content',
            details: [
                `Pages with meta: ${pagesWithMeta}/${scanResult.pages.length}`,
                `Has blog: ${scanResult.pages.some(p => p.path.includes('blog')) ? 'Yes' : 'No'}`,
                `Content gaps: ${plan.analysis.contentGaps.length}`,
                `SSL enabled: ${scanResult.url.startsWith('https') ? 'Yes' : 'No'}`,
            ],
            issues,
            improvements,
        };
    }
    scorePerformance(scanResult, metrics) {
        let score = 65;
        const issues = [];
        const improvements = [];
        // Apps impact
        if (metrics.appsInstalled > 10) {
            score -= 10;
            issues.push('Many apps may slow load time');
            improvements.push('Audit and remove unused apps');
        }
        else if (metrics.appsInstalled <= 5) {
            score += 10;
        }
        // Page depth
        if (metrics.pageDepth <= 3)
            score += 10;
        else {
            issues.push('Deep page structure');
            improvements.push('Flatten site architecture');
        }
        // Mobile
        if (metrics.mobileOptimized)
            score += 15;
        else {
            issues.push('Mobile optimization needed');
            improvements.push('Implement responsive design');
        }
        score = Math.min(100, Math.max(0, score));
        return {
            score,
            maxScore: 100,
            grade: this.getGrade(score),
            label: 'Performance',
            details: [
                `Apps installed: ${metrics.appsInstalled}`,
                `Page depth: ${metrics.pageDepth} levels`,
                `Mobile optimized: ${metrics.mobileOptimized ? 'Yes' : 'No'}`,
                `Load estimate: ${metrics.loadTimeEstimate}`,
            ],
            issues,
            improvements,
        };
    }
    scoreConversion(scanResult, metrics) {
        let score = 55;
        const issues = [];
        const improvements = [];
        // Email capture
        if (metrics.hasEmailCapture)
            score += 15;
        else {
            issues.push('No email capture system');
            improvements.push('Add Klaviyo popup for email collection');
        }
        // Reviews
        if (metrics.hasReviews)
            score += 15;
        else {
            issues.push('No review system');
            improvements.push('Install Judge.me or Loox for reviews');
        }
        // Social proof
        if (metrics.hasSocialProof)
            score += 10;
        else {
            issues.push('Limited social proof');
            improvements.push('Add testimonials section');
        }
        // Custom pages for conversion
        if (metrics.customPages > 0)
            score += 10;
        score = Math.min(100, Math.max(0, score));
        return {
            score,
            maxScore: 100,
            grade: this.getGrade(score),
            label: 'Conversion',
            details: [
                `Email capture: ${metrics.hasEmailCapture ? 'Yes' : 'No'}`,
                `Review system: ${metrics.hasReviews ? 'Yes' : 'No'}`,
                `Social proof: ${metrics.hasSocialProof ? 'Yes' : 'No'}`,
                `Landing pages: ${metrics.customPages}`,
            ],
            issues,
            improvements,
        };
    }
    scoreSocial(scanResult, plan, metrics) {
        let score = 50;
        const issues = [];
        const improvements = [];
        // Social links in navigation
        const hasSocial = scanResult.navigation.some(n => n.url.includes('instagram') || n.url.includes('facebook') || n.url.includes('tiktok'));
        if (hasSocial)
            score += 15;
        else {
            issues.push('Social links not prominent');
            improvements.push('Add social media links to footer');
        }
        // Share functionality
        if (scanResult.apps.some(a => a.toLowerCase().includes('share')))
            score += 10;
        // UGC potential
        if (plan.marketingPlan.viralHooks.length > 0)
            score += 15;
        score = Math.min(100, Math.max(0, score));
        return {
            score,
            maxScore: 100,
            grade: this.getGrade(score),
            label: 'Social & Sharing',
            details: [
                `Social presence: ${hasSocial ? 'Yes' : 'Limited'}`,
                `Viral hooks identified: ${plan.marketingPlan.viralHooks.length}`,
                `UGC potential: ${plan.marketingPlan.viralHooks.length > 2 ? 'High' : 'Medium'}`,
            ],
            issues,
            improvements,
        };
    }
    getGrade(score) {
        if (score >= 90)
            return 'A+';
        if (score >= 85)
            return 'A';
        if (score >= 80)
            return 'A-';
        if (score >= 75)
            return 'B+';
        if (score >= 70)
            return 'B';
        if (score >= 65)
            return 'B-';
        if (score >= 60)
            return 'C+';
        if (score >= 55)
            return 'C';
        if (score >= 50)
            return 'C-';
        return 'D';
    }
    estimateLoadTime(scanResult) {
        const baseTime = 2;
        const appPenalty = scanResult.apps.length * 0.3;
        return `${(baseTime + appPenalty).toFixed(1)}s estimated`;
    }
    calculateBenchmarks(score, scanResult) {
        return {
            industryAverage: 62,
            topPerformer: 92,
            percentile: score > 80 ? 85 : score > 65 ? 60 : 35,
            vsCompetitors: score > 75 ? 'Above average' : score > 60 ? 'Average' : 'Below average',
        };
    }
    generateRecommendations(design, products, seo, performance, conversion, social) {
        const all = [
            ...this.categoryToRecommendations(design, 'Design'),
            ...this.categoryToRecommendations(products, 'Products'),
            ...this.categoryToRecommendations(seo, 'SEO'),
            ...this.categoryToRecommendations(performance, 'Performance'),
            ...this.categoryToRecommendations(conversion, 'Conversion'),
            ...this.categoryToRecommendations(social, 'Social'),
        ];
        return all.sort((a, b) => {
            const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }).slice(0, 10);
    }
    categoryToRecommendations(cat, category) {
        return cat.improvements.map((imp, i) => ({
            priority: cat.score < 50 ? 'critical' : cat.score < 70 ? 'high' : 'medium',
            category,
            title: imp,
            description: cat.issues[i] || 'Improvement opportunity',
            impact: 'Medium to high impact on store performance',
            effort: i < 2 ? 'quick' : 'medium',
            potentialLift: '+5-15%',
        }));
    }
}
exports.ShopScorer = ShopScorer;
const createShopScorer = () => new ShopScorer();
exports.createShopScorer = createShopScorer;
//# sourceMappingURL=shopScorer.js.map