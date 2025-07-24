"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubPRAnalyzer = void 0;
const github_1 = require("@actions/github");
const auth_app_1 = require("@octokit/auth-app");
const rest_1 = require("@octokit/rest");
class GitHubPRAnalyzer {
    constructor(config) {
        this.config = config;
        // Create GitHub App authentication
        const auth = (0, auth_app_1.createAppAuth)({
            appId: config.appId,
            privateKey: config.appPrivateKey,
            installationId: config.appInstallationId,
        });
        this.octokit = new rest_1.Octokit({
            auth,
        });
    }
    static fromContext(appId, appPrivateKey, appInstallationId) {
        const payload = github_1.context.payload;
        const pullRequest = payload.pull_request;
        if (!pullRequest) {
            throw new Error('This action must be triggered by a pull request event');
        }
        return new GitHubPRAnalyzer({
            appId,
            appPrivateKey,
            appInstallationId,
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            pullNumber: pullRequest.number,
        });
    }
    async getPRContext(maxFiles = 10, excludePatterns = []) {
        const { data: pullRequest } = await this.octokit.rest.pulls.get({
            owner: this.config.owner,
            repo: this.config.repo,
            pull_number: this.config.pullNumber,
        });
        const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: this.config.owner,
            repo: this.config.repo,
            pull_number: this.config.pullNumber,
        });
        const filteredFiles = files
            .filter(file => !this.shouldExcludeFile(file.filename, excludePatterns))
            .slice(0, maxFiles);
        const processedFiles = await Promise.all(filteredFiles.map(async (file) => {
            let content = '';
            if (file.status !== 'removed' && file.contents_url) {
                try {
                    const { data: fileContent } = await this.octokit.rest.repos.getContent({
                        owner: this.config.owner,
                        repo: this.config.repo,
                        path: file.filename,
                        ref: pullRequest.head.sha,
                    });
                    if ('content' in fileContent && fileContent.content) {
                        content = Buffer.from(fileContent.content, 'base64').toString('utf-8');
                    }
                }
                catch (error) {
                    console.warn(`Failed to fetch content for ${file.filename}:`, error);
                }
            }
            return {
                filename: file.filename,
                content: this.truncateContent(content),
                patch: file.patch || '',
                additions: file.additions,
                deletions: file.deletions,
            };
        }));
        return {
            title: pullRequest.title,
            description: pullRequest.body || '',
            files: processedFiles,
            baseBranch: pullRequest.base.ref,
            headBranch: pullRequest.head.ref,
            author: pullRequest.user?.login || 'unknown',
        };
    }
    async postReview(review) {
        await this.octokit.rest.pulls.createReview({
            owner: this.config.owner,
            repo: this.config.repo,
            pull_number: this.config.pullNumber,
            body: review,
            event: 'COMMENT',
        });
    }
    async postComment(comment) {
        await this.octokit.rest.issues.createComment({
            owner: this.config.owner,
            repo: this.config.repo,
            issue_number: this.config.pullNumber,
            body: comment,
        });
    }
    shouldExcludeFile(filename, excludePatterns) {
        return excludePatterns.some(pattern => {
            // Convert glob pattern to regex
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            return new RegExp(`^${regexPattern}$`).test(filename);
        });
    }
    truncateContent(content, maxLines = 500) {
        const lines = content.split('\n');
        if (lines.length <= maxLines) {
            return content;
        }
        return lines.slice(0, maxLines).join('\n') + '\n... [Content truncated]';
    }
    async checkExistingReviews() {
        const { data: reviews } = await this.octokit.rest.pulls.listReviews({
            owner: this.config.owner,
            repo: this.config.repo,
            pull_number: this.config.pullNumber,
        });
        return reviews.some(review => review.user?.login === 'github-actions[bot]' ||
            review.body?.includes('🤖 OpenAI PR Review'));
    }
    async postInlineComments(inlineComments) {
        const reviewComments = inlineComments.map(comment => ({
            path: comment.filename,
            line: comment.line,
            body: comment.comment,
            side: 'RIGHT',
        }));
        if (reviewComments.length > 0) {
            await this.octokit.rest.pulls.createReview({
                owner: this.config.owner,
                repo: this.config.repo,
                pull_number: this.config.pullNumber,
                body: '🤖 OpenAI PR Review - Inline Comments',
                event: 'COMMENT',
                comments: reviewComments,
            });
        }
    }
    async storeReviewContext(context) {
        // Store context as a comment with a special marker for future retrieval
        const contextData = JSON.stringify({
            timestamp: new Date().toISOString(),
            context: {
                title: context.title,
                description: context.description,
                files: context.files.map(f => ({
                    filename: f.filename,
                    additions: f.additions,
                    deletions: f.deletions
                }))
            }
        });
        await this.octokit.rest.issues.createComment({
            owner: this.config.owner,
            repo: this.config.repo,
            issue_number: this.config.pullNumber,
            body: `<!-- OPENAI_PR_CONTEXT:${Buffer.from(contextData).toString('base64')} -->`,
        });
    }
    async loadReviewContext() {
        try {
            const { data: comments } = await this.octokit.rest.issues.listComments({
                owner: this.config.owner,
                repo: this.config.repo,
                issue_number: this.config.pullNumber,
            });
            // Find the most recent context comment
            for (const comment of comments.reverse()) {
                const match = comment.body?.match(/<!-- OPENAI_PR_CONTEXT:([A-Za-z0-9+/=]+) -->/);
                if (match) {
                    const contextData = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'));
                    return contextData.context;
                }
            }
        }
        catch (error) {
            console.warn('Failed to load review context:', error);
        }
        return null;
    }
}
exports.GitHubPRAnalyzer = GitHubPRAnalyzer;
//# sourceMappingURL=context.js.map