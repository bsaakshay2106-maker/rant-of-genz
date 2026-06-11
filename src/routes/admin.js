// src/routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../db/index');

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Admins only 🛡️' });
  next();
}

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 0').get().c;
  const blockedUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_blocked = 1').get().c;
  const totalChats = db.prepare('SELECT COUNT(*) as c FROM chats WHERE is_deleted = 0').get().c;
  const totalComments = db.prepare('SELECT COUNT(*) as c FROM comments WHERE is_deleted = 0').get().c;
  const totalReactions = db.prepare('SELECT COUNT(*) as c FROM reactions').get().c;
  const todayChats = db.prepare('SELECT COUNT(*) as c FROM chats WHERE created_at > unixepoch() - 86400').get().c;
  res.json({ totalUsers, blockedUsers, totalChats, totalComments, totalReactions, todayChats });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.is_blocked, u.created_at, u.last_seen,
      (SELECT COUNT(*) FROM chats WHERE user_id = u.id AND is_deleted = 0) as chat_count,
      (SELECT COUNT(*) FROM comments WHERE user_id = u.id AND is_deleted = 0) as comment_count
    FROM users u
    WHERE u.is_admin = 0 AND (u.username LIKE ? OR u.display_name LIKE ?)
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(`%${search}%`, `%${search}%`, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM users WHERE is_admin = 0 AND (username LIKE ? OR display_name LIKE ?)`).get(`%${search}%`, `%${search}%`).c;

  res.json({ users, total, page, pages: Math.ceil(total / limit) });
});

// PATCH /api/admin/users/:id/block
router.patch('/users/:id/block', requireAdmin, (req, res) => {
  const { blocked } = req.body;
  db.prepare('UPDATE users SET is_blocked = ? WHERE id = ? AND is_admin = 0').run(blocked ? 1 : 0, req.params.id);
  res.json({ success: true });
});

// GET /api/admin/chats
router.get('/chats', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;

  const chats = db.prepare(`
    SELECT c.id, c.content, c.is_deleted, c.created_at, 
      u.display_name as author, u.username,
      cat.label as category,
      (SELECT COUNT(*) FROM comments WHERE chat_id = c.id AND is_deleted = 0) as comment_count
    FROM chats c
    JOIN users u ON c.user_id = u.id
    JOIN categories cat ON c.category_id = cat.id
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM chats').get().c;
  res.json({ chats, total, page, pages: Math.ceil(total / limit) });
});

// DELETE /api/admin/chats/:id
router.delete('/chats/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE chats SET is_deleted = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// DELETE /api/admin/comments/:id
router.delete('/comments/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE comments SET is_deleted = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/admin/check - verify admin status
router.get('/check', (req, res) => {
  if (!req.session.userId) return res.json({ isAdmin: false });
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  res.json({ isAdmin: user?.is_admin === 1 || false });
});

module.exports = router;
