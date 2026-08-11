export interface VercelConfig {
    token: string;
    teamId?: string;
}
export interface VercelProject {
    id: string;
    name: string;
    framework: string | null;
    link?: {
        type: 'github';
        org: string;
        repo: string;
        repoId: number;
    };
    latestDeployments?: VercelDeployment[];
    createdAt: number;
    updatedAt: number;
}
export interface VercelDeployment {
    id: string;
    url: string;
    name: string;
    state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
    type: 'LAMBDAS' | 'STATIC';
    creator: {
        uid: string;
        email: string;
        username?: string;
    };
    inspectorUrl: string;
    meta?: Record<string, string>;
    target?: string;
    alias?: string[];
    createdAt: number;
    updatedAt: number;
    buildingAt?: number;
    ready?: number;
}
export interface VercelDomain {
    id: string;
    name: string;
    boughtAt: number | null;
    createdAt: number;
    expiresAt: number | null;
    verified: boolean;
    verification: Array<{
        type: string;
        domain: string;
        value: string;
        reason: string;
    }>;
}
export interface VercelEnvVar {
    id?: string;
    key: string;
    value: string;
    type: 'system' | 'secret' | 'encrypted' | 'plain';
    target?: ('production' | 'preview' | 'development')[];
    gitBranch?: string;
}
export declare class VercelService {
    private client;
    private teamId?;
    constructor(config: VercelConfig);
    private getTeamParam;
    getProjects(): Promise<VercelProject[]>;
    getProject(projectId: string): Promise<VercelProject>;
    getProjectByName(name: string): Promise<VercelProject | null>;
    createProject(params: {
        name: string;
        framework?: string;
        gitRepository?: {
            repo: string;
            org: string;
            type?: 'github';
        };
        rootDirectory?: string;
        buildCommand?: string;
        outputDirectory?: string;
        installCommand?: string;
        devCommand?: string;
        env?: VercelEnvVar[];
    }): Promise<VercelProject>;
    deleteProject(projectId: string): Promise<void>;
    updateProject(projectId: string, updates: Partial<{
        name: string;
        framework: string;
        buildCommand: string;
        outputDirectory: string;
        installCommand: string;
    }>): Promise<VercelProject>;
    getDeployments(projectId?: string, limit?: number): Promise<VercelDeployment[]>;
    getDeployment(deploymentId: string): Promise<VercelDeployment>;
    createDeployment(params: {
        projectId: string;
        files: Array<{
            file: string;
            data: string;
            encoding?: 'base64';
        }>;
        target?: 'production' | 'staging';
        meta?: Record<string, string>;
    }): Promise<VercelDeployment>;
    cancelDeployment(deploymentId: string): Promise<void>;
    getDeploymentLogs(deploymentId: string): Promise<any[]>;
    getEnvironmentVariables(projectId: string): Promise<VercelEnvVar[]>;
    addEnvironmentVariable(projectId: string, envVar: VercelEnvVar): Promise<VercelEnvVar>;
    updateEnvironmentVariable(projectId: string, envId: string, updates: Partial<VercelEnvVar>): Promise<VercelEnvVar>;
    removeEnvironmentVariable(projectId: string, envId: string): Promise<void>;
    getDomains(projectId?: string): Promise<VercelDomain[]>;
    addDomain(projectId: string, domain: string): Promise<VercelDomain>;
    removeDomain(projectId: string, domain: string): Promise<void>;
    verifyDomain(projectId: string, domain: string): Promise<any>;
    assignAlias(projectId: string, deploymentId: string, alias: string): Promise<void>;
    getAliases(deploymentId: string): Promise<any[]>;
    getUser(): Promise<any>;
    getTeam(teamId?: string): Promise<any>;
    deployStoreFrontend(storeName: string, config: {
        shopifyDomain: string;
        shopifyToken: string;
        backendUrl: string;
        gaId?: string;
        fbPixelId?: string;
    }): Promise<{
        project: VercelProject;
        deployment: VercelDeployment;
    }>;
    deployLandingPage(storeName: string, theme?: 'modern' | 'minimal' | 'bold', customDomain?: string): Promise<VercelProject>;
    getDeploymentStatus(projectId: string): Promise<{
        ready: boolean;
        state: string;
        url?: string;
        alias?: string[];
    }>;
    rollbackToPreviousDeployment(projectId: string): Promise<VercelDeployment>;
    getDeploymentAnalytics(projectId: string, from: Date, to: Date): Promise<any>;
}
export declare const createVercelService: (config: VercelConfig) => VercelService;
//# sourceMappingURL=vercelService.d.ts.map