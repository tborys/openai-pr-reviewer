"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const client_1 = require("./openai/client");
const context_1 = require("./github/context");
async function run() {
    try {
        // Get inputs from GitHub Action
        const openaiApiKey = core.getInput('openai_api_key', { required: true });
        const githubToken = core.getInput('github_token', { required: true });
        const model = core.getInput('model') || 'gpt-4o-mini';
        const reviewType = core.getInput('review_type') || 'comprehensive';
        const maxFiles = parseInt(core.getInput('max_files') || '10', 10);
        const excludePatterns = core.getInput('exclude_patterns')
            .split(',')
            .map(pattern => pattern.trim())
            .filter(pattern => pattern.length > 0);
        const maxTokens = parseInt(core.getInput('max_tokens') || '4000', 10);
        // Determine if this is an interactive comment or PR review
        const context = github.context;
        const isInteractiveMode = context.eventName === 'issue_comment';
        if (isInteractiveMode) {
            await handleInteractiveMode(openaiApiKey, githubToken, model, reviewType, maxTokens);
            return;
        }
        core.info(`Starting OpenAI PR Review with model: ${model}, type: ${reviewType}`);
        // Configure OpenAI reviewer
        const reviewConfig = {
            model,
            maxTokens,
            temperature: 0.1,
            reviewType,
        };
        const reviewer = new client_1.OpenAIReviewer(openaiApiKey, reviewConfig);
        // Test OpenAI connection
        core.info('Testing OpenAI connection...');
        const connectionTest = await reviewer.testConnection();
        if (!connectionTest) {
            throw new Error('Failed to connect to OpenAI API');
        }
        core.info('OpenAI connection successful');
        // Initialize GitHub analyzer
        const githubAnalyzer = context_1.GitHubPRAnalyzer.fromContext(githubToken);
        // Check if we've already reviewed this PR
        const existingReview = await githubAnalyzer.checkExistingReviews();
        if (existingReview) {
            core.info('PR already has an OpenAI review, skipping...');
            return;
        }
        // Get PR context
        core.info('Fetching PR context...');
        const prContext = await githubAnalyzer.getPRContext(maxFiles, excludePatterns);
        core.info(`Found ${prContext.files.length} files to review`);
        prContext.files.forEach(file => {
            core.info(`- ${file.filename} (+${file.additions}/-${file.deletions})`);
        });
        if (prContext.files.length === 0) {
            core.info('No files to review (all files excluded or no changes)');
            await githubAnalyzer.postComment('🤖 **OpenAI PR Review**\n\nNo files to review based on the current filters and exclusions.');
            return;
        }
        // Generate review with inline comments
        core.info('Generating AI review...');
        const { generalReview, inlineComments } = await reviewer.reviewPRWithInlineComments(prContext);
        // Post general review
        const formattedReview = formatReview(generalReview, reviewConfig, prContext.files.length);
        core.info('Posting general review to GitHub...');
        await githubAnalyzer.postComment(formattedReview);
        // Post inline comments
        if (inlineComments.length > 0) {
            core.info(`Posting ${inlineComments.length} inline comments...`);
            await githubAnalyzer.postInlineComments(inlineComments);
        }
        // Store context for future interactive sessions
        await githubAnalyzer.storeReviewContext(prContext);
        core.info('✅ PR review completed successfully');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.error(`PR review failed: ${errorMessage}`);
        core.setFailed(errorMessage);
    }
}
async function handleInteractiveMode(openaiApiKey, githubToken, model, reviewType, maxTokens) {
    const context = github.context;
    // Check if comment mentions @wic-reviewer
    const comment = context.payload.comment?.body || '';
    if (!comment.includes('@wic-reviewer')) {
        core.info('Comment does not mention @wic-reviewer, skipping...');
        return;
    }
    // Only respond to comments on PRs
    if (!context.payload.issue?.pull_request) {
        core.info('Comment is not on a PR, skipping...');
        return;
    }
    core.info('Interactive mode triggered by @wic-reviewer mention');
    const reviewer = new client_1.OpenAIReviewer(openaiApiKey, {
        model,
        maxTokens,
        temperature: 0.1,
        reviewType: reviewType
    });
    const githubAnalyzer = context_1.GitHubPRAnalyzer.fromInteractiveContext(githubToken);
    // Extract the user's question/request
    const userRequest = comment.replace('@wic-reviewer', '').trim();
    // Load stored context to reduce API costs, or fetch fresh context if none exists
    let prContext = await githubAnalyzer.loadReviewContext();
    if (!prContext) {
        core.info('No stored context found, fetching fresh PR context for interactive mode');
        // Get the same inputs as the main workflow
        const maxFiles = parseInt(core.getInput('max_files') || '10', 10);
        const excludePatterns = core.getInput('exclude_patterns')
            .split(',')
            .map(pattern => pattern.trim())
            .filter(pattern => pattern.length > 0);
        prContext = await githubAnalyzer.getPRContext(maxFiles, excludePatterns);
    }
    // Check if user is requesting a comprehensive review
    const reviewKeywords = ['take a look', 'review this', 'review the pr', 'what do you think', 'analyze this', 'check this'];
    const isRequestingReview = reviewKeywords.some(keyword => userRequest.toLowerCase().includes(keyword.toLowerCase()));
    let response;
    if (isRequestingReview && prContext) {
        core.info('User requesting comprehensive review, generating full analysis with inline comments');
        // Use the enhanced reviewer for comprehensive analysis
        const enhancedReviewer = new client_1.OpenAIReviewer(openaiApiKey, {
            model,
            maxTokens,
            temperature: 0.1,
            reviewType: 'comprehensive'
        });
        // Generate comprehensive review with inline comments
        const { generalReview, inlineComments } = await enhancedReviewer.reviewPRWithInlineComments(prContext);
        // Format response as comprehensive review with todo checklist
        response = `# 🔍 Comprehensive PR Review

${generalReview}

## ✅ Action Items Checklist

Based on this review, here are the key items to address:

- [ ] **Security**: Review any hardcoded values or sensitive data exposure
- [ ] **Error Handling**: Ensure all edge cases and error scenarios are handled
- [ ] **Type Safety**: Add missing type annotations and fix any type issues
- [ ] **Testing**: Add unit tests for new functionality
- [ ] **Documentation**: Update documentation for any API changes
- [ ] **Performance**: Address any performance concerns identified
- [ ] **Code Quality**: Refactor any complex or unclear code sections

*Check off items as you address them in subsequent commits.*`;
        // Post inline comments if any were generated
        if (inlineComments.length > 0) {
            core.info(`Attempting to post ${inlineComments.length} inline comments for comprehensive review`);
            try {
                await githubAnalyzer.postInlineComments(inlineComments);
                core.info('Inline comments posted successfully');
            }
            catch (error) {
                core.warning(`Failed to post inline comments: ${error}`);
                core.info('Comprehensive review will continue without inline comments');
            }
        }
        else {
            core.info('No inline comments generated for this review');
        }
    }
    else {
        // Handle as simple Q&A
        response = await reviewer.handleInteractiveQuery(userRequest, prContext);
    }
    // Post response as a comment reply
    await githubAnalyzer.postComment(`## 🤖 Interactive Response

${response}

---
<sub>Generated by [OpenAI PR Reviewer](https://github.com/tborys/openai-pr-reviewer) • Interactive mode</sub>`);
}
function formatReview(review, config, fileCount) {
    const timestamp = new Date().toISOString();
    return `## 🤖 OpenAI PR Review

**Model**: ${config.model}  
**Review Type**: ${config.reviewType}  
**Files Reviewed**: ${fileCount}  
**Generated**: ${timestamp}

---

${review}

---

<sub>Generated by [OpenAI PR Reviewer](https://github.com/tborys/openai-pr-reviewer) • AI-powered code review</sub>`;
}
function validateInputs() {
    const requiredInputs = ['openai_api_key', 'github_token'];
    for (const input of requiredInputs) {
        if (!core.getInput(input)) {
            throw new Error(`Missing required input: ${input}`);
        }
    }
    const model = core.getInput('model') || 'gpt-4o-mini';
    const supportedModels = ['gpt-4', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
    if (!supportedModels.includes(model)) {
        core.warning(`Unsupported model: ${model}. Supported models: ${supportedModels.join(', ')}`);
    }
    const reviewType = core.getInput('review_type') || 'comprehensive';
    const supportedTypes = ['comprehensive', 'security', 'performance', 'style'];
    if (!supportedTypes.includes(reviewType)) {
        throw new Error(`Unsupported review type: ${reviewType}. Supported types: ${supportedTypes.join(', ')}`);
    }
}
// Run the action
if (require.main === module) {
    run();
}
//# sourceMappingURL=main.js.map