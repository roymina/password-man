const { invoke, convertFileSrc } = window.__TAURI__.core;
import { getLanguage, initI18n, setLanguage, t } from "./i18n.js";
import { extractFirstImagePath, renderMarkdown, stripMarkdown } from "./markdown.js";

let autostartApi = null;

let currentPasswords = [];
let currentBookmarks = [];
let currentBookmarkGroups = [];
let currentNotes = [];
let currentNoteAssetsDir = "";
let activeGroupId = null;
let currentTab = "passwords";
let isDbProtected = false;
let noteEditorMode = "edit";
let noteSelectionStart = 0;
let noteSelectionEnd = 0;

const passwordList = document.getElementById("password-list");
const searchInput = document.getElementById("search-input");
const addBtn = document.getElementById("add-btn");
const themeToggle = document.getElementById("theme-toggle");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const modalCancel = document.getElementById("modal-cancel");
const modalSave = document.getElementById("modal-save");
const mId = document.getElementById("modal-id");
const mName = document.getElementById("modal-name");
const mUsername = document.getElementById("modal-username");
const mUrl = document.getElementById("modal-url");
const mPassword = document.getElementById("modal-password");
const mNote = document.getElementById("modal-note");
const mGenPwd = document.getElementById("modal-gen-pwd");

const bookmarkSearchInput = document.getElementById("bookmark-search-input");
const bookmarkList = document.getElementById("bookmark-list");
const bookmarkGroupBar = document.getElementById("bookmark-group-bar");
const bookmarkImportFile = document.getElementById("bookmark-import-file");
const bookmarkModal = document.getElementById("bookmark-modal");
const bookmarkModalTitle = document.getElementById("bm-modal-title");
const bmId = document.getElementById("bm-modal-id");
const bmTitleInput = document.getElementById("bm-modal-title-input");
const bmUrlInput = document.getElementById("bm-modal-url");
const bmGroupSelect = document.getElementById("bm-modal-group");
const bmNoteInput = document.getElementById("bm-modal-note");

const groupModal = document.getElementById("bookmark-group-modal");
const groupNameInput = document.getElementById("bookmark-group-name");

const noteSearchInput = document.getElementById("note-search-input");
const noteList = document.getElementById("note-list");
const noteModal = document.getElementById("note-modal");
const noteModalTitle = document.getElementById("note-modal-title");
const noteModalId = document.getElementById("note-modal-id");
const noteTitleInput = document.getElementById("note-modal-title-input");
const noteContentInput = document.getElementById("note-modal-content");
const notePreview = document.getElementById("note-preview");
const noteEditModeBtn = document.getElementById("note-edit-mode");
const notePreviewModeBtn = document.getElementById("note-preview-mode");
const noteInsertImageBtn = document.getElementById("note-insert-image-btn");
const noteImageInput = document.getElementById("note-image-input");

async function getAutostartApi() {
    if (autostartApi) return autostartApi;

    if (window.__TAURI__?.plugin?.autostart) {
        autostartApi = window.__TAURI__.plugin.autostart;
        return autostartApi;
    }

    try {
        autostartApi = await import("@tauri-apps/plugin-autostart");
        return autostartApi;
    } catch (error) {
        console.warn("Autostart plugin not available:", error);
        autostartApi = null;
        return null;
    }
}

async function autostartIsEnabled() {
    try {
        return await invoke("autostart_is_enabled");
    } catch {
        const api = await getAutostartApi();
        return api?.isEnabled ? api.isEnabled() : false;
    }
}

async function autostartEnable() {
    try {
        return await invoke("autostart_enable");
    } catch {
        const api = await getAutostartApi();
        return api?.enable ? api.enable() : undefined;
    }
}

async function autostartDisable() {
    try {
        return await invoke("autostart_disable");
    } catch {
        const api = await getAutostartApi();
        return api?.disable ? api.disable() : undefined;
    }
}

function addSettingsLog(message) {
    const list = document.getElementById("settings-log-list");
    if (!list) return;
    const item = document.createElement("li");
    item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    list.prepend(item);
    while (list.children.length > 20) {
        list.removeChild(list.lastChild);
    }
}

function initTheme() {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
        document.body.classList.add("dark-theme");
    }

    themeToggle.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-theme");
        document.body.classList.toggle("dark-theme", !isDark);
        document.body.classList.toggle("light-theme", isDark);
    });
}

async function switchTab(tab) {
    currentTab = tab;
    document.getElementById("tab-passwords").classList.toggle("active", tab === "passwords");
    document.getElementById("tab-bookmarks").classList.toggle("active", tab === "bookmarks");
    document.getElementById("tab-notes").classList.toggle("active", tab === "notes");

    document.getElementById("password-controls").classList.toggle("hidden", tab !== "passwords");
    document.getElementById("bookmark-controls").classList.toggle("hidden", tab !== "bookmarks");
    document.getElementById("note-controls").classList.toggle("hidden", tab !== "notes");
    document.getElementById("password-section").classList.toggle("hidden", tab !== "passwords");
    document.getElementById("bookmark-section").classList.toggle("hidden", tab !== "bookmarks");
    document.getElementById("note-section").classList.toggle("hidden", tab !== "notes");
    bookmarkGroupBar.classList.toggle("hidden", tab !== "bookmarks");

    if (tab === "bookmarks") {
        await refreshBookmarksView();
    }
    if (tab === "notes") {
        await refreshNotesView();
    }
}

