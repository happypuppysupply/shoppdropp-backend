"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVercelService = exports.VercelService = void 0;
const axios_1 = __importDefault(require("axios"));
class VercelService {
    client;
    teamId;
    constructor(config) {
        this.teamId = config.teamId;
        this.client = axios_1.default.create({
            baseURL: 'https://api.vercel.com',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
    }
    getTeamParam() {
        return this.teamId ? `?teamId=${this.teamId}` : '';
    }
    // ============ PROJECTS ============
    async getProjects() {
        const response = await this.client.get(`/v9/projects${this.getTeamParam()}`);
        return response.data.projects;
    }
    async getProject(projectId) {
        const response = await this.client.get(`/v9/projects/${projectId}${this.getTeamParam()}`);
        return response.data;
    }
    async getProjectByName(name) {
        const projects = await this.getProjects();
        return projects.find(p => p.name === name) || null;
    }
    async createProject(params) {
        const response = await this.client.post(`/v10/projects${this.getTeamParam()}`, {
            name: params.name,
            framework: params.framework,
            gitRepository: params.gitRepository ? {
                type: params.gitRepository.type || 'github',
                repo: params.gitRepository.repo,
                org: params.gitRepository.org,
            } : undefined,
            rootDirectory: params.rootDirectory,
            buildCommand: params.buildCommand,
            outputDirectory: params.outputDirectory,
            installCommand: params.installCommand,
            devCommand: params.devCommand,
        });
        // Add env vars if provided
        if (params.env && params.env.length > 0) {
            for (const envVar of params.env) {
                await this.addEnvironmentVariable(response.data.id, envVar);
            }
        }
        return response.data;
    }
    async deleteProject(projectId) {
        await this.client.delete(`/v9/projects/${projectId}${this.getTeamParam()}`);
    }
    async updateProject(projectId, updates) {
        const response = await this.client.patch(`/v9/projects/${projectId}${this.getTeamParam()}`, updates);
        return response.data;
    }
    // ============ DEPLOYMENTS ============
    async getDeployments(projectId, limit = 20) {
        const params = { limit };
        if (projectId)
            params.projectId = projectId;
        const response = await this.client.get(`/v6/deployments${this.getTeamParam()}`, { params });
        return response.data.deployments;
    }
    async getDeployment(deploymentId) {
        const response = await this.client.get(`/v13/deployments/${deploymentId}${this.getTeamParam()}`);
        return response.data;
    }
    async createDeployment(params) {
        // First, create the deployment
        const response = await this.client.post(`/v13/deployments${this.getTeamParam()}`, {
            projectId: params.projectId,
            target: params.target,
            meta: params.meta,
            files: params.files.map(f => ({
                file: f.file,
                data: f.encoding === 'base64' ? f.data : Buffer.from(f.data).toString('base64'),
                encoding: 'base64',
            })),
        });
        return response.data;
    }
    async cancelDeployment(deploymentId) {
        await this.client.patch(`/v12/deployments/${deploymentId}/cancel${this.getTeamParam()}`);
    }
    async getDeploymentLogs(deploymentId) {
        const response = await this.client.get(`/v2/deployments/${deploymentId}/events${this.getTeamParam()}`);
        return response.data.events;
    }
    // ============ ENVIRONMENT VARIABLES ============
    async getEnvironmentVariables(projectId) {
        const response = await this.client.get(`/v9/projects/${projectId}/env${this.getTeamParam()}`);
        return response.data.envs;
    }
    async addEnvironmentVariable(projectId, envVar) {
        const response = await this.client.post(`/v10/projects/${projectId}/env${this.getTeamParam()}`, {
            key: envVar.key,
            value: envVar.value,
            type: envVar.type || 'plain',
            target: envVar.target || ['production', 'preview', 'development'],
            gitBranch: envVar.gitBranch,
        });
        return response.data;
    }
    async updateEnvironmentVariable(projectId, envId, updates) {
        const response = await this.client.patch(`/v9/projects/${projectId}/env/${envId}${this.getTeamParam()}`, updates);
        return response.data;
    }
    async removeEnvironmentVariable(projectId, envId) {
        await this.client.delete(`/v9/projects/${projectId}/env/${envId}${this.getTeamParam()}`);
    }
    // ============ DOMAINS ============
    async getDomains(projectId) {
        const params = {};
        if (projectId)
            params.projectId = projectId;
        const response = await this.client.get(`/v5/domains${this.getTeamParam()}`, { params });
        return response.data.domains;
    }
    async addDomain(projectId, domain) {
        const response = await this.client.post(`/v10/projects/${projectId}/domains${this.getTeamParam()}`, {
            name: domain,
        });
        return response.data;
    }
    async removeDomain(projectId, domain) {
        await this.client.delete(`/v9/projects/${projectId}/domains/${domain}${this.getTeamParam()}`);
    }
    async verifyDomain(projectId, domain) {
        const response = await this.client.post(`/v9/projects/${projectId}/domains/${domain}/verify${this.getTeamParam()}`);
        return response.data;
    }
    // ============ ALIASES ============
    async assignAlias(projectId, deploymentId, alias) {
        await this.client.post(`/v2/deployments/${deploymentId}/aliases${this.getTeamParam()}`, {
            alias,
        });
    }
    async getAliases(deploymentId) {
        const response = await this.client.get(`/v2/deployments/${deploymentId}/aliases${this.getTeamParam()}`);
        return response.data.aliases;
    }
    // ============ TEAMS/USERS ============
    async getUser() {
        const response = await this.client.get('/v2/user');
        return response.data.user;
    }
    async getTeam(teamId) {
        const targetTeamId = teamId || this.teamId;
        if (!targetTeamId)
            throw new Error('Team ID required');
        const response = await this.client.get(`/v2/teams/${targetTeamId}`);
        return response.data;
    }
    // ============ AI WORKER METHODS ============
    async deployStoreFrontend(storeName, config) {
        const projectName = `${storeName.toLowerCase().replace(/\s+/g, '-')}-store`;
        // Check if project exists
        let project = await this.getProjectByName(projectName);
        if (!project) {
            // Create new project
            project = await this.createProject({
                name: projectName,
                framework: 'nextjs',
                buildCommand: 'npm run build',
                outputDirectory: 'dist',
                env: [
                    {
                        key: 'NEXT_PUBLIC_SHOPIFY_DOMAIN',
                        value: config.shopifyDomain,
                        type: 'plain',
                        target: ['production', 'preview'],
                    },
                    {
                        key: 'NEXT_PUBLIC_SHOPIFY_TOKEN',
                        value: config.shopifyToken,
                        type: 'plain',
                        target: ['production', 'preview'],
                    },
                    {
                        key: 'NEXT_PUBLIC_API_URL',
                        value: config.backendUrl,
                        type: 'plain',
                        target: ['production', 'preview'],
                    },
                    ...(config.gaId ? [{
                            key: 'NEXT_PUBLIC_GA_ID',
                            value: config.gaId,
                            type: 'plain',
                            target: ['production', 'preview'],
                        }] : []),
                    ...(config.fbPixelId ? [{
                            key: 'NEXT_PUBLIC_FB_PIXEL_ID',
                            value: config.fbPixelId,
                            type: 'plain',
                            target: ['production', 'preview'],
                        }] : []),
                ],
            });
        }
        else {
            // Update existing project env vars
            const existingEnv = await this.getEnvironmentVariables(project.id);
            for (const envVar of [
                { key: 'NEXT_PUBLIC_SHOPIFY_DOMAIN', value: config.shopifyDomain },
                { key: 'NEXT_PUBLIC_SHOPIFY_TOKEN', value: config.shopifyToken },
                { key: 'NEXT_PUBLIC_API_URL', value: config.backendUrl },
            ]) {
                const existing = existingEnv.find(e => e.key === envVar.key);
                if (existing?.id) {
                    await this.updateEnvironmentVariable(project.id, existing.id, envVar);
                }
                else {
                    await this.addEnvironmentVariable(project.id, {
                        ...envVar,
                        type: 'plain',
                        target: ['production', 'preview'],
                    });
                }
            }
        }
        // Trigger production deployment
        // Note: In practice, you'd push to Git or upload files
        // This assumes the project is connected to a Git repo
        return { project, deployment: project.latestDeployments?.[0] };
    }
    async deployLandingPage(storeName, theme = 'modern', customDomain) {
        const projectName = `${storeName.toLowerCase().replace(/\s+/g, '-')}-landing`;
        let project = await this.getProjectByName(projectName);
        if (!project) {
            project = await this.createProject({
                name: projectName,
                framework: 'nextjs',
            });
        }
        // Add custom domain if provided
        if (customDomain) {
            await this.addDomain(project.id, customDomain);
        }
        return project;
    }
    async getDeploymentStatus(projectId) {
        const deployments = await this.getDeployments(projectId, 1);
        if (deployments.length === 0) {
            return { ready: false, state: 'NO_DEPLOYMENTS' };
        }
        const latest = deployments[0];
        return {
            ready: latest.state === 'READY',
            state: latest.state,
            url: latest.url,
            alias: latest.alias,
        };
    }
    async rollbackToPreviousDeployment(projectId) {
        const deployments = await this.getDeployments(projectId, 2);
        if (deployments.length < 2) {
            throw new Error('No previous deployment to rollback to');
        }
        const previousDeployment = deployments[1];
        // Redeploy the previous deployment
        const response = await this.client.post(`/v13/deployments${this.getTeamParam()}`, {
            deploymentId: previousDeployment.id,
            meta: { action: 'rollback' },
        });
        return response.data;
    }
    // ============ ANALYTICS ============
    async getDeploymentAnalytics(projectId, from, to) {
        const params = {
            from: from.toISOString(),
            to: to.toISOString(),
            projectId,
        };
        const response = await this.client.get(`/v1/analytics${this.getTeamParam()}`, { params });
        return response.data;
    }
}
exports.VercelService = VercelService;
const createVercelService = (config) => new VercelService(config);
exports.createVercelService = createVercelService;
//# sourceMappingURL=vercelService.js.map