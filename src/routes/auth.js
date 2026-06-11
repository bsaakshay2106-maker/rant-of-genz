// src/routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../db/index');

// Sanitize username - only allow letters, numbers, spaces
function sanitizeName(name) {
  return name.trim().replace(/[^a-zA-Z0-9\s\u0900-\u097F]/g, '').substring(0, 30);
}

// POST /api/auth/login - login or auto-register
router.post('/login', (req, res) => {
  try {
    let { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required to rant!' });
    }

    name = sanitizeName(name);
    if (!name) {
      return res.status(400).json({ error: 'Give us a real name bestie 😭' });
    }

    // Normalize name base (lowercase, no spaces for uniqueness check)
    const nameBase = name.toLowerCase().replace(/\s+/g, '');

    // Find how many users already have this name base
    const existing = db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE name_base = ?
    `).get(nameBase);

    const nameNumber = existing.count; // 0 = first, 1 = second (shown as "name 2"), etc.
    const username = nameNumber === 0 ? nameBase : `${nameBase}${nameNumber + 1}`;
    const displayName = nameNumber === 0 ? name : `${name} ${nameNumber + 1}`;

    // Check if this exact username already exists (returning user)
    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      // New user - register them
      const result = db.prepare(`
        INSERT INTO users (username, display_name, name_base, name_number)
        VALUES (?, ?, ?, ?)
      `).run(username, displayName, nameBase, nameNumber);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: 'You have been blocked from this platform. 🚫' });
    }

    // Update last seen
    db.prepare('UPDATE users SET last_seen = unixepoch() WHERE id = ?').run(user.id);

    // Store in session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.displayName = user.display_name;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        isAdmin: user.is_admin === 1
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server blew up 💥 try again' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?')
    .get(req.session.userId);

  if (!user || user.is_blocked) {
    req.session.destroy(() => {});
    return res.json({ user: null });
  }

  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      isAdmin: user.is_admin === 1
    }
  });
});

module.exports = router;