function createIconButton(src, title, onClick) {
    const button = document.createElement("button");
    button.className = "action-btn";
    button.type = "button";
    button.title = title;
    const img = document.createElement("img");
    img.src = src;
    img.alt = title;
    button.appendChild(img);
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
    });
    return button;
}

function createCopyableContent(textValue, copyValue) {
    const wrapper = document.createElement("div");
    wrapper.className = "copyable-cell";

    const text = document.createElement("span");
    text.className = "copyable-cell-text";
    text.textContent = textValue;
    wrapper.appendChild(text);

    if (copyValue) {
        wrapper.appendChild(
            createIconButton("assets/solar--copy-line-duotone.svg", t("tooltip-copy"), () =>
                copyToClipboard(copyValue)
            )
        );
    }

    return wrapper;
}

function copyToClipboard(value) {
    navigator.clipboard
        .writeText(value)
        .then(() => showToast(t("toast-copied")))
        .catch(() => showToast(t("toast-copy-fail")));
}

async function loadPasswords() {
    try {
        const search = searchInput.value.trim() || null;
        currentPasswords = await invoke("get_passwords", { search });
        renderPasswords();
    } catch (error) {
        handleDataAccessError(error);
    }
}

function renderPasswords() {
    passwordList.innerHTML = "";

    currentPasswords.forEach((passwordItem) => {
        const card = document.createElement("article");
        card.className = `entity-card password-card${passwordItem.pinned ? " pinned-row" : ""}`;
        card.addEventListener("dblclick", () => openPasswordModal(passwordItem));

        const header = document.createElement("div");
        header.className = "entity-card-header";

        const title = document.createElement("h3");
        title.className = "entity-card-title";
        title.textContent = passwordItem.pinned ? `★ ${passwordItem.name}` : passwordItem.name;
        title.title = passwordItem.name;

        const actions = document.createElement("div");
        actions.className = "entity-card-actions";

        const pinBtn = createIconButton(
            "assets/solar--arrow-to-top-left-bold.svg",
            passwordItem.pinned ? t("tooltip-unpin") : t("tooltip-pin"),
            () => togglePinPassword(passwordItem.id, !passwordItem.pinned)
        );
        if (passwordItem.pinned) pinBtn.style.backgroundColor = "var(--border-color)";

        const editBtn = createIconButton("assets/solar--pen-linear.svg", t("modal-edit-title"), () =>
            openPasswordModal(passwordItem)
        );
        const deleteBtn = createIconButton("assets/solar--remove-square-broken.svg", t("th-action"), () =>
            deletePassword(passwordItem.id)
        );
        deleteBtn.classList.add("delete-btn");
        actions.append(pinBtn, editBtn, deleteBtn);
        header.append(title, actions);

        const content = document.createElement("div");
        content.className = "entity-card-content";

        content.appendChild(
            createDetailField(t("th-username"), passwordItem.username || "-", passwordItem.username || null)
        );
        const normalizedUrl = passwordItem.url ? normalizeUrl(passwordItem.url) : null;
        content.appendChild(createDetailField(t("th-url"), passwordItem.url || "-", normalizedUrl));

        const passwordField = document.createElement("div");
        passwordField.className = "detail-field";

        const passwordLabel = document.createElement("span");
        passwordLabel.className = "detail-field-label";
        passwordLabel.textContent = t("th-password");

        const passwordValue = document.createElement("div");
        passwordValue.className = "detail-field-value password-card-secret";

        const passwordSpan = document.createElement("span");
        passwordSpan.dataset.real = passwordItem.password;
        passwordSpan.dataset.mask = "••••••";
        passwordSpan.dataset.visible = "false";
        passwordSpan.textContent = passwordSpan.dataset.mask;
        passwordValue.appendChild(passwordSpan);
        passwordValue.appendChild(
            createIconButton("assets/solar--eye-outline.svg", t("tooltip-show-hide"), () => {
                const visible = passwordSpan.dataset.visible === "true";
                passwordSpan.textContent = visible ? passwordSpan.dataset.mask : passwordSpan.dataset.real;
                passwordSpan.dataset.visible = visible ? "false" : "true";
            })
        );
        passwordValue.appendChild(
            createIconButton("assets/solar--copy-line-duotone.svg", t("tooltip-copy"), () =>
                copyToClipboard(passwordItem.password)
            )
        );
        passwordField.append(passwordLabel, passwordValue);
        content.appendChild(passwordField);

        content.appendChild(
            createTextBlock(t("th-note"), passwordItem.note || t("common-no-note"), {
                compact: true,
                empty: !passwordItem.note,
            })
        );

        card.append(header, content);
        passwordList.appendChild(card);
    });
}

function createDetailField(label, textValue, copyValue = null) {
    const field = document.createElement("div");
    field.className = "detail-field";

    const labelNode = document.createElement("span");
    labelNode.className = "detail-field-label";
    labelNode.textContent = label;

    const value = createCopyableContent(textValue, copyValue);
    value.classList.add("detail-field-value");

    field.append(labelNode, value);
    return field;
}

