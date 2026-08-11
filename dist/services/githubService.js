"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGitHubService = exports.GitHubService = void 0;
const axios_1 = __importDefault(require("axios"));
class GitHubService {
    client;
    token;
    constructor(config) {
        this.token = config.token;
        this.client = axios_1.default.create({
            baseURL: 'https://api.github.com',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            timeout: 30000,
        });
    }
    // ============ REPOSITORIES ============
    async getRepositories(owner) {
        const targetOwner = owner || (await this.getAuthenticatedUser()).login;
        const response = await this.client.get(`/users/${targetOwner}/repos`, {
            params: {
                sort: 'updated',
                per_page: 100,
            },
        });
        return response.data;
    }
    async getRepository(owner, repo) {
        const response = await this.client.get(`/repos/${owner}/${repo}`);
        return response.data;
    }
    async createRepository(params) {
        const response = await this.client.post('/user/repos', {
            ...params,
            private: params.private ?? true,
        });
        return response.data;
    }
    async createOrgRepository(org, params) {
        const response = await this.client.post(`/orgs/${org}/repos`, {
            ...params,
            private: params.private ?? true,
        });
        return response.data;
    }
    async deleteRepository(owner, repo) {
        await this.client.delete(`/repos/${owner}/${repo}`);
    }
    // ============ FILES ============
    async getFile(owner, repo, path, ref) {
        const response = await this.client.get(`/repos/${owner}/${repo}/contents/${path}`, {
            params: ref ? { ref } : {},
        });
        const data = response.data;
        return {
            path: data.path,
            content: Buffer.from(data.content, 'base64').toString('utf-8'),
            sha: data.sha,
            encoding: data.encoding,
        };
    }
    async createOrUpdateFile(owner, repo, path, content, message, branch, sha) {
        const encodedContent = Buffer.from(content).toString('base64');
        await this.client.put(`/repos/${owner}/${repo}/contents/${path}`, {
            message,
            content: encodedContent,
            branch,
            sha,
        });
    }
    async deleteFile(owner, repo, path, message, sha, branch) {
        await this.client.delete(`/repos/${owner}/${repo}/contents/${path}`, {
            data: {
                message,
                sha,
                branch,
            },
        });
    }
    // ============ WORKFLOWS ============
    async getWorkflows(owner, repo) {
        const response = await this.client.get(`/repos/${owner}/${repo}/actions/workflows`);
        return response.data.workflows;
    }
    async getWorkflowRuns(owner, repo, workflowId, params) {
        const endpoint = workflowId
            ? `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`
            : `/repos/${owner}/${repo}/actions/runs`;
        const response = await this.client.get(endpoint, { params });
        return response.data.workflow_runs || response.data.runs;
    }
    async triggerWorkflow(owner, repo, workflowId, ref, inputs) {
        await this.client.post(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
            ref,
            inputs,
        });
    }
    async getWorkflowRun(owner, repo, runId) {
        const response = await this.client.get(`/repos/${owner}/${repo}/actions/runs/${runId}`);
        return response.data;
    }
    async cancelWorkflowRun(owner, repo, runId) {
        await this.client.post(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`);
    }
    async rerunWorkflowRun(owner, repo, runId) {
        await this.client.post(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`);
    }
    // ============ SECRETS ============
    async getRepoSecrets(owner, repo) {
        const response = await this.client.get(`/repos/${owner}/${repo}/actions/secrets`);
        return response.data.secrets;
    }
    async createRepoSecret(owner, repo, secretName, secretValue) {
        // Get public key for encryption
        const { data: publicKey } = await this.client.get(`/repos/${owner}/${repo}/actions/secrets/public-key`);
        // Encrypt secret using libsodium (simplified - in production use proper encryption)
        // For now, GitHub accepts plaintext via their API with proper auth
        await this.client.put(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, {
            encrypted_value: secretValue, // In production, encrypt this
            key_id: publicKey.key_id,
        });
    }
    async deleteRepoSecret(owner, repo, secretName) {
        await this.client.delete(`/repos/${owner}/${repo}/actions/secrets/${secretName}`);
    }
    // ============ DEPLOY KEYS ============
    async getDeployKeys(owner, repo) {
        const response = await this.client.get(`/repos/${owner}/${repo}/keys`);
        return response.data;
    }
    async createDeployKey(owner, repo, title, key, readOnly = true) {
        const response = await this.client.post(`/repos/${owner}/${repo}/keys`, {
            title,
            key,
            read_only: readOnly,
        });
        return response.data;
    }
    async deleteDeployKey(owner, repo, keyId) {
        await this.client.delete(`/repos/${owner}/${repo}/keys/${keyId}`);
    }
    // ============ BRANCHES ============
    async getBranches(owner, repo) {
        const response = await this.client.get(`/repos/${owner}/${repo}/branches`);
        return response.data;
    }
    async getBranch(owner, repo, branch) {
        const response = await this.client.get(`/repos/${owner}/${repo}/branches/${branch}`);
        return response.data;
    }
    async createBranch(owner, repo, newBranch, fromBranch) {
        // Get SHA of fromBranch
        const branchData = await this.getBranch(owner, repo, fromBranch);
        const sha = branchData.commit.sha;
        // Create new ref
        await this.client.post(`/repos/${owner}/${repo}/git/refs`, {
            ref: `refs/heads/${newBranch}`,
            sha,
        });
    }
    async mergeBranches(owner, repo, base, head, commitMessage) {
        const response = await this.client.post(`/repos/${owner}/${repo}/merges`, {
            base,
            head,
            commit_message: commitMessage,
        });
        return response.data;
    }
    // ============ PULL REQUESTS ============
    async createPullRequest(owner, repo, title, head, base, body) {
        const response = await this.client.post(`/repos/${owner}/${repo}/pulls`, {
            title,
            head,
            base,
            body,
        });
        return response.data;
    }
    async getPullRequests(owner, repo, state = 'open') {
        const response = await this.client.get(`/repos/${owner}/${repo}/pulls`, {
            params: { state },
        });
        return response.data;
    }
    // ============ USER ============
    async getAuthenticatedUser() {
        const response = await this.client.get('/user');
        return response.data;
    }
    // ============ AI WORKER METHODS ============
    async setupDeploymentWorkflow(owner, repo, platform, config) {
        const workflowContent = this.generateWorkflowFile(platform, config);
        await this.createOrUpdateFile(owner, repo, '.github/workflows/deploy.yml', workflowContent, 'Add deployment workflow', 'main');
    }
    generateWorkflowFile(platform, config) {
        if (platform === 'vercel') {
            return `name: Deploy to Vercel

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Vercel
        uses: vercel/action-deploy@v1
        with:
          vercel-token: \${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${config.vercelOrgId}
          vercel-project-id: ${config.vercelProjectId}
`;
        }
        return `name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy
        run: echo "Deploy to ${platform}"
`;
    }
    async createThemeRepository(storeName, themeFiles) {
        // Create repo
        const repo = await this.createRepository({
            name: `shopify-theme-${storeName.toLowerCase().replace(/\s+/g, '-')}`,
            description: `Shopify theme for ${storeName}`,
            private: true,
            auto_init: true,
        });
        // Add theme files
        for (const [path, content] of Object.entries(themeFiles)) {
            await this.createOrUpdateFile(repo.owner.login, repo.name, path, content, `Add ${path}`, 'main');
        }
        return repo;
    }
    async updateThemeFiles(owner, repo, updates, commitMessage) {
        // Get current branch SHA
        const branch = await this.getBranch(owner, repo, 'main');
        let currentSha = branch.commit.sha;
        // Create tree with updates
        const tree = await this.client.post(`/repos/${owner}/${repo}/git/trees`, {
            base_tree: currentSha,
            tree: updates.map(u => ({
                path: u.path,
                mode: '100644',
                type: 'blob',
                content: u.content,
            })),
        });
        // Create commit
        const commit = await this.client.post(`/repos/${owner}/${repo}/git/commits`, {
            message: commitMessage,
            tree: tree.data.sha,
            parents: [currentSha],
        });
        // Update branch
        await this.client.patch(`/repos/${owner}/${repo}/git/refs/heads/main`, {
            sha: commit.data.sha,
        });
    }
}
exports.GitHubService = GitHubService;
const createGitHubService = (config) => new GitHubService(config);
exports.createGitHubService = createGitHubService;
//# sourceMappingURL=githubService.js.map