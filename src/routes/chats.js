// src/routes/chats.js
const express = require('express');
const router = express.Router();
const db = require('../db/index');
const { phoneFilterMiddleware } = require('../middleware/phoneFilter');

const REACTIONS = ['🔥', '💀', '😭', '😤', '👀', '💯', '🤡', '🫡'];
const EDIT_WINDOW_MS = 5 * 60 * 1000;

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login karo pehle 🙄' });
  const user = db.prepare('SELECT is_blocked FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.is_blocked) { req.session.destroy(() => {}); return res.status(403).json({ error: 'You are blocked 🚫' }); }
  next();
}

function getReactionSummary(type, id) {
  const rows = db.prepare(`SELECT reaction_type, COUNT(*) as count FROM reactions WHERE target_type = ? AND target_id = ? GROUP BY reaction_type`).all(type, id);
  const map = {};
  for (const r of rows) map[r.reaction_type] = r.count;
  return map;
}

router.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories').all());
});

router.get('/chats/:categorySlug', (req, res) => {
  try {
    const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.categorySlug);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const chats = db.prepare(`
      SELECT c.id, c.content, c.created_at, c.updated_at, u.display_name as author, u.username,
        (SELECT COUNT(*) FROM comments WHERE chat_id = c.id AND is_deleted = 0) as comment_count,
        (SELECT COUNT(*) FROM reactions WHERE target_type = 'chat' AND target_id = c.id) as reaction_count
      FROM chats c JOIN users u ON c.user_id = u.id
      WHERE c.category_id = ? AND c.is_deleted = 0
      ORDER BY c.created_at DESC LIMIT ? OFFSET ?
    `).all(cat.id, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) as count FROM chats WHERE category_id = ? AND is_deleted = 0`).get(cat.id).count;
    res.json({ chats, total, page, pages: Math.ceil(total / limit), category: cat });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/chats/:categorySlug', requireAuth, phoneFilterMiddleware, (req, res) => {
  try {
    const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.categorySlug);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    let { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Kuch toh likho yaar 😭' });
    if (content.length > 1000) return res.status(400).json({ error: 'Max 1000 characters!' });
    const result = db.prepare(`INSERT INTO chats (user_id, category_id, content) VALUES (?, ?, ?)`).run(req.session.userId, cat.id, content.trim());
    const chat = db.prepare(`SELECT c.*, u.display_name as author, u.username FROM chats c JOIN users u ON c.user_id = u.id WHERE c.id = ?`).get(result.lastInsertRowid);
    res.json({ success: true, chat });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/thread/:chatId', (req, res) => {
  try {
    const chat = db.prepare(`SELECT c.*, u.display_name as author, u.username FROM chats c JOIN users u ON c.user_id = u.id WHERE c.id = ? AND c.is_deleted = 0`).get(req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'Rant not found 👻' });
    const comments = db.prepare(`SELECT cm.*, u.display_name as author, u.username FROM comments cm JOIN users u ON cm.user_id = u.id WHERE cm.chat_id = ? AND cm.is_deleted = 0 ORDER BY cm.created_at ASC`).all(req.params.chatId);
    const userChatReaction = req.session.userId ? db.prepare('SELECT reaction_type FROM reactions WHERE target_type=? AND target_id=? AND user_id=?').get('chat', chat.id, req.session.userId)?.reaction_type || null : null;
    const commentsOut = comments.map(c => ({
      ...c,
      reactions: getReactionSummary('comment', c.id),
      userReaction: req.session.userId ? db.prepare('SELECT reaction_type FROM reactions WHERE target_type=? AND target_id=? AND user_id=?').get('comment', c.id, req.session.userId)?.reaction_type || null : null,
      canEdit: req.session.userId === c.user_id && (Date.now() - c.created_at * 1000) < EDIT_WINDOW_MS
    }));
    res.json({ chat: { ...chat, reactions: getReactionSummary('chat', chat.id), userReaction: userChatReaction, canEdit: req.session.userId === chat.user_id && (Date.now() - chat.created_at * 1000) < EDIT_WINDOW_MS }, comments: commentsOut });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/thread/:chatId/comments', requireAuth, phoneFilterMiddleware, (req, res) => {
  try {
    const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND is_deleted = 0').get(req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    let { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Empty comment? 😒' });
    if (content.length > 500) return res.status(400).json({ error: 'Max 500 chars' });
    const result = db.prepare(`INSERT INTO comments (chat_id, user_id, content) VALUES (?, ?, ?)`).run(req.params.chatId, req.session.userId, content.trim());
    const comment = db.prepare(`SELECT cm.*, u.display_name as author, u.username FROM comments cm JOIN users u ON cm.user_id = u.id WHERE cm.id = ?`).get(result.lastInsertRowid);
    res.json({ success: true, comment: { ...comment, reactions: {}, userReaction: null, canEdit: true } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/edit/chat/:id', requireAuth, phoneFilterMiddleware, (req, res) => {
  try {
    const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND is_deleted = 0').get(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Not found' });
    if (chat.user_id !== req.session.userId) return res.status(403).json({ error: 'Not yours!' });
    if ((Date.now() - chat.created_at * 1000) > EDIT_WINDOW_MS) return res.status(403).json({ error: 'Edit window closed! 5 mins only ⏰' });
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Empty?' });
    db.prepare('UPDATE chats SET content = ?, updated_at = unixepoch() WHERE id = ?').run(content.trim(), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.patch('/edit/comment/:id', requireAuth, phoneFilterMiddleware, (req, res) => {
  try {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND is_deleted = 0').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Not found' });
    if (comment.user_id !== req.session.userId) return res.status(403).json({ error: 'Not yours!' });
    if ((Date.now() - comment.created_at * 1000) > EDIT_WINDOW_MS) return res.status(403).json({ error: 'Edit window closed! ⏰' });
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Empty?' });
    db.prepare('UPDATE comments SET content = ?, updated_at = unixepoch() WHERE id = ?').run(content.trim(), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/react', requireAuth, (req, res) => {
  try {
    const { targetType, targetId, reactionType } = req.body;
    if (!['chat', 'comment'].includes(targetType)) return res.status(400).json({ error: 'Invalid type' });
    if (!REACTIONS.includes(reactionType)) return res.status(400).json({ error: 'Invalid reaction' });
    const existing = db.prepare(`SELECT * FROM reactions WHERE target_type=? AND target_id=? AND user_id=?`).get(targetType, targetId, req.session.userId);
    if (existing) {
      if (existing.reaction_type === reactionType) { db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id); }
      else { db.prepare('UPDATE reactions SET reaction_type = ? WHERE id = ?').run(reactionType, existing.id); }
    } else {
      db.prepare(`INSERT INTO reactions (target_type, target_id, user_id, reaction_type) VALUES (?,?,?,?)`).run(targetType, targetId, req.session.userId, reactionType);
    }
    const reactions = getReactionSummary(targetType, targetId);
    const userReaction = db.prepare(`SELECT reaction_type FROM reactions WHERE target_type=? AND target_id=? AND user_id=?`).get(targetType, targetId, req.session.userId)?.reaction_type || null;
    res.json({ success: true, reactions, userReaction });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
