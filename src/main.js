const { invoke } = window.__TAURI__.core;
import { initI18n, t, setLanguage, getLanguage } from './i18n.js';

let autostartApi = null;

async function getAutostartApi() {
    if (autostartApi) return autostartApi;

    if (window.__TAURI__?.plugin?.autostart) {
        autostartApi = window.__TAURI__.plugin.autostart;
        return autostartApi;
    }

    try {
        autostartApi = await import('@tauri-apps/plugin-autostart');
        return autostartApi;
    } catch (err) {
        console.warn('Autostart plugin not available:', err);
        autostartApi = null;
        return null;
    }
}

async function autostartIsEnabled() {
    try {
        return await invoke('autostart_is_enabled');
    } catch (err) {
        const api = await getAutostartApi();
        if (!api?.isEnabled) return false;
        return api.isEnabled();
    }
}

async function autostartEnable() {
    try {
        return await invoke('autostart_enable');
    } catch (err) {
        const api = await getAutostartApi();
        if (!api?.enable) return;
        return api.enable();
    }
}

async function autostartDisable() {
    try {
        return await invoke('autostart_disable');
    } catch (err) {
        const api = await getAutostartApi();
        if (!api?.disable) return;
        return api.disable();
    }
}

function addSettingsLog(message) {
    const list = document.getElementById('settings-log-list');
    if (!list) return;
    const time = new Date().toLocaleTimeString();
    const item = document.createElement('li');
    item.textContent = `[${time}] ${message}`;
    list.prepend(item);

    while (list.children.length > 20) {
        list.removeChild(list.lastChild);
    }
}

// ─── State ───────────────────────────────────────────────────────────────────

let currentPasswords = [];
let isDbLocked = false;
let isDbProtected = false;

let currentBookmarks = [];
let activeCategory = null; // null = all categories
let currentTab = 'passwords'; // 'passwords' | 'bookmarks'

// ─── DOM Elements ─────────────────────────────────────────────────────────────

const passwordList = document.getElementById('password-list');
const searchInput = document.getElementById('search-input');
const addBtn = document.getElementById('add-btn');
const themeToggle = document.getElementById('theme-toggle');
const modal = document.getElementById('modal');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const modalTitle = document.getElementById('modal-title');

const mId = document.getElementById('modal-id');
const mName = document.getElementById('modal-name');
const mUsername = document.getElementById('modal-username');
const mUrl = document.getElementById('modal-url');
const mPassword = document.getElementById('modal-password');
const mNote = document.getElementById('modal-note');
const mGenPwd = document.getElementById('modal-gen-pwd');

// ─── Theme ────────────────────────────────────────────────────────────────────

function initTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-theme');
    }

    themeToggle.addEventListener('click', () => {
        const isDark = document.body.classList.contains('dark-theme');
        if (isDark) {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        }
    });
}

// ─── Tab Switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
    currentTab = tab;

    document.getElementById('tab-passwords').classList.toggle('active', tab === 'passwords');
    document.getElementById('tab-bookmarks').classList.toggle('active', tab === 'bookmarks');

    document.getElementById('password-controls').classList.toggle('hidden', tab !== 'passwords');
    document.getElementById('bookmark-controls').classList.toggle('hidden', tab !== 'bookmarks');
    document.getElementById('password-section').classList.toggle('hidden', tab !== 'passwords');
    document.getElementById('bookmark-section').classList.toggle('hidden', tab !== 'bookmarks');
    document.getElementById('category-chips').classList.toggle('hidden', tab !== 'bookmarks');

    if (tab === 'bookmarks') {
        loadBookmarks();
    }
}

// ─── Passwords ────────────────────────────────────────────────────────────────

async function loadPasswords() {
    try {
        const search = searchInput.value || null;
        currentPasswords = await invoke('get_passwords', { search });
        renderPasswords();
    } catch (error) {
        console.error('Failed to load passwords:', error);
        if (error.toString().includes("LOCKED")) {
            isDbLocked = true;
            isDbProtected = true;
            showUnlockModal();
        } else {
            alert(t('alert-op-fail') + error);
        }
    }
}

