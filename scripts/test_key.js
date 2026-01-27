import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.local');

// Allow passing key as arg
const argKey = process.argv[2];

if (fs.existsSync(envPath) && !argKey) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const apiKey = argKey || process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY;

if (!apiKey) {
    console.error("❌ No API Key provided. Pass it as an argument or set it in .env.local");
    console.log("Usage: node scripts/test_key.js [YOUR_API_KEY]");
    process.exit(1);
}

console.log(`🔑 Testing API Key: ${apiKey.substring(0, 5)}...`);

async function testStandardModels() {
    const modelsToTest = [
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-pro'
    ];

    console.log("\n🧪 Verification Tests:");

    for (const model of modelsToTest) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Hello, are you working?" }] }]
                })
            });

            if (response.ok) {
                console.log(`✅ SUCCESS: ${model} is working!`);
                console.log(`   (This key is good for the chat app)`);
                process.exit(0); // Exit on first success
            } else {
                if (response.status === 404) {
                    console.log(`❌ FAILED: ${model} (404 Not Found - Access Denied)`);
                } else {
                    console.log(`❌ FAILED: ${model} (${response.status} - ${response.statusText})`);
                }
            }
        } catch (err) {
            console.error(`❌ ERROR: ${model} (${err.message})`);
        }
    }

    console.log("\n⚠️ CONCLUSION: This key CANNOT access standard chat models.");
    console.log("This key is likely restricted to 'Deep Research' or other specialized APIs.");
    console.log("👉 Please create a NEW key in a standard Google Cloud Project.");
}

testStandardModels();
