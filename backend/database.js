const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'tutor.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS grammar_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mistake TEXT,
        correction TEXT,
        reason TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS vocabulary_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT,
        english_meaning TEXT,
        marathi_meaning TEXT,
        example TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = db;