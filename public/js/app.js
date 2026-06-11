'use strict';

const state = {
  user: null,
  currentCategory: null,
  currentChatId: null,
  currentPage: 1,
  editTimers: {},
  selectedLabels: new Set()
};

const REACTIONS = ['🔥', '💀', '😭', '😤', '👀', '💯', '🤡', '🫡'];

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function avatarColor(username) {
  let n = 0;
  for (const c of (username || '?')) n += c.charCodeAt(0);
  return n % 6;
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.getElementById(id).classList.add('active-view');
}

async function doLogin() {
  const input = document.getElementById('name-input');
  const btnText = document.getElementById('login-btn-text');
  const btn = document.getElementById('login-btn');
  const name = (input.value || '').trim();

  if (!name) {
    input.focus();
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 500);
    toast('Enter your name first!', 'error');
    return;
  }

  btn.disabled = true;
  btnText.textContent = 'Loading...';

  try {
    const data = await api('/auth/login', { method: 'POST', body: { name } });
    state.user = data.user;
    enterApp();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btnText.textContent = "Let's Rant Up 🔥";
  }
}

async function doLogout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
  state.user = null;
  document.getElementById('name-input').value = '';
  showPage('landing-page');
}

function enterApp() {
  document.getElementById('header-username').textContent = state.user.displayName;
  if (state.user.isAdmin) {
    document.getElementById('admin-link').style.display = 'inline';
  }
  showPage('app-page');
  loadCategories();
}

async function loadCategories() {
  showView('categories-view');
  const container = document.getElementById('category-cards-container');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const cats = await api('/categories');
    container.innerHTML = cats.map(cat => `
      <div class="category-card" data-slug="${cat.slug}" data-label="${esc(cat.label)}" data-emoji="${cat.emoji}">
        <span class="card-emoji">${cat.emoji}</span>
        <div class="card-label">${esc(cat.label)}</div>
        <div class="card-desc">${esc(cat.description || '')}</div>
        <div class="card-arrow">→</div>
      </div>
    `).join('');
    container.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        openCategory(card.dataset.slug, card.dataset.label, card.dataset.emoji);
      });
    });
  } catch (err) {
    container.innerHTML = `<p style="color:var(--red);padding:2rem">${err.message}</p>`;
  }
}

async function openCategory(slug, label, emoji) {
  state.currentCategory = { slug, label, emoji };
  state.currentPage = 1;
  document.getElementById('chat-list-title').textContent = `${emoji} ${label}`;
  showView('chat-list-view');
  await loadChatList(1);
}

async function loadChatList(page = 1) {
  state.currentPage = page;
  const container = document.getElementById('chat-list-container');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading rants...</div>';
  try {
    const data = await api(`/chats/${state.currentCategory.slug}?page=${page}`);
    if (!data.chats.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-emoji">😶</span>
          <h3>No rants yet...</h3>
          <p>Be the first to break the silence 🔥</p>
        </div>`;
    } else {
      container.innerHTML = data.chats.map(chat => `
        <div class="rant-card" data-id="${chat.id}">
          <div class="rant-card-author">
            <div class="author-avatar av-${avatarColor(chat.username)}">${initials(chat.author)}</div>
            <div class="author-info">
              <div class="author-name">${esc(chat.author)}</div>
              <div class="author-handle">@${esc(chat.username)}</div>
            </div>
            <div class="rant-time">${timeAgo(chat.created_at)}</div>
          </div>
          <div class="rant-content">${esc(chat.content)}</div>
          <div class="rant-footer">
            <span class="rant-stat">💬 ${chat.comment_count}</span>
            <span class="rant-stat">⚡ ${chat.reaction_count}</span>
            ${chat.updated_at > chat.created_at ? '<span class="edited-badge">edited</span>' : ''}
          </div>
        </div>
      `).join('');
      container.querySelectorAll('.rant-card').forEach(card => {
        card.addEventListener('click', () => openThread(parseInt(card.dataset.id)));
      });
    }
    renderPagination(data.page, data.pages);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><span class="empty-emoji">💀</span><h3>Failed to load</h3><p>${err.message}</p></div>`;
  }
}

function renderPagination(page, pages) {
  const el = document.getElementById('chat-list-pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  if (page > 1) html += `<button class="page-btn" data-page="${page-1}">← Prev</button>`;
  for (let i = Math.max(1, page-2); i <= Math.min(pages, page+2); i++) {
    html += `<button class="page-btn ${i===page?'active':''}" data-page="${i}">${i}</button>`;
  }
  if (page < pages) html += `<button class="page-btn" data-page="${page+1}">Next →</button>`;
  el.innerHTML = html;
  el.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => loadChatList(parseInt(btn.dataset.page)));
  });
}

