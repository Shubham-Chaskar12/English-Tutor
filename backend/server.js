const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const Groq = require('groq-sdk');
const db = require('./database');
require('dotenv').config();

const app = express();
app.use(cors());

// Progress endpoint for the Settings/Progress modal
app.get('/stats', (req, res) => {
    db.get("SELECT COUNT(*) as totalMistakes FROM grammar_history", (err, gRow) => {
        db.get("SELECT COUNT(*) as totalWords FROM vocabulary_history", (err2, vRow) => {
            db.all("SELECT mistake, correction, reason FROM grammar_history ORDER BY id DESC LIMIT 5", (err3, recent) => {
                res.json({
                    totalMistakes: gRow ? gRow.totalMistakes : 0,
                    totalWords: vRow ? vRow.totalWords : 0,
                    recentMistakes: recent || []
                });
            });
        });
    });
});

const server = app.listen(3000, () => console.log('Backend running on port 3000'));
const wss = new WebSocketServer({ server });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function buildSystemPrompt(topic, weakPointsText) {
    return `You are a warm, natural English conversation partner and tutor for a Marathi speaker.
Current conversation topic: ${topic}.
${weakPointsText}

CRITICAL RULES FOR NATURAL CONVERSATION:
1. Do NOT act like a Q&A bot. Talk like a real friend/mentor. React to what the user says, share a brief thought, and ALWAYS end your reply with a natural, engaging follow-up question to keep the conversation flowing.
2. If the user asks you to explain something, give a clear, helpful 3-4 sentence explanation with an example before asking a follow-up question.
3. Spot grammar or phrasing mistakes in the user's speech. Gently mention major mistakes in your reply if helpful, and ALWAYS log them in the "grammar" array with a clear teaching explanation in "reason".

Respond ONLY in valid JSON format matching this exact structure:
{
    "tutor_reply": "Your natural conversational reply ending with a follow-up question.",
    "grammar": [{"mistake": "exact wrong phrase", "correction": "natural corrected phrase", "reason": "clear mini-lesson explaining why"}],
    "vocabulary": [{"word": "useful word from the chat", "english_meaning": "simple meaning", "marathi_meaning": "Marathi translation", "example": "example sentence"}]
}
Only add items to "grammar" if the user actually made a mistake. Limit "vocabulary" to 1-2 useful words.`;
}

wss.on('connection', (ws) => {
    console.log('🟢 Session Started: Frontend connected');
    let currentTopic = 'Daily Life & Casual Chat';
    let conversationHistory = [];

    // Load recent weak points from SQLite
    function initSystemPrompt(callback) {
        db.all("SELECT mistake, correction FROM grammar_history ORDER BY id DESC LIMIT 4", (err, rows) => {
            let weakPointsText = "";
            if (rows && rows.length > 0) {
                const list = rows.map(r => `"${r.mistake}" -> "${r.correction}"`).join("; ");
                weakPointsText = `User's recent recurring mistakes: ${list}. Watch out for similar patterns and help them improve.`;
            }
            const sysMsg = { role: "system", content: buildSystemPrompt(currentTopic, weakPointsText) };
            if (conversationHistory.length === 0) {
                conversationHistory.push(sysMsg);
            } else {
                conversationHistory[0] = sysMsg;
            }
            if (callback) callback();
        });
    }

    initSystemPrompt();

    ws.on('message', async (rawMessage) => {
        let parsed;
        try {
            parsed = JSON.parse(rawMessage.toString());
        } catch {
            parsed = { type: 'user-speech', text: rawMessage.toString() };
        }

        // Handle topic/settings update from frontend
        if (parsed.type === 'config') {
            currentTopic = parsed.topic || currentTopic;
            initSystemPrompt();
            console.log(`⚙️ Topic updated to: ${currentTopic}`);
            return;
        }

        const userText = parsed.text;
        if (!userText) return;

        console.log(`🎤 User said: "${userText}"`);
        conversationHistory.push({ role: "user", content: userText });

        // Keep system prompt + last 12 turns for strong context
        if (conversationHistory.length > 13) {
            conversationHistory = [conversationHistory[0], ...conversationHistory.slice(-12)];
        }

        try {
            const response = await groq.chat.completions.create({
                messages: conversationHistory,
                model: "openai/gpt-oss-20b",
                response_format: { type: "json_object" }
            });

            const aiData = JSON.parse(response.choices[0].message.content);
            conversationHistory.push({ role: "assistant", content: aiData.tutor_reply });
            console.log(`🤖 Tutor replied: "${aiData.tutor_reply}"`);

            // Save grammar mistakes to SQLite
            if (aiData.grammar && aiData.grammar.length > 0) {
                const stmt = db.prepare("INSERT INTO grammar_history (mistake, correction, reason) VALUES (?, ?, ?)");
                aiData.grammar.forEach(g => stmt.run(g.mistake, g.correction, g.reason));
                stmt.finalize();
            }

            // Save vocabulary to SQLite
            if (aiData.vocabulary && aiData.vocabulary.length > 0) {
                const stmt = db.prepare("INSERT INTO vocabulary_history (word, english_meaning, marathi_meaning, example) VALUES (?, ?, ?, ?)");
                aiData.vocabulary.forEach(v => stmt.run(v.word, v.english_meaning, v.marathi_meaning, v.example));
                stmt.finalize();
            }

            ws.send(JSON.stringify({ type: 'ai-reply', payload: aiData }));
        } catch (error) {
            console.error("❌ Groq Error:", error);
        }
    });

    ws.on('close', () => {
        console.log('🔴 Session Stopped: Frontend disconnected (Server still ready)');
    });
});