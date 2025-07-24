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
export interface InlineComment {
    filename: string;
    line: number;
    comment: string;
}
export declare class OpenAIReviewer {
    private client;
    private config;
    constructor(apiKey: string, config: ReviewConfig);
    reviewPR(context: PRContext): Promise<string>;
    private buildPrompt;
    private getSystemPrompt;
    private buildUserPrompt;
    reviewPRWithInlineComments(context: PRContext): Promise<{
        generalReview: string;
        inlineComments: InlineComment[];
    }>;
    private generateInlineComments;
    private analyzeFileForInlineComments;
    private parseInlineComments;
    handleInteractiveQuery(userRequest: string, storedContext: PRContext | null): Promise<string>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=client.d.ts.map