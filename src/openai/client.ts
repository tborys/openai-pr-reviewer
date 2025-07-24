import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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

export class OpenAIReviewer {
  private client: OpenAI;
  private config: ReviewConfig;

  constructor(apiKey: string, config: ReviewConfig) {
    this.client = new OpenAI({
      apiKey,
    });
    this.config = config;
  }

  async reviewPR(context: PRContext): Promise<string> {
    const messages = this.buildPrompt(context);
    
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      return response.choices[0]?.message?.content || 'No review generated';
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to generate review: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildPrompt(context: PRContext): ChatCompletionMessageParam[] {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  private getSystemPrompt(): string {
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

  private buildUserPrompt(context: PRContext): string {
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

  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 10,
      });
      return true;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }
}