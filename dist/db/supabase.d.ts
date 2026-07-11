import { User, Store, ApiCredentials, Worker, Task } from '../types';
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
    getWorkersByUser(userId: string): Promise<Worker[]>;
    getWorkerById(id: string): Promise<Worker | null>;
    createWorker(worker: Partial<Worker>): Promise<Worker>;
    updateWorker(id: string, updates: Partial<Worker>): Promise<Worker>;
    createTask(task: Partial<Task>): Promise<Task>;
    updateTask(id: string, updates: Partial<Task>): Promise<Task>;
    getUserByStripeCustomerId(customerId: string): Promise<{
        data: User | null;
        error: any;
    }>;
}
export declare const db: Database;
//# sourceMappingURL=supabase.d.ts.map