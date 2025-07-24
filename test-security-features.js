// Test file to trigger PR review workflow
// Contains intentional security issues and code quality problems for testing

const express = require('express');
const mysql = require('mysql');
const fs = require('fs');

const app = express();

// Security Issue 1: Hardcoded credentials
const DB_PASSWORD = 'admin123';
const API_KEY = 'sk-1234567890abcdef';

// Security Issue 2: SQL Injection vulnerability
function getUserData(userId) {
    const connection = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: DB_PASSWORD,
        database: 'users'
    });
    
    // Vulnerable to SQL injection
    const query = `SELECT * FROM users WHERE id = ${userId}`;
    connection.query(query, (error, results) => {
        if (error) throw error;
        console.log(results);
    });
}

// Security Issue 3: Path traversal vulnerability
app.get('/file/:filename', (req, res) => {
    const filename = req.params.filename;
    // Vulnerable to path traversal
    const filePath = `./uploads/${filename}`;
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.status(404).send('File not found');
        } else {
            res.send(data);
        }
    });
});

// Performance Issue: Synchronous file operations
function processLargeFile(filepath) {
    try {
        // Blocking operation - should be async
        const data = fs.readFileSync(filepath);
        return data.toString().split('\n').length;
    } catch (error) {
        console.log('Error processing file');
        return 0;
    }
}

// Code Quality Issue: Unused variables and poor error handling
function calculateTotal(items) {
    let total = 0;
    let tax = 0.08; // Unused variable
    let discount = 0; // Unused variable
    
    for (let i = 0; i < items.length; i++) {
        total += items[i].price;
    }
    
    // Missing error handling for invalid items
    return total;
}

// Security Issue 4: Eval usage
function executeUserCode(userInput) {
    // Dangerous use of eval
    return eval(userInput);
}

// Memory leak potential
const cache = {};
function cacheData(key, value) {
    // No cache size limit - potential memory leak
    cache[key] = value;
}

app.listen(3000, () => {
    console.log('Server running on port 3000');
});

module.exports = {
    getUserData,
    processLargeFile,
    calculateTotal,
    executeUserCode,
    cacheData
};