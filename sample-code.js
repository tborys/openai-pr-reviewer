// Sample JavaScript file for testing PR review workflow
// Contains various code patterns to trigger different types of reviews

const crypto = require('crypto');
const fs = require('fs');

// Security concern: hardcoded API key
const API_SECRET = 'sk-test-1234567890abcdef';

class UserManager {
    constructor() {
        this.users = new Map();
        this.loginAttempts = new Map();
    }

    // Security issue: No input validation
    createUser(username, password, email) {
        const userId = crypto.randomUUID();
        
        // Poor practice: storing plain text password
        const user = {
            id: userId,
            username: username,
            password: password,  // Should be hashed!
            email: email,
            createdAt: new Date()
        };
        
        this.users.set(userId, user);
        return userId;
    }

    // Performance issue: inefficient search
    findUserByEmail(email) {
        for (let [id, user] of this.users) {
            if (user.email === email) {
                return user;
            }
        }
        return null;
    }

    // Security issue: no rate limiting on login attempts
    authenticateUser(username, password) {
        // Vulnerable timing attack
        for (let [id, user] of this.users) {
            if (user.username === username && user.password === password) {
                return { success: true, userId: id };
            }
        }
        return { success: false };
    }
}

// Code quality issue: inconsistent naming convention
const user_manager = new UserManager();
const MAX_RETRY_COUNT = 3;
const default_timeout = 5000;

// Memory leak potential: no cleanup
const activeConnections = [];

function handleConnection(connection) {
    activeConnections.push(connection);
    // Missing: cleanup logic to remove old connections
}

// Error handling issue: catching all errors generically
async function processFile(filename) {
    try {
        const data = await fs.promises.readFile(filename);
        return JSON.parse(data);
    } catch (error) {
        // Too generic error handling
        console.error('Something went wrong');
        return null;
    }
}

module.exports = {
    UserManager,
    handleConnection,
    processFile
};