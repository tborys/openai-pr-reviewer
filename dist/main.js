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
        const appId = core.getInput('app_id', { required: true });
        const appPrivateKey = core.getInput('app_private_key', { required: true });
        const appInstallationId = core.getInput('app_installation_id', { required: true });
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
            await handleInteractiveMode(openaiApiKey, appId, appPrivateKey, appInstallationId, model, reviewType, maxTokens);
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
        const githubAnalyzer = context_1.GitHubPRAnalyzer.fromContext(appId, appPrivateKey, appInstallationId);
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
async function handleInteractiveMode(openaiApiKey, appId, appPrivateKey, appInstallationId, model, reviewType, maxTokens) {
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
    const githubAnalyzer = context_1.GitHubPRAnalyzer.fromContext(appId, appPrivateKey, appInstallationId);
    // Extract the user's question/request
    const userRequest = comment.replace('@wic-reviewer', '').trim();
    // Load stored context to reduce API costs
    const storedContext = await githubAnalyzer.loadReviewContext();
    // Generate response based on user request and stored context
    const response = await reviewer.handleInteractiveQuery(userRequest, storedContext);
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
    const requiredInputs = ['openai_api_key', 'app_id', 'app_private_key', 'app_installation_id'];
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