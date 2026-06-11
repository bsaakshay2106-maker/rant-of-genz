// src/server.js
require('./db/setup'); // Run DB setup on start

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'genz-rant-secret-change-in-prod-pls';

// Trust proxy for deployed environments
app.set('trust proxy', 1);

// Security + performance
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, chill for a bit 😤' }
});

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts 🚫' }
});

const postLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: { error: 'Posting too fast! Breathe 😤' }
});

// Session - use memory store for simplicity (fine for single instance)
// For multi-instance, swap with connect-sqlite3 or redis
const SqliteStore = require('./db/sessionStore');
app.use(session({
  store: new SqliteStore(),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax'
  }
}));

// Static files
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', apiLimiter, chatRoutes);
app.use('/api/admin', adminRoutes);

// Post rate limiting on write routes
app.use('/api/chats', postLimiter);
app.use('/api/thread', postLimiter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server crashed 💥' });
});

app.listen(PORT, () => {
  console.log(`🔥 Rant of GenZ is LIVE on port ${PORT}`);
  console.log(`🌐 Open: http://localhost:${PORT}`);
  console.log(`🛡️ Admin panel: http://localhost:${PORT}/admin.html`);
});

module.exports = app;
