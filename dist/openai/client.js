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
    async reviewPRWithInlineComments(context) {
        // First, generate general review
        const generalReview = await this.reviewPR(context);
        // Then generate inline comments for specific issues
        const inlineComments = await this.generateInlineComments(context);
        return { generalReview, inlineComments };
    }
    async generateInlineComments(context) {
        const inlineComments = [];
        for (const file of context.files) {
            const fileComments = await this.analyzeFileForInlineComments(file);
            inlineComments.push(...fileComments);
        }
        return inlineComments;
    }
    async analyzeFileForInlineComments(file) {
        const prompt = `Analyze this code diff and identify specific lines that need detailed inline comments.

Focus on identifying:
- Security vulnerabilities (SQL injection, XSS, hardcoded secrets, etc.)
- Performance issues (inefficient loops, memory leaks, algorithmic complexity)
- Bugs or logic errors (null pointer risks, incorrect conditionals, edge cases)
- Code quality improvements (naming conventions, maintainability, best practices)

For each issue found, provide:
1. Clear explanation of the problem
2. Specific impact or risk
3. Concrete suggestion for improvement

Return a JSON array with format: [{"line": number, "comment": "Detailed explanation of the issue and suggested fix"}]
Make comments 2-3 sentences when appropriate. Be specific and actionable.
Only include significant issues that warrant inline comments.

File: ${file.filename}
Diff:
\`\`\`diff
${file.patch}
\`\`\``;
        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages: [
                    { role: 'system', content: 'You are a code reviewer. Return only valid JSON array for inline comments.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 1000,
            });
            const content = response.choices[0]?.message?.content || '[]';
            const parsedComments = this.parseInlineComments(content);
            return parsedComments.map(comment => ({
                filename: file.filename,
                line: comment.line,
                comment: comment.comment
            }));
        }
        catch (error) {
            console.error('Failed to generate inline comments:', error);
            return [];
        }
    }
    parseInlineComments(content) {
        try {
            // Try to extract JSON from the response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return [];
        }
        catch (error) {
            console.error('Failed to parse inline comments JSON:', error);
            return [];
        }
    }
    async handleInteractiveQuery(userRequest, storedContext) {
        const systemPrompt = `You are an AI code reviewer in interactive mode. A user is asking a question about a pull request.
    
Use the stored PR context (if available) to provide specific, accurate answers.
Be concise but helpful. Reference specific files or code when relevant.`;
        const contextSummary = storedContext ?
            `PR Context: ${storedContext.title}\nFiles: ${storedContext.files.map(f => f.filename).join(', ')}` :
            'No stored context available.';
        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `${contextSummary}\n\nUser question: ${userRequest}` }
                ],
                temperature: 0.1,
                max_tokens: 800,
            });
            return response.choices[0]?.message?.content || 'Unable to process your request.';
        }
        catch (error) {
            console.error('Interactive query failed:', error);
            return 'Sorry, I encountered an error processing your request.';
        }
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