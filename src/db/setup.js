// src/db/setup.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/rant_genz.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    name_base TEXT NOT NULL,
    name_number INTEGER DEFAULT 0,
    is_blocked INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    last_seen INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    emoji TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL CHECK(target_type IN ('chat', 'comment')),
    target_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reaction_type TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(target_type, target_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    user_id INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_chats_category ON chats(category_id);
  CREATE INDEX IF NOT EXISTS idx_chats_created ON chats(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_chat ON comments(chat_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
`);

// Seed categories
const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (slug, label, emoji, description) VALUES (?, ?, ?, ?)
`);

insertCategory.run('genz-bahu', 'GenZ Bahu', '👰', 'Bahus fighting back against saas-bahu drama');
insertCategory.run('genz-employee', 'GenZ Employee', '💼', 'Office rants, toxic bosses, manager menace');
insertCategory.run('genz-youth', 'GenZ Youth', '🔥', 'Youth vs Neta, system rants, society drama');

// Create default admin if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare(`
    INSERT INTO users (username, display_name, name_base, name_number, is_admin)
    VALUES ('admin', 'Admin', 'admin', 0, 1)
  `).run();
}

console.log('✅ Database setup complete');
module.exports = db;