async function openThread(chatId) {
  state.currentChatId = chatId;
  showView('thread-view');
  const container = document.getElementById('thread-container');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading thread...</div>';
  try {
    const data = await api(`/thread/${chatId}`);
    renderThread(data);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><span class="empty-emoji">💀</span><h3>Failed</h3><p>${err.message}</p></div>`;
  }
}

function renderThread({ chat, comments }) {
  const container = document.getElementById('thread-container');
  const av = avatarColor(chat.username);

  container.innerHTML = `
    <div class="original-rant">
      <div class="rant-card-author">
        <div class="author-avatar av-${av}">${initials(chat.author)}</div>
        <div class="author-info">
          <div class="author-name">${esc(chat.author)}</div>
          <div class="author-handle">@${esc(chat.username)}</div>
        </div>
        <div class="rant-time">${timeAgo(chat.created_at)}${chat.updated_at > chat.created_at ? ' · <span class="edited-badge">edited</span>' : ''}</div>
      </div>
      <div class="rant-content" id="chat-content-${chat.id}">${esc(chat.content)}</div>
      <div class="reaction-bar" id="reactions-chat-${chat.id}"></div>
      ${chat.canEdit ? `<div class="edit-actions" id="edit-actions-chat-${chat.id}">
        <button class="btn-edit" data-type="chat" data-id="${chat.id}">✏️ Edit</button>
        <span class="edit-timer" id="edit-timer-chat-${chat.id}"></span>
      </div>` : ''}
    </div>

    <div class="comment-compose">
      <textarea class="comment-textarea" id="comment-input" placeholder="Drop your take... 🔥" maxlength="500"></textarea>
      <div class="compose-footer">
        <span class="char-count" id="comment-char">0 / 500</span>
        <button class="btn-submit-comment" id="submit-comment-btn" data-chat-id="${chat.id}">Post 🔥</button>
      </div>
    </div>

    <div class="comments-section">
      <div class="comments-header">
        Comments <span class="count-badge" id="comment-count-badge">${comments.length}</span>
      </div>
      <div id="comments-list">
        ${comments.length === 0
          ? '<div class="empty-state"><span class="empty-emoji">🫥</span><h3>No takes yet</h3><p>Be first to react!</p></div>'
          : comments.map(c => renderCommentHTML(c)).join('')}
      </div>
    </div>
  `;

  updateReactionBar('chat', chat.id, chat.reactions, chat.userReaction);
  comments.forEach(c => updateReactionBar('comment', c.id, c.reactions, c.userReaction));

  if (chat.canEdit) {
    startEditTimer('chat', chat.id, chat.created_at);
    container.querySelector(`[data-type="chat"][data-id="${chat.id}"]`)
      ?.addEventListener('click', () => startEdit('chat', chat.id));
  }
  comments.forEach(c => {
    if (c.canEdit) {
      startEditTimer('comment', c.id, c.created_at);
      container.querySelector(`[data-type="comment"][data-id="${c.id}"]`)
        ?.addEventListener('click', () => startEdit('comment', c.id));
    }
  });

  const commentInput = document.getElementById('comment-input');
  commentInput.addEventListener('input', () => {
    const len = commentInput.value.length;
    const el = document.getElementById('comment-char');
    el.textContent = `${len} / 500`;
    el.className = `char-count${len > 450 ? ' warn' : ''}`;
  });

  document.getElementById('submit-comment-btn').addEventListener('click', () => {
    submitComment(chat.id);
  });
}

function renderCommentHTML(c) {
  const av = avatarColor(c.username);
  return `
    <div class="comment-item" id="comment-item-${c.id}">
      <div class="rant-card-author">
        <div class="author-avatar av-${av}" style="width:28px;height:28px;font-size:0.65rem">${initials(c.author)}</div>
        <div class="author-info">
          <div class="author-name" style="font-size:0.85rem">${esc(c.author)}</div>
          <div class="author-handle">@${esc(c.username)}</div>
        </div>
        <div class="rant-time">${timeAgo(c.created_at)}${c.updated_at > c.created_at ? ' · <span class="edited-badge">edited</span>' : ''}</div>
      </div>
      <div class="rant-content comment-text" id="comment-content-${c.id}">${esc(c.content)}</div>
      <div class="reaction-bar" id="reactions-comment-${c.id}"></div>
      ${c.canEdit ? `<div class="edit-actions" id="edit-actions-comment-${c.id}">
        <button class="btn-edit" data-type="comment" data-id="${c.id}">✏️ Edit</button>
        <span class="edit-timer" id="edit-timer-comment-${c.id}"></span>
      </div>` : ''}
    </div>
  `;
}

function updateReactionBar(type, id, reactions, userReaction) {
  const bar = document.getElementById(`reactions-${type}-${id}`);
  if (!bar) return;
  bar.innerHTML = '';
  Object.entries(reactions || {}).forEach(([emoji, count]) => {
    if (count <= 0) return;
    const btn = document.createElement('button');
    btn.className = `reaction-btn${userReaction === emoji ? ' active' : ''}`;
    btn.innerHTML = `${emoji} <span class="count">${count}</span>`;
    btn.addEventListener('click', () => doReact(type, id, emoji));
    bar.appendChild(btn);
  });
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  REACTIONS.forEach(emoji => {
    if (reactions && reactions[emoji]) return;
    const btn = document.createElement('button');
    btn.className = 'reaction-pick-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => doReact(type, id, emoji));
    picker.appendChild(btn);
  });
  bar.appendChild(picker);
}

async function doReact(type, id, emoji) {
  if (!state.user) { toast('Login to react!', 'error'); return; }
  try {
    const data = await api('/react', { method: 'POST', body: { targetType: type, targetId: id, reactionType: emoji } });
    updateReactionBar(type, id, data.reactions, data.userReaction);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function startEditTimer(type, id, createdAt) {
  const key = `${type}-${id}`;
  const FIVE_MIN = 5 * 60 * 1000;
  const tick = () => {
    const remaining = FIVE_MIN - (Date.now() - createdAt * 1000);
    const timerEl = document.getElementById(`edit-timer-${type}-${id}`);
    const actionsEl = document.getElementById(`edit-actions-${type}-${id}`);
    if (!timerEl) { clearInterval(state.editTimers[key]); return; }
    if (remaining <= 0) {
      if (actionsEl) actionsEl.style.display = 'none';
      clearInterval(state.editTimers[key]);
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `⏰ ${mins}:${secs.toString().padStart(2, '0')}`;
    timerEl.className = `edit-timer${remaining < 60000 ? ' urgent' : ''}`;
  };
  tick();
  state.editTimers[key] = setInterval(tick, 1000);
}

function startEdit(type, id) {
  const contentEl = document.getElementById(`${type}-content-${id}`);
  const actionsEl = document.getElementById(`edit-actions-${type}-${id}`);
  if (!contentEl) return;
  const current = contentEl.innerHTML.replace(/<br>/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
  contentEl.innerHTML = `<textarea class="inline-edit-area" id="edit-area-${type}-${id}"></textarea>
    <div class="edit-action-btns">
      <button class="btn-save-edit" id="save-edit-${type}-${id}">Save ✓</button>
      <button class="btn-cancel-edit" id="cancel-edit-${type}-${id}">Cancel</button>
    </div>`;
  const ta = document.getElementById(`edit-area-${type}-${id}`);
  ta.value = current;
  ta.focus();
  if (actionsEl) actionsEl.style.display = 'none';
  document.getElementById(`save-edit-${type}-${id}`).addEventListener('click', () => saveEdit(type, id));
  document.getElementById(`cancel-edit-${type}-${id}`).addEventListener('click', () => {
    contentEl.innerHTML = esc(current);
    if (actionsEl) actionsEl.style.display = '';
  });
}

async function saveEdit(type, id) {
  const ta = document.getElementById(`edit-area-${type}-${id}`);
  if (!ta) return;
  const content = ta.value.trim();
  if (!content) { toast('Empty?', 'error'); return; }
  try {
    await api(`/edit/${type}/${id}`, { method: 'PATCH', body: { content } });
    const contentEl = document.getElementById(`${type}-content-${id}`);
    if (contentEl) contentEl.innerHTML = esc(content);
    const actionsEl = document.getElementById(`edit-actions-${type}-${id}`);
    if (actionsEl) actionsEl.style.display = '';
    toast('Edited! ✓', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openNewRantModal() {
  document.getElementById('new-rant-modal').classList.add('open');
  document.getElementById('new-rant-text').focus();
  document.getElementById('new-rant-text').value = '';
  document.getElementById('rant-char-count').textContent = '0 / 1000';
  state.selectedLabels.clear();
  document.querySelectorAll('.label-pill').forEach(p => p.classList.remove('selected'));
}

function closeNewRantModal() {
  document.getElementById('new-rant-modal').classList.remove('open');
}

async function submitNewRant() {
  const textarea = document.getElementById('new-rant-text');
  const btn = document.getElementById('post-rant-btn');
  let content = textarea.value.trim();
  if (state.selectedLabels.size > 0) {
    content = `[${Array.from(state.selectedLabels).join(' · ')}]\n\n${content}`;
  }
  if (!content.trim()) { toast('Write something first!', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Posting...';
  try {
    await api(`/chats/${state.currentCategory.slug}`, { method: 'POST', body: { content } });
    closeNewRantModal();
    toast('Rant posted! 🔥', 'success');
    loadChatList(1);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Post Rant 🔥';
  }
}

async function submitComment(chatId) {
  const input = document.getElementById('comment-input');
  const btn = document.getElementById('submit-comment-btn');
  const content = (input.value || '').trim();
  if (!content) { toast('Write something!', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Posting...';
  try {
    const data = await api(`/thread/${chatId}/comments`, { method: 'POST', body: { content } });
    input.value = '';
    document.getElementById('comment-char').textContent = '0 / 500';
    const list = document.getElementById('comments-list');
    list.querySelector('.empty-state')?.remove();
    const div = document.createElement('div');
    div.innerHTML = renderCommentHTML({ ...data.comment, canEdit: true });
    const el = div.firstElementChild;
    list.appendChild(el);
    if (data.comment.canEdit) {
      startEditTimer('comment', data.comment.id, data.comment.created_at);
      el.querySelector(`[data-type="comment"][data-id="${data.comment.id}"]`)
        ?.addEventListener('click', () => startEdit('comment', data.comment.id));
    }
    updateReactionBar('comment', data.comment.id, {}, null);
    const badge = document.getElementById('comment-count-badge');
    if (badge) badge.textContent = parseInt(badge.textContent || 0) + 1;
    toast('Comment posted! 🫡', 'success');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Post 🔥';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('header-brand').addEventListener('click', () => { if (state.user) loadCategories(); });
  document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.getElementById('back-to-cats').addEventListener('click', loadCategories);
  document.getElementById('back-to-list').addEventListener('click', () => {
    Object.values(state.editTimers).forEach(t => clearInterval(t));
    state.editTimers = {};
    showView('chat-list-view');
  });
  document.getElementById('open-new-rant-btn').addEventListener('click', openNewRantModal);
  document.getElementById('close-modal-btn').addEventListener('click', closeNewRantModal);
  document.getElementById('post-rant-btn').addEventListener('click', submitNewRant);
  document.getElementById('new-rant-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('new-rant-modal')) closeNewRantModal();
  });
  document.getElementById('new-rant-text').addEventListener('input', () => {
    const len = document.getElementById('new-rant-text').value.length;
    document.getElementById('rant-char-count').textContent = `${len} / 1000`;
  });
  document.getElementById('rant-labels').addEventListener('click', e => {
    const pill = e.target.closest('.label-pill');
    if (!pill) return;
    const label = pill.textContent.trim();
    if (state.selectedLabels.has(label)) {
      state.selectedLabels.delete(label);
      pill.classList.remove('selected');
    } else {
      state.selectedLabels.add(label);
      pill.classList.add('selected');
    }
  });

  api('/auth/me').then(data => {
    if (data.user) { state.user = data.user; enterApp(); }
  }).catch(() => {});
});
