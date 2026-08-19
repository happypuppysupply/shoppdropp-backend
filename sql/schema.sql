-- ShoppDropp Production Database Schema
-- Supports 1000+ users with full category taxonomy

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Stores table (main store entity)
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500),
    platform VARCHAR(50) DEFAULT 'shopify',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Store configurations (extended onboarding data)
CREATE TABLE IF NOT EXISTS store_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Onboarding status
    onboarding_status VARCHAR(50) DEFAULT 'incomplete',
    onboarding_step INTEGER DEFAULT 1,
    onboarding_data JSONB DEFAULT '{}',
    
    -- Category & Niche (Facebook Ads aligned)
    market_category VARCHAR(100),
    market_subcategory VARCHAR(100),
    niche_angles JSONB DEFAULT '[]',
    
    -- Target Audience
    target_audience JSONB DEFAULT '{}',
    primary_audience VARCHAR(100),
    audience_demographics JSONB DEFAULT '{}',
    
    -- Brand Voice
    brand_voice JSONB DEFAULT '{}',
    site_style VARCHAR(50),
    visual_style VARCHAR(50),
    
    -- Product Strategy
    price_strategy VARCHAR(50),
    pricing JSONB DEFAULT '{}',
    product_types JSONB DEFAULT '[]',
    
    -- Marketing
    marketing_budget_monthly INTEGER DEFAULT 0,
    business_goals JSONB DEFAULT '[]',
    primary_channel VARCHAR(100),
    
    -- AI Context
    ai_context_summary TEXT,
    
    -- Facebook Ads Targeting
    facebook_targeting JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(store_id)
);

-- Credentials storage (encrypted)
CREATE TABLE IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    service_type VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    password_encrypted TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workers (VPS instances)
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    hetzner_server_id VARCHAR(100),
    ip_address INET,
    status VARCHAR(50) DEFAULT 'pending',
    gateway_url VARCHAR(500),
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Configuration per user
CREATE TABLE IF NOT EXISTS ai_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) DEFAULT 'openrouter',
    model VARCHAR(100) DEFAULT 'moonshotai/kimi-k2.5',
    api_key_encrypted TEXT,
    use_platform_ai BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Products catalog
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    supplier_product_id VARCHAR(255),
    supplier_name VARCHAR(100),
    title VARCHAR(500),
    description TEXT,
    price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    compare_at_price DECIMAL(10,2),
    inventory_quantity INTEGER DEFAULT 0,
    sku VARCHAR(255),
    barcode VARCHAR(255),
    weight DECIMAL(8,2),
    images JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]',
    category VARCHAR(255),
    status VARCHAR(50) DEFAULT 'draft',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shopify_order_id VARCHAR(255),
    order_number VARCHAR(100),
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    total DECIMAL(10,2),
    subtotal DECIMAL(10,2),
    tax DECIMAL(10,2),
    shipping DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'pending',
    fulfillment_status VARCHAR(50),
    payment_status VARCHAR(50),
    line_items JSONB DEFAULT '[]',
    shipping_address JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity logs (for agent actions)
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    activity_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'running',
    label VARCHAR(500),
    detail TEXT,
    tools_used INTEGER DEFAULT 0,
    duration_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat history
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    form_data JSONB,
    tokens_used INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_stores_user_id ON stores(user_id);
CREATE INDEX idx_stores_status ON stores(status);
CREATE INDEX idx_store_configs_store_id ON store_configs(store_id);
CREATE INDEX idx_store_configs_user_id ON store_configs(user_id);
CREATE INDEX idx_credentials_user_id ON credentials(user_id);
CREATE INDEX idx_credentials_store_id ON credentials(store_id);
CREATE INDEX idx_workers_user_id ON workers(user_id);
CREATE INDEX idx_workers_store_id ON workers(store_id);
CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_store_id ON activity_logs(store_id);
CREATE INDEX idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX idx_chat_history_store_id ON chat_history(store_id);

-- Row Level Security (RLS) policies
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can only see their own stores" ON stores
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own configs" ON store_configs
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own credentials" ON credentials
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own workers" ON workers
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own products" ON products
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own orders" ON orders
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own activity" ON activity_logs
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own chat" ON chat_history
    FOR ALL USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_configs_updated_at BEFORE UPDATE ON store_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_configs_updated_at BEFORE UPDATE ON ai_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