function createTextBlock(label, text, options = {}) {
    const block = document.createElement("div");
    block.className = "text-block";
    if (options.compact) block.classList.add("compact");
    if (options.empty) block.classList.add("empty");

    const labelNode = document.createElement("span");
    labelNode.className = "detail-field-label";
    labelNode.textContent = label;

    const textNode = document.createElement("p");
    textNode.className = "text-block-content";
    textNode.textContent = text;
    textNode.title = text;

    block.append(labelNode, textNode);
    return block;
}

function openPasswordModal(passwordItem = null) {
    if (passwordItem) {
        modalTitle.textContent = t("modal-edit-title");
        mId.value = passwordItem.id;
        mName.value = passwordItem.name;
        mUsername.value = passwordItem.username || "";
        mUrl.value = passwordItem.url || "";
        mPassword.value = passwordItem.password;
        mNote.value = passwordItem.note || "";
    } else {
        modalTitle.textContent = t("modal-add-title");
        mId.value = "";
        mName.value = "";
        mUsername.value = "";
        mUrl.value = "";
        mPassword.value = "";
        mNote.value = "";
    }
    modal.classList.remove("hidden");
}

function closePasswordModal() {
    modal.classList.add("hidden");
}

async function savePassword() {
    const payload = {
        name: mName.value.trim(),
        username: mUsername.value.trim() || null,
        url: mUrl.value.trim() || null,
        password: mPassword.value,
        note: mNote.value.trim() || null,
    };

    if (!payload.name || !payload.password) {
        alert(t("alert-name-pass-req"));
        return;
    }

    try {
        if (mId.value) {
            await invoke("update_password", { id: Number(mId.value), ...payload });
        } else {
            await invoke("add_password", payload);
        }
        closePasswordModal();
        await loadPasswords();
        showToast(t("toast-saved"));
    } catch (error) {
        alert(t("alert-op-fail") + error);
    }
}

function generatePassword() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
    let password = "";
    for (let index = 0; index < 16; index += 1) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    mPassword.value = password;
}

async function togglePinPassword(id, pinned) {
    try {
        await invoke("toggle_pin_password", { id, pinned });
        await loadPasswords();
    } catch (error) {
        alert(t("alert-op-fail") + error);
    }
}

function deletePassword(id) {
    showConfirm(t("confirm-del-msg"), async () => {
        try {
            await invoke("delete_password", { id });
            await loadPasswords();
            showToast(t("toast-deleted"));
        } catch (error) {
            alert(t("alert-del-fail") + error);
        }
    });
}

async function refreshBookmarksView() {
    try {
        await loadBookmarkGroups();
        await loadBookmarks();
    } catch (error) {
        handleDataAccessError(error);
    }
}

async function loadBookmarkGroups() {
    currentBookmarkGroups = await invoke("get_bookmark_groups");
    renderBookmarkGroupBar();
    populateBookmarkGroupSelect();
}

async function loadBookmarks() {
    try {
        const search = bookmarkSearchInput.value.trim() || null;
        currentBookmarks = await invoke("get_bookmarks", {
            search,
            groupId: activeGroupId,
        });
        renderBookmarks();
    } catch (error) {
        handleDataAccessError(error);
    }
}

function renderBookmarkGroupBar() {
    bookmarkGroupBar.innerHTML = "";

    const allButton = document.createElement("button");
    allButton.className = `bookmark-group-chip${activeGroupId === null ? " active" : ""}`;
    allButton.textContent = t("bm-all-groups");
    allButton.addEventListener("click", async () => {
        activeGroupId = null;
        renderBookmarkGroupBar();
        await loadBookmarks();
    });
    bookmarkGroupBar.appendChild(allButton);

    currentBookmarkGroups.forEach((group) => {
        const button = document.createElement("button");
        button.className = `bookmark-group-chip${activeGroupId === group.id ? " active" : ""}`;
        button.textContent = group.name;
        button.addEventListener("click", async () => {
            activeGroupId = group.id;
            renderBookmarkGroupBar();
            await loadBookmarks();
        });
        bookmarkGroupBar.appendChild(button);
    });
}

function populateBookmarkGroupSelect(selectedGroupId = activeGroupId) {
    bmGroupSelect.innerHTML = "";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = t("bm-no-group");
    bmGroupSelect.appendChild(emptyOption);

    currentBookmarkGroups.forEach((group) => {
        const option = document.createElement("option");
        option.value = String(group.id);
        option.textContent = group.name;
        bmGroupSelect.appendChild(option);
    });

    bmGroupSelect.value = selectedGroupId == null ? "" : String(selectedGroupId);
}

