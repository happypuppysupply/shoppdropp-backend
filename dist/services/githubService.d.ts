export interface GitHubConfig {
    token: string;
    owner?: string;
}
export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    private: boolean;
    html_url: string;
    clone_url: string;
    ssh_url: string;
    created_at: string;
    updated_at: string;
    pushed_at: string;
    default_branch: string;
}
export interface GitHubFile {
    path: string;
    content: string;
    sha?: string;
    encoding?: string;
}
export interface GitHubWorkflow {
    id: number;
    name: string;
    path: string;
    state: string;
    created_at: string;
    updated_at: string;
    html_url: string;
}
export interface GitHubWorkflowRun {
    id: number;
    name: string;
    head_branch: string;
    head_sha: string;
    run_number: number;
    event: string;
    status: string;
    conclusion: string | null;
    workflow_id: number;
    html_url: string;
    created_at: string;
    updated_at: string;
}
export interface GitHubSecret {
    name: string;
    created_at: string;
    updated_at: string;
}
export declare class GitHubService {
    private client;
    private token;
    constructor(config: GitHubConfig);
    getRepositories(owner?: string): Promise<GitHubRepo[]>;
    getRepository(owner: string, repo: string): Promise<GitHubRepo>;
    createRepository(params: {
        name: string;
        description?: string;
        private?: boolean;
        auto_init?: boolean;
        gitignore_template?: string;
    }): Promise<GitHubRepo>;
    createOrgRepository(org: string, params: {
        name: string;
        description?: string;
        private?: boolean;
        auto_init?: boolean;
    }): Promise<GitHubRepo>;
    deleteRepository(owner: string, repo: string): Promise<void>;
    getFile(owner: string, repo: string, path: string, ref?: string): Promise<GitHubFile>;
    createOrUpdateFile(owner: string, repo: string, path: string, content: string, message: string, branch?: string, sha?: string): Promise<void>;
    deleteFile(owner: string, repo: string, path: string, message: string, sha: string, branch?: string): Promise<void>;
    getWorkflows(owner: string, repo: string): Promise<GitHubWorkflow[]>;
    getWorkflowRuns(owner: string, repo: string, workflowId?: number, params?: {
        branch?: string;
        status?: string;
    }): Promise<GitHubWorkflowRun[]>;
    triggerWorkflow(owner: string, repo: string, workflowId: string, ref: string, inputs?: Record<string, string>): Promise<void>;
    getWorkflowRun(owner: string, repo: string, runId: number): Promise<GitHubWorkflowRun>;
    cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<void>;
    rerunWorkflowRun(owner: string, repo: string, runId: number): Promise<void>;
    getRepoSecrets(owner: string, repo: string): Promise<GitHubSecret[]>;
    createRepoSecret(owner: string, repo: string, secretName: string, secretValue: string): Promise<void>;
    deleteRepoSecret(owner: string, repo: string, secretName: string): Promise<void>;
    getDeployKeys(owner: string, repo: string): Promise<any[]>;
    createDeployKey(owner: string, repo: string, title: string, key: string, readOnly?: boolean): Promise<any>;
    deleteDeployKey(owner: string, repo: string, keyId: number): Promise<void>;
    getBranches(owner: string, repo: string): Promise<any[]>;
    getBranch(owner: string, repo: string, branch: string): Promise<any>;
    createBranch(owner: string, repo: string, newBranch: string, fromBranch: string): Promise<void>;
    mergeBranches(owner: string, repo: string, base: string, head: string, commitMessage?: string): Promise<any>;
    createPullRequest(owner: string, repo: string, title: string, head: string, base: string, body?: string): Promise<any>;
    getPullRequests(owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<any[]>;
    getAuthenticatedUser(): Promise<any>;
    setupDeploymentWorkflow(owner: string, repo: string, platform: 'vercel' | 'render' | 'railway', config: {
        vercelToken?: string;
        vercelOrgId?: string;
        vercelProjectId?: string;
        renderServiceId?: string;
    }): Promise<void>;
    private generateWorkflowFile;
    createThemeRepository(storeName: string, themeFiles: Record<string, string>): Promise<GitHubRepo>;
    updateThemeFiles(owner: string, repo: string, updates: {
        path: string;
        content: string;
    }[], commitMessage: string): Promise<void>;
}
export declare const createGitHubService: (config: GitHubConfig) => GitHubService;
//# sourceMappingURL=githubService.d.ts.map