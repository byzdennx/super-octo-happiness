/* ============================================================
   MyNotes — Frontend for EpanBase
   Auth endpoints:
     POST /rest/v1/auth/register   { email, password }
     POST /rest/v1/auth/login      { email, password }
   Data endpoints (Bearer token):
     GET/POST/PATCH/DELETE /rest/v1/notes
   ============================================================ */

// ==================== CONFIG ====================
const EPANBASE_URL = 'https://gentle-sea-6f11.siburianepan1.workers.dev';
const EPANBASE_KEY = 'epb_11bb9fc787df450c120d5aca67a759de07575e991f4afd07';

// ==================== STATE ====================
const state = {
    user: null,
    token: localStorage.getItem('mynotes_token') || null,
    notes: [],
    filter: 'all',
    view: 'grid',
    search: '',
    editingNote: null,
    selectedColor: '#FFE066',
};

// ==================== API HELPER ====================
const api = {
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'apikey': EPANBASE_KEY,
            ...(options.headers || {}),
        };

        if (state.token && !options.skipAuth) {
            headers['Authorization'] = `Bearer ${state.token}`;
        }

        let res;
        try {
            res = await fetch(`${EPANBASE_URL}${endpoint}`, {
                ...options,
                headers,
            });
        } catch (netErr) {
            throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
        }

        // Parse body
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

        if (!res.ok) {
            const msg =
                data?.message ||
                data?.error ||
                data?.error_description ||
                data?.msg ||
                `HTTP ${res.status} ${res.statusText}`;
            const err = new Error(msg);
            err.status = res.status;
            err.data = data;
            throw err;
        }

        return data;
    },

    /* ---------- AUTH ---------- */
    async register(email, password) {
        return this.request('/rest/v1/auth/register', {
            method: 'POST',
            skipAuth: true,
            body: JSON.stringify({ email, password }),
        });
    },

    async login(email, password) {
        return this.request('/rest/v1/auth/login', {
            method: 'POST',
            skipAuth: true,
            body: JSON.stringify({ email, password }),
        });
    },

    async me() {
        // Coba beberapa endpoint umum; kalau gagal, kita pakai data user dari localStorage
        try { return await this.request('/rest/v1/auth/me'); } catch (_) {}
        try { return await this.request('/rest/v1/auth/user'); } catch (_) {}
        try { return await this.request('/rest/v1/user'); } catch (_) {}
        return null;
    },

    /* ---------- NOTES ---------- */
    async getNotes() {
        const data = await this.request('/rest/v1/notes?select=*&order=is_pinned.desc,updated_at.desc');
        return normalizeList(data);
    },

    async createNote(note) {
        const data = await this.request('/rest/v1/notes', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(note),
        });
        return normalizeItem(data);
    },

    async updateNote(id, updates) {
        const data = await this.request(`/rest/v1/notes?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(updates),
        });
        return normalizeItem(data);
    },

    async deleteNote(id) {
        return this.request(`/rest/v1/notes?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
    },
};

// Normalizers — handle both array-of-objects and wrapped responses
function normalizeList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.results)) return data.results;
    return [];
}

function normalizeItem(data) {
    if (Array.isArray(data)) return data[0] || null;
    if (data?.data) {
        return Array.isArray(data.data) ? data.data[0] : data.data;
    }
    return data;
}

// Extract token from various possible login responses
function extractToken(resp) {
    if (!resp || typeof resp !== 'object') return null;
    return (
        resp.access_token ||
        resp.token ||
        resp.jwt ||
        resp.session?.access_token ||
        resp.data?.access_token ||
        resp.data?.token ||
        resp.data?.session?.access_token ||
        null
    );
}

function extractUser(resp, fallbackEmail) {
    const u =
        resp?.user ||
        resp?.data?.user ||
        resp?.session?.user ||
        resp?.data?.session?.user ||
        null;
    if (u) return u;
    return { email: fallbackEmail, id: null };
}