function renderBookmarks() {
    bookmarkList.innerHTML = "";

    currentBookmarks.forEach((bookmark) => {
        const card = document.createElement("article");
        card.className = `entity-card bookmark-entity-card${bookmark.pinned ? " pinned-row" : ""}`;
        card.addEventListener("dblclick", () => openBookmarkUrl(bookmark.url));

        const header = document.createElement("div");
        header.className = "entity-card-header";
        header.appendChild(createBookmarkCard(bookmark));

        const actionCell = document.createElement("div");
        actionCell.className = "entity-card-actions";
        const openBtn = createIconButton("assets/solar--arrow-to-top-left-bold.svg", t("bm-open-tooltip"), () =>
            openBookmarkUrl(bookmark.url)
        );
        openBtn.style.transform = "rotate(90deg) scale(0.8)";

        const copyBtn = createIconButton("assets/solar--copy-line-duotone.svg", t("bm-copy-url-tooltip"), () =>
            copyToClipboard(normalizeUrl(bookmark.url))
        );
        const pinBtn = createIconButton(
            "assets/solar--arrow-to-top-left-bold.svg",
            bookmark.pinned ? t("tooltip-unpin") : t("tooltip-pin"),
            () => togglePinBookmark(bookmark.id, !bookmark.pinned)
        );
        if (bookmark.pinned) pinBtn.style.backgroundColor = "var(--border-color)";

        const editBtn = createIconButton("assets/solar--pen-linear.svg", t("bm-modal-edit-title"), () =>
            openBookmarkModal(bookmark)
        );
        const deleteBtn = createIconButton("assets/solar--remove-square-broken.svg", t("bm-th-action"), () =>
            deleteBookmark(bookmark.id)
        );
        deleteBtn.classList.add("delete-btn");

        actionCell.append(openBtn, copyBtn, pinBtn, editBtn, deleteBtn);
        header.appendChild(actionCell);

        const content = document.createElement("div");
        content.className = "entity-card-content";
        content.appendChild(createDetailField(t("bm-th-url"), bookmark.url, normalizeUrl(bookmark.url)));

        const metaRow = document.createElement("div");
        metaRow.className = "bookmark-meta-row";

        const groupLabel = document.createElement("span");
        groupLabel.className = "bookmark-group-label";
        groupLabel.textContent = bookmark.group_name || t("bm-no-group");

        const savedAt = document.createElement("span");
        savedAt.className = "bookmark-saved-at";
        savedAt.textContent = `${formatAbsoluteDate(bookmark.created_at)} · ${formatRelativeTime(bookmark.created_at)}`;

        metaRow.append(groupLabel, savedAt);
        content.appendChild(metaRow);

        content.appendChild(
            createTextBlock(t("bm-th-note"), bookmark.note || t("common-no-note"), {
                compact: true,
                empty: !bookmark.note,
            })
        );

        card.append(header, content);
        bookmarkList.appendChild(card);
    });
}

function createBookmarkCard(bookmark) {
    const wrapper = document.createElement("div");
    wrapper.className = "bookmark-card bookmark-card-head";

    const favicon = document.createElement("img");
    favicon.className = "bookmark-card-favicon";
    favicon.src = bookmark.favicon_url || "favicon.png";
    favicon.alt = bookmark.site_title || bookmark.title;
    favicon.onerror = () => {
        favicon.src = "favicon.png";
    };

    const body = document.createElement("div");
    body.className = "bookmark-card-body";

    const title = document.createElement("div");
    title.className = "bookmark-card-title";
    title.textContent = bookmark.site_title || bookmark.title;

    const description = document.createElement("div");
    description.className = "bookmark-card-description";
    description.textContent = bookmark.site_description || t("bm-no-description");

    body.append(title, description);
    wrapper.append(favicon, body);
    return wrapper;
}

function createBookmarkUrlCell(url) {
    const wrapper = document.createElement("div");
    wrapper.className = "bookmark-url-cell";

    const text = document.createElement("span");
    text.className = "bookmark-url-text";
    text.textContent = url;
    wrapper.appendChild(text);

    wrapper.appendChild(
        createIconButton("assets/solar--copy-line-duotone.svg", t("bm-copy-url-tooltip"), () =>
            copyToClipboard(normalizeUrl(url))
        )
    );

    return wrapper;
}

function openBookmarkModal(bookmark = null) {
    if (bookmark) {
        bookmarkModalTitle.textContent = t("bm-modal-edit-title");
        bmId.value = bookmark.id;
        bmTitleInput.value = bookmark.title;
        bmUrlInput.value = bookmark.url;
        bmNoteInput.value = bookmark.note || "";
        populateBookmarkGroupSelect(bookmark.group_id ?? null);
    } else {
        bookmarkModalTitle.textContent = t("bm-modal-add-title");
        bmId.value = "";
        bmTitleInput.value = "";
        bmUrlInput.value = "";
        bmNoteInput.value = "";
        populateBookmarkGroupSelect(activeGroupId);
    }

    bookmarkModal.classList.remove("hidden");
    bmTitleInput.focus();
}

function closeBookmarkModal() {
    bookmarkModal.classList.add("hidden");
}

async function saveBookmark() {
    const payload = {
        title: bmTitleInput.value.trim(),
        url: bmUrlInput.value.trim(),
        note: bmNoteInput.value.trim() || null,
        groupId: bmGroupSelect.value ? Number(bmGroupSelect.value) : null,
    };

    if (!payload.title || !payload.url) {
        alert(t("bm-alert-title-url-req"));
        return;
    }

    try {
        if (bmId.value) {
            await invoke("update_bookmark", { id: Number(bmId.value), ...payload });
        } else {
            await invoke("add_bookmark", payload);
        }
        closeBookmarkModal();
        await refreshBookmarksView();
        showToast(t("toast-saved"));
    } catch (error) {
        alert(formatBackendError(error));
    }
}

async function togglePinBookmark(id, pinned) {
    try {
        await invoke("toggle_pin_bookmark", { id, pinned });
        await loadBookmarks();
    } catch (error) {
        alert(formatBackendError(error));
    }
}

