// Test file to validate GPT-4o-mini fixes
// This should successfully trigger the OpenAI PR Reviewer with 128k context

function validateFeatures() {
    // Test basic functionality
    console.log("Testing GPT-4o-mini integration");
    
    // Security issue: hardcoded password (should trigger inline comment)
    const password = "admin123";
    
    // Performance issue: inefficient loop (should trigger inline comment)  
    let result = [];
    for (let i = 0; i < 1000; i++) {
        for (let j = 0; j < 1000; j++) {
            result.push(i * j);
        }
    }
    
    // Code quality: inconsistent naming (should trigger inline comment)
    const UserName = "test";
    const user_email = "test@example.com";
    
    return {
        password: password,
        data: result,
        user: UserName,
        email: user_email
    };
}

// Test enhanced features:
// 1. General PR review should work with GPT-4o-mini
// 2. Inline comments should be posted on specific lines above
// 3. Interactive mode should work with @wic-reviewer mentions
// 4. Context preservation should store review data

module.exports = { validateFeatures };