const { invoke } = window.__TAURI__.core;
import { initI18n, t, setLanguage, getLanguage } from './i18n.js';

let autostartApi = null;

async function getAutostartApi() {
    if (autostartApi) return autostartApi;

    // Prefer global plugin API when available
    if (window.__TAURI__?.plugin?.autostart) {
        autostartApi = window.__TAURI__.plugin.autostart;
        return autostartApi;
    }

    // Fallback to dynamic import (works when a bundler is present)
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

    // Keep last 20 entries
    while (list.children.length > 20) {
        list.removeChild(list.lastChild);
    }
}



let currentPasswords = [];
let isDbLocked = false;
let isDbProtected = false; // Tracks if the DB has a password set (inferred)

// DOM Elements
const passwordList = document.getElementById('password-list');
const searchInput = document.getElementById('search-input');
const addBtn = document.getElementById('add-btn');
const themeToggle = document.getElementById('theme-toggle');
const modal = document.getElementById('modal');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const modalTitle = document.getElementById('modal-title');

// Modal Inputs
const mId = document.getElementById('modal-id');
const mName = document.getElementById('modal-name');
const mUsername = document.getElementById('modal-username');
const mUrl = document.getElementById('modal-url');
const mPassword = document.getElementById('modal-password');
const mNote = document.getElementById('modal-note');
const mGenPwd = document.getElementById('modal-gen-pwd');

// Theme Logic
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

// Load Passwords
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

