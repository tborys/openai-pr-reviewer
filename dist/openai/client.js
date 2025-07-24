"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIReviewer = void 0;
const openai_1 = __importDefault(require("openai"));
class OpenAIReviewer {
    constructor(apiKey, config) {
        this.client = new openai_1.default({
            apiKey,
        });
        this.config = config;
    }
    async reviewPR(context) {
        const messages = this.buildPrompt(context);
        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
            });
            return response.choices[0]?.message?.content || 'No review generated';
        }
        catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error(`Failed to generate review: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    buildPrompt(context) {
        const systemPrompt = this.getSystemPrompt();
        const userPrompt = this.buildUserPrompt(context);
        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
    }
    getSystemPrompt() {
        const basePrompt = `You are an expert code reviewer. Analyze the provided PR changes and provide constructive feedback.

Focus on:
- Code quality and maintainability
- Security considerations
- Performance implications
- Best practices
- Potential bugs or issues

Provide actionable suggestions and be constructive in your feedback.
Format your response in markdown with clear sections.`;
        switch (this.config.reviewType) {
            case 'security':
                return basePrompt + `\n\nPay special attention to:
- Security vulnerabilities (SQL injection, XSS, CSRF, etc.)
- Authentication and authorization issues
- Data validation and sanitization
- Secure coding practices`;
            case 'performance':
                return basePrompt + `\n\nPay special attention to:
- Performance bottlenecks
- Memory usage and leaks
- Database query optimization
- Algorithmic complexity
- Caching opportunities`;
            case 'style':
                return basePrompt + `\n\nPay special attention to:
- Code formatting and consistency
- Naming conventions
- Code organization and structure
- Documentation and comments
- Adherence to coding standards`;
            default: // comprehensive
                return basePrompt + `\n\nProvide a comprehensive review covering all aspects of code quality, security, performance, and style.`;
        }
    }
    buildUserPrompt(context) {
        const { title, description, files, baseBranch, headBranch, author } = context;
        let prompt = `## Pull Request Information

**Title:** ${title}
**Author:** ${author}
**Base Branch:** ${baseBranch}
**Head Branch:** ${headBranch}

**Description:**
${description || 'No description provided'}

## Files Changed

`;
        for (const file of files) {
            prompt += `### ${file.filename}
**Changes:** +${file.additions} -${file.deletions}

**Diff:**
\`\`\`diff
${file.patch}
\`\`\`

`;
        }
        return prompt;
    }
    async testConnection() {
        try {
            await this.client.chat.completions.create({
                model: this.config.model,
                messages: [{ role: 'user', content: 'Test connection' }],
                max_tokens: 10,
            });
            return true;
        }
        catch (error) {
            console.error('OpenAI connection test failed:', error);
            return false;
        }
    }
}
exports.OpenAIReviewer = OpenAIReviewer;
//# sourceMappingURL=client.js.map