// ==================== DOM REFS ====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    authScreen: $('#authScreen'),
    app: $('#app'),
    authForm: $('#authForm'),
    email: $('#email'),
    password: $('#password'),
    authSubmit: $('#authSubmit'),
    authFooter: $('#authFooter'),
    authTabs: $$('.auth-tab'),

    userEmail: $('#userEmail'),
    userAvatar: $('#userAvatar'),
    logoutBtn: $('#logoutBtn'),
    newNoteBtn: $('#newNoteBtn'),
    emptyNewNoteBtn: $('#emptyNewNoteBtn'),

    navItems: $$('.nav-item'),
    countAll: $('#countAll'),
    countPinned: $('#countPinned'),
    countArchived: $('#countArchived'),

    searchInput: $('#searchInput'),
    viewBtns: $$('.view-btn'),
    viewTitle: $('#viewTitle'),
    noteCountLabel: $('#noteCountLabel'),
    notesContainer: $('#notesContainer'),
    emptyState: $('#emptyState'),

    editorModal: $('#editorModal'),
    editorBackdrop: $('#editorBackdrop'),
    noteTitle: $('#noteTitle'),
    noteContent: $('#noteContent'),
    noteUpdatedAt: $('#noteUpdatedAt'),
    saveNoteBtn: $('#saveNoteBtn'),
    closeEditorBtn: $('#closeEditorBtn'),
    pinNoteBtn: $('#pinNoteBtn'),
    archiveNoteBtn: $('#archiveNoteBtn'),
    deleteNoteBtn: $('#deleteNoteBtn'),
    colorSwatches: $$('.color-swatch'),

    toast: $('#toast'),
    mobileMenu: $('#mobileMenu'),
    sidebar: $('#sidebar'),
};

// ==================== AUTH MODE ====================
let authMode = 'login';

function setAuthMode(mode) {
    authMode = mode;
    dom.authTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === mode));
    dom.authSubmit.textContent = mode === 'login' ? 'Masuk' : 'Daftar';
    dom.authFooter.innerHTML = mode === 'login'
        ? 'Belum punya akun? <a href="#" id="switchAuth">Daftar sekarang</a>'
        : 'Sudah punya akun? <a href="#" id="switchAuth">Masuk di sini</a>';
    dom.password.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
    bindSwitchAuth();
}

function bindSwitchAuth() {
    const link = $('#switchAuth');
    if (!link) return;
    link.addEventListener('click', (e) => {
        e.preventDefault();
        setAuthMode(authMode === 'login' ? 'register' : 'login');
    });
}

dom.authTabs.forEach(tab => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.tab));
});

setAuthMode('login');

// ==================== AUTH HANDLER ====================
dom.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = dom.email.value.trim();
    const password = dom.password.value;

    if (!email || password.length < 6) {
        showToast('Email & password minimal 6 karakter', 'error');
        return;
    }

    dom.authSubmit.disabled = true;
    const originalText = dom.authSubmit.textContent;
    dom.authSubmit.textContent = authMode === 'login' ? 'Masuk...' : 'Mendaftar...';

    try {
        let resp;
        if (authMode === 'login') {
            resp = await api.login(email, password);
        } else {
            resp = await api.register(email, password);
        }

        // Kalau register sukses tanpa token → arahkan login
        let token = extractToken(resp);
        if (!token && authMode === 'register') {
            showToast('Registrasi berhasil. Silakan masuk.', 'success');
            setAuthMode('login');
            dom.password.value = '';
            return;
        }

        // Kalau register sukses tapi tidak ada token, coba login otomatis
        if (!token && authMode === 'register') {
            resp = await api.login(email, password);
            token = extractToken(resp);
        }

        if (!token) {
            throw new Error('Server tidak mengembalikan token. Cek respons API.');
        }

        state.token = token;
        state.user = extractUser(resp, email);

        localStorage.setItem('mynotes_token', token);
        localStorage.setItem('mynotes_user', JSON.stringify(state.user));

        await enterApp();
        showToast(`Selamat datang, ${state.user.email}!`, 'success');
    } catch (err) {
        console.error('[auth]', err, err.data);
        showToast(err.message || 'Autentikasi gagal', 'error');
    } finally {
        dom.authSubmit.disabled = false;
        dom.authSubmit.textContent = originalText;
    }
});

// ==================== APP INIT ====================
async function enterApp() {
    dom.authScreen.classList.add('hidden');
    dom.app.classList.remove('hidden');

    const email = state.user?.email || 'user@email.com';
    dom.userEmail.textContent = email;
    dom.userAvatar.textContent = (email[0] || 'U').toUpperCase();

    await loadNotes();
}

