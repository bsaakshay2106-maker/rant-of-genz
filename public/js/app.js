// public/js/app.js
'use strict';

// ══ STATE ══
const state = {
  user: null,
  currentCategory: null,
  currentChatId: null,
  currentPage: 1,
  editTimers: {}
};

const REACTIONS = ['🔥', '💀', '😭', '😤', '👀', '💯', '🤡', '🫡'];
const AVATAR_COLORS = 6;

// ══ UTILS ══
function avatarColor(username) {
  let n = 0;
  for (let c of (username || '?')) n += c.charCodeAt(0);
  return n % AVATAR_COLORS;
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function timeAgo(ts) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ══ AUTH ══
async function doLogin() {
  const nameInput = document.getElementById('name-input');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); showToast('Enter your name first!', 'error'); return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Loading...';

  try {
    const data = await api('/auth/login', { method: 'POST', body: { name } });
    state.user = data.user;
    enterApp();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = "Let's Rant Up 🔥";
  }
}

document.getElementById('name-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

async function doLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch(e) {}
  state.user = null;
  showPage('landing-page');
  document.getElementById('name-input').value = '';
}

function enterApp() {
  document.getElementById('header-username').textContent = state.user.displayName;
  if (state.user.isAdmin) {
    document.getElementById('admin-link').style.display = 'inline';
  }
  showPage('app-page');
  loadCategories();
}

