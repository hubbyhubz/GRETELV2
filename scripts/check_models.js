import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.local manually since we are running with node
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const apiKey = process.argv[2] || process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY;

if (!apiKey) {
    console.error("❌ No GOOGLE_API_KEY found in .env.local");
    process.exit(1);
}

console.log(`🔑 Using API Key: ${apiKey.substring(0, 5)}...`);

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    console.log(`🌐 Querying: ${url.replace(apiKey, 'HIDDEN_KEY')}`);

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error(`❌ Error fetching models: ${response.status} ${response.statusText}`);
            console.error(JSON.stringify(data, null, 2));
            return;
        }

        if (!data.models) {
            console.log("⚠️ No models returned.");
            console.log(data);
            return;
        }

        console.log("\n✅ Available Models:");
        const generateModels = data.models.filter(m => m.supportedGenerationMethods.includes('generateContent'));

        generateModels.forEach(m => {
            console.log(`- ${m.name} (${m.displayName})`);
        });

        if (generateModels.length === 0) {
            console.log("❌ No models support 'generateContent'.");
        }

    } catch (error) {
        console.error("❌ Network error:", error.message);
    }
}

listModels();