// Render Table
function renderPasswords() {
    passwordList.innerHTML = '';
    currentPasswords.forEach(pwd => {
        const tr = document.createElement('tr');
        if (pwd.pinned) {
            tr.classList.add('pinned-row');
        }

        // Helper to create icon button
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

        // Name
        const tdName = document.createElement('td');
        // Add pin icon if pinned
        if (pwd.pinned) {
            tdName.textContent = '📌 ' + pwd.name;
        } else {
            tdName.textContent = pwd.name;
        }

        // Username & URL
        const tdUser = document.createElement('td');
        const userDiv = document.createElement('div');
        userDiv.style.display = 'flex';
        userDiv.style.alignItems = 'center';
        userDiv.style.gap = '5px';
        
        const usernameText = document.createElement('span');
        usernameText.textContent = pwd.username || '-';
        userDiv.appendChild(usernameText);

        if (pwd.username) {
             const copyUserBtn = createIconBtn('assets/solar--copy-line-duotone.svg', t('toast-copied'), () => {
                navigator.clipboard.writeText(pwd.username).then(() => {
                    showToast(t('toast-copied'));
                }).catch(err => {
                    console.error('Copy failed', err);
                    showToast(t('toast-copy-fail'));
                });
            });
            // Make it consistent with other buttons
            // copyUserBtn.style.transform = 'scale(0.8)';
            userDiv.appendChild(copyUserBtn);
        }
        tdUser.appendChild(userDiv);



        const tdUrl = document.createElement('td');
        if (pwd.url) {
            const urlDiv = document.createElement('div');
            
            let finalUrl = pwd.url;
            if (!/^https?:\/\//i.test(finalUrl)) {
                finalUrl = 'https://' + finalUrl;
            }
            
            // Use span instead of anchor tag - no click to open
            const urlSpan = document.createElement('span');
            urlSpan.title = finalUrl;
            
            // Truncate logic
            let displayUrl = pwd.url.replace(/^https?:\/\//, '');
            if (displayUrl.length > 25) {
                displayUrl = displayUrl.substring(0, 25) + '...';
            }
            urlSpan.textContent = '🔗 ' + displayUrl;
            urlSpan.style.fontSize = '0.9em';
            urlSpan.style.color = 'var(--text-color)';
            
            // Flex container for URL + Copy btn
            urlDiv.style.display = 'flex';
            urlDiv.style.alignItems = 'center';
            urlDiv.style.gap = '5px';
            
            urlDiv.appendChild(urlSpan);

            const copyUrlBtn = createIconBtn('assets/solar--copy-line-duotone.svg', t('toast-copied'), (e) => {
                // Prevent row click or link click events
                e.preventDefault();
                e.stopPropagation();
                navigator.clipboard.writeText(finalUrl).then(() => {
                    showToast(t('toast-copied'));
                }).catch(err => {
                    console.error('Copy failed', err);
                    showToast(t('toast-copy-fail'));
                });
            });
            // copyUrlBtn.style.transform = 'scale(0.8)';
            urlDiv.appendChild(copyUrlBtn);

            tdUrl.appendChild(urlDiv);
        }

        // Password with Toggle
        const tdPwd = document.createElement('td');
        tdPwd.className = 'password-cell';
        const span = document.createElement('span');
        span.textContent = '••••••';
        span.dataset.real = pwd.password;
        span.dataset.mask = '••••••';
        span.dataset.visible = 'false';



        const eyeBtn = createIconBtn('assets/solar--eye-outline.svg', t('tooltip-show-hide'), () => {
            const visible = span.dataset.visible === 'true';
            if (visible) {
                span.textContent = span.dataset.mask;
                span.dataset.visible = 'false';
                // eyeBtn icon remains same for now as we lack 'closed eye' icon
            } else {
                span.textContent = span.dataset.real;
                span.dataset.visible = 'true';
            }
        });

        const copyBtn = createIconBtn('assets/solar--copy-line-duotone.svg', t('tooltip-copy'), () => {
            navigator.clipboard.writeText(pwd.password).then(() => {
                showToast(t('toast-copied'));
            }).catch(err => {
                console.error('Copy failed', err);
                showToast(t('toast-copy-fail'));
            });
        });

        tdPwd.appendChild(span);
        tdPwd.appendChild(eyeBtn);
        tdPwd.appendChild(copyBtn);

        // Note
        const tdNote = document.createElement('td');
        tdNote.textContent = pwd.note || '';

        // Actions
        const tdActions = document.createElement('td');

        const pinBtn = createIconBtn('assets/solar--arrow-to-top-left-bold.svg', pwd.pinned ? t('tooltip-unpin') : t('tooltip-pin'), () => togglePin(pwd.id, !pwd.pinned));
        if (pwd.pinned) {
            // Optional: style pin button to show active state
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

// CRUD Operations
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

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger reflow
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        // Remove from DOM after transition
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300); // Wait for transition duration
    }, 2000);
}

// Event Listeners
window.addEventListener('DOMContentLoaded', async () => {
    initI18n();
    initTheme();
    loadPasswords();
    initSettings();
    initAutostart();

    searchInput.addEventListener('input', loadPasswords);

    addBtn.addEventListener('click', () => openModal(null));
    modalCancel.addEventListener('click', closeModal);
    modalSave.addEventListener('click', savePassword);
    mGenPwd.addEventListener('click', generatePassword);

    // Settings & Unlock Events
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


    // Toggle password visibility in Set Password modal
    document.getElementById('toggle-new-pass-1').addEventListener('click', () => {
        const input = document.getElementById('new-pass-1');
        input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Confirm Modal Events
    document.getElementById('confirm-cancel').addEventListener('click', closeConfirmModal);
    document.getElementById('confirm-ok').addEventListener('click', handleConfirmOk);
});

// Confirm Modal Logic
let confirmCallback = null;

function showConfirm(message, callback) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    msgEl.textContent = message;
    confirmCallback = callback;
    modal.classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    confirmCallback = null;
}

function handleConfirmOk() {
    if (confirmCallback) {
        confirmCallback();
    }
    closeConfirmModal();
}

// Settings & Security Logic

// Initialize autostart checkbox state on load
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

// Unlock
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

// Settings Modal
function openSettingsModal() {
    // Determine state
    // If we loaded passwords successfully without unlock modal, and we haven't unlocked manually,
    // then it's Unprotected.
    // If we Unlocked manually, it is Protected.
    // BUT exception: If the user just started app and it loaded, isDbProtected is false by default.
    // So logic:
    // If isDbLocked -> show unlock first? No, we can't open settings.

    const noPassDiv = document.getElementById('settings-no-pass');
    const hasPassDiv = document.getElementById('settings-has-pass');

    // Update Autostart Checkbox
    const autostartCb = document.getElementById('settings-autostart');
    autostartIsEnabled().then(enabled => {
        autostartCb.checked = enabled;
        addSettingsLog(`开机启动状态：${enabled ? '已开启' : '未开启'}`);
    });

    // Update Language Selection
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

let passInputMode = 'set'; // 'set' or 'change'

function openPassInput(mode) {
    passInputMode = mode;
    const title = document.getElementById('pass-input-title');
    title.textContent = mode === 'set' ? t('pass-set-title') : t('pass-change-title');

    document.getElementById('new-pass-1').value = '';
    document.getElementById('new-pass-2').value = '';

    document.getElementById('pass-input-modal').classList.remove('hidden');
    document.getElementById('new-pass-1').focus();
}

async function handlePassInputSave() {
    const p1 = document.getElementById('new-pass-1').value;
    const p2 = document.getElementById('new-pass-2').value;

    if (!p1) {
        alert(t('alert-name-pass-req')); // reusing helper or generic empty
        return;
    }
    if (p1 !== p2) {
        alert(t('alert-pass-mismatch'));
        return;
    }

    try {
        if (passInputMode === 'set') {
            await invoke('set_db_password', { password: p1 });
            isDbProtected = true;
            showToast(t('toast-saved'));
        } else {
            // Change
            await invoke('set_db_password', { password: p1 }); // rekey uses set_db_password logic
            showToast(t('toast-saved'));
        }
        document.getElementById('pass-input-modal').classList.add('hidden');
        openSettingsModal(); // Refresh UI
    } catch (e) {
        alert(t('alert-op-fail') + e);
    }
}

// Extra Settings Logic
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
            e.target.checked = !e.target.checked; // Revert
            addSettingsLog('开机启动设置失败，已回退状态');
        }
    });

    const langSelect = document.getElementById('settings-language');
    langSelect.addEventListener('change', (e) => {
        setLanguage(e.target.value);
        // Refresh things like placeholders or re-render list if needed
        loadPasswords();
    });
}

async function removeDbPassword() {
    if (!confirm(t('confirm-remove-pass'))) {
        return;
    }

    try {
        await invoke('remove_db_password');
        isDbProtected = false;
        showToast(t('toast-saved'));
        openSettingsModal(); // Refresh UI
    } catch (e) {
        alert(t('alert-op-fail') + e);
    }
}
