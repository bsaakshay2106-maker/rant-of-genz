# 🔥 Rant of GenZs

> The unfiltered rant platform for Gen-Z India. Saas-bahu drama. Boss nightmares. Neta nonsense.

---

## 🚀 Features

- **Zero-friction login** — just type your name, you're in. No password, no signup form.
- **Auto-numbered duplicates** — Two Akshays? First is `Akshay`, second is `Akshay 2` automatically.
- **3 Rant Categories:**
  - 👰 **GenZ Bahu** — saas-bahu drama rants
  - 💼 **GenZ Employee** — office, boss, manager rants
  - 🔥 **GenZ Youth** — neta, system, society rants
- **Threaded discussions** — click any rant to see the full thread and drop comments
- **8 Emoji reactions** — 🔥💀😭😤👀💯🤡🫡 (toggle on/off)
- **5-minute edit window** — edit your rant/comment within 5 minutes with countdown timer
- **No deletes** — once posted, it's there (only admins can remove)
- **Phone number auto-filter** — any text resembling a phone number is auto-stripped before publishing
- **Label pills** — tag your rant with pre-set vibes before posting
- **Admin panel** — `/admin.html` — view stats, block/unblock users, delete chats
- **Session persistence** — stay logged in for 30 days automatically

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | SQLite (via better-sqlite3) |
| Sessions | Custom SQLite session store |
| Frontend | Vanilla JS + CSS (no framework) |
| Fonts | Space Grotesk + Syne + DM Mono (Google Fonts) |
| Auth | Session-based (no JWT, no passwords) |

**Why this stack for scale?**
- SQLite in WAL mode handles thousands of concurrent reads
- Better-sqlite3 is synchronous and extremely fast (benchmarks often beat Postgres for read-heavy loads)
- No external database service = zero cost
- Compression + helmet + rate limiting built-in
- Deploy on Railway, Render, or Fly.io free tier

---

## 📦 Setup

### Local Development

```bash
# Clone the repo
git clone <your-repo-url>
cd rant-of-genz

# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Start development server
npm run dev
# OR
npm start
```

Open `http://localhost:3000`

---

## 🌐 Deploy (Free)

### Option 1: Railway (Recommended — easiest)

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Set environment variables:
   - `SESSION_SECRET` = any long random string (e.g. `openssl rand -hex 32`)
   - `NODE_ENV` = `production`
5. Railway auto-detects Node.js and runs `npm start`
6. Done! ✅

**Persistent storage note:** Railway gives you a mounted volume. Set `DB_PATH=/data/rant_genz.db` and add a volume mount at `/data` in Railway settings.

### Option 2: Render.com (Free tier)

1. Push to GitHub
2. New Web Service → Connect repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add env vars: `SESSION_SECRET`, `NODE_ENV=production`
6. Add a **Disk** at `/data` with 1GB
7. Set `DB_PATH=/data/rant_genz.db`

### Option 3: Fly.io (Best for scalability)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Launch (follow prompts)
flyctl launch

# Add volume for SQLite persistence
flyctl volumes create rantgenz_data --size 1

# Deploy
flyctl deploy
```

Add to `fly.toml`:
```toml
[mounts]
  source = "rantgenz_data"
  destination = "/data"
```

Set secrets:
```bash
flyctl secrets set SESSION_SECRET=$(openssl rand -hex 32)
flyctl secrets set DB_PATH=/data/rant_genz.db
flyctl secrets set NODE_ENV=production
```

---

## 🛡 Admin Panel

Visit `/admin.html` while logged in as admin.

**Default admin:** username is `admin`. To access the admin panel, just type `admin` as your name on the login screen.

**What admins can do:**
- View platform stats (total users, rants, comments, reactions)
- Search and browse all users
- Block / unblock users (blocked users can't comment or react)
- View all rants across categories
- Delete any rant

---

## 🔒 Phone Number Filter

Any text matching these patterns is auto-removed before publishing:
- 10-digit Indian mobile numbers (starting with 6-9)
- International format (+91XXXXXXXXXX)
- Numbers with spaces/dashes between them
- WhatsApp-style @numbers

Filtered text is replaced with `[📵 no numbers]`.

---

## 🎨 Theme

Dark theme, Gen-Z aesthetic:
- Background: Deep navy-black (#0a0a0f)
- Accent: Purple (#8b5cf6) + Pink (#ec4899)
- Typography: Syne (display) + Space Grotesk (body) + DM Mono (code/labels)
- Signature element: Floating scene tags on the landing page showing rant snippets

---

## 📁 Project Structure

```
rant-of-genz/
├── src/
│   ├── server.js          # Main Express server
│   ├── db/
│   │   ├── setup.js       # Schema + seed
│   │   ├── index.js       # DB connection
│   │   └── sessionStore.js # SQLite session store
│   ├── routes/
│   │   ├── auth.js        # Login/logout/me
│   │   ├── chats.js       # Chats, comments, reactions, edits
│   │   └── admin.js       # Admin endpoints
│   └── middleware/
│       └── phoneFilter.js # Strip phone numbers
├── public/
│   ├── index.html         # Main app (SPA)
│   ├── admin.html         # Admin panel
│   ├── css/style.css      # All styles
│   └── js/app.js          # All frontend JS
├── data/                  # SQLite DB (gitignored)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## ⚡ Scaling Notes

This app is designed to run cheaply at scale:

- **SQLite WAL mode** — multiple readers, one writer, no blocking
- **In-memory rate limiting** — 200 req/15min globally, 10 posts/min per IP
- **Compression** — all responses gzip'd
- **Static file caching** — 1 day cache in production
- **Session store** — SQLite-backed, cleaned up every 15 minutes
- **For multi-instance deploy** — swap session store to Redis (just change `SqliteStore` to `connect-redis`)

For 10k+ concurrent users, migrate to PostgreSQL (change `better-sqlite3` to `pg`, queries are compatible).

---

## 📝 License

MIT — do whatever you want with it ✌️