function renderPasswords() {
    passwordList.innerHTML = '';
    currentPasswords.forEach(pwd => {
        const tr = document.createElement('tr');
        if (pwd.pinned) {
            tr.classList.add('pinned-row');
        }

        const createIconBtn = (src, title, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.title = title;
            const img = document.createElement('img');
            img.src = src;
            btn.appendChild(img);
            btn.onclick = onClick;
            return btn;
        };

        const copyToClipboard = (value) => {
            navigator.clipboard.writeText(value).then(() => {
                showToast(t('toast-copied'));
            }).catch(() => {
                showToast(t('toast-copy-fail'));
            });
        };

        const createCopyableContent = (displayText, copyValue) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'copyable-cell';

            const text = document.createElement('span');
            text.className = 'copyable-cell-text';
            text.textContent = displayText;
            wrapper.appendChild(text);

            if (copyValue) {
                const copyBtn = createIconBtn('assets/solar--copy-line-duotone.svg', t('tooltip-copy'), () => copyToClipboard(copyValue));
                wrapper.appendChild(copyBtn);
            }

            return wrapper;
        };

        const tdName = document.createElement('td');
        tdName.textContent = pwd.pinned ? '📌 ' + pwd.name : pwd.name;
        tdName.title = pwd.name;

        const tdUser = document.createElement('td');
        tdUser.title = pwd.username || '';
        tdUser.appendChild(createCopyableContent(pwd.username || '-', pwd.username || null));

        const tdUrl = document.createElement('td');
        if (pwd.url) {
            let finalUrl = pwd.url;
            if (!/^https?:\/\//i.test(finalUrl)) {
                finalUrl = 'https://' + finalUrl;
            }
            tdUrl.textContent = '🔗 ' + pwd.url;
            tdUrl.title = finalUrl;
            tdUrl.textContent = '';
            tdUrl.appendChild(createCopyableContent('🔗 ' + pwd.url, finalUrl));
        } else {
            tdUrl.textContent = '-';
            tdUrl.textContent = '';
            tdUrl.appendChild(createCopyableContent('-', null));
        }

        const tdPwd = document.createElement('td');
        tdPwd.className = 'password-cell';
        const span = document.createElement('span');
        span.textContent = '••••••';
        span.dataset.real = pwd.password;
        span.dataset.mask = '••••••';
        span.dataset.visible = 'false';

        const eyeBtn = createIconBtn('assets/solar--eye-outline.svg', t('tooltip-show-hide'), () => {
            const visible = span.dataset.visible === 'true';
            span.textContent = visible ? span.dataset.mask : span.dataset.real;
            span.dataset.visible = visible ? 'false' : 'true';
        });

        const copyBtn = createIconBtn('assets/solar--copy-line-duotone.svg', t('tooltip-copy'), () => {
            navigator.clipboard.writeText(pwd.password).then(() => {
                showToast(t('toast-copied'));
            }).catch(() => {
                showToast(t('toast-copy-fail'));
            });
        });

        tdPwd.appendChild(span);
        tdPwd.appendChild(eyeBtn);
        tdPwd.appendChild(copyBtn);

        const tdNote = document.createElement('td');
        tdNote.textContent = pwd.note || '';
        tdNote.title = pwd.note || '';

        const tdActions = document.createElement('td');

        const pinBtn = createIconBtn('assets/solar--arrow-to-top-left-bold.svg', pwd.pinned ? t('tooltip-unpin') : t('tooltip-pin'), () => togglePin(pwd.id, !pwd.pinned));
        if (pwd.pinned) {
            pinBtn.style.backgroundColor = 'var(--border-color)';
        }

        const editBtn = createIconBtn('assets/solar--pen-linear.svg', t('modal-edit-title'), () => openModal(pwd));
        const delBtn = createIconBtn('assets/solar--remove-square-broken.svg', t('th-action'), () => handleDelete(pwd.id));
        delBtn.classList.add('delete-btn');

        tdActions.appendChild(pinBtn);
        tdActions.appendChild(editBtn);
        tdActions.appendChild(delBtn);

        tr.appendChild(tdName);
        tr.appendChild(tdUser);
        tr.appendChild(tdUrl);
        tr.appendChild(tdPwd);
        tr.appendChild(tdNote);
        tr.appendChild(tdActions);

        passwordList.appendChild(tr);
    });
}

