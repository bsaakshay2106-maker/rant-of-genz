// src/db/sessionStore.js
const db = require('./index');
const { Store } = require('express-session');

// Ensure sessions table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS http_sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expired ON http_sessions(expired);
`);

class SqliteStore extends Store {
  constructor(options = {}) {
    super(options);
    this.ttl = options.ttl || 86400; // 1 day default
    
    // Clean up expired sessions every 15 minutes
    setInterval(() => {
      try {
        db.prepare('DELETE FROM http_sessions WHERE expired < ?').run(Math.floor(Date.now() / 1000));
      } catch (e) {}
    }, 15 * 60 * 1000);
  }

  get(sid, callback) {
    try {
      const row = db.prepare('SELECT sess, expired FROM http_sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (row.expired < Math.floor(Date.now() / 1000)) {
        this.destroy(sid, () => {});
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, session, callback) {
    try {
      const maxAge = session.cookie?.maxAge || this.ttl * 1000;
      const expired = Math.floor(Date.now() / 1000) + Math.floor(maxAge / 1000);
      db.prepare(`
        INSERT OR REPLACE INTO http_sessions (sid, sess, expired) VALUES (?, ?, ?)
      `).run(sid, JSON.stringify(session), expired);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      db.prepare('DELETE FROM http_sessions WHERE sid = ?').run(sid);
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  touch(sid, session, callback) {
    try {
      const maxAge = session.cookie?.maxAge || this.ttl * 1000;
      const expired = Math.floor(Date.now() / 1000) + Math.floor(maxAge / 1000);
      db.prepare('UPDATE http_sessions SET expired = ? WHERE sid = ?').run(expired, sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = SqliteStore;
