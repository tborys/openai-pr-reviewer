import { PRContext } from '../openai/client';
export interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
    pullNumber: number;
}
export declare class GitHubPRAnalyzer {
    private octokit;
    private config;
    constructor(config: GitHubConfig);
    static fromContext(token: string): GitHubPRAnalyzer;
    getPRContext(maxFiles?: number, excludePatterns?: string[]): Promise<PRContext>;
    postReview(review: string): Promise<void>;
    postComment(comment: string): Promise<void>;
    private shouldExcludeFile;
    private truncateContent;
    checkExistingReviews(): Promise<boolean>;
}
//# sourceMappingURL=context.d.ts.map