async function togglePin(id, pinned) {
    try {
        await invoke('toggle_pin_password', { id, pinned });
        loadPasswords();
    } catch (e) {
        alert('操作失败: ' + e);
    }
}

async function handleDelete(id) {
    showConfirm(t('confirm-del-msg'), async () => {
        try {
            await invoke('delete_password', { id });
            loadPasswords();
            showToast(t('toast-deleted'));
        } catch (e) {
            alert(t('alert-del-fail') + e);
        }
    });
}

function openModal(pwd = null) {
    if (pwd) {
        modalTitle.textContent = t('modal-edit-title');
        mId.value = pwd.id;
        mName.value = pwd.name;
        mUsername.value = pwd.username || '';
        mUrl.value = pwd.url || '';
        mPassword.value = pwd.password;
        mNote.value = pwd.note || '';
    } else {
        modalTitle.textContent = t('modal-add-title');
        mId.value = '';
        mName.value = '';
        mUsername.value = '';
        mUrl.value = '';
        mPassword.value = '';
        mNote.value = '';
    }
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
}

async function savePassword() {
    const name = mName.value;
    const username = mUsername.value || null;
    const url = mUrl.value || null;
    const password = mPassword.value;
    const note = mNote.value || null;
    const id = mId.value ? parseInt(mId.value) : null;

    if (!name || !password) {
        alert(t('alert-name-pass-req'));
        return;
    }

    try {
        if (id) {
            await invoke('update_password', { id, name, username, password, note, url });
        } else {
            await invoke('add_password', { name, username, password, note, url });
        }
        closeModal();
        loadPasswords();
        showToast(t('toast-saved'));
    } catch (e) {
        alert(t('alert-op-fail') + e);
    }
}

