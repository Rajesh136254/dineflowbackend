require('dotenv').config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();
        if (data.models) {
            // Print first 10 models
            console.log(data.models.map(m => m.name).slice(0, 20));
        }
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