function deleteBookmark(id) {
    showConfirm(t("bm-confirm-del"), async () => {
        try {
            await invoke("delete_bookmark", { id });
            await refreshBookmarksView();
            showToast(t("toast-deleted"));
        } catch (error) {
            alert(formatBackendError(error));
        }
    });
}

function openGroupModal() {
    groupNameInput.value = "";
    groupModal.classList.remove("hidden");
    groupNameInput.focus();
}

function closeGroupModal() {
    groupModal.classList.add("hidden");
}

async function saveBookmarkGroup() {
    try {
        const group = await invoke("add_bookmark_group", { name: groupNameInput.value });
        activeGroupId = group.id;
        closeGroupModal();
        await refreshBookmarksView();
        showToast(t("toast-saved"));
    } catch (error) {
        alert(formatBackendError(error));
    }
}

function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const imported = await invoke("import_bookmarks_json", {
                jsonText: event.target.result,
            });
            await refreshBookmarksView();
            showToast(`${imported}${t("bm-toast-imported")}`);
        } catch (error) {
            alert(formatBackendError(error));
        }
    };
    reader.readAsText(file);
}

async function handleExport() {
    try {
        const path = await invoke("export_bookmarks");
        showToast(t("bm-toast-exported") + path);
    } catch (error) {
        alert(formatBackendError(error));
    }
}

async function refreshNotesView() {
    try {
        await ensureNoteAssetsDir();
    } catch (error) {
        console.error("Failed to init note asset dir:", error);
    }
    await loadNotes();
}

async function ensureNoteAssetsDir() {
    if (currentNoteAssetsDir) return currentNoteAssetsDir;
    currentNoteAssetsDir = await invoke("get_note_assets_dir");
    return currentNoteAssetsDir;
}

async function loadNotes() {
    try {
        const search = noteSearchInput.value.trim() || null;
        currentNotes = await invoke("get_notes", { search });
        renderNotes();
    } catch (error) {
        handleDataAccessError(error);
    }
}

function renderNotes() {
    noteList.innerHTML = "";

    currentNotes.forEach((note) => {
        const card = document.createElement("article");
        card.className = `note-card${note.pinned ? " pinned-row" : ""}`;
        card.addEventListener("dblclick", () => openNoteModal(note));

        const coverPath = extractFirstImagePath(note.content_md);
        const cover = document.createElement("div");
        cover.className = `note-card-cover${coverPath ? "" : " empty"}`;

        if (coverPath) {
            const image = document.createElement("img");
            image.src = resolveNoteCardImageSrc(coverPath);
            image.alt = note.title;
            image.loading = "lazy";
            image.addEventListener("error", () => {
                cover.classList.add("empty");
                image.remove();
            });
            cover.appendChild(image);
        }

        const body = document.createElement("div");
        body.className = "note-card-body";

        const header = document.createElement("div");
        header.className = "note-card-header";

        const title = document.createElement("h3");
        title.className = "note-card-title";
        title.textContent = note.pinned ? `★ ${note.title}` : note.title;
        title.title = note.title;

        const pinBtn = createIconButton(
            "assets/solar--arrow-to-top-left-bold.svg",
            note.pinned ? t("tooltip-unpin") : t("tooltip-pin"),
            () => togglePinNote(note.id, !note.pinned)
        );
        if (note.pinned) pinBtn.style.backgroundColor = "var(--border-color)";
        const editBtn = createIconButton("assets/solar--pen-linear.svg", t("note-modal-edit-title"), () =>
            openNoteModal(note)
        );
        const deleteBtn = createIconButton("assets/solar--remove-square-broken.svg", t("th-action"), () =>
            deleteNote(note.id)
        );
        deleteBtn.classList.add("delete-btn");
        const actions = document.createElement("div");
        actions.className = "note-card-actions";
        actions.append(pinBtn, editBtn, deleteBtn);

        header.append(title, actions);

        const excerpt = buildNoteExcerpt(note.content_md);
        const excerptBlock = document.createElement("p");
        excerptBlock.className = "note-card-excerpt";
        excerptBlock.textContent = excerpt || t("note-empty-content");
        excerptBlock.title = excerpt;

        const updated = document.createElement("div");
        updated.className = "note-card-updated";
        updated.textContent = `${formatAbsoluteDate(note.updated_at)} · ${formatRelativeTime(note.updated_at)}`;
        updated.title = updated.textContent;

        body.append(header, excerptBlock, updated);
        card.append(cover, body);
        noteList.appendChild(card);
    });
}

function buildNoteExcerpt(markdown) {
    return stripMarkdown(markdown).slice(0, 140);
}

function resolveNoteCardImageSrc(path) {
    if (/^(https?:|data:)/i.test(path)) {
        return path;
    }
    return resolveNoteImageSrc(path);
}

function openNoteModal(note = null) {
    if (note) {
        noteModalTitle.textContent = t("note-modal-edit-title");
        noteModalId.value = note.id;
        noteTitleInput.value = note.title;
        noteContentInput.value = note.content_md || "";
    } else {
        noteModalTitle.textContent = t("note-modal-add-title");
        noteModalId.value = "";
        noteTitleInput.value = "";
        noteContentInput.value = "";
    }

    noteSelectionStart = noteContentInput.value.length;
    noteSelectionEnd = noteContentInput.value.length;
    switchNoteEditorMode("edit");
    renderNotePreview();
    noteModal.classList.remove("hidden");
    noteTitleInput.focus();
}