// ══ PAGE MANAGEMENT ══
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => {
    v.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function showCategories() {
  showView('categories-view');
  state.currentCategory = null;
  state.currentChatId = null;
}

// ══ CATEGORIES ══
async function loadCategories() {
  showView('categories-view');
  try {
    const cats = await api('/categories');
    const container = document.getElementById('category-cards-container');
    container.innerHTML = cats.map(cat => renderCategoryCard(cat)).join('');
  } catch (err) {
    showToast('Failed to load categories', 'error');
  }
}

function renderCategoryCard(cat) {
  return `
    <div class="category-card" data-slug="${cat.slug}" onclick="openCategory('${cat.slug}', '${escHtml(cat.label)}', '${cat.emoji}')">
      <span class="card-emoji">${cat.emoji}</span>
      <div class="card-label">${escHtml(cat.label)}</div>
      <div class="card-desc">${escHtml(cat.description || '')}</div>
      <div class="card-meta">
        <span class="card-count">loading rants...</span>
        <span class="card-arrow">→</span>
      </div>
    </div>
  `;
}

// ══ CHAT LIST ══
async function openCategory(slug, label, emoji) {
  state.currentCategory = { slug, label, emoji };
  state.currentPage = 1;
  showView('chat-list-view');
  document.getElementById('chat-list-title').textContent = `${emoji} ${label}`;
  await loadChatList();
}

async function loadChatList(page = 1) {
  state.currentPage = page;
  const container = document.getElementById('chat-list-container');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading rants...</div>';

  try {
    const data = await api(`/chats/${state.currentCategory.slug}?page=${page}`);
    if (data.chats.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="emoji">😶</span>
          <h3>No rants yet...</h3>
          <p>Be the first one to break the silence 🔥</p>
        </div>
      `;
    } else {
      container.innerHTML = data.chats.map(renderRantCard).join('');
    }
    renderPagination(data.page, data.pages);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><span class="emoji">💀</span><h3>Failed to load</h3><p>${err.message}</p></div>`;
  }
}

function renderRantCard(chat) {
  const av = avatarColor(chat.username);
  return `
    <div class="rant-card" onclick="openThread(${chat.id})">
      <div class="rant-card-author">
        <div class="author-avatar av-${av}">${initials(chat.author)}</div>
        <div>
          <div class="author-name">${escHtml(chat.author)}</div>
          <div class="author-handle">@${escHtml(chat.username)}</div>
        </div>
        <div class="rant-time">${timeAgo(chat.created_at)}</div>
      </div>
      <div class="rant-content">${escHtml(chat.content)}</div>
      <div class="rant-footer">
        <span class="rant-stat">💬 ${chat.comment_count}</span>
        <span class="rant-stat">⚡ ${chat.reaction_count}</span>
        ${chat.updated_at > chat.created_at ? '<span class="edited-badge">edited</span>' : ''}
      </div>
    </div>
  `;
}

function renderPagination(page, pages) {
  const el = document.getElementById('chat-list-pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  if (page > 1) html += `<button class="page-btn" onclick="loadChatList(${page-1})">← Prev</button>`;
  for (let i = Math.max(1, page-2); i <= Math.min(pages, page+2); i++) {
    html += `<button class="page-btn ${i===page?'active':''}" onclick="loadChatList(${i})">${i}</button>`;
  }
  if (page < pages) html += `<button class="page-btn" onclick="loadChatList(${page+1})">Next →</button>`;
  el.innerHTML = html;
}

// ══ THREAD / COMMENTS ══
async function openThread(chatId) {
  state.currentChatId = chatId;
  showView('thread-view');
  const container = document.getElementById('thread-container');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading thread...</div>';

  try {
    const data = await api(`/thread/${chatId}`);
    renderThread(data);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><span class="emoji">💀</span><h3>Failed to load</h3><p>${err.message}</p></div>`;
  }
}

function backToChatList() {
  showView('chat-list-view');
  // Clear edit timers
  for (const k in state.editTimers) clearInterval(state.editTimers[k]);
  state.editTimers = {};
}

function renderThread(data) {
  const { chat, comments } = data;
  const container = document.getElementById('thread-container');
  const av = avatarColor(chat.username);

  let html = `
    <div class="original-rant">
      <div class="rant-card-author" style="margin-bottom:1rem">
        <div class="author-avatar av-${av}">${initials(chat.author)}</div>
        <div>
          <div class="author-name">${escHtml(chat.author)}</div>
          <div class="author-handle">@${escHtml(chat.username)}</div>
        </div>
        <div class="rant-time">${timeAgo(chat.created_at)} ${chat.updated_at > chat.created_at ? '· <span class="edited-badge">edited</span>' : ''}</div>
      </div>
      <div class="rant-content" id="chat-content-${chat.id}">${escHtml(chat.content)}</div>
      <div class="reaction-bar" id="reactions-chat-${chat.id}">
        ${renderReactionPicker('chat', chat.id, chat.reactions, chat.userReaction)}
      </div>
      ${chat.canEdit ? renderEditBlock('chat', chat.id, chat.content, chat.created_at) : ''}
    </div>

    <div class="comment-compose" id="comment-compose">
      <textarea
        class="comment-textarea"
        id="comment-input"
        placeholder="Drop your take... 🔥"
        maxlength="500"
        oninput="updateCommentCharCount()"
      ></textarea>
      <div class="compose-footer">
        <span class="char-count" id="comment-char">0 / 500</span>
        <button class="btn-submit-comment" onclick="submitComment(${chat.id})">Post Comment</button>
      </div>
    </div>

    <div class="comments-section">
      <div class="comments-header">
        Comments
        <span class="count-badge">${comments.length}</span>
      </div>
      <div id="comments-list">
        ${comments.length === 0 
          ? '<div class="empty-state"><span class="emoji">🫥</span><h3>No takes yet</h3><p>Be first to react!</p></div>'
          : comments.map(c => renderComment(c)).join('')
        }
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Start edit timers
  if (chat.canEdit) startEditTimer('chat', chat.id, chat.created_at);
  comments.forEach(c => {
    if (c.canEdit) startEditTimer('comment', c.id, c.created_at);
  });
}

function renderComment(c) {
  const av = avatarColor(c.username);
  return `
    <div class="comment-item" id="comment-item-${c.id}">
      <div class="rant-card-author">
        <div class="author-avatar av-${av}" style="width:28px;height:28px;font-size:0.65rem;">${initials(c.author)}</div>
        <div>
          <div class="author-name" style="font-size:0.85rem">${escHtml(c.author)}</div>
          <div class="author-handle">@${escHtml(c.username)}</div>
        </div>
        <div class="rant-time">${timeAgo(c.created_at)} ${c.updated_at > c.created_at ? '· <span class="edited-badge">edited</span>' : ''}</div>
      </div>
      <div class="rant-content" style="font-size:0.9rem;margin-top:0.5rem" id="comment-content-${c.id}">${escHtml(c.content)}</div>
      <div class="reaction-bar" id="reactions-comment-${c.id}" style="margin-top:0.5rem">
        ${renderReactionPicker('comment', c.id, c.reactions, c.userReaction)}
      </div>
      ${c.canEdit ? renderEditBlock('comment', c.id, c.content, c.created_at) : ''}
    </div>
  `;
}

function renderReactionPicker(type, id, reactions, userReaction) {
  const activeReactions = Object.entries(reactions || {}).filter(([, v]) => v > 0);
  let html = '';

  // Show existing reactions
  for (const [emoji, count] of activeReactions) {
    const active = userReaction === emoji ? 'active' : '';
    html += `<button class="reaction-btn ${active}" onclick="doReact('${type}', ${id}, '${emoji}')" title="React with ${emoji}">
      ${emoji} <span class="count">${count}</span>
    </button>`;
  }

  // Add reaction picker
  html += `<div class="reaction-picker">`;
  for (const emoji of REACTIONS) {
    if (!reactions || !reactions[emoji]) {
      html += `<button class="reaction-pick-btn" onclick="doReact('${type}', ${id}, '${emoji}')" title="${emoji}">${emoji}</button>`;
    }
  }
  html += `</div>`;

  return html;
}

function renderEditBlock(type, id, content, createdAt) {
  return `
    <div class="edit-actions" id="edit-actions-${type}-${id}">
      <button class="btn-edit" onclick="startEdit('${type}', ${id}, this)">✏️ Edit</button>
      <span class="edit-timer" id="edit-timer-${type}-${id}"></span>
    </div>
  `;
}

// ══ REACTIONS ══
async function doReact(type, id, emoji) {
  if (!state.user) { showToast('Login to react!', 'error'); return; }
  try {
    const data = await api('/react', {
      method: 'POST',
      body: { targetType: type, targetId: id, reactionType: emoji }
    });
    // Update reaction bar in place
    const bar = document.getElementById(`reactions-${type}-${id}`);
    if (bar) bar.innerHTML = renderReactionPicker(type, id, data.reactions, data.userReaction);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ══ EDIT ══
function startEditTimer(type, id, createdAt) {
  const key = `${type}-${id}`;
  const timerEl = () => document.getElementById(`edit-timer-${type}-${id}`);
  const actionsEl = () => document.getElementById(`edit-actions-${type}-${id}`);
  const FIVE_MIN = 5 * 60 * 1000;

  const tick = () => {
    const remaining = FIVE_MIN - (Date.now() - createdAt * 1000);
    const el = timerEl();
    const actions = actionsEl();
    if (!el) { clearInterval(state.editTimers[key]); return; }
    if (remaining <= 0) {
      if (actions) actions.style.display = 'none';
      clearInterval(state.editTimers[key]);
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.textContent = `⏰ ${mins}:${secs.toString().padStart(2, '0')}`;
    if (remaining < 60000) el.className = 'edit-timer urgent';
  };

  tick();
  state.editTimers[key] = setInterval(tick, 1000);
}

function startEdit(type, id, btn) {
  const contentEl = document.getElementById(`${type}-content-${id}`);
  if (!contentEl) return;
  const current = contentEl.textContent;

  const actionsEl = document.getElementById(`edit-actions-${type}-${id}`);
  
  contentEl.innerHTML = `
    <textarea class="inline-edit-area" id="edit-area-${type}-${id}">${escHtml(current)}</textarea>
    <div class="edit-actions" style="margin-top:6px">
      <button class="btn-save-edit" onclick="saveEdit('${type}', ${id})">Save ✓</button>
      <button class="btn-cancel-edit" onclick="cancelEdit('${type}', ${id}, \`${escHtml(current).replace(/`/g,"'")}\`)">Cancel</button>
    </div>
  `;
  if (actionsEl) actionsEl.style.display = 'none';
  document.getElementById(`edit-area-${type}-${id}`)?.focus();
}

async function saveEdit(type, id) {
  const textarea = document.getElementById(`edit-area-${type}-${id}`);
  if (!textarea) return;
  const content = textarea.value.trim();
  if (!content) { showToast('Empty? Really?', 'error'); return; }

  try {
    await api(`/edit/${type}/${id}`, { method: 'PATCH', body: { content } });
    const contentEl = document.getElementById(`${type}-content-${id}`);
    if (contentEl) contentEl.innerHTML = escHtml(content);
    
    const actionsEl = document.getElementById(`edit-actions-${type}-${id}`);
    if (actionsEl) actionsEl.style.display = '';
    
    showToast('Edited! ✓', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    const contentEl = document.getElementById(`${type}-content-${id}`);
    if (contentEl) contentEl.innerHTML = escHtml(textarea.value);
  }
}

function cancelEdit(type, id, original) {
  const contentEl = document.getElementById(`${type}-content-${id}`);
  if (contentEl) contentEl.innerHTML = original;
  const actionsEl = document.getElementById(`edit-actions-${type}-${id}`);
  if (actionsEl) actionsEl.style.display = '';
}

// ══ NEW RANT ══
let selectedLabels = new Set();

function toggleLabel(el) {
  const label = el.textContent.trim();
  if (selectedLabels.has(label)) {
    selectedLabels.delete(label);
    el.classList.remove('selected');
  } else {
    selectedLabels.add(label);
    el.classList.add('selected');
  }
}

function openNewRantModal() {
  document.getElementById('new-rant-modal').classList.add('open');
  document.getElementById('new-rant-text').focus();
  document.getElementById('new-rant-text').value = '';
  document.getElementById('rant-char-count').textContent = '0 / 1000';
  selectedLabels.clear();
  document.querySelectorAll('.label-pill').forEach(p => p.classList.remove('selected'));
}

function closeNewRantModal() {
  document.getElementById('new-rant-modal').classList.remove('open');
}

function updateRantCharCount() {
  const len = document.getElementById('new-rant-text').value.length;
  document.getElementById('rant-char-count').textContent = `${len} / 1000`;
}

document.getElementById('new-rant-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('new-rant-modal')) closeNewRantModal();
});

async function submitNewRant() {
  const textarea = document.getElementById('new-rant-text');
  let content = textarea.value.trim();

  if (selectedLabels.size > 0) {
    content = `[${Array.from(selectedLabels).join(' · ')}]\n\n${content}`;
  }

  if (!content || content.trim() === '') {
    showToast('Write something first!', 'error'); return;
  }

  const btn = document.querySelector('.btn-post-rant');
  btn.disabled = true; btn.textContent = 'Posting...';

  try {
    await api(`/chats/${state.currentCategory.slug}`, { method: 'POST', body: { content } });
    closeNewRantModal();
    showToast('Rant posted! 🔥', 'success');
    loadChatList(1);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Post Rant 🔥';
  }
}

// ══ COMMENT ══
function updateCommentCharCount() {
  const len = document.getElementById('comment-input')?.value.length || 0;
  const el = document.getElementById('comment-char');
  if (el) {
    el.textContent = `${len} / 500`;
    el.className = `char-count${len > 480 ? ' warn' : ''}${len >= 500 ? ' over' : ''}`;
  }
}

async function submitComment(chatId) {
  const input = document.getElementById('comment-input');
  const content = input?.value.trim();
  if (!content) { showToast('Write something!', 'error'); return; }

  const btn = document.querySelector('.btn-submit-comment');
  btn.disabled = true; btn.textContent = 'Posting...';

  try {
    const data = await api(`/thread/${chatId}/comments`, { method: 'POST', body: { content } });
    input.value = '';
    updateCommentCharCount();

    const list = document.getElementById('comments-list');
    // Remove empty state if exists
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Append new comment
    const div = document.createElement('div');
    div.innerHTML = renderComment({ ...data.comment, canEdit: true });
    list.appendChild(div.firstElementChild);

    // Update comment count in header
    const countBadge = document.querySelector('.count-badge');
    if (countBadge) countBadge.textContent = parseInt(countBadge.textContent || 0) + 1;

    // Start edit timer
    if (data.comment.canEdit) startEditTimer('comment', data.comment.id, data.comment.created_at);

    showToast('Comment posted! 🫡', 'success');

    // Scroll to new comment
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Post Comment';
  }
}

// ══ XSS PROTECTION ══
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

// ══ INIT ══
async function init() {
  try {
    const data = await api('/auth/me');
    if (data.user) {
      state.user = data.user;
      enterApp();
    } else {
      showPage('landing-page');
    }
  } catch (e) {
    showPage('landing-page');
  }
}

init();
