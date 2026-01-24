const { invoke } = window.__TAURI__.core;

let currentPasswords = [];

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
        alert('加载密码失败: ' + error);
    }
}

// Render Table
function renderPasswords() {
    passwordList.innerHTML = '';
    currentPasswords.forEach(pwd => {
        const tr = document.createElement('tr');
        
        // Name
        const tdName = document.createElement('td');
        tdName.textContent = pwd.name;
        
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
        
        const eyeBtn = document.createElement('button');
        eyeBtn.textContent = '👁️';
        eyeBtn.className = 'action-btn';
        eyeBtn.onclick = () => {
             const visible = span.dataset.visible === 'true';
             if (visible) {
                 span.textContent = span.dataset.mask;
                 span.dataset.visible = 'false';
                 eyeBtn.textContent = '👁️';
             } else {
                 span.textContent = span.dataset.real;
                 span.dataset.visible = 'true';
                 eyeBtn.textContent = '🙈';
             }
        };

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋';
        copyBtn.className = 'action-btn';
        copyBtn.title = 'Copy';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(pwd.password);
            // Optional data-tooltip for feedback
        };
        
        tdPwd.appendChild(span);
        tdPwd.appendChild(eyeBtn);
        tdPwd.appendChild(copyBtn);

        // Note
        const tdNote = document.createElement('td');
        tdNote.textContent = pwd.note || '';

        // Actions
        const tdActions = document.createElement('td');
        
        const editBtn = document.createElement('button');
        editBtn.textContent = '修改';
        editBtn.className = 'action-btn';
        editBtn.onclick = () => openModal(pwd);

        const delBtn = document.createElement('button');
        delBtn.textContent = '删除';
        delBtn.className = 'action-btn';
        delBtn.onclick = () => handleDelete(pwd.id);

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
async function handleDelete(id) {
    if (confirm('确定要删除吗？')) {
        try {
            await invoke('delete_password', { id });
            loadPasswords();
        } catch (e) {
            alert('删除失败: ' + e);
        }
    }
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

// Event Listeners
window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadPasswords();

    searchInput.addEventListener('input', loadPasswords);
    
    addBtn.addEventListener('click', () => openModal(null));
    modalCancel.addEventListener('click', closeModal);
    modalSave.addEventListener('click', savePassword);
    mGenPwd.addEventListener('click', generatePassword);
});
