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

export interface InlineComment {
  filename: string;
  line: number;
  comment: string;
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
    const basePrompt = `You are an experienced senior engineer reviewing this pull request as an experienced senior engineer.

**Review Approach:**
1. Leave a short summary describing:
   • The purpose of the PR (inferred from code and description)
   • Whether implementation looks correct and aligns with engineering best practices
   • Any notable issues or positive highlights

2. Focus on code lines that:
   • Have bugs, logic issues, or potential edge cases
   • Could benefit from better naming, structure, or performance
   • Lack clarity, appropriate comments, or type safety
   • Introduce unnecessary complexity or duplication

**Review Guidelines:**
- Be concise and constructive
- Avoid overly subjective preferences unless it's a clear readability/maintainability improvement
- Assume code is written in production environment by a mid-level engineer
- Mention areas where tests or documentation are missing if relevant
- Provide actionable, specific feedback with file/line references when possible

Format your response in markdown with clear sections and end with a practical action items checklist.`;

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

  async reviewPRWithInlineComments(context: PRContext): Promise<{
    generalReview: string;
    inlineComments: InlineComment[];
  }> {
    // First, generate general review
    const generalReview = await this.reviewPR(context);
    
    // Then generate inline comments for specific issues
    const inlineComments = await this.generateInlineComments(context);
    
    return { generalReview, inlineComments };
  }

  private async generateInlineComments(context: PRContext): Promise<InlineComment[]> {
    const inlineComments: InlineComment[] = [];
    
    for (const file of context.files) {
      const fileComments = await this.analyzeFileForInlineComments(file);
      inlineComments.push(...fileComments);
    }
    
    return inlineComments;
  }

  private async analyzeFileForInlineComments(file: {
    filename: string;
    content: string;
    patch: string;
    additions: number;
    deletions: number;
  }): Promise<InlineComment[]> {
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
    } catch (error) {
      console.error('Failed to generate inline comments:', error);
      return [];
    }
  }

  private parseInlineComments(content: string): Array<{ line: number; comment: string }> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.error('Failed to parse inline comments JSON:', error);
      return [];
    }
  }

  async handleInteractiveQuery(userRequest: string, storedContext: PRContext | null): Promise<string> {
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
    } catch (error) {
      console.error('Interactive query failed:', error);
      return 'Sorry, I encountered an error processing your request.';
    }
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