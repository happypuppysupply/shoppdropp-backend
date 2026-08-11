"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupabaseService = exports.SupabaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
class SupabaseService {
    client;
    managementToken;
    constructor(config) {
        this.client = (0, supabase_js_1.createClient)(config.url, config.serviceKey);
    }
    // For management API (requires Supabase CLI token)
    setManagementToken(token) {
        this.managementToken = token;
    }
    // ============ DATABASE OPERATIONS ============
    async query(sql, params) {
        const { data, error } = await this.client.rpc('pgql', { query: sql, params });
        if (error)
            throw error;
        return data;
    }
    async createTable(name, columns, options) {
        const schema = options?.schema || 'public';
        // Build column definitions
        const columnDefs = Object.entries(columns)
            .map(([col, type]) => `"${col}" ${type}`)
            .join(', ');
        let sql = `CREATE TABLE IF NOT EXISTS ${schema}."${name}" (${columnDefs}`;
        if (options?.primaryKey) {
            sql += `, PRIMARY KEY ("${options.primaryKey}")`;
        }
        sql += ');';
        const { error } = await this.client.rpc('exec', { sql });
        if (error)
            throw error;
        // Enable RLS if requested
        if (options?.rls) {
            await this.enableRLS(name, schema);
        }
        // Create indexes
        if (options?.indexes) {
            for (const index of options.indexes) {
                await this.createIndex(name, index, schema);
            }
        }
    }
    async dropTable(name, schema = 'public') {
        const { error } = await this.client.rpc('exec', {
            sql: `DROP TABLE IF EXISTS ${schema}."${name}";`,
        });
        if (error)
            throw error;
    }
    async enableRLS(table, schema = 'public') {
        const { error } = await this.client.rpc('exec', {
            sql: `ALTER TABLE ${schema}."${table}" ENABLE ROW LEVEL SECURITY;`,
        });
        if (error)
            throw error;
    }
    async createPolicy(table, name, action, using, withCheck, schema = 'public') {
        let sql = `CREATE POLICY "${name}" ON ${schema}."${table}" FOR ${action}`;
        if (using) {
            sql += ` USING (${using})`;
        }
        if (withCheck) {
            sql += ` WITH CHECK (${withCheck})`;
        }
        sql += ';';
        const { error } = await this.client.rpc('exec', { sql });
        if (error)
            throw error;
    }
    async createIndex(table, column, schema = 'public') {
        const indexName = `idx_${table}_${column}`;
        const { error } = await this.client.rpc('exec', {
            sql: `CREATE INDEX IF NOT EXISTS "${indexName}" ON ${schema}."${table}" ("${column}");`,
        });
        if (error)
            throw error;
    }
    // ============ STORAGE ============
    async createBucket(name, options) {
        const { data, error } = await this.client.storage.createBucket(name, {
            public: options?.public ?? false,
            fileSizeLimit: options?.fileSizeLimit,
        });
        if (error)
            throw error;
        return data;
    }
    async getBuckets() {
        const { data, error } = await this.client.storage.listBuckets();
        if (error)
            throw error;
        return data || [];
    }
    async deleteBucket(name) {
        const { error } = await this.client.storage.deleteBucket(name);
        if (error)
            throw error;
    }
    async uploadFile(bucket, path, file, options) {
        const { data, error } = await this.client.storage
            .from(bucket)
            .upload(path, file, {
            contentType: options?.contentType,
            upsert: options?.upsert ?? false,
        });
        if (error)
            throw error;
        return { path: data.path, id: data.id };
    }
    async getPublicUrl(bucket, path) {
        const { data } = this.client.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    }
    async deleteFile(bucket, path) {
        const { error } = await this.client.storage.from(bucket).remove([path]);
        if (error)
            throw error;
    }
    // ============ AUTH ============
    async createUser(email, password, userData) {
        const { data, error } = await this.client.auth.admin.createUser({
            email,
            password,
            user_metadata: userData,
            email_confirm: true,
        });
        if (error)
            throw error;
        return data.user;
    }
    async deleteUser(userId) {
        const { error } = await this.client.auth.admin.deleteUser(userId);
        if (error)
            throw error;
    }
    async getUserByEmail(email) {
        const { data, error } = await this.client.rpc('get_user_by_email', { email });
        if (error)
            return null;
        return data;
    }
    // ============ EDGE FUNCTIONS ============
    async listEdgeFunctions() {
        const response = await fetch(`${this.client.supabaseUrl}/v1/projects`, {
            headers: {
                Authorization: `Bearer ${this.managementToken}`,
            },
        });
        if (!response.ok)
            throw new Error('Failed to list functions');
        return response.json();
    }
    async deployEdgeFunction(name, code, verifyJwt = true) {
        // This requires the Supabase CLI or Management API
        // For now, we'll document the approach
        console.log(`[SupabaseService] Would deploy edge function: ${name}`);
        console.log('[SupabaseService] Use: supabase functions deploy ' + name);
    }
    // ============ REALTIME ============
    async enableRealtime(table, schema = 'public') {
        const { error } = await this.client.rpc('exec', {
            sql: `BEGIN; DROP PUBLICATION IF EXISTS supabase_realtime; CREATE PUBLICATION supabase_realtime; COMMIT;
            ALTER PUBLICATION supabase_realtime ADD TABLE ${schema}."${table}";`,
        });
        if (error)
            throw error;
    }
    // ============ BACKUP & MIGRATIONS ============
    async exportTable(table, schema = 'public') {
        const { data, error } = await this.client
            .from(`${schema}.${table}`)
            .select('*');
        if (error)
            throw error;
        return data || [];
    }
    async importTable(table, data, schema = 'public') {
        const { error } = await this.client
            .from(`${schema}.${table}`)
            .upsert(data);
        if (error)
            throw error;
    }
    // ============ STORE-SPECIFIC METHODS ============
    async setupStoreDatabase(storeId, storeName) {
        // Create store-specific tables
        // Products table (synced from Shopify)
        await this.createTable(`store_${storeId}_products`, {
            id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
            shopify_product_id: 'bigint UNIQUE',
            title: 'text NOT NULL',
            description: 'text',
            price: 'decimal(10,2)',
            compare_at_price: 'decimal(10,2)',
            sku: 'text',
            inventory_quantity: 'integer DEFAULT 0',
            category: 'text',
            tags: 'text[]',
            images: 'text[]',
            status: 'text DEFAULT \'active\'',
            cj_product_id: 'text',
            supplier_price: 'decimal(10,2)',
            profit_margin: 'decimal(5,2)',
            created_at: 'timestamptz DEFAULT now()',
            updated_at: 'timestamptz DEFAULT now()',
        }, {
            primaryKey: 'id',
            rls: true,
            indexes: ['shopify_product_id', 'sku', 'status'],
        });
        // Orders table
        await this.createTable(`store_${storeId}_orders`, {
            id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
            shopify_order_id: 'bigint UNIQUE',
            order_number: 'text',
            customer_email: 'text',
            customer_name: 'text',
            total_price: 'decimal(10,2)',
            currency: 'text',
            fulfillment_status: 'text',
            cj_order_id: 'text',
            tracking_number: 'text',
            shipping_carrier: 'text',
            created_at: 'timestamptz DEFAULT now()',
            updated_at: 'timestamptz DEFAULT now()',
        }, {
            primaryKey: 'id',
            rls: true,
            indexes: ['shopify_order_id', 'cj_order_id', 'fulfillment_status'],
        });
        // Analytics table
        await this.createTable(`store_${storeId}_analytics`, {
            id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
            date: 'date NOT NULL',
            metric_type: 'text NOT NULL',
            metric_value: 'decimal(15,2)',
            source: 'text',
            metadata: 'jsonb',
            created_at: 'timestamptz DEFAULT now()',
        }, {
            primaryKey: 'id',
            indexes: ['date', 'metric_type'],
        });
        // Campaigns table (Meta ads)
        await this.createTable(`store_${storeId}_campaigns`, {
            id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
            meta_campaign_id: 'text UNIQUE',
            name: 'text NOT NULL',
            objective: 'text',
            status: 'text',
            budget: 'decimal(10,2)',
            spent: 'decimal(10,2) DEFAULT 0',
            impressions: 'integer DEFAULT 0',
            clicks: 'integer DEFAULT 0',
            conversions: 'integer DEFAULT 0',
            roas: 'decimal(5,2)',
            created_at: 'timestamptz DEFAULT now()',
            updated_at: 'timestamptz DEFAULT now()',
        }, {
            primaryKey: 'id',
            indexes: ['meta_campaign_id', 'status'],
        });
        // Create RLS policies
        await this.createPolicy(`store_${storeId}_products`, 'allow_store_access', 'ALL', `auth.uid() IN (SELECT user_id FROM stores WHERE id = '${storeId}')`);
        console.log(`[SupabaseService] Database setup complete for store: ${storeName}`);
    }
    async cleanupStoreDatabase(storeId) {
        const tables = [
            `store_${storeId}_products`,
            `store_${storeId}_orders`,
            `store_${storeId}_analytics`,
            `store_${storeId}_campaigns`,
        ];
        for (const table of tables) {
            try {
                await this.dropTable(table);
            }
            catch (e) {
                console.log(`[SupabaseService] Table ${table} may not exist, skipping`);
            }
        }
        console.log(`[SupabaseService] Database cleanup complete for store: ${storeId}`);
    }
    // ============ UTILITY ============
    async getStats() {
        const { data: tables, error: tablesError } = await this.client
            .rpc('get_table_stats');
        if (tablesError) {
            return { tables: 0, buckets: 0, users: 0, size: '0 MB' };
        }
        const { data: buckets } = await this.client.storage.listBuckets();
        const { count: users } = await this.client.auth.admin.listUsers();
        return {
            tables: tables?.length || 0,
            buckets: buckets?.length || 0,
            users: users || 0,
            size: tables?.reduce((sum, t) => sum + (t.size || 0), 0) || '0 MB',
        };
    }
    // Get client for direct operations
    getClient() {
        return this.client;
    }
}
exports.SupabaseService = SupabaseService;
const createSupabaseService = (config) => new SupabaseService(config);
exports.createSupabaseService = createSupabaseService;
//# sourceMappingURL=supabaseService.js.map