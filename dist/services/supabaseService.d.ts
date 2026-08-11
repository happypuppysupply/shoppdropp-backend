import { SupabaseClient } from '@supabase/supabase-js';
export interface SupabaseConfig {
    url: string;
    serviceKey: string;
}
export interface SupabaseProject {
    id: string;
    name: string;
    organization_id: string;
    region: string;
    created_at: string;
}
export interface SupabaseTable {
    id: number;
    schema: string;
    name: string;
    rls_enabled: boolean;
}
export interface SupabaseBucket {
    id: string;
    name: string;
    owner: string;
    created_at: string;
    updated_at: string;
    public: boolean;
}
export interface SupabaseEdgeFunction {
    id: string;
    slug: string;
    name: string;
    status: 'ACTIVE' | 'IDLE';
    version: number;
    created_at: string;
    updated_at: string;
}
export declare class SupabaseService {
    private client;
    private managementToken?;
    constructor(config: SupabaseConfig);
    setManagementToken(token: string): void;
    query(sql: string, params?: any[]): Promise<any>;
    createTable(name: string, columns: Record<string, string>, options?: {
        schema?: string;
        primaryKey?: string;
        rls?: boolean;
        indexes?: string[];
    }): Promise<void>;
    dropTable(name: string, schema?: string): Promise<void>;
    enableRLS(table: string, schema?: string): Promise<void>;
    createPolicy(table: string, name: string, action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL', using?: string, withCheck?: string, schema?: string): Promise<void>;
    createIndex(table: string, column: string, schema?: string): Promise<void>;
    createBucket(name: string, options?: {
        public?: boolean;
        fileSizeLimit?: number;
    }): Promise<SupabaseBucket>;
    getBuckets(): Promise<SupabaseBucket[]>;
    deleteBucket(name: string): Promise<void>;
    uploadFile(bucket: string, path: string, file: Buffer | Blob | File, options?: {
        contentType?: string;
        upsert?: boolean;
    }): Promise<{
        path: string;
        id: string;
    }>;
    getPublicUrl(bucket: string, path: string): Promise<string>;
    deleteFile(bucket: string, path: string): Promise<void>;
    createUser(email: string, password: string, userData?: Record<string, any>): Promise<any>;
    deleteUser(userId: string): Promise<void>;
    getUserByEmail(email: string): Promise<any | null>;
    listEdgeFunctions(): Promise<SupabaseEdgeFunction[]>;
    deployEdgeFunction(name: string, code: string, verifyJwt?: boolean): Promise<void>;
    enableRealtime(table: string, schema?: string): Promise<void>;
    exportTable(table: string, schema?: string): Promise<any[]>;
    importTable(table: string, data: any[], schema?: string): Promise<void>;
    setupStoreDatabase(storeId: string, storeName: string): Promise<void>;
    cleanupStoreDatabase(storeId: string): Promise<void>;
    getStats(): Promise<{
        tables: number;
        buckets: number;
        users: number;
        size: string;
    }>;
    getClient(): SupabaseClient;
}
export declare const createSupabaseService: (config: SupabaseConfig) => SupabaseService;
//# sourceMappingURL=supabaseService.d.ts.map