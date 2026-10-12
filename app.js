// ==================== CONFIG ====================
const EPANBASE_URL = 'https://gentle-sea-6f11.siburianepan1.workers.dev';
const EPANBASE_KEY = 'epb_fe5afa0eea5205945093479b7110c9277f025a64e061e8df';

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
            ...options.headers,
        };
        
        if (state.token) {
            headers['Authorization'] = `Bearer ${state.token}`;
        }
        
        const res = await fetch(`${EPANBASE_URL}${endpoint}`, {
            ...options,
            headers,
        });
        
        const data = await res.json().catch(() => ({}));
        
        if (!res.ok) {
            throw new Error(data.message || data.error || `HTTP ${res.status}`);
        }
        
        return data;
    },
    
    // Auth
    async signUp(email, password) {
        return this.request('/auth/v1/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },
    
    async signIn(email, password) {
        return this.request('/auth/v1/token?grant_type=password', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },
    
    async signOut() {
        return this.request('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    },
    
    async getUser() {
        return this.request('/auth/v1/user');
    },
    
    // Notes CRUD
    async getNotes() {
        // EpanBase REST API format (mirip Supabase/PostgREST)
        const data = await this.request('/rest/v1/notes?select=*&order=is_pinned.desc,updated_at.desc');
        return Array.isArray(data) ? data : (data.data || []);
    },
    
    async createNote(note) {
        const data = await this.request('/rest/v1/notes', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(note),
        });
        return Array.isArray(data) ? data[0] : (data.data?.[0] || data);
    },
    
    async updateNote(id, updates) {
        const data = await this.request(`/rest/v1/notes?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(updates),
        });
        return Array.isArray(data) ? data[0] : (data.data?.[0] || data);
    },
    
    async deleteNote(id) {
        return this.request(`/rest/v1/notes?id=eq.${id}`, {
            method: 'DELETE',
        });
    },
};

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
    switchAuth: $('#switchAuth'),
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
    sidebar: $('.sidebar'),
};

// ==================== AUTH MODE ====================
let authMode = 'login';

dom.authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        authMode = tab.dataset.tab;
        dom.authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        dom.authSubmit.textContent = authMode === 'login' ? 'Masuk' : 'Daftar';
        dom.authFooter.innerHTML = authMode === 'login'
            ? 'Belum punya akun? <a href="#" id="switchAuth">Daftar sekarang</a>'
            : 'Sudah punya akun? <a href="#" id="switchAuth">Masuk di sini</a>';
        bindSwitchAuth();
    });
});

function bindSwitchAuth() {
    const link = $('#switchAuth');
    if (link) {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = authMode === 'login' ? 'register' : 'login';
            document.querySelector(`.auth-tab[data-tab="${targetTab}"]`).click();
        });
    }
}
bindSwitchAuth();

// ==================== AUTH HANDLER ====================
dom.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = dom.email.value.trim();
    const password = dom.password.value;
    
    dom.authSubmit.disabled = true;
    dom.authSubmit.textContent = 'Memproses...';
    
    try {
        let result;
        if (authMode === 'login') {
            result = await api.signIn(email, password);
        } else {
            result = await api.signUp(email, password);
            if (!result.access_token && !result.session) {
                showToast('Cek email untuk verifikasi, lalu masuk.', 'success');
                authMode = 'login';
                document.querySelector('.auth-tab[data-tab="login"]').click();
                return;
            }
        }
        
        const token = result.access_token || result.session?.access_token;
        const user = result.user || result.session?.user;
        
        if (token) {
            state.token = token;
            state.user = user;
            localStorage.setItem('mynotes_token', token);
            localStorage.setItem('mynotes_user', JSON.stringify(user));
            await enterApp();
        } else {
            throw new Error('Tidak menerima token dari server');
        }
    } catch (err) {
        showToast(err.message || 'Autentikasi gagal', 'error');
    } finally {
        dom.authSubmit.disabled = false;
        dom.authSubmit.textContent = authMode === 'login' ? 'Masuk' : 'Daftar';
    }
});

// ==================== APP INIT ====================
async function enterApp() {
    dom.authScreen.classList.add('hidden');
    dom.app.classList.remove('hidden');
    
    const email = state.user?.email || 'user@email.com';
    dom.userEmail.textContent = email;
    dom.userAvatar.textContent = email[0].toUpperCase();
    
    await loadNotes();
}

async function loadNotes() {
    try {
        dom.notesContainer.innerHTML = '<div style="padding:20px;font-family:var(--font-mono);font-size:13px;color:var(--ink-muted)">Memuat catatan...</div>';
        state.notes = await api.getNotes();
        renderNotes();
    } catch (err) {
        console.error('Load notes error:', err);
        // Jika tabel belum ada / error, mulai dengan array kosong
        state.notes = [];
        renderNotes();
        showToast('Gagal memuat catatan: ' + err.message, 'error');
    }
}

// ==================== RENDER NOTES ====================
function getFilteredNotes() {
    let notes = [...state.notes];
    
    // Filter
    if (state.filter === 'pinned') {
        notes = notes.filter(n => n.is_pinned && !n.is_archived);
    } else if (state.filter === 'archived') {
        notes = notes.filter(n => n.is_archived);
    } else {
        notes = notes.filter(n => !n.is_archived);
    }
    
    // Search
    if (state.search) {
        const q = state.search.toLowerCase();
        notes = notes.filter(n =>
            (n.title || '').toLowerCase().includes(q) ||
            (n.content || '').toLowerCase().includes(q)
        );
    }
    
    // Sort: pinned first, then updated_at
    notes.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
        return new Date(b.updated_at) - new Date(a.updated_at);
    });
    
    return notes;
}

function renderNotes() {
    const notes = getFilteredNotes();
    const container = dom.notesContainer;
    container.className = `notes-container ${state.view}`;
    
    // Update counts
    const all = state.notes.filter(n => !n.is_archived);
    const pinned = state.notes.filter(n => n.is_pinned && !n.is_archived);
    const archived = state.notes.filter(n => n.is_archived);
    dom.countAll.textContent = all.length;
    dom.countPinned.textContent = pinned.length;
    dom.countArchived.textContent = archived.length;
    
    // Update title
    const titles = { all: 'Semua Catatan', pinned: 'Disematkan', archived: 'Arsip' };
    dom.viewTitle.textContent = titles[state.filter];
    dom.noteCountLabel.textContent = `${notes.length} catatan`;
    
    // Empty state
    if (notes.length === 0) {
        container.innerHTML = '';
        dom.emptyState.classList.remove('hidden');
        return;
    }
    dom.emptyState.classList.add('hidden');
    
    // Render cards
    container.innerHTML = notes.map(note => `
        <div class="note-card" style="background:${note.color || '#FFE066'}" data-id="${note.id}">
            <div class="note-card-header">
                <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
                ${note.is_pinned ? '<span class="note-pin-badge">📌</span>' : ''}
            </div>
            <div class="note-card-content">${escapeHtml(note.content || 'Tidak ada konten...')}</div>
            <div class="note-card-footer">
                <span>${formatDate(note.updated_at)}</span>
                <div class="note-card-actions">
                    <button class="note-card-action" data-action="pin" data-id="${note.id}" title="${note.is_pinned ? 'Lepas sematan' : 'Sematkan'}">
                        ${note.is_pinned ? '📌' : '📍'}
                    </button>
                    <button class="note-card-action" data-action="archive" data-id="${note.id}" title="${note.is_archived ? 'Keluarkan dari arsip' : 'Arsipkan'}">
                        ${note.is_archived ? '📤' : '🗄️'}
                    </button>
                    <button class="note-card-action" data-action="delete" data-id="${note.id}" title="Hapus">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Bind events
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
            const note = state.notes.find(n => n.id === id);
            if (!note) return;
            
            if (action === 'pin') {
                await quickUpdate(id, { is_pinned: !note.is_pinned });
            } else if (action === 'archive') {
                await quickUpdate(id, { is_archived: !note.is_archived });
            } else if (action === 'delete') {
                if (confirm('Hapus catatan ini?')) {
                    await deleteNoteById(id);
                }
            }
        });
    });
}

async function quickUpdate(id, updates) {
    try {
        const updated = await api.updateNote(id, updates);
        const idx = state.notes.findIndex(n => n.id === id);
        if (idx >= 0) state.notes[idx] = { ...state.notes[idx], ...updates };
        renderNotes();
        showToast('Catatan diperbarui', 'success');
    } catch (err) {
        showToast('Gagal memperbarui: ' + err.message, 'error');
    }
}

async function deleteNoteById(id) {
    try {
        await api.deleteNote(id);
        state.notes = state.notes.filter(n => n.id !== id);
        renderNotes();
        showToast('Catatan dihapus', 'success');
    } catch (err) {
        showToast('Gagal menghapus: ' + err.message, 'error');
    }
}

// ==================== EDITOR ====================
function openEditor(id) {
    const note = state.notes.find(n => n.id === id);
    if (!note) return;
    
    state.editingNote = note;
    state.selectedColor = note.color || '#FFE066';
    
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
dom.editorModal.querySelector('.modal-backdrop').addEventListener('click', closeEditor);

dom.saveNoteBtn.addEventListener('click', async () => {
    const title = dom.noteTitle.value.trim() || 'Untitled';
    const content = dom.noteContent.value;
    
    dom.saveNoteBtn.disabled = true;
    dom.saveNoteBtn.textContent = 'Menyimpan...';
    
    try {
        if (state.editingNote) {
            const updates = { title, content, color: state.selectedColor };
            const updated = await api.updateNote(state.editingNote.id, updates);
            const idx = state.notes.findIndex(n => n.id === state.editingNote.id);
            if (idx >= 0) state.notes[idx] = { ...state.notes[idx], ...updates, updated_at: new Date().toISOString() };
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
            state.notes.unshift(created);
            showToast('Catatan dibuat', 'success');
        }
        renderNotes();
        closeEditor();
    } catch (err) {
        showToast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
        dom.saveNoteBtn.disabled = false;
        dom.saveNoteBtn.textContent = 'Simpan';
    }
});

dom.pinNoteBtn.addEventListener('click', async () => {
    if (!state.editingNote) {
        showToast('Simpan catatan dulu', 'error');
        return;
    }
    const newVal = !state.editingNote.is_pinned;
    await quickUpdate(state.editingNote.id, { is_pinned: newVal });
    state.editingNote.is_pinned = newVal;
    dom.pinNoteBtn.textContent = newVal ? '📌' : '📍';
});

dom.archiveNoteBtn.addEventListener('click', async () => {
    if (!state.editingNote) {
        showToast('Simpan catatan dulu', 'error');
        return;
    }
    const newVal = !state.editingNote.is_archived;
    await quickUpdate(state.editingNote.id, { is_archived: newVal });
    state.editingNote.is_archived = newVal;
    dom.archiveNoteBtn.textContent = newVal ? '📤' : '🗄️';
});

dom.deleteNoteBtn.addEventListener('click', async () => {
    if (!state.editingNote) {
        closeEditor();
        return;
    }
    if (confirm('Hapus catatan ini?')) {
        await deleteNoteById(state.editingNote.id);
        closeEditor();
    }
});

// ==================== NAV & FILTERS ====================
dom.navItems.forEach(item => {
    item.addEventListener('click', () => {
        dom.navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        state.filter = item.dataset.filter;
        renderNotes();
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

// ==================== NEW NOTE BUTTONS ====================
dom.newNoteBtn.addEventListener('click', openNewNote);
dom.emptyNewNoteBtn.addEventListener('click', openNewNote);

// ==================== LOGOUT ====================
dom.logoutBtn.addEventListener('click', async () => {
    if (!confirm('Keluar dari MyNotes?')) return;
    await api.signOut();
    state.token = null;
    state.user = null;
    state.notes = [];
    localStorage.removeItem('mynotes_token');
    localStorage.removeItem('mynotes_user');
    dom.app.classList.add('hidden');
    dom.authScreen.classList.remove('hidden');
    dom.authForm.reset();
});

// ==================== MOBILE MENU ====================
dom.mobileMenu.addEventListener('click', () => {
    dom.sidebar.classList.toggle('open');
});

// ==================== UTILS ====================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    
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
    }, 3000);
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S = Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (!dom.editorModal.classList.contains('hidden')) {
            e.preventDefault();
            dom.saveNoteBtn.click();
        }
    }
    // Escape = Close editor
    if (e.key === 'Escape' && !dom.editorModal.classList.contains('hidden')) {
        closeEditor();
    }
    // Ctrl/Cmd + K = Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        dom.searchInput.focus();
    }
});

// ==================== AUTO LOGIN ====================
(async function init() {
    if (state.token) {
        try {
            // Verify token masih valid
            const user = await api.getUser();
            state.user = user.user || user;
            localStorage.setItem('mynotes_user', JSON.stringify(state.user));
            await enterApp();
        } catch (err) {
            console.warn('Auto-login gagal:', err.message);
            localStorage.removeItem('mynotes_token');
            localStorage.removeItem('mynotes_user');
            state.token = null;
        }
    }
})();
