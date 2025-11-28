const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // For google-generative-ai package, we might not have a direct listModels method exposed easily on the main class in older versions,
        // but let's try to just run a simple generation with 'gemini-pro' and 'gemini-1.5-flash' to see which one works.

        console.log("Testing gemini-pro...");
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent("Hello");
            console.log("gemini-pro success:", result.response.text());
        } catch (e) {
            console.log("gemini-pro failed:", e.message);
        }

        console.log("Testing gemini-1.5-flash...");
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent("Hello");
            console.log("gemini-1.5-flash success:", result.response.text());
        } catch (e) {
            console.log("gemini-1.5-flash failed:", e.message);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

listModels();
