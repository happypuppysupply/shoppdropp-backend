import { User, Store, ApiCredentials, Worker, Task } from '../types';
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare class Database {
    getUserById(id: string): Promise<User | null>;
    getUserByEmail(email: string): Promise<User | null>;
    createUser(user: Partial<User>): Promise<User>;
    updateUser(id: string, updates: Partial<User>): Promise<User>;
    getStoresByUser(userId: string): Promise<Store[]>;
    getStoreById(id: string): Promise<Store | null>;
    createStore(store: Partial<Store>): Promise<Store>;
    updateStore(id: string, updates: Partial<Store>): Promise<Store>;
    getCredentialsByStore(storeId: string): Promise<ApiCredentials[]>;
    upsertCredentials(creds: Partial<ApiCredentials>): Promise<ApiCredentials>;
    getWorkerById(id: string): Promise<Worker | null>;
    getWorkersByUser(userId: string): Promise<Worker[]>;
    createWorker(worker: Partial<Worker>): Promise<Worker>;
    updateWorker(id: string, updates: Partial<Worker>): Promise<Worker>;
    createTask(task: Partial<Task>): Promise<Task>;
    updateTask(id: string, updates: Partial<Task>): Promise<Task>;
    saveAIConfig(userId: string, config: {
        provider: string;
        model: string;
        apiKey: string;
    }): Promise<any>;
    getAIConfig(userId: string): Promise<any>;
    saveUserCredential(userId: string, type: string, data: any): Promise<any>;
    getUserCredential(userId: string, type: string): Promise<any>;
    getUserByStripeCustomerId(customerId: string): Promise<{
        data: User | null;
        error: any;
    }>;
}
export declare const db: Database;
//# sourceMappingURL=supabase.d.ts.map