const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const Groq = require('groq-sdk');
require('dotenv').config();

const app = express();
app.use(cors());
const server = app.listen(3000, () => console.log('Backend running on port 3000'));
const wss = new WebSocketServer({ server });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const userText = message.toString();
        
        const prompt = `You are an English tutor for a Marathi speaker. The user said: "${userText}".
        Respond ONLY in valid JSON format:
        {
            "tutor_reply": "Your 1-2 sentence reply.",
            "grammar": [{"mistake": "wrong phrase", "correction": "fix", "reason": "why"}],
            "vocabulary": [{"word": "new word", "english_meaning": "meaning", "marathi_meaning": "Marathi translation", "example": "usage"}]
        }`;

        try {
            const response = await groq.chat.completions.create({
                messages: [{ role: "system", content: prompt }],
                model: "openai/gpt-oss-20b",
                response_format: { type: "json_object" }
            });

            const aiData = JSON.parse(response.choices[0].message.content);
            
            ws.send(JSON.stringify({ type: 'ai-reply', payload: aiData }));
        } catch (error) {
            console.error("Groq Error:", error);
        }
    });
});