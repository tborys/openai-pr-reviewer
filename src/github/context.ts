import { getOctokit } from '@actions/github';
import { context } from '@actions/github';
import { PRContext } from '../openai/client';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  pullNumber: number;
}

export class GitHubPRAnalyzer {
  private octokit: ReturnType<typeof getOctokit>;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = getOctokit(config.token);
  }

  static fromContext(token: string): GitHubPRAnalyzer {
    const payload = context.payload;
    const pullRequest = payload.pull_request;
    
    if (!pullRequest) {
      throw new Error('This action must be triggered by a pull request event');
    }

    return new GitHubPRAnalyzer({
      token,
      owner: context.repo.owner,
      repo: context.repo.repo,
      pullNumber: pullRequest.number,
    });
  }

  async getPRContext(maxFiles: number = 10, excludePatterns: string[] = []): Promise<PRContext> {
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

    const processedFiles = await Promise.all(
      filteredFiles.map(async (file) => {
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
          } catch (error) {
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
      })
    );

    return {
      title: pullRequest.title,
      description: pullRequest.body || '',
      files: processedFiles,
      baseBranch: pullRequest.base.ref,
      headBranch: pullRequest.head.ref,
      author: pullRequest.user?.login || 'unknown',
    };
  }

  async postReview(review: string): Promise<void> {
    await this.octokit.rest.pulls.createReview({
      owner: this.config.owner,
      repo: this.config.repo,
      pull_number: this.config.pullNumber,
      body: review,
      event: 'COMMENT',
    });
  }

  async postComment(comment: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.config.owner,
      repo: this.config.repo,
      issue_number: this.config.pullNumber,
      body: comment,
    });
  }

  private shouldExcludeFile(filename: string, excludePatterns: string[]): boolean {
    return excludePatterns.some(pattern => {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      return new RegExp(`^${regexPattern}$`).test(filename);
    });
  }

  private truncateContent(content: string, maxLines: number = 500): string {
    const lines = content.split('\n');
    if (lines.length <= maxLines) {
      return content;
    }
    
    return lines.slice(0, maxLines).join('\n') + '\n... [Content truncated]';
  }

  async checkExistingReviews(): Promise<boolean> {
    const { data: reviews } = await this.octokit.rest.pulls.listReviews({
      owner: this.config.owner,
      repo: this.config.repo,
      pull_number: this.config.pullNumber,
    });

    return reviews.some(review => 
      review.user?.login === 'github-actions[bot]' || 
      review.body?.includes('🤖 OpenAI PR Review')
    );
  }
}