async function loadNotes() {
    dom.notesContainer.className = 'notes-container grid';
    dom.notesContainer.innerHTML = '<div class="loading-msg">Memuat catatan…</div>';
    dom.emptyState.classList.add('hidden');

    try {
        state.notes = await api.getNotes();
        renderNotes();
    } catch (err) {
        console.error('[loadNotes]', err, err.data);
        state.notes = [];
        renderNotes();

        if (err.status === 401) {
            showToast('Sesi berakhir. Silakan login ulang.', 'error');
            handleLogout(true);
            return;
        }
        showToast('Gagal memuat catatan: ' + err.message, 'error');
    }
}

// ==================== RENDER ====================
function getFilteredNotes() {
    let notes = [...state.notes];

    if (state.filter === 'pinned') {
        notes = notes.filter(n => n.is_pinned && !n.is_archived);
    } else if (state.filter === 'archived') {
        notes = notes.filter(n => n.is_archived);
    } else {
        notes = notes.filter(n => !n.is_archived);
    }

    if (state.search) {
        const q = state.search.toLowerCase();
        notes = notes.filter(n =>
            (n.title || '').toLowerCase().includes(q) ||
            (n.content || '').toLowerCase().includes(q)
        );
    }

    notes.sort((a, b) => {
        if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

    return notes;
}

function renderNotes() {
    const notes = getFilteredNotes();
    const container = dom.notesContainer;
    container.className = `notes-container ${state.view}`;

    const all = state.notes.filter(n => !n.is_archived);
    const pinned = state.notes.filter(n => n.is_pinned && !n.is_archived);
    const archived = state.notes.filter(n => n.is_archived);

    dom.countAll.textContent = all.length;
    dom.countPinned.textContent = pinned.length;
    dom.countArchived.textContent = archived.length;

    const titles = { all: 'Semua Catatan', pinned: 'Disematkan', archived: 'Arsip' };
    dom.viewTitle.textContent = titles[state.filter] || 'Catatan';
    dom.noteCountLabel.textContent = `${notes.length} catatan`;

    if (notes.length === 0) {
        container.innerHTML = '';
        dom.emptyState.classList.remove('hidden');
        return;
    }
    dom.emptyState.classList.add('hidden');

    container.innerHTML = notes.map(note => `
        <div class="note-card" style="background:${sanitizeColor(note.color)}" data-id="${escapeAttr(note.id)}">
            <div class="note-card-header">
                <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
                ${note.is_pinned ? '<span class="note-pin-badge">📌</span>' : ''}
            </div>
            <div class="note-card-content">${escapeHtml(note.content || 'Tidak ada konten…')}</div>
            <div class="note-card-footer">
                <span>${formatDate(note.updated_at || note.created_at)}</span>
                <div class="note-card-actions">
                    <button class="note-card-action" data-action="pin" data-id="${escapeAttr(note.id)}" title="${note.is_pinned ? 'Lepas sematan' : 'Sematkan'}">
                        ${note.is_pinned ? '📌' : '📍'}
                    </button>
                    <button class="note-card-action" data-action="archive" data-id="${escapeAttr(note.id)}" title="${note.is_archived ? 'Keluarkan dari arsip' : 'Arsipkan'}">
                        ${note.is_archived ? '📤' : '🗄️'}
                    </button>
                    <button class="note-card-action" data-action="delete" data-id="${escapeAttr(note.id)}" title="Hapus">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.note-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.note-card-action')) return;
            openEditor(card.dataset.id);
        });
    });

    container.querySelectorAll('.note-card-action').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { action, id } = btn.dataset;
            const note = state.notes.find(n => String(n.id) === String(id));
            if (!note) return;

            if (action === 'pin') {
                await quickUpdate(id, { is_pinned: !note.is_pinned });
            } else if (action === 'archive') {
                await quickUpdate(id, { is_archived: !note.is_archived });
            } else if (action === 'delete') {
                if (confirm('Hapus catatan ini?')) await deleteNoteById(id);
            }
        });
    });
}

async function quickUpdate(id, updates) {
    try {
        await api.updateNote(id, updates);
        const idx = state.notes.findIndex(n => String(n.id) === String(id));
        if (idx >= 0) {
            state.notes[idx] = { ...state.notes[idx], ...updates, updated_at: new Date().toISOString() };
        }
        renderNotes();
    } catch (err) {
        console.error('[quickUpdate]', err);
        showToast('Gagal memperbarui: ' + err.message, 'error');
    }
}

async function deleteNoteById(id) {
    try {
        await api.deleteNote(id);
        state.notes = state.notes.filter(n => String(n.id) !== String(id));
        renderNotes();
        showToast('Catatan dihapus', 'success');
    } catch (err) {
        console.error('[delete]', err);
        showToast('Gagal menghapus: ' + err.message, 'error');
    }
}

// ==================== EDITOR ====================
function openEditor(id) {
    const note = state.notes.find(n => String(n.id) === String(id));
    if (!note) return;

    state.editingNote = note;
    state.selectedColor = sanitizeColor(note.color);

    dom.noteTitle.value = note.title || '';
    dom.noteContent.value = note.content || '';
    dom.noteUpdatedAt.textContent = `Diperbarui ${formatDate(note.updated_at)}`;

    dom.pinNoteBtn.textContent = note.is_pinned ? '📌' : '📍';
    dom.archiveNoteBtn.textContent = note.is_archived ? '📤' : '🗄️';

    updateColorSwatches();
    dom.editorModal.classList.remove('hidden');
    setTimeout(() => dom.noteTitle.focus(), 100);
}

function openNewNote() {
    state.editingNote = null;
    state.selectedColor = '#FFE066';
    dom.noteTitle.value = '';
    dom.noteContent.value = '';
    dom.noteUpdatedAt.textContent = 'Catatan baru';
    dom.pinNoteBtn.textContent = '📍';
    dom.archiveNoteBtn.textContent = '🗄️';
    updateColorSwatches();
    dom.editorModal.classList.remove('hidden');
    setTimeout(() => dom.noteTitle.focus(), 100);
}

function closeEditor() {
    dom.editorModal.classList.add('hidden');
    state.editingNote = null;
}

function updateColorSwatches() {
    dom.colorSwatches.forEach(sw => {
        sw.classList.toggle('active', sw.dataset.color === state.selectedColor);
    });
}

dom.colorSwatches.forEach(sw => {
    sw.addEventListener('click', () => {
        state.selectedColor = sw.dataset.color;
        updateColorSwatches();
    });
});

dom.closeEditorBtn.addEventListener('click', closeEditor);
dom.editorBackdrop.addEventListener('click', closeEditor);

dom.saveNoteBtn.addEventListener('click', async () => {
    const title = (dom.noteTitle.value.trim() || 'Untitled').slice(0, 255);
    const content = dom.noteContent.value;

    dom.saveNoteBtn.disabled = true;
    dom.saveNoteBtn.textContent = 'Menyimpan…';

    try {
        if (state.editingNote) {
            const updates = { title, content, color: state.selectedColor };
            await api.updateNote(state.editingNote.id, updates);
            const idx = state.notes.findIndex(n => String(n.id) === String(state.editingNote.id));
            if (idx >= 0) {
                state.notes[idx] = { ...state.notes[idx], ...updates, updated_at: new Date().toISOString() };
            }
            showToast('Catatan disimpan', 'success');
        } else {
            const newNote = {
                title,
                content,
                color: state.selectedColor,
                is_pinned: false,
                is_archived: false,
            };
            const created = await api.createNote(newNote);
            if (created && created.id) {
                state.notes.unshift(created);
            } else {
                // Fallback: reload
                state.notes = await api.getNotes();
            }
            showToast('Catatan dibuat', 'success');
        }
        renderNotes();
        closeEditor();
    } catch (err) {
        console.error('[save]', err, err.data);
        showToast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
        dom.saveNoteBtn.disabled = false;
        dom.saveNoteBtn.textContent = 'Simpan';
    }
});

dom.pinNoteBtn.addEventListener('click', async () => {
    if (!state.editingNote) { showToast('Simpan catatan dulu', 'error'); return; }
    const newVal = !state.editingNote.is_pinned;
    state.editingNote.is_pinned = newVal;
    dom.pinNoteBtn.textContent = newVal ? '📌' : '📍';
    await quickUpdate(state.editingNote.id, { is_pinned: newVal });
});

dom.archiveNoteBtn.addEventListener('click', async () => {
    if (!state.editingNote) { showToast('Simpan catatan dulu', 'error'); return; }
    const newVal = !state.editingNote.is_archived;
    state.editingNote.is_archived = newVal;
    dom.archiveNoteBtn.textContent = newVal ? '📤' : '🗄️';
    await quickUpdate(state.editingNote.id, { is_archived: newVal });
});

dom.deleteNoteBtn.addEventListener('click', async () => {
    if (!state.editingNote) { closeEditor(); return; }
    if (confirm('Hapus catatan ini?')) {
        await deleteNoteById(state.editingNote.id);
        closeEditor();
    }
});

// ==================== FILTER & VIEW ====================
dom.navItems.forEach(item => {
    item.addEventListener('click', () => {
        dom.navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        state.filter = item.dataset.filter;
        renderNotes();
        dom.sidebar.classList.remove('open');
    });
});

dom.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderNotes();
});

dom.viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        dom.viewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.view = btn.dataset.view;
        renderNotes();
    });
});

// ==================== NEW NOTE ====================
dom.newNoteBtn.addEventListener('click', openNewNote);
dom.emptyNewNoteBtn.addEventListener('click', openNewNote);

// ==================== LOGOUT ====================
function handleLogout(skipConfirm = false) {
    if (!skipConfirm && !confirm('Keluar dari MyNotes?')) return;
    state.token = null;
    state.user = null;
    state.notes = [];
    localStorage.removeItem('mynotes_token');
    localStorage.removeItem('mynotes_user');
    dom.app.classList.add('hidden');
    dom.authScreen.classList.remove('hidden');
    dom.authForm.reset();
    setAuthMode('login');
}

dom.logoutBtn.addEventListener('click', () => handleLogout(false));

// ==================== MOBILE MENU ====================
dom.mobileMenu.addEventListener('click', () => {
    dom.sidebar.classList.toggle('open');
});

// Close sidebar on outside click (mobile)
document.addEventListener('click', (e) => {
    if (window.innerWidth > 768) return;
    if (!dom.sidebar.classList.contains('open')) return;
    if (dom.sidebar.contains(e.target) || dom.mobileMenu.contains(e.target)) return;
    dom.sidebar.classList.remove('open');
});

// ==================== UTILS ====================
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    return escapeHtml(str);
}

function sanitizeColor(color) {
    const fallback = '#FFE066';
    if (!color || typeof color !== 'string') return fallback;
    return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : fallback;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';

    const now = new Date();
    const diff = (now - d) / 1000;

    if (diff < 0) return 'Baru saja';
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}h lalu`;

    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

let toastTimeout;
function showToast(message, type = '') {
    dom.toast.textContent = message;
    dom.toast.className = `toast ${type}`;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        dom.toast.classList.add('hidden');
    }, 3200);
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S → Save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (!dom.editorModal.classList.contains('hidden')) {
            e.preventDefault();
            dom.saveNoteBtn.click();
        }
    }
    // Escape → Close editor
    if (e.key === 'Escape' && !dom.editorModal.classList.contains('hidden')) {
        closeEditor();
    }
    // Ctrl/Cmd + K → Focus search
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!dom.app.classList.contains('hidden')) dom.searchInput.focus();
    }
});

// ==================== AUTO LOGIN ====================
(async function init() {
    // Restore user info
    try {
        const cachedUser = localStorage.getItem('mynotes_user');
        if (cachedUser) state.user = JSON.parse(cachedUser);
    } catch {}

    if (!state.token) return;

    // Coba verifikasi token (best-effort, kalau endpoint tidak ada, lanjut saja)
    try {
        const me = await api.me();
        if (me) {
            state.user = me.user || me.data?.user || me;
            localStorage.setItem('mynotes_user', JSON.stringify(state.user));
        }
    } catch (err) {
        if (err.status === 401) {
            // Token invalid → paksa login
            localStorage.removeItem('mynotes_token');
            localStorage.removeItem('mynotes_user');
            state.token = null;
            state.user = null;
            return;
        }
        // 404/endpoint tidak ada → lanjut pakai token
    }

    try {
        await enterApp();
    } catch (err) {
        console.error('[auto-login]', err);
    }
})();