function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let pwd = '';
    for (let i = 0; i < 16; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    mPassword.value = pwd;
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

async function loadBookmarks() {
    try {
        const search = document.getElementById('bookmark-search-input').value || null;
        const category = activeCategory;
        currentBookmarks = await invoke('get_bookmarks', { search, category });
        renderBookmarks();
        await refreshCategoryChips();
    } catch (error) {
        console.error('Failed to load bookmarks:', error);
        if (error.toString().includes("LOCKED")) {
            isDbLocked = true;
            isDbProtected = true;
            showUnlockModal();
        } else {
            alert(t('alert-op-fail') + error);
        }
    }
}

function getFaviconUrl(url) {
    try {
        let full = url;
        if (!/^https?:\/\//i.test(full)) full = 'https://' + full;
        const origin = new URL(full).origin;
        return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`;
    } catch {
        return null;
    }
}

function renderBookmarks() {
    const list = document.getElementById('bookmark-list');
    list.innerHTML = '';

    currentBookmarks.forEach(bm => {
        const tr = document.createElement('tr');
        if (bm.pinned) tr.classList.add('pinned-row');

        // Double-click to open URL
        tr.addEventListener('dblclick', () => openBookmarkUrl(bm.url));
        tr.style.cursor = 'default';

        const createIconBtn = (src, title, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.title = title;
            const img = document.createElement('img');
            img.src = src;
            btn.appendChild(img);
            btn.onclick = (e) => { e.stopPropagation(); onClick(); };
            return btn;
        };

        // Title cell with favicon
        const tdTitle = document.createElement('td');
        tdTitle.className = 'bm-title-cell';
        const faviconUrl = getFaviconUrl(bm.url);
        if (faviconUrl) {
            const favicon = document.createElement('img');
            favicon.className = 'favicon';
            favicon.src = faviconUrl;
            favicon.onerror = () => { favicon.style.display = 'none'; };
            tdTitle.appendChild(favicon);
        }
        if (bm.pinned) {
            const pin = document.createElement('span');
            pin.textContent = '📌 ';
            tdTitle.appendChild(pin);
        }
        const titleSpan = document.createElement('span');
        titleSpan.textContent = bm.title;
        tdTitle.appendChild(titleSpan);
        tdTitle.title = bm.title;

        // URL cell - clickable
        const tdUrl = document.createElement('td');
        if (bm.url) {
            const link = document.createElement('span');
            link.className = 'bm-url-link';
            link.textContent = bm.url;
            link.title = bm.url;
            link.addEventListener('click', (e) => { e.stopPropagation(); openBookmarkUrl(bm.url); });
            tdUrl.appendChild(link);
        } else {
            tdUrl.textContent = '-';
        }

        // Category cell
        const tdCat = document.createElement('td');
        tdCat.textContent = bm.category || '-';

        // Note cell
        const tdNote = document.createElement('td');
        tdNote.textContent = bm.note || '';
        tdNote.title = bm.note || '';

        // Actions cell
        const tdActions = document.createElement('td');

        const openBtn = createIconBtn('assets/solar--arrow-to-top-left-bold.svg', t('bm-open-tooltip'), () => openBookmarkUrl(bm.url));
        openBtn.style.transform = 'rotate(90deg) scale(0.8)';

        const copyBtn = createIconBtn('assets/solar--copy-line-duotone.svg', t('bm-copy-url-tooltip'), () => {
            let url = bm.url;
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            navigator.clipboard.writeText(url).then(() => showToast(t('toast-copied')));
        });

        const pinBtn = createIconBtn('assets/solar--arrow-to-top-left-bold.svg', bm.pinned ? t('tooltip-unpin') : t('tooltip-pin'), () => togglePinBookmark(bm.id, !bm.pinned));
        if (bm.pinned) pinBtn.style.backgroundColor = 'var(--border-color)';

        const editBtn = createIconBtn('assets/solar--pen-linear.svg', t('bm-modal-edit-title'), () => openBookmarkModal(bm));
        const delBtn = createIconBtn('assets/solar--remove-square-broken.svg', t('bm-th-action'), () => handleDeleteBookmark(bm.id));
        delBtn.classList.add('delete-btn');

        tdActions.appendChild(openBtn);
        tdActions.appendChild(copyBtn);
        tdActions.appendChild(pinBtn);
        tdActions.appendChild(editBtn);
        tdActions.appendChild(delBtn);

        tr.appendChild(tdTitle);
        tr.appendChild(tdUrl);
        tr.appendChild(tdCat);
        tr.appendChild(tdNote);
        tr.appendChild(tdActions);

        list.appendChild(tr);
    });
}

async function openBookmarkUrl(url) {
    if (!url) return;
    let finalUrl = url;
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl;
    try {
        await invoke('open_url', { url: finalUrl });
    } catch (e) {
        console.error('Failed to open URL:', e);
    }
}

async function togglePinBookmark(id, pinned) {
    try {
        await invoke('toggle_pin_bookmark', { id, pinned });
        loadBookmarks();
    } catch (e) {
        alert('操作失败: ' + e);
    }
}

async function handleDeleteBookmark(id) {
    showConfirm(t('bm-confirm-del'), async () => {
        try {
            await invoke('delete_bookmark', { id });
            loadBookmarks();
            showToast(t('toast-deleted'));
        } catch (e) {
            alert(t('alert-del-fail') + e);
        }
    });
}

// Bookmark modal
function openBookmarkModal(bm = null) {
    const titleEl = document.getElementById('bm-modal-title');
    const idEl = document.getElementById('bm-modal-id');
    const titleInput = document.getElementById('bm-modal-title-input');
    const urlInput = document.getElementById('bm-modal-url');
    const catInput = document.getElementById('bm-modal-category');
    const noteInput = document.getElementById('bm-modal-note');

    if (bm) {
        titleEl.textContent = t('bm-modal-edit-title');
        idEl.value = bm.id;
        titleInput.value = bm.title;
        urlInput.value = bm.url;
        catInput.value = bm.category || '';
        noteInput.value = bm.note || '';
    } else {
        titleEl.textContent = t('bm-modal-add-title');
        idEl.value = '';
        titleInput.value = '';
        urlInput.value = '';
        catInput.value = '';
        noteInput.value = '';
    }

    // Populate category suggestions
    invoke('get_bookmark_categories', {}).then(cats => {
        const datalist = document.getElementById('bm-category-suggestions');
        datalist.innerHTML = '';
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            datalist.appendChild(opt);
        });
    }).catch(() => {});

    document.getElementById('bookmark-modal').classList.remove('hidden');
    titleInput.focus();
}

function closeBookmarkModal() {
    document.getElementById('bookmark-modal').classList.add('hidden');
}

async function saveBookmark() {
    const idEl = document.getElementById('bm-modal-id');
    const title = document.getElementById('bm-modal-title-input').value.trim();
    const url = document.getElementById('bm-modal-url').value.trim();
    const category = document.getElementById('bm-modal-category').value.trim() || null;
    const note = document.getElementById('bm-modal-note').value.trim() || null;
    const id = idEl.value ? parseInt(idEl.value) : null;

    if (!title || !url) {
        alert(t('bm-alert-title-url-req'));
        return;
    }

    try {
        if (id) {
            await invoke('update_bookmark', { id, title, url, note, category });
        } else {
            await invoke('add_bookmark', { title, url, note, category });
        }
        closeBookmarkModal();
        loadBookmarks();
        showToast(t('toast-saved'));
    } catch (e) {
        alert(t('alert-op-fail') + e);
    }
}

// ─── Category Chips ───────────────────────────────────────────────────────────

async function refreshCategoryChips() {
    try {
        const cats = await invoke('get_bookmark_categories', {});
        renderCategoryChips(cats);
    } catch (e) {
        console.error('Failed to load categories:', e);
    }
}

function renderCategoryChips(cats) {
    const container = document.getElementById('category-chips');
    container.innerHTML = '';

    // "All" chip
    const allChip = document.createElement('button');
    allChip.className = 'category-chip' + (activeCategory === null ? ' active' : '');
    allChip.textContent = t('bm-all-categories');
    allChip.addEventListener('click', () => {
        activeCategory = null;
        loadBookmarks();
    });
    container.appendChild(allChip);

    // Per-category chips
    cats.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'category-chip' + (activeCategory === cat ? ' active' : '');
        chip.textContent = cat;
        chip.addEventListener('click', () => {
            activeCategory = activeCategory === cat ? null : cat;
            loadBookmarks();
        });
        container.appendChild(chip);
    });
}

// ─── Import / Export ──────────────────────────────────────────────────────────

function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const html = e.target.result;
            const bookmarks = parseNetscapeBookmarks(html);
            if (bookmarks.length === 0) {
                showToast(t('bm-import-error') + 'no bookmarks found');
                return;
            }
            let count = 0;
            for (const bm of bookmarks) {
                try {
                    await invoke('add_bookmark', {
                        title: bm.title,
                        url: bm.url,
                        note: bm.note || null,
                        category: bm.category || null,
                    });
                    count++;
                } catch (err) {
                    console.warn('Skipped bookmark:', bm.title, err);
                }
            }
            await loadBookmarks();
            showToast(count + t('bm-toast-imported'));
        } catch (err) {
            alert(t('bm-import-error') + err);
        }
    };
    reader.readAsText(file);
}

function parseNetscapeBookmarks(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const result = [];

    function walk(node, category) {
        const children = Array.from(node.children || []);
        let lastH3 = category;
        for (const child of children) {
            const tag = child.tagName?.toUpperCase();
            if (tag === 'H3') {
                lastH3 = child.textContent.trim();
            } else if (tag === 'A') {
                const href = child.getAttribute('href');
                const title = child.textContent.trim();
                if (href && /^https?:\/\//i.test(href)) {
                    result.push({ title: title || href, url: href, category: lastH3 || null, note: null });
                }
            } else if (tag === 'DL' || tag === 'DT' || tag === 'P') {
                walk(child, lastH3);
            }
        }
    }

    const body = doc.body;
    walk(body, null);
    return result;
}

async function handleExport() {
    try {
        const path = await invoke('export_bookmarks', {});
        showToast(t('bm-toast-exported') + path);
        // Open the folder containing the exported file
        try {
            await invoke('open_url', { url: 'file://' + path });
        } catch (_) {}
    } catch (e) {
        alert(t('alert-op-fail') + e);
    }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 2000);
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

let confirmCallback = null;

function showConfirm(message, callback) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = callback;
    modal.classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    confirmCallback = null;
}

function handleConfirmOk() {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
}

// ─── Unlock ───────────────────────────────────────────────────────────────────

async function unlockDb() {
    const password = document.getElementById('unlock-password').value;
    if (!password) return;

    try {
        await invoke('unlock_db', { password });
        isDbLocked = false;
        isDbProtected = true;
        document.getElementById('unlock-modal').classList.add('hidden');
        document.getElementById('unlock-password').value = '';
        loadPasswords();
    } catch (e) {
        alert(t('alert-op-fail') + e);
        loadPasswords();
    }
}

function showUnlockModal() {
    document.getElementById('unlock-modal').classList.remove('hidden');
    document.getElementById('unlock-password').focus();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function openSettingsModal() {
    const noPassDiv = document.getElementById('settings-no-pass');
    const hasPassDiv = document.getElementById('settings-has-pass');

    const autostartCb = document.getElementById('settings-autostart');
    autostartIsEnabled().then(enabled => {
        autostartCb.checked = enabled;
        addSettingsLog(`开机启动状态：${enabled ? '已开启' : '未开启'}`);
    });

    const langSelect = document.getElementById('settings-language');
    langSelect.value = getLanguage();

    if (isDbProtected) {
        noPassDiv.classList.add('hidden');
        hasPassDiv.classList.remove('hidden');
    } else {
        noPassDiv.classList.remove('hidden');
        hasPassDiv.classList.add('hidden');
    }

    document.getElementById('settings-modal').classList.remove('hidden');
}

let passInputMode = 'set';

function openPassInput(mode) {
    passInputMode = mode;
    document.getElementById('pass-input-title').textContent = mode === 'set' ? t('pass-set-title') : t('pass-change-title');
    document.getElementById('new-pass-1').value = '';
    document.getElementById('new-pass-2').value = '';
    document.getElementById('pass-input-modal').classList.remove('hidden');
    document.getElementById('new-pass-1').focus();
}

async function handlePassInputSave() {
    const p1 = document.getElementById('new-pass-1').value;
    const p2 = document.getElementById('new-pass-2').value;

    if (!p1) {
        alert(t('alert-name-pass-req'));
        return;
    }
    if (p1 !== p2) {
        alert(t('alert-pass-mismatch'));
        return;
    }

    try {
        await invoke('set_db_password', { password: p1 });
        isDbProtected = true;
        showToast(t('toast-saved'));
        document.getElementById('pass-input-modal').classList.add('hidden');
        openSettingsModal();
    } catch (e) {
        alert(t('alert-op-fail') + e);
    }
}

async function initAutostart() {
    const autostartCb = document.getElementById('settings-autostart');
    try {
        const enabled = await autostartIsEnabled();
        autostartCb.checked = enabled;
        addSettingsLog(`开机启动状态：${enabled ? '已开启' : '未开启'}`);
    } catch (err) {
        console.error('Failed to get autostart state:', err);
        autostartCb.disabled = true;
        addSettingsLog('读取开机启动状态失败，已禁用开关');
    }
}

function initSettings() {
    const autostartCb = document.getElementById('settings-autostart');
    autostartCb.addEventListener('change', async (e) => {
        try {
            addSettingsLog(`正在${e.target.checked ? '开启' : '关闭'}开机启动...`);
            if (e.target.checked) {
                await autostartEnable();
            } else {
                await autostartDisable();
            }
            const enabled = await autostartIsEnabled();
            autostartCb.checked = enabled;
            addSettingsLog(`开机启动设置结果：${enabled ? '已开启' : '未开启'}`);
        } catch (err) {
            console.error('Autostart error', err);
            e.target.checked = !e.target.checked;
            addSettingsLog('开机启动设置失败，已回退状态');
        }
    });

    const langSelect = document.getElementById('settings-language');
    langSelect.addEventListener('change', (e) => {
        setLanguage(e.target.value);
        loadPasswords();
    });
}

async function removeDbPassword() {
    if (!confirm(t('confirm-remove-pass'))) return;
    try {
        await invoke('remove_db_password');
        isDbProtected = false;
        showToast(t('toast-saved'));
        openSettingsModal();
    } catch (e) {
        alert(t('alert-op-fail') + e);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    initI18n();
    initTheme();
    loadPasswords();
    initSettings();
    initAutostart();

    // Password tab events
    searchInput.addEventListener('input', loadPasswords);
    addBtn.addEventListener('click', () => openModal(null));
    modalCancel.addEventListener('click', closeModal);
    modalSave.addEventListener('click', savePassword);
    mGenPwd.addEventListener('click', generatePassword);

    // Tab switching
    document.getElementById('tab-passwords').addEventListener('click', () => switchTab('passwords'));
    document.getElementById('tab-bookmarks').addEventListener('click', () => switchTab('bookmarks'));

    // Bookmark tab events
    document.getElementById('bookmark-search-input').addEventListener('input', loadBookmarks);
    document.getElementById('bookmark-add-btn').addEventListener('click', () => openBookmarkModal(null));
    document.getElementById('bm-modal-cancel').addEventListener('click', closeBookmarkModal);
    document.getElementById('bm-modal-save').addEventListener('click', saveBookmark);

    document.getElementById('bookmark-import-btn').addEventListener('click', () => {
        document.getElementById('bookmark-import-file').value = '';
        document.getElementById('bookmark-import-file').click();
    });
    document.getElementById('bookmark-import-file').addEventListener('change', (e) => {
        handleImportFile(e.target.files[0]);
    });
    document.getElementById('bookmark-export-btn').addEventListener('click', handleExport);

    // Settings & Unlock events
    document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    document.getElementById('settings-close').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.add('hidden');
    });

    document.getElementById('btn-unlock').addEventListener('click', unlockDb);
    document.getElementById('unlock-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') unlockDb();
    });

    document.getElementById('btn-set-pass').addEventListener('click', () => openPassInput('set'));
    document.getElementById('btn-change-pass').addEventListener('click', () => openPassInput('change'));
    document.getElementById('btn-remove-pass').addEventListener('click', removeDbPassword);

    document.getElementById('pass-input-cancel').addEventListener('click', () => {
        document.getElementById('pass-input-modal').classList.add('hidden');
    });
    document.getElementById('pass-input-save').addEventListener('click', handlePassInputSave);

    document.getElementById('toggle-new-pass-1').addEventListener('click', () => {
        const input = document.getElementById('new-pass-1');
        input.type = input.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('confirm-cancel').addEventListener('click', closeConfirmModal);
    document.getElementById('confirm-ok').addEventListener('click', handleConfirmOk);
});