function closeNoteModal() {
    noteModal.classList.add("hidden");
}

function switchNoteEditorMode(mode) {
    noteEditorMode = mode;
    noteEditModeBtn.classList.toggle("active", mode === "edit");
    notePreviewModeBtn.classList.toggle("active", mode === "preview");
    noteContentInput.classList.toggle("hidden", mode !== "edit");
    notePreview.classList.toggle("hidden", mode !== "preview");
    if (mode === "preview") {
        renderNotePreview();
    }
}

function renderNotePreview() {
    const content = noteContentInput.value;
    if (!content.trim()) {
        notePreview.innerHTML = `<p class="note-preview-placeholder">${t("note-empty-preview")}</p>`;
        return;
    }
    notePreview.innerHTML = renderMarkdown(content, {
        resolveImageSrc: resolveNoteImageSrc,
    });
}

function resolveNoteImageSrc(path) {
    if (!/^note-assets[\\/]/i.test(path)) {
        return path;
    }
    if (!currentNoteAssetsDir) {
        return path;
    }
    const normalizedDir = String(currentNoteAssetsDir || "").replace(/\\/g, "/").replace(/\/$/, "");
    const fileName = path.replace(/^note-assets[\\/]/i, "");
    const fullPath = `${normalizedDir}/${fileName}`;
    if (typeof convertFileSrc === "function") {
        return convertFileSrc(fullPath);
    }
    return toFileUrl(fullPath);
}

function toFileUrl(path) {
    const normalized = String(path).replace(/\\/g, "/");
    if (/^[a-zA-Z]:\//.test(normalized)) {
        return `file:///${encodeURI(normalized).replace(/#/g, "%23")}`;
    }
    return `file://${encodeURI(normalized).replace(/#/g, "%23")}`;
}

async function saveNote() {
    const payload = {
        title: noteTitleInput.value.trim(),
        contentMd: noteContentInput.value,
    };

    if (!payload.title) {
        alert(t("note-title-required"));
        return;
    }

    try {
        if (noteModalId.value) {
            await invoke("update_note", { id: Number(noteModalId.value), ...payload });
        } else {
            await invoke("add_note", payload);
        }
        closeNoteModal();
        await loadNotes();
        showToast(t("toast-saved"));
    } catch (error) {
        alert(formatBackendError(error));
    }
}

async function togglePinNote(id, pinned) {
    try {
        await invoke("toggle_pin_note", { id, pinned });
        await loadNotes();
    } catch (error) {
        alert(formatBackendError(error));
    }
}

function deleteNote(id) {
    showConfirm(t("note-confirm-del"), async () => {
        try {
            await invoke("delete_note", { id });
            await loadNotes();
            showToast(t("toast-deleted"));
        } catch (error) {
            alert(formatBackendError(error));
        }
    });
}

function rememberNoteSelection() {
    noteSelectionStart = noteContentInput.selectionStart ?? noteSelectionStart;
    noteSelectionEnd = noteContentInput.selectionEnd ?? noteSelectionEnd;
}

function insertNoteText(text) {
    const start = noteSelectionStart ?? noteContentInput.selectionStart ?? 0;
    const end = noteSelectionEnd ?? noteContentInput.selectionEnd ?? 0;
    const currentValue = noteContentInput.value;
    noteContentInput.value = `${currentValue.slice(0, start)}${text}${currentValue.slice(end)}`;
    const cursor = start + text.length;
    noteContentInput.focus();
    noteContentInput.setSelectionRange(cursor, cursor);
    noteSelectionStart = cursor;
    noteSelectionEnd = cursor;
    renderNotePreview();
}

function fileAltText(fileName) {
    return fileName.replace(/\.[^.]+$/, "").trim() || "image";
}

async function handleNoteImageFile(file) {
    if (!file) return;
    try {
        await ensureNoteAssetsDir();
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        const savedPath = await invoke("save_note_image", {
            fileName: file.name,
            bytes,
        });
        const prefix = noteContentInput.value && !noteContentInput.value.endsWith("\n") ? "\n" : "";
        insertNoteText(`${prefix}![${fileAltText(file.name)}](${savedPath})\n`);
        showToast(t("toast-saved"));
    } catch (error) {
        alert(formatBackendError(error));
    }
}

function normalizeUrl(url) {
    if (!url) return "";
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function openBookmarkUrl(url) {
    if (!url) return;
    try {
        await invoke("open_url", { url: normalizeUrl(url) });
    } catch (error) {
        console.error("Failed to open URL:", error);
    }
}

function formatAbsoluteDate(timestamp) {
    if (!timestamp) return t("bm-created-at");
    const locale = getLanguage() === "zh" ? "zh-CN" : "en-US";
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(timestamp * 1000));
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return "";
    const diffSeconds = Math.round(timestamp - Date.now() / 1000);
    const locale = getLanguage() === "zh" ? "zh-CN" : "en-US";
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const ranges = [
        { unit: "year", seconds: 31536000 },
        { unit: "month", seconds: 2592000 },
        { unit: "day", seconds: 86400 },
        { unit: "hour", seconds: 3600 },
        { unit: "minute", seconds: 60 },
    ];

    for (const range of ranges) {
        if (Math.abs(diffSeconds) >= range.seconds || range.unit === "minute") {
            return formatter.format(Math.round(diffSeconds / range.seconds), range.unit);
        }
    }

    return formatter.format(diffSeconds, "second");
}

