"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeDeveloper = exports.StoreDeveloper = void 0;
const supabase_1 = require("../db/supabase");
const shopifyService_1 = require("./shopifyService");
const githubService_1 = require("./githubService");
const vercelService_1 = require("./vercelService");
const cjDropshippingService_1 = require("./cjDropshippingService");
const metaService_1 = require("./metaService");
const supabaseService_1 = require("./supabaseService");
const worker_orchestrator_1 = require("./worker-orchestrator");
const communication_service_1 = require("./communication-service");
class StoreDeveloper {
    tasks = new Map();
    config;
    // ============ MAIN DEVELOPMENT FLOW ============
    async developStore(config) {
        this.config = config;
        console.log(`[StoreDeveloper] Starting full development for: ${config.storeName}`);
        try {
            // Phase 1: Infrastructure Setup
            await this.runTask('infrastructure', 'Setting up infrastructure', async () => {
                await this.setupInfrastructure(config);
            });
            // Phase 2: Database Setup
            await this.runTask('database', 'Configuring database', async () => {
                await this.setupDatabase(config);
            });
            // Phase 3: Shopify Connection
            await this.runTask('shopify', 'Connecting Shopify store', async () => {
                await this.connectShopify(config);
            });
            // Phase 4: Product Research & Import
            await this.runTask('products', 'Researching and importing products', async () => {
                await this.researchAndImportProducts(config);
            });
            // Phase 5: Theme Development
            await this.runTask('theme', 'Building custom theme', async () => {
                await this.buildTheme(config);
            });
            // Phase 6: Landing Pages
            await this.runTask('landing', 'Creating landing pages', async () => {
                await this.createLandingPages(config);
            });
            // Phase 7: Meta Ads Setup
            if (config.metaAccessToken && config.metaAdAccountId) {
                await this.runTask('meta', 'Setting up Meta advertising', async () => {
                    await this.setupMetaAds(config);
                });
            }
            // Phase 8: Communication Setup
            await this.runTask('communication', 'Configuring communication channels', async () => {
                await this.setupCommunication(config);
            });
            // Phase 9: Deploy Workers (AI agents)
            await this.runTask('workers', 'Deploying AI workers', async () => {
                await this.deployWorkers(config);
            });
            // Phase 10: Launch
            await this.runTask('launch', 'Launching store', async () => {
                await this.launchStore(config);
            });
            console.log(`[StoreDeveloper] ✅ Full development complete for: ${config.storeName}`);
            // Send success notification
            await communication_service_1.communicationService.sendUpdate(config.storeId, {
                workerType: 'Store Developer',
                storeName: config.storeName,
                status: 'completed',
                content: `🎉 Your store "${config.storeName}" is fully developed and live!\n\nAll systems are operational:\n✅ Shopify connected\n✅ Products imported\n✅ Theme deployed\n✅ Landing pages live\n✅ AI workers running\n✅ Communication channels ready`,
                timestamp: new Date(),
            });
        }
        catch (error) {
            console.error(`[StoreDeveloper] Development failed:`, error);
            await communication_service_1.communicationService.sendUpdate(config.storeId, {
                workerType: 'Store Developer',
                storeName: config.storeName,
                status: 'error',
                content: `❌ Development failed: ${error.message}\n\nPlease check the logs and try again.`,
                timestamp: new Date(),
            });
            throw error;
        }
    }
    // ============ PHASE IMPLEMENTATIONS ============
    async setupInfrastructure(config) {
        console.log('[StoreDeveloper] Phase 1: Infrastructure');
        // 1. Setup Supabase storage buckets
        const supabase = (0, supabaseService_1.createSupabaseService)({
            url: config.supabaseUrl,
            serviceKey: config.supabaseKey,
        });
        // Create buckets for store assets
        try {
            await supabase.createBucket(`store-${config.storeId}-products`, { public: true });
            await supabase.createBucket(`store-${config.storeId}-assets`, { public: true });
        }
        catch (e) {
            console.log('[StoreDeveloper] Buckets may already exist');
        }
        // 2. Create GitHub repository for theme
        const github = (0, githubService_1.createGitHubService)({ token: config.githubToken });
        const repoName = `shopify-theme-${config.storeName.toLowerCase().replace(/\s+/g, '-')}`;
        try {
            await github.createRepository({
                name: repoName,
                description: `Shopify theme and assets for ${config.storeName}`,
                private: true,
                auto_init: true,
            });
            console.log(`[StoreDeveloper] Created GitHub repo: ${repoName}`);
        }
        catch (e) {
            if (e.response?.status === 422) {
                console.log('[StoreDeveloper] GitHub repo already exists');
            }
            else {
                throw e;
            }
        }
        // 3. Create Vercel project for landing page
        const vercel = (0, vercelService_1.createVercelService)({ token: config.vercelToken });
        const projectName = `${config.storeName.toLowerCase().replace(/\s+/g, '-')}-landing`;
        try {
            await vercel.createProject({
                name: projectName,
                framework: 'nextjs',
            });
            console.log(`[StoreDeveloper] Created Vercel project: ${projectName}`);
        }
        catch (e) {
            console.log('[StoreDeveloper] Vercel project may already exist');
        }
        console.log('[StoreDeveloper] ✅ Infrastructure complete');
    }
    async setupDatabase(config) {
        console.log('[StoreDeveloper] Phase 2: Database');
        const supabase = (0, supabaseService_1.createSupabaseService)({
            url: config.supabaseUrl,
            serviceKey: config.supabaseKey,
        });
        // Setup store-specific database tables
        await supabase.setupStoreDatabase(config.storeId, config.storeName);
        console.log('[StoreDeveloper] ✅ Database configured');
    }
    async connectShopify(config) {
        console.log('[StoreDeveloper] Phase 3: Shopify');
        const shopify = (0, shopifyService_1.createShopifyService)({
            shopDomain: config.shopifyDomain,
            accessToken: config.shopifyToken,
        });
        // Verify connection
        const shopInfo = await shopify.getShopInfo();
        console.log(`[StoreDeveloper] Connected to: ${shopInfo.name}`);
        // Save credentials
        await supabase_1.db.saveIntegrationCredential(config.storeId, 'shopify', {
            shopDomain: config.shopifyDomain,
            accessToken: config.shopifyToken,
            shopInfo: {
                name: shopInfo.name,
                email: shopInfo.email,
                currency: shopInfo.currency,
                timezone: shopInfo.iana_timezone,
            },
        });
        // Setup webhooks for order notifications
        await shopify.createWebhook('orders/create', `https://api.shoppdropp.com/webhooks/shopify/orders/${config.storeId}`);
        await shopify.createWebhook('orders/updated', `https://api.shoppdropp.com/webhooks/shopify/orders/${config.storeId}`);
        console.log('[StoreDeveloper] ✅ Shopify connected');
    }
    async researchAndImportProducts(config) {
        console.log('[StoreDeveloper] Phase 4: Product Research');
        // 1. Find winning products from CJ
        const cj = (0, cjDropshippingService_1.createCJDropshippingService)({ apiKey: config.cjApiKey });
        const products = await cj.findWinningProducts({
            minListedNum: 100,
        });
        console.log(`[StoreDeveloper] Found ${products.length} potential products`);
        // 2. Connect to Shopify
        const shopify = (0, shopifyService_1.createShopifyService)({
            shopDomain: config.shopifyDomain,
            accessToken: config.shopifyToken,
        });
        // 3. Import top products
        const productsToImport = products.slice(0, 20); // Start with 20 products
        const importedProducts = [];
        for (const product of productsToImport) {
            try {
                // Get product details
                const details = await cj.getProductDetails(product.pid);
                const variants = await cj.getProductVariants(product.pid);
                // Create Shopify product
                const shopifyProduct = await shopify.createProduct({
                    title: product.name,
                    body_html: product.description || product.name,
                    vendor: product.sourceFrom || 'ShoppDropp',
                    product_type: product.categoryName || 'General',
                    tags: [product.categoryName || ''].filter(Boolean),
                    variants: variants.map((v) => ({
                        title: v.variantName,
                        price: (v.variantPrice * 1.5).toFixed(2), // 50% markup
                        sku: v.variantSku,
                        inventory_quantity: 100,
                        inventory_policy: 'continue',
                    })),
                    images: product.images?.map((img) => ({ src: img })) || [{ src: product.imageUrl }],
                    status: 'active',
                });
                importedProducts.push({
                    shopifyId: shopifyProduct.id,
                    cjId: product.pid,
                    name: product.name,
                });
                console.log(`[StoreDeveloper] Imported: ${product.name}`);
            }
            catch (e) {
                console.error(`[StoreDeveloper] Failed to import ${product.name}:`, e.message);
            }
        }
        // Save product mapping to database
        const supabase = (0, supabaseService_1.createSupabaseService)({
            url: config.supabaseUrl,
            serviceKey: config.supabaseKey,
        });
        await supabase.importTable(`store_${config.storeId}_products`, importedProducts.map(p => ({
            shopify_product_id: p.shopifyId,
            title: p.name,
            cj_product_id: p.cjId,
            status: 'active',
        })));
        console.log(`[StoreDeveloper] ✅ Imported ${importedProducts.length} products`);
    }
    async buildTheme(config) {
        console.log('[StoreDeveloper] Phase 5: Theme Development');
        const github = (0, githubService_1.createGitHubService)({ token: config.githubToken });
        const repoName = `shopify-theme-${config.storeName.toLowerCase().replace(/\s+/g, '-')}`;
        const user = await github.getAuthenticatedUser();
        // Create theme files
        const themeFiles = {
            'layout/theme.liquid': this.generateThemeLayout(config.storeName),
            'templates/index.liquid': this.generateHomePage(config.storeName),
            'templates/product.liquid': this.generateProductPage(),
            'templates/collection.liquid': this.generateCollectionPage(),
            'templates/cart.liquid': this.generateCartPage(),
            'assets/theme.css': this.generateThemeCSS(),
            'assets/theme.js': this.generateThemeJS(),
            'config/settings_schema.json': this.generateSettingsSchema(),
            'sections/header.liquid': this.generateHeader(config.storeName),
            'sections/footer.liquid': this.generateFooter(config.storeName),
            'sections/hero.liquid': this.generateHeroSection(),
            'sections/product-grid.liquid': this.generateProductGrid(),
        };
        // Upload files to GitHub
        for (const [path, content] of Object.entries(themeFiles)) {
            await github.createOrUpdateFile(user.login, repoName, path, content, `Add ${path}`, 'main');
        }
        console.log('[StoreDeveloper] ✅ Theme built and pushed to GitHub');
        // Also deploy to Shopify
        await this.deployThemeToShopify(config, themeFiles);
    }
    async deployThemeToShopify(config, themeFiles) {
        console.log('[StoreDeveloper] Deploying theme to Shopify...');
        const shopify = (0, shopifyService_1.createShopifyService)({
            shopDomain: config.shopifyDomain,
            accessToken: config.shopifyToken,
        });
        try {
            // Get existing themes
            const themes = await shopify.getThemes();
            // Find or create ShoppDropp theme
            let theme = themes.find((t) => t.name.includes('ShoppDropp'));
            if (!theme) {
                // Create new theme
                // Note: Shopify API doesn't allow creating themes directly via Admin API
                // You'd need to use Theme API or Shopify CLI
                // For now, we'll update the main theme
                theme = themes.find((t) => t.role === 'main') || themes[0];
                console.log(`[StoreDeveloper] Using existing theme: ${theme.name}`);
            }
            // Update theme assets
            for (const [path, content] of Object.entries(themeFiles)) {
                try {
                    await shopify.updateThemeAsset(theme.id, path, content);
                    console.log(`[StoreDeveloper] Updated: ${path}`);
                }
                catch (e) {
                    console.error(`[StoreDeveloper] Failed to update ${path}:`, e.message);
                }
            }
            console.log('[StoreDeveloper] ✅ Theme deployed to Shopify');
        }
        catch (e) {
            console.error('[StoreDeveloper] Theme deployment failed:', e.message);
            // Don't throw - GitHub backup exists
        }
    }
    async createLandingPages(config) {
        console.log('[StoreDeveloper] Phase 6: Landing Pages');
        const vercel = (0, vercelService_1.createVercelService)({ token: config.vercelToken });
        const github = (0, githubService_1.createGitHubService)({ token: config.githubToken });
        const user = await github.getAuthenticatedUser();
        const projectName = `${config.storeName.toLowerCase().replace(/\s+/g, '-')}-landing`;
        const repoName = `${projectName}-repo`;
        // 1. Create GitHub repo for landing page
        try {
            await github.createRepository({
                name: repoName,
                description: `Landing page for ${config.storeName}`,
                private: true,
                auto_init: true,
            });
            console.log(`[StoreDeveloper] Created GitHub repo: ${repoName}`);
        }
        catch (e) {
            if (e.response?.status === 422) {
                console.log('[StoreDeveloper] GitHub repo already exists');
            }
        }
        // 2. Create landing page files
        const landingFiles = {
            'package.json': JSON.stringify({
                name: projectName,
                version: '1.0.0',
                private: true,
                scripts: {
                    dev: 'next dev',
                    build: 'next build',
                    start: 'next start',
                },
                dependencies: {
                    next: '^14.0.0',
                    react: '^18.0.0',
                    'react-dom': '^18.0.0',
                },
            }, null, 2),
            'next.config.js': `module.exports = { output: 'export', distDir: 'dist' }`,
            'pages/index.js': this.generateLandingPage(config.storeName, config.shopifyDomain),
            'pages/_app.js': `export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}`,
            'public/styles.css': this.generateLandingCSS(),
        };
        // 3. Push files to GitHub
        for (const [path, content] of Object.entries(landingFiles)) {
            await github.createOrUpdateFile(user.login, repoName, path, content, `Add ${path}`, 'main');
        }
        console.log('[StoreDeveloper] Pushed landing page files to GitHub');
        // 4. Create Vercel project connected to GitHub
        let project = await vercel.getProjectByName(projectName);
        if (!project) {
            project = await vercel.createProject({
                name: projectName,
                framework: 'nextjs',
                gitRepository: {
                    type: 'github',
                    org: user.login,
                    repo: repoName,
                },
                buildCommand: 'npm run build',
                outputDirectory: 'dist',
                env: [
                    { key: 'NEXT_PUBLIC_SHOPIFY_DOMAIN', value: config.shopifyDomain, type: 'plain' },
                    { key: 'NEXT_PUBLIC_STORE_NAME', value: config.storeName, type: 'plain' },
                ],
            });
            console.log(`[StoreDeveloper] Created Vercel project: ${project.name}`);
        }
        // 5. Trigger deployment (Vercel auto-deploys on push, but we can also force it)
        console.log('[StoreDeveloper] ✅ Landing pages deployed to Vercel');
        console.log(`[StoreDeveloper] URL: https://${projectName}.vercel.app`);
    }
    async setupMetaAds(config) {
        console.log('[StoreDeveloper] Phase 7: Meta Ads');
        if (!config.metaAccessToken || !config.metaAdAccountId) {
            console.log('[StoreDeveloper] Meta ads not configured, skipping');
            return;
        }
        const meta = (0, metaService_1.createMetaService)({
            accessToken: config.metaAccessToken,
            adAccountId: config.metaAdAccountId,
        });
        // Create initial retargeting campaign
        const { campaign, adSet, ad } = await meta.createCampaignFromTemplate({
            name: `${config.storeName} - Retargeting`,
            objective: 'CONVERSIONS',
            budget: 20,
            targeting: {
                geo_locations: { countries: ['US'] },
                age_min: 25,
                age_max: 65,
            },
            creative: {
                name: 'Retargeting Ad',
                object_story_spec: {
                    page_id: 'PAGE_ID', // Would need actual page ID
                    link_data: {
                        link: `https://${config.shopifyDomain}`,
                        message: `Discover amazing products at ${config.storeName}!`,
                        name: config.storeName,
                        call_to_action: { type: 'SHOP_NOW' },
                    },
                },
            },
        });
        // Save campaign info
        await supabase_1.db.saveIntegrationCredential(config.storeId, 'meta', {
            campaigns: [
                {
                    id: campaign.id,
                    name: campaign.name,
                    adSetId: adSet.id,
                    adId: ad.id,
                },
            ],
        });
        console.log('[StoreDeveloper] ✅ Meta ads configured');
    }
    async setupCommunication(config) {
        console.log('[StoreDeveloper] Phase 8: Communication');
        // Setup default communication config (user will need to configure actual webhooks)
        await supabase_1.db.saveCommunicationConfig({
            userId: config.userId,
            storeId: config.storeId,
            channel: 'slack',
            webhookUrl: 'placeholder',
            enabled: false,
        });
        console.log('[StoreDeveloper] ✅ Communication channels ready (configure webhook to activate)');
    }
    async deployWorkers(config) {
        console.log('[StoreDeveloper] Phase 9: Deploying AI Workers');
        // Deploy workers via orchestrator
        await worker_orchestrator_1.workerOrchestrator.provisionStoreWorkers(config.storeId, config.userId);
        console.log('[StoreDeveloper] ✅ Workers deployed');
    }
    async launchStore(config) {
        console.log('[StoreDeveloper] Phase 10: Launch!');
        // Update store status
        await supabase_1.db.updateStore(config.storeId, {
            status: 'active',
            updated_at: new Date().toISOString(),
        });
        console.log('[StoreDeveloper] ✅ Store launched!');
    }
    // ============ HELPER METHODS ============
    async runTask(id, message, fn) {
        const task = {
            id,
            type: id,
            status: 'in_progress',
            progress: 0,
            message,
            startedAt: new Date(),
        };
        this.tasks.set(id, task);
        console.log(`[StoreDeveloper] 🔄 ${message}`);
        try {
            await fn();
            task.status = 'completed';
            task.progress = 100;
            task.completedAt = new Date();
            console.log(`[StoreDeveloper] ✅ ${message} - Complete`);
        }
        catch (error) {
            task.status = 'error';
            task.error = error.message;
            console.error(`[StoreDeveloper] ❌ ${message} - Failed:`, error.message);
            throw error;
        }
        this.tasks.set(id, task);
    }
    getTasks() {
        return Array.from(this.tasks.values());
    }
    // ============ THEME GENERATORS ============
    generateThemeLayout(storeName) {
        return `<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="">
  <link rel="canonical" href="{{ canonical_url }}">

  <title>{{ shop.name }} - {{ page_title }}</title>

  {{ content_for_header }}

  {{ 'theme.css' | asset_url | stylesheet_tag }}
</head>

<body>
  {% section 'header' %}

  <main role="main" tabindex="-1">
    {{ content_for_layout }}
  </main>

  {% section 'footer' %}

  {{ 'theme.js' | asset_url | script_tag }}
</body>
</html>`;
    }
    generateHomePage(storeName) {
        return `{% section 'hero' %}
{% section 'product-grid' %}

<div class="container">
  <div class="featured-collections">
    <h2>Shop Collections</h2>
    {% for collection in collections limit: 4 %}
      <div class="collection-card">
        <a href="{{ collection.url }}">
          <img src="{{ collection.image | img_url: 'medium' }}" alt="{{ collection.title }}">
          <h3>{{ collection.title }}</h3>
        </a>
      </div>
    {% endfor %}
  </div>
</div>`;
    }
    generateProductPage() {
        return `<div class="product-page container">
  <div class="product-images">
    {% for image in product.images %}
      <img src="{{ image | img_url: 'large' }}" alt="{{ product.title }}">
    {% endfor %}
  </div>
  
  <div class="product-info">
    <h1>{{ product.title }}</h1>
    <div class="price">{{ product.price | money }}</div>
    <div class="description">{{ product.description }}</div>
    
    <form method="post" action="/cart/add">
      <select name="id">
        {% for variant in product.variants %}
          <option value="{{ variant.id }}">{{ variant.title }} - {{ variant.price | money }}</option>
        {% endfor %}
      </select>
      <button type="submit" class="btn-primary">Add to Cart</button>
    </form>
  </div>
</div>`;
    }
    generateCollectionPage() {
        return `<div class="collection-page container">
  <h1>{{ collection.title }}</h1>
  <p>{{ collection.description }}</p>
  
  <div class="product-grid">
    {% for product in collection.products %}
      <div class="product-card">
        <a href="{{ product.url }}">
          <img src="{{ product.featured_image | img_url: 'medium' }}" alt="{{ product.title }}">
          <h3>{{ product.title }}</h3>
          <p class="price">{{ product.price | money }}</p>
        </a>
      </div>
    {% endfor %}
  </div>
</div>`;
    }
    generateCartPage() {
        return `<div class="cart-page container">
  <h1>Your Cart</h1>
  
  {% if cart.item_count > 0 %}
    <form action="/cart" method="post">
      {% for item in cart.items %}
        <div class="cart-item">
          <img src="{{ item.image | img_url: 'small' }}" alt="{{ item.title }}">
          <div class="item-details">
            <h3>{{ item.title }}</h3>
            <p>{{ item.price | money }}</p>
            <input type="number" name="updates[]" value="{{ item.quantity }}" min="0">
          </div>
        </div>
      {% endfor %}
      
      <div class="cart-total">
        <p>Subtotal: {{ cart.total_price | money }}</p>
        <button type="submit" name="checkout" class="btn-primary">Checkout</button>
      </div>
    </form>
  {% else %}
    <p>Your cart is empty</p>
  {% endif %}
</div>`;
    }
    generateThemeCSS() {
        return `/* ShoppDropp Theme - Auto Generated */
:root {
  --primary: #8b5cf6;
  --primary-dark: #7c3aed;
  --secondary: #ec4899;
  --bg: #ffffff;
  --text: #1f2937;
  --text-light: #6b7280;
  --border: #e5e7eb;
  --success: #22c55e;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  line-height: 1.6;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

/* Header */
.site-header {
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 1rem 0;
}

.site-header .container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.site-logo {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary);
  text-decoration: none;
}

/* Hero */
.hero {
  background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
  color: white;
  padding: 100px 0;
  text-align: center;
}

.hero h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.hero p {
  font-size: 1.25rem;
  margin-bottom: 2rem;
  opacity: 0.9;
}

/* Buttons */
.btn-primary {
  display: inline-block;
  background: var(--primary);
  color: white;
  padding: 12px 30px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-primary:hover {
  background: var(--primary-dark);
}

/* Product Grid */
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 30px;
  padding: 60px 0;
}

.product-card {
  background: var(--bg);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  transition: transform 0.3s, box-shadow 0.3s;
}

.product-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

.product-card img {
  width: 100%;
  height: 250px;
  object-fit: cover;
}

.product-card h3 {
  padding: 15px;
  font-size: 1.1rem;
}

.product-card .price {
  padding: 0 15px 15px;
  font-weight: 600;
  color: var(--primary);
  font-size: 1.1rem;
}

/* Footer */
.site-footer {
  background: #111827;
  color: white;
  padding: 60px 0 30px;
  margin-top: 60px;
}

/* Responsive */
@media (max-width: 768px) {
  .hero h1 { font-size: 2rem; }
  .product-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
  .product-grid { grid-template-columns: 1fr; }
}`;
    }
    generateThemeJS() {
        return `// ShoppDropp Theme JS - Auto Generated

document.addEventListener('DOMContentLoaded', function() {
  // Product image gallery
  const productImages = document.querySelectorAll('.product-images img');
  if (productImages.length > 1) {
    let currentIndex = 0;
    
    productImages.forEach((img, index) => {
      img.addEventListener('click', () => {
        productImages[currentIndex].classList.remove('active');
        currentIndex = index;
        productImages[currentIndex].classList.add('active');
      });
    });
  }

  // Add to cart animation
  const addToCartBtns = document.querySelectorAll('button[type="submit"]');
  addToCartBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
      this.textContent = 'Adding...';
      setTimeout(() => {
        this.textContent = 'Added!';
        setTimeout(() => {
          this.textContent = 'Add to Cart';
        }, 1500);
      }, 500);
    });
  });

  // Mobile menu toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      nav.classList.toggle('active');
    });
  }

  console.log('🛍️ ShoppDropp Theme loaded');
});`;
    }
    generateSettingsSchema() {
        return JSON.stringify([
            {
                name: "theme_info",
                theme_name: "ShoppDropp",
                theme_version: "1.0.0",
                theme_author: "ShoppDropp AI",
                theme_documentation_url: "https://shoppdropp.com/docs",
            },
            {
                name: "Colors",
                settings: [
                    {
                        type: "color",
                        id: "primary_color",
                        label: "Primary Color",
                        default: "#8b5cf6"
                    },
                    {
                        type: "color",
                        id: "secondary_color",
                        label: "Secondary Color",
                        default: "#ec4899"
                    }
                ]
            }
        ], null, 2);
    }
    generateHeader(storeName) {
        return `<header class="site-header">
  <div class="container">
    <a href="/" class="site-logo">${storeName}</a>
    <nav class="site-nav">
      <a href="/collections/all">Shop</a>
      <a href="/cart">Cart ({{ cart.item_count }})</a>
    </nav>
  </div>
</header>`;
    }
    generateFooter(storeName) {
        return `<footer class="site-footer">
  <div class="container">
    <div class="footer-content">
      <div>
        <h3>${storeName}</h3>
        <p>Powered by ShoppDropp AI</p>
      </div>
      <div>
        <h4>Quick Links</h4>
        <a href="/">Home</a>
        <a href="/collections/all">Shop</a>
        <a href="/cart">Cart</a>
      </div>
    </div>
    <div class="copyright">
      <p>© {{ 'now' | date: '%Y' }} ${storeName}. All rights reserved.</p>
    </div>
  </div>
</footer>`;
    }
    generateHeroSection() {
        return `<section class="hero">
  <div class="container">
    <h1>{{ settings.hero_title | default: 'Welcome to Our Store' }}</h1>
    <p>{{ settings.hero_subtitle | default: 'Discover amazing products at great prices' }}</p>
    <a href="/collections/all" class="btn-primary">Shop Now</a>
  </div>
</section>`;
    }
    generateProductGrid() {
        return `<section class="container">
  <h2>Featured Products</h2>
  <div class="product-grid">
    {% for product in collections.all.products limit: 8 %}
      <div class="product-card">
        <a href="{{ product.url }}">
          <img src="{{ product.featured_image | img_url: 'medium' }}" alt="{{ product.title }}">
          <h3>{{ product.title }}</h3>
          <p class="price">{{ product.price | money }}</p>
        </a>
      </div>
    {% endfor %}
  </div>
</section>`;
    }
    generateLandingPage(storeName, shopifyDomain) {
        return `import React from 'react';
import Head from 'next/head';

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>${storeName} - Premium Products</title>
        <meta name="description" content="Discover amazing products at ${storeName}" />
        <link rel="stylesheet" href="/styles.css" />
      </Head>

      <div className="landing-page">
        {/* Hero */}
        <section className="hero">
          <div className="container">
            <h1>Welcome to ${storeName}</h1>
            <p>Discover amazing products curated just for you</p>
            <a href="https://${shopifyDomain}" className="btn-primary">Shop Now</a>
          </div>
        </section>

        {/* Features */}
        <section className="features">
          <div className="container">
            <div className="feature-grid">
              <div className="feature">
                <h3>🚚 Free Shipping</h3>
                <p>On orders over $50</p>
              </div>
              <div className="feature">
                <h3>⭐ Quality Products</h3>
                <p>Curated selection</p>
              </div>
              <div className="feature">
                <h3>💬 24/7 Support</h3>
                <p>Always here to help</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}`;
    }
    generateLandingCSS() {
        return `/* Landing Page Styles */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: #1f2937;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.hero {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: white;
  padding: 120px 20px;
  text-align: center;
}

.hero h1 {
  font-size: 3.5rem;
  margin-bottom: 1rem;
  font-weight: 700;
}

.hero p {
  font-size: 1.25rem;
  opacity: 0.9;
  margin-bottom: 2rem;
}

.btn-primary {
  display: inline-block;
  background: white;
  color: #8b5cf6;
  padding: 15px 40px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: bold;
  font-size: 1.1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(0,0,0,0.2);
}

.features {
  padding: 80px 20px;
  background: #f9fafb;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 40px;
  text-align: center;
}

.feature h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #1f2937;
}

.feature p {
  color: #6b7280;
}

@media (max-width: 768px) {
  .hero h1 { font-size: 2.5rem; }
  .hero { padding: 80px 20px; }
}
`;
    }
    /**
     * Deploy a viral growth tool
     * Creates GitHub repo, Supabase tables, and deploys to Vercel
     */
    async deployViralTool(storeId, toolId, code) {
        console.log(`[StoreDeveloper] Deploying viral tool: ${toolId}`);
        if (!this.config) {
            throw new Error('StoreDeveloper not configured. Call developStore first.');
        }
        const toolName = toolId.replace(/-/g, '_');
        const repoName = `${this.config.storeName.toLowerCase().replace(/\s+/g, '-')}-${toolId}`;
        // 1. Create GitHub repository
        console.log(`[StoreDeveloper] Creating GitHub repo: ${repoName}`);
        const github = (0, githubService_1.createGitHubService)(this.config.githubToken);
        const repo = await github.createViralToolRepo(repoName, code.files);
        // 2. Run Supabase migrations
        console.log(`[StoreDeveloper] Running Supabase migrations`);
        const supabase = (0, supabaseService_1.createSupabaseService)(this.config.supabaseUrl, this.config.supabaseKey);
        for (const migration of code.supabaseMigrations) {
            try {
                await supabase.runMigration(migration);
            }
            catch (e) {
                console.log(`[StoreDeveloper] Migration skipped (may already exist)`);
            }
        }
        // 3. Deploy to Vercel
        console.log(`[StoreDeveloper] Deploying to Vercel`);
        const vercel = (0, vercelService_1.createVercelService)(this.config.vercelToken);
        const project = await vercel.createViralToolProject(repoName, repo.html_url);
        const deployment = await vercel.deployViralTool(project.id, {
            NEXT_PUBLIC_SUPABASE_URL: this.config.supabaseUrl,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: this.config.supabaseKey,
            KLAVIYO_API_KEY: process.env.KLAVIYO_API_KEY || '',
            OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        });
        // 4. Notify user
        await communication_service_1.communicationService.sendStoreUpdate(this.config.storeId, '🚀 Viral Tool Deployed!', `Your ${toolId} is now live at ${deployment.url}`, 'success');
        return {
            url: deployment.url,
            repo: repo.html_url,
        };
    }
}
exports.StoreDeveloper = StoreDeveloper;
// Singleton
exports.storeDeveloper = new StoreDeveloper();
//# sourceMappingURL=storeDeveloper.js.map