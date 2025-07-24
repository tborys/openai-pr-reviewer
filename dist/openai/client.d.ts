export interface ReviewConfig {
    model: string;
    maxTokens: number;
    temperature: number;
    reviewType: 'comprehensive' | 'security' | 'performance' | 'style';
}
export interface PRContext {
    title: string;
    description: string;
    files: Array<{
        filename: string;
        content: string;
        patch: string;
        additions: number;
        deletions: number;
    }>;
    baseBranch: string;
    headBranch: string;
    author: string;
}
export declare class OpenAIReviewer {
    private client;
    private config;
    constructor(apiKey: string, config: ReviewConfig);
    reviewPR(context: PRContext): Promise<string>;
    private buildPrompt;
    private getSystemPrompt;
    private buildUserPrompt;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=client.d.ts.map