function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 2000);
}

let confirmCallback = null;

function showConfirm(message, callback) {
    document.getElementById("confirm-message").textContent = message;
    document.getElementById("confirm-modal").classList.remove("hidden");
    confirmCallback = callback;
}

function closeConfirmModal() {
    document.getElementById("confirm-modal").classList.add("hidden");
    confirmCallback = null;
}

function handleConfirmOk() {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
}

async function unlockDb() {
    const password = document.getElementById("unlock-password").value;
    if (!password) return;

    try {
        await invoke("unlock_db", { password });
        isDbProtected = true;
        document.getElementById("unlock-modal").classList.add("hidden");
        document.getElementById("unlock-password").value = "";
        await loadPasswords();
        if (currentTab === "bookmarks") {
            await refreshBookmarksView();
        }
        if (currentTab === "notes") {
            await refreshNotesView();
        }
    } catch (error) {
        alert(formatBackendError(error));
        await loadPasswords();
    }
}

function showUnlockModal() {
    document.getElementById("unlock-modal").classList.remove("hidden");
    document.getElementById("unlock-password").focus();
}

function openSettingsModal() {
    const noPass = document.getElementById("settings-no-pass");
    const hasPass = document.getElementById("settings-has-pass");
    noPass.classList.toggle("hidden", isDbProtected);
    hasPass.classList.toggle("hidden", !isDbProtected);

    autostartIsEnabled().then((enabled) => {
        document.getElementById("settings-autostart").checked = enabled;
        addSettingsLog(enabled ? t("settings-autostart-enabled") : t("settings-autostart-disabled"));
    });
    document.getElementById("settings-language").value = getLanguage();
    document.getElementById("settings-modal").classList.remove("hidden");
}

let passInputMode = "set";

function openPassInput(mode) {
    passInputMode = mode;
    document.getElementById("pass-input-title").textContent =
        mode === "set" ? t("pass-set-title") : t("pass-change-title");
    document.getElementById("new-pass-1").value = "";
    document.getElementById("new-pass-2").value = "";
    document.getElementById("pass-input-modal").classList.remove("hidden");
    document.getElementById("new-pass-1").focus();
}

async function handlePassInputSave() {
    const password1 = document.getElementById("new-pass-1").value;
    const password2 = document.getElementById("new-pass-2").value;

    if (!password1) {
        alert(t("alert-name-pass-req"));
        return;
    }
    if (password1 !== password2) {
        alert(t("alert-pass-mismatch"));
        return;
    }

    try {
        await invoke("set_db_password", { password: password1 });
        isDbProtected = true;
        document.getElementById("pass-input-modal").classList.add("hidden");
        showToast(t("toast-saved"));
        openSettingsModal();
    } catch (error) {
        alert(formatBackendError(error));
    }
}

async function initAutostart() {
    try {
        const enabled = await autostartIsEnabled();
        document.getElementById("settings-autostart").checked = enabled;
        addSettingsLog(enabled ? t("settings-autostart-enabled") : t("settings-autostart-disabled"));
    } catch (error) {
        console.error("Failed to get autostart state:", error);
        document.getElementById("settings-autostart").disabled = true;
    }
}

function initSettings() {
    document.getElementById("settings-autostart").addEventListener("change", async (event) => {
        try {
            if (event.target.checked) {
                await autostartEnable();
            } else {
                await autostartDisable();
            }
            const enabled = await autostartIsEnabled();
            event.target.checked = enabled;
            addSettingsLog(enabled ? t("settings-autostart-enabled") : t("settings-autostart-disabled"));
        } catch (error) {
            event.target.checked = !event.target.checked;
            console.error("Autostart error", error);
        }
    });

    document.getElementById("settings-language").addEventListener("change", async (event) => {
        setLanguage(event.target.value);
        renderPasswords();
        renderBookmarkGroupBar();
        populateBookmarkGroupSelect(bmGroupSelect.value ? Number(bmGroupSelect.value) : activeGroupId);
        renderBookmarks();
        renderNotes();
        renderNotePreview();
        await loadPasswords();
        if (currentTab === "bookmarks") {
            await refreshBookmarksView();
        }
        if (currentTab === "notes") {
            await refreshNotesView();
        }
    });
}

async function removeDbPassword() {
    if (!confirm(t("confirm-remove-pass"))) return;
    try {
        await invoke("remove_db_password");
        isDbProtected = false;
        showToast(t("toast-saved"));
        openSettingsModal();
    } catch (error) {
        alert(formatBackendError(error));
    }
}

function handleDataAccessError(error) {
    console.error(error);
    if (String(error).includes("LOCKED")) {
        isDbProtected = true;
        showUnlockModal();
        return;
    }
    alert(formatBackendError(error));
}

function formatBackendError(error) {
    const text = String(error);
    if (text.includes("GROUP_EXISTS")) return t("bm-group-exists");
    if (text.includes("GROUP_NAME_REQUIRED")) return t("bm-group-required");
    if (text.includes("INVALID_JSON")) return t("bm-invalid-json");
    if (text.includes("INVALID_SCHEMA")) return t("bm-invalid-schema");
    if (text.includes("UNSUPPORTED_VERSION")) return t("bm-unsupported-version");
    if (text.includes("BOOKMARK_TITLE_REQUIRED") || text.includes("BOOKMARK_URL_REQUIRED")) {
        return t("bm-alert-title-url-req");
    }
    if (text.includes("NOTE_TITLE_REQUIRED")) return t("note-title-required");
    if (text.includes("NOTE_IMAGE_INVALID_TYPE")) return t("note-image-invalid");
    if (text.includes("NOTE_IMAGE_EMPTY")) return t("note-image-invalid");
    if (text.includes("NOTE_IMAGE")) return t("note-image-failed") + text;
    return t("alert-op-fail") + text;
}

window.addEventListener("DOMContentLoaded", async () => {
    initI18n();
    initTheme();
    initSettings();
    initAutostart();
    try {
        await ensureNoteAssetsDir();
    } catch (error) {
        console.error("Failed to init note asset dir:", error);
    }
    await loadPasswords();

    searchInput.addEventListener("input", loadPasswords);
    addBtn.addEventListener("click", () => openPasswordModal());
    modalCancel.addEventListener("click", closePasswordModal);
    modalSave.addEventListener("click", savePassword);
    mGenPwd.addEventListener("click", generatePassword);

    document.getElementById("tab-passwords").addEventListener("click", () => switchTab("passwords"));
    document.getElementById("tab-bookmarks").addEventListener("click", () => switchTab("bookmarks"));
    document.getElementById("tab-notes").addEventListener("click", () => switchTab("notes"));

    bookmarkSearchInput.addEventListener("input", loadBookmarks);
    document.getElementById("bookmark-add-btn").addEventListener("click", () => openBookmarkModal());
    document.getElementById("bookmark-group-add-btn").addEventListener("click", openGroupModal);
    document.getElementById("bm-modal-cancel").addEventListener("click", closeBookmarkModal);
    document.getElementById("bm-modal-save").addEventListener("click", saveBookmark);
    document.getElementById("bookmark-group-cancel").addEventListener("click", closeGroupModal);
    document.getElementById("bookmark-group-save").addEventListener("click", saveBookmarkGroup);

    document.getElementById("bookmark-import-btn").addEventListener("click", () => {
        bookmarkImportFile.value = "";
        bookmarkImportFile.click();
    });
    bookmarkImportFile.addEventListener("change", (event) => handleImportFile(event.target.files[0]));
    document.getElementById("bookmark-export-btn").addEventListener("click", handleExport);

    noteSearchInput.addEventListener("input", loadNotes);
    document.getElementById("note-add-btn").addEventListener("click", () => openNoteModal());
    document.getElementById("note-modal-cancel").addEventListener("click", closeNoteModal);
    document.getElementById("note-modal-save").addEventListener("click", saveNote);
    noteEditModeBtn.addEventListener("click", () => switchNoteEditorMode("edit"));
    notePreviewModeBtn.addEventListener("click", () => switchNoteEditorMode("preview"));
    noteInsertImageBtn.addEventListener("click", () => {
        rememberNoteSelection();
        noteImageInput.value = "";
        noteImageInput.click();
    });
    noteImageInput.addEventListener("change", (event) => handleNoteImageFile(event.target.files[0]));
    noteContentInput.addEventListener("click", rememberNoteSelection);
    noteContentInput.addEventListener("keyup", rememberNoteSelection);
    noteContentInput.addEventListener("select", rememberNoteSelection);
    noteContentInput.addEventListener("input", () => {
        rememberNoteSelection();
        renderNotePreview();
    });
    notePreview.addEventListener("click", (event) => {
        const link = event.target.closest("a");
        if (!link) return;
        event.preventDefault();
        openBookmarkUrl(link.getAttribute("href"));
    });

    document.getElementById("settings-btn").addEventListener("click", openSettingsModal);
    document.getElementById("settings-close").addEventListener("click", () => {
        document.getElementById("settings-modal").classList.add("hidden");
    });

    document.getElementById("btn-unlock").addEventListener("click", unlockDb);
    document.getElementById("unlock-password").addEventListener("keydown", (event) => {
        if (event.key === "Enter") unlockDb();
    });

    document.getElementById("btn-set-pass").addEventListener("click", () => openPassInput("set"));
    document.getElementById("btn-change-pass").addEventListener("click", () => openPassInput("change"));
    document.getElementById("btn-remove-pass").addEventListener("click", removeDbPassword);
    document.getElementById("pass-input-cancel").addEventListener("click", () => {
        document.getElementById("pass-input-modal").classList.add("hidden");
    });
    document.getElementById("pass-input-save").addEventListener("click", handlePassInputSave);
    document.getElementById("toggle-new-pass-1").addEventListener("click", () => {
        const input = document.getElementById("new-pass-1");
        input.type = input.type === "password" ? "text" : "password";
    });

    document.getElementById("confirm-cancel").addEventListener("click", closeConfirmModal);
    document.getElementById("confirm-ok").addEventListener("click", handleConfirmOk);
});
