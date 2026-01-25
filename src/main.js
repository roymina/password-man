const { invoke } = window.__TAURI__.core;

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
            alert('加载密码失败: ' + error);
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

        // Name
        const tdName = document.createElement('td');
        // Add pin icon if pinned
        if (pwd.pinned) {
            tdName.textContent = '📌 ' + pwd.name;
        } else {
            tdName.textContent = pwd.name;
        }

        // Username
        const tdUser = document.createElement('td');
        tdUser.textContent = pwd.username || '-';

        // Password with Toggle
        const tdPwd = document.createElement('td');
        tdPwd.className = 'password-cell';
        const span = document.createElement('span');
        span.textContent = '••••••';
        span.dataset.real = pwd.password;
        span.dataset.mask = '••••••';
        span.dataset.visible = 'false';

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

        const eyeBtn = createIconBtn('assets/solar--eye-outline.svg', '显示/隐藏', () => {
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

        const copyBtn = createIconBtn('assets/solar--copy-line-duotone.svg', '复制', () => {
            navigator.clipboard.writeText(pwd.password).then(() => {
                showToast('密码已复制到剪贴板');
            }).catch(err => {
                console.error('Copy failed', err);
                showToast('复制失败');
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

        const pinBtn = createIconBtn('assets/solar--arrow-to-top-left-bold.svg', pwd.pinned ? '取消置顶' : '置顶', () => togglePin(pwd.id, !pwd.pinned));
        if (pwd.pinned) {
            // Optional: style pin button to show active state
            pinBtn.style.backgroundColor = 'var(--border-color)';
        }

        const editBtn = createIconBtn('assets/solar--pen-linear.svg', '修改', () => openModal(pwd));
        const delBtn = createIconBtn('assets/solar--remove-square-broken.svg', '删除', () => handleDelete(pwd.id));
        delBtn.classList.add('delete-btn');

        tdActions.appendChild(pinBtn);
        tdActions.appendChild(editBtn);
        tdActions.appendChild(delBtn);

        tr.appendChild(tdName);
        tr.appendChild(tdUser);
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
    showConfirm('确定要删除这条密码吗？此操作无法撤销。', async () => {
        try {
            await invoke('delete_password', { id });
            loadPasswords();
            showToast('已删除');
        } catch (e) {
            alert('删除失败: ' + e);
        }
    });
}

function openModal(pwd = null) {
    if (pwd) {
        modalTitle.textContent = '修改密码';
        mId.value = pwd.id;
        mName.value = pwd.name;
        mUsername.value = pwd.username || '';
        mPassword.value = pwd.password;
        mNote.value = pwd.note || '';
    } else {
        modalTitle.textContent = '添加密码';
        mId.value = '';
        mName.value = '';
        mUsername.value = '';
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
    const password = mPassword.value;
    const note = mNote.value || null;
    const id = mId.value ? parseInt(mId.value) : null;

    if (!name || !password) {
        alert('名称和密码必填');
        return;
    }

    try {
        if (id) {
            await invoke('update_password', { id, name, username, password, note });
        } else {
            await invoke('add_password', { name, username, password, note });
        }
        closeModal();
        loadPasswords();
    } catch (e) {
        alert('保存失败: ' + e);
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
window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadPasswords();

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
        alert('解锁失败: ' + e);
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
    title.textContent = mode === 'set' ? '设置主密码' : '修改主密码';

    document.getElementById('new-pass-1').value = '';
    document.getElementById('new-pass-2').value = '';

    document.getElementById('pass-input-modal').classList.remove('hidden');
    document.getElementById('new-pass-1').focus();
}

async function handlePassInputSave() {
    const p1 = document.getElementById('new-pass-1').value;
    const p2 = document.getElementById('new-pass-2').value;

    if (!p1) {
        alert('密码不能为空');
        return;
    }
    if (p1 !== p2) {
        alert('两次输入的密码不一致');
        return;
    }

    try {
        if (passInputMode === 'set') {
            await invoke('set_db_password', { password: p1 });
            isDbProtected = true;
            showToast('主密码已设置');
        } else {
            // Change
            await invoke('set_db_password', { password: p1 }); // rekey uses set_db_password logic
            showToast('主密码已修改');
        }
        document.getElementById('pass-input-modal').classList.add('hidden');
        openSettingsModal(); // Refresh UI
    } catch (e) {
        alert('操作失败: ' + e);
    }
}

async function removeDbPassword() {
    if (!confirm('确定要取消密码保护吗？取消后任何人都可以访问您的数据。')) {
        return;
    }

    try {
        await invoke('remove_db_password');
        isDbProtected = false;
        showToast('密码保护已取消');
        openSettingsModal(); // Refresh UI
    } catch (e) {
        alert('操作失败: ' + e);
    }
}
