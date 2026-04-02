use reqwest::blocking::Client;
use reqwest::header::CONTENT_TYPE;
use reqwest::Url;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::io::Write;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

const BOOKMARK_EXPORT_SCHEMA: &str = "passwordman.bookmarks";
const BOOKMARK_EXPORT_VERSION: u32 = 2;
const BOOKMARK_SELECT: &str = "
    SELECT
        b.id,
        b.title,
        b.url,
        b.note,
        b.pinned,
        COALESCE(b.created_at, 0),
        b.site_title,
        b.site_description,
        b.favicon_url,
        b.group_id,
        g.name
    FROM bookmarks b
    LEFT JOIN bookmark_groups g ON g.id = b.group_id
";
const BOOKMARK_ORDER: &str = " ORDER BY b.pinned DESC, b.created_at DESC, b.id DESC";

#[derive(Serialize, Deserialize, Debug)]
pub struct Password {
    pub id: i32,
    pub name: String,
    pub username: Option<String>,
    pub password: String,
    pub note: Option<String>,
    pub url: Option<String>,
    pub pinned: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BookmarkGroup {
    pub id: i32,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Bookmark {
    pub id: i32,
    pub title: String,
    pub url: String,
    pub note: Option<String>,
    pub pinned: bool,
    pub created_at: i64,
    pub site_title: Option<String>,
    pub site_description: Option<String>,
    pub favicon_url: Option<String>,
    pub group_id: Option<i32>,
    pub group_name: Option<String>,
}

#[derive(Debug, Default)]
struct BookmarkMetadata {
    site_title: Option<String>,
    site_description: Option<String>,
    favicon_url: Option<String>,
}

#[derive(Deserialize)]
struct BookmarkImportPayload {
    schema: String,
    version: u32,
    #[serde(default)]
    groups: Vec<BookmarkImportGroup>,
    #[serde(default)]
    bookmarks: Vec<BookmarkImportItem>,
}

#[derive(Deserialize)]
struct BookmarkImportGroup {
    name: String,
}

#[derive(Deserialize)]
struct BookmarkImportItem {
    title: String,
    url: String,
    note: Option<String>,
    group: Option<String>,
    pinned: Option<bool>,
    created_at: Option<i64>,
    site_title: Option<String>,
    site_description: Option<String>,
    favicon_url: Option<String>,
}

#[derive(Serialize)]
struct BookmarkExportPayload {
    schema: &'static str,
    version: u32,
    exported_at: i64,
    groups: Vec<BookmarkExportGroup>,
    bookmarks: Vec<BookmarkExportItem>,
}

#[derive(Serialize)]
struct BookmarkExportGroup {
    name: String,
}

#[derive(Serialize)]
struct BookmarkExportItem {
    title: String,
    url: String,
    note: Option<String>,
    group: Option<String>,
    pinned: bool,
    created_at: i64,
    site_title: Option<String>,
    site_description: Option<String>,
    favicon_url: Option<String>,
}

pub struct AppState {
    pub db_key: Mutex<Option<String>>,
}

pub struct DbState {
    pub db_path: String,
}

impl DbState {
    pub fn new() -> Self {
        let exe_path = std::env::current_exe().expect("Failed to get executable path");
        let exe_dir = exe_path.parent().expect("Failed to get executable directory");
        let db_path = exe_dir.join("pwd.db");

        Self {
            db_path: db_path.to_string_lossy().to_string(),
        }
    }

    pub fn get_connection(&self, key: Option<&str>) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        if let Some(k) = key {
            conn.execute(&format!("PRAGMA key = '{}'", k), [])?;
        }
        Ok(conn)
    }

    pub fn init(&self) -> Result<()> {
        let conn = self.get_connection(None)?;
        let res = run_migrations(&conn);
        match res {
            Ok(_) => Ok(()),
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("file is not a database") || msg.contains("encrypted") {
                    Ok(())
                } else {
                    Err(e)
                }
            }
        }
    }
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS passwords (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT,
            password TEXT NOT NULL,
            note TEXT
        )",
        [],
    )?;
    let _ = conn.execute("ALTER TABLE passwords ADD COLUMN pinned BOOLEAN DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE passwords ADD COLUMN url TEXT", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            note TEXT,
            category TEXT,
            pinned BOOLEAN DEFAULT 0
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS bookmark_groups (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        )",
        [],
    )?;
    let _ = conn.execute(
        "ALTER TABLE bookmarks ADD COLUMN group_id INTEGER REFERENCES bookmark_groups(id)",
        [],
    );
    let _ = conn.execute("ALTER TABLE bookmarks ADD COLUMN created_at INTEGER", []);
    let _ = conn.execute("ALTER TABLE bookmarks ADD COLUMN site_title TEXT", []);
    let _ = conn.execute("ALTER TABLE bookmarks ADD COLUMN site_description TEXT", []);
    let _ = conn.execute("ALTER TABLE bookmarks ADD COLUMN favicon_url TEXT", []);
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_bookmarks_group_id ON bookmarks(group_id)",
        [],
    );

    conn.execute(
        "UPDATE bookmarks
         SET created_at = ?
         WHERE created_at IS NULL OR created_at = 0",
        params![current_timestamp()],
    )?;

    migrate_legacy_bookmark_categories(conn)?;
    Ok(())
}

fn migrate_legacy_bookmark_categories(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT TRIM(category)
         FROM bookmarks
         WHERE category IS NOT NULL AND TRIM(category) != ''",
    )?;
    let categories: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(|row| row.ok())
        .collect();

    for category in categories {
        conn.execute(
            "INSERT OR IGNORE INTO bookmark_groups (name) VALUES (?1)",
            params![category],
        )?;
    }

    conn.execute(
        "UPDATE bookmarks
         SET group_id = (
             SELECT id FROM bookmark_groups
             WHERE bookmark_groups.name = TRIM(bookmarks.category)
         )
         WHERE (group_id IS NULL OR group_id = 0)
           AND category IS NOT NULL
           AND TRIM(category) != ''",
        [],
    )?;

    conn.execute(
        "UPDATE bookmarks
         SET category = (
             SELECT name FROM bookmark_groups
             WHERE bookmark_groups.id = bookmarks.group_id
         )
         WHERE group_id IS NOT NULL",
        [],
    )?;

    Ok(())
}

#[tauri::command]
pub fn get_passwords(state: State<AppState>, search: Option<String>) -> Result<Vec<Password>, String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db
        .get_connection(key)
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut passwords = Vec::new();
    if conn.prepare("SELECT count(*) FROM passwords").is_err() {
        return Err("LOCKED".to_string());
    }

    if let Some(s) = search {
        let pattern = format!("%{}%", s);
        let mut stmt = conn
            .prepare("SELECT id, name, username, password, note, pinned, url FROM passwords WHERE name LIKE ?1 OR username LIKE ?1 OR note LIKE ?1 OR url LIKE ?1 ORDER BY pinned DESC, id DESC")
            .map_err(|e: rusqlite::Error| e.to_string())?;
        let rows = stmt
            .query_map(params![pattern], |row: &rusqlite::Row| {
                Ok(Password {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    username: row.get(2)?,
                    password: row.get(3)?,
                    note: row.get(4)?,
                    pinned: row.get(5).unwrap_or(false),
                    url: row.get(6).unwrap_or(None),
                })
            })
            .map_err(|e: rusqlite::Error| e.to_string())?;

        for password_result in rows {
            let password = password_result.map_err(|e: rusqlite::Error| e.to_string())?;
            passwords.push(password);
        }
    } else {
        let mut stmt = conn
            .prepare("SELECT id, name, username, password, note, pinned, url FROM passwords ORDER BY pinned DESC, id DESC")
            .map_err(|e: rusqlite::Error| e.to_string())?;
        let rows = stmt
            .query_map([], |row: &rusqlite::Row| {
                Ok(Password {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    username: row.get(2)?,
                    password: row.get(3)?,
                    note: row.get(4)?,
                    pinned: row.get(5).unwrap_or(false),
                    url: row.get(6).unwrap_or(None),
                })
            })
            .map_err(|e: rusqlite::Error| e.to_string())?;

        for password_result in rows {
            let password = password_result.map_err(|e: rusqlite::Error| e.to_string())?;
            passwords.push(password);
        }
    }

    Ok(passwords)
}

#[tauri::command]
pub fn add_password(
    state: State<AppState>,
    name: String,
    username: Option<String>,
    password: String,
    note: Option<String>,
    url: Option<String>,
) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO passwords (name, username, password, note, url, pinned) VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        params![name, username, password, note, url],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_password(
    state: State<AppState>,
    id: i32,
    name: String,
    username: Option<String>,
    password: String,
    note: Option<String>,
    url: Option<String>,
) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE passwords SET name = ?1, username = ?2, password = ?3, note = ?4, url = ?5 WHERE id = ?6",
        params![name, username, password, note, url, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_pin_password(state: State<AppState>, id: i32, pinned: bool) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE passwords SET pinned = ?1 WHERE id = ?2",
        params![pinned, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_password(state: State<AppState>, id: i32) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM passwords WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn unlock_db(state: State<AppState>, password: String) -> Result<(), String> {
    let db = DbState::new();
    let conn = db
        .get_connection(Some(&password))
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT count(*) FROM passwords")
        .map_err(|_| "Invalid Password".to_string())?;
    let _ = stmt
        .query_row([], |_| Ok(()))
        .map_err(|_| "Invalid Password".to_string())?;

    let _ = run_migrations(&conn);

    let mut key_guard = state.db_key.lock().unwrap();
    *key_guard = Some(password);

    Ok(())
}

#[tauri::command]
pub fn set_db_password(state: State<AppState>, password: String) -> Result<(), String> {
    let mut key_guard = state.db_key.lock().unwrap();
    let current_key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(current_key).map_err(|e| e.to_string())?;
    conn.execute(&format!("PRAGMA rekey = '{}'", password), [])
        .map_err(|e| e.to_string())?;

    *key_guard = Some(password);
    Ok(())
}

#[tauri::command]
pub fn remove_db_password(state: State<AppState>) -> Result<(), String> {
    let mut key_guard = state.db_key.lock().unwrap();
    let current_key = key_guard.as_deref();

    if current_key.is_none() {
        return Ok(());
    }

    let db = DbState::new();
    let conn = db.get_connection(current_key).map_err(|e| e.to_string())?;
    conn.execute("PRAGMA rekey = ''", [])
        .map_err(|e| e.to_string())?;

    *key_guard = None;
    Ok(())
}

#[tauri::command]
pub fn get_bookmarks(
    state: State<AppState>,
    search: Option<String>,
    group_id: Option<i32>,
) -> Result<Vec<Bookmark>, String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db
        .get_connection(key)
        .map_err(|e: rusqlite::Error| e.to_string())?;

    if conn.prepare("SELECT count(*) FROM bookmarks").is_err() {
        return Err("LOCKED".to_string());
    }

    match (search.and_then(|value| clean_optional_text(Some(value))), group_id) {
        (Some(search), Some(group_id)) => {
            let pattern = format!("%{}%", search);
            let sql = format!(
                "{} WHERE b.group_id = ?1 AND (b.title LIKE ?2 OR b.url LIKE ?2 OR b.note LIKE ?2 OR g.name LIKE ?2 OR b.site_title LIKE ?2 OR b.site_description LIKE ?2){}",
                BOOKMARK_SELECT, BOOKMARK_ORDER
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            collect_bookmarks(stmt.query_map(params![group_id, pattern], map_bookmark_row))
        }
        (Some(search), None) => {
            let pattern = format!("%{}%", search);
            let sql = format!(
                "{} WHERE b.title LIKE ?1 OR b.url LIKE ?1 OR b.note LIKE ?1 OR g.name LIKE ?1 OR b.site_title LIKE ?1 OR b.site_description LIKE ?1{}",
                BOOKMARK_SELECT, BOOKMARK_ORDER
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            collect_bookmarks(stmt.query_map(params![pattern], map_bookmark_row))
        }
        (None, Some(group_id)) => {
            let sql = format!("{} WHERE b.group_id = ?1{}", BOOKMARK_SELECT, BOOKMARK_ORDER);
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            collect_bookmarks(stmt.query_map(params![group_id], map_bookmark_row))
        }
        (None, None) => {
            let sql = format!("{}{}", BOOKMARK_SELECT, BOOKMARK_ORDER);
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            collect_bookmarks(stmt.query_map([], map_bookmark_row))
        }
    }
}

fn collect_bookmarks(
    rows: rusqlite::Result<rusqlite::MappedRows<'_, fn(&rusqlite::Row<'_>) -> rusqlite::Result<Bookmark>>>,
) -> Result<Vec<Bookmark>, String> {
    let mut bookmarks = Vec::new();
    for row in rows.map_err(|e| e.to_string())? {
        bookmarks.push(row.map_err(|e| e.to_string())?);
    }
    Ok(bookmarks)
}

fn map_bookmark_row(row: &rusqlite::Row) -> rusqlite::Result<Bookmark> {
    Ok(Bookmark {
        id: row.get(0)?,
        title: row.get(1)?,
        url: row.get(2)?,
        note: row.get(3)?,
        pinned: row.get(4).unwrap_or(false),
        created_at: row.get(5).unwrap_or(0),
        site_title: row.get(6)?,
        site_description: row.get(7)?,
        favicon_url: row.get(8)?,
        group_id: row.get(9)?,
        group_name: row.get(10)?,
    })
}

#[tauri::command]
pub fn get_bookmark_groups(state: State<AppState>) -> Result<Vec<BookmarkGroup>, String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    if conn.prepare("SELECT count(*) FROM bookmark_groups").is_err() {
        return Err("LOCKED".to_string());
    }
    let mut stmt = conn
        .prepare("SELECT id, name FROM bookmark_groups ORDER BY name COLLATE NOCASE ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(BookmarkGroup {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut groups = Vec::new();
    for row in rows {
        groups.push(row.map_err(|e| e.to_string())?);
    }
    Ok(groups)
}

#[tauri::command]
pub fn add_bookmark_group(state: State<AppState>, name: String) -> Result<BookmarkGroup, String> {
    let group_name = clean_optional_text(Some(name)).ok_or("GROUP_NAME_REQUIRED")?;

    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO bookmark_groups (name) VALUES (?1)",
        params![group_name],
    )
    .map_err(|e| {
        if e.to_string().to_ascii_lowercase().contains("unique") {
            "GROUP_EXISTS".to_string()
        } else {
            e.to_string()
        }
    })?;

    Ok(BookmarkGroup {
        id: conn.last_insert_rowid() as i32,
        name: group_name,
    })
}

#[tauri::command]
pub fn add_bookmark(
    state: State<AppState>,
    title: String,
    url: String,
    note: Option<String>,
    group_id: Option<i32>,
) -> Result<(), String> {
    let title = clean_optional_text(Some(title)).ok_or("BOOKMARK_TITLE_REQUIRED")?;
    let url = clean_optional_text(Some(url)).ok_or("BOOKMARK_URL_REQUIRED")?;

    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;

    let normalized_url = normalize_url(&url);
    let metadata = fetch_bookmark_metadata(&normalized_url);
    let group_name = resolve_group_name(&conn, group_id).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO bookmarks (
            title,
            url,
            note,
            category,
            group_id,
            pinned,
            created_at,
            site_title,
            site_description,
            favicon_url
        ) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9)",
        params![
            title,
            url,
            clean_optional_text(note),
            group_name,
            group_id,
            current_timestamp(),
            metadata.site_title,
            metadata.site_description,
            metadata.favicon_url
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_bookmark(
    state: State<AppState>,
    id: i32,
    title: String,
    url: String,
    note: Option<String>,
    group_id: Option<i32>,
) -> Result<(), String> {
    let title = clean_optional_text(Some(title)).ok_or("BOOKMARK_TITLE_REQUIRED")?;
    let url = clean_optional_text(Some(url)).ok_or("BOOKMARK_URL_REQUIRED")?;

    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;

    let normalized_url = normalize_url(&url);
    let metadata = fetch_bookmark_metadata(&normalized_url);
    let group_name = resolve_group_name(&conn, group_id).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE bookmarks
         SET title = ?1,
             url = ?2,
             note = ?3,
             category = ?4,
             group_id = ?5,
             site_title = ?6,
             site_description = ?7,
             favicon_url = ?8
         WHERE id = ?9",
        params![
            title,
            url,
            clean_optional_text(note),
            group_name,
            group_id,
            metadata.site_title,
            metadata.site_description,
            metadata.favicon_url,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_bookmark(state: State<AppState>, id: i32) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_pin_bookmark(state: State<AppState>, id: i32, pinned: bool) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE bookmarks SET pinned = ?1 WHERE id = ?2",
        params![pinned, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_bookmarks_json(state: State<AppState>, json_text: String) -> Result<usize, String> {
    let payload: BookmarkImportPayload =
        serde_json::from_str(&json_text).map_err(|e| format!("INVALID_JSON: {}", e))?;

    if payload.schema != BOOKMARK_EXPORT_SCHEMA {
        return Err("INVALID_SCHEMA".to_string());
    }
    if payload.version != 1 && payload.version != BOOKMARK_EXPORT_VERSION {
        return Err("UNSUPPORTED_VERSION".to_string());
    }

    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let mut conn = db.get_connection(key).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut group_names = BTreeSet::new();
    for group in payload.groups {
        if let Some(name) = clean_optional_text(Some(group.name)) {
            group_names.insert(name);
        }
    }
    for bookmark in &payload.bookmarks {
        if let Some(name) = clean_optional_text(bookmark.group.clone()) {
            group_names.insert(name);
        }
    }
    for name in group_names {
        tx.execute(
            "INSERT OR IGNORE INTO bookmark_groups (name) VALUES (?1)",
            params![name],
        )
        .map_err(|e| e.to_string())?;
    }

    let mut imported = 0usize;
    for bookmark in payload.bookmarks {
        let title = clean_optional_text(Some(bookmark.title)).ok_or("BOOKMARK_TITLE_REQUIRED")?;
        let url = clean_optional_text(Some(bookmark.url)).ok_or("BOOKMARK_URL_REQUIRED")?;
        let group_name = clean_optional_text(bookmark.group);
        let group_id =
            resolve_group_id_by_name(&tx, group_name.as_deref()).map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO bookmarks (
                title,
                url,
                note,
                category,
                group_id,
                pinned,
                created_at,
                site_title,
                site_description,
                favicon_url
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                title,
                url,
                clean_optional_text(bookmark.note),
                group_name,
                group_id,
                bookmark.pinned.unwrap_or(false),
                bookmark.created_at.unwrap_or_else(current_timestamp),
                clean_optional_text(bookmark.site_title),
                clean_optional_text(bookmark.site_description),
                clean_optional_text(bookmark.favicon_url)
            ],
        )
        .map_err(|e| e.to_string())?;
        imported += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(imported)
}

#[tauri::command]
pub fn export_bookmarks(state: State<AppState>) -> Result<String, String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;

    let mut group_stmt = conn
        .prepare("SELECT name FROM bookmark_groups ORDER BY name COLLATE NOCASE ASC")
        .map_err(|e| e.to_string())?;
    let groups = group_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .map(|name| BookmarkExportGroup { name })
        .collect::<Vec<_>>();

    let sql = format!(
        "{} ORDER BY g.name COLLATE NOCASE ASC, b.title COLLATE NOCASE ASC",
        BOOKMARK_SELECT
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let bookmarks = stmt
        .query_map([], map_bookmark_row)
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .map(|bookmark| BookmarkExportItem {
            title: bookmark.title,
            url: bookmark.url,
            note: bookmark.note,
            group: bookmark.group_name,
            pinned: bookmark.pinned,
            created_at: bookmark.created_at,
            site_title: bookmark.site_title,
            site_description: bookmark.site_description,
            favicon_url: bookmark.favicon_url,
        })
        .collect::<Vec<_>>();

    let payload = BookmarkExportPayload {
        schema: BOOKMARK_EXPORT_SCHEMA,
        version: BOOKMARK_EXPORT_VERSION,
        exported_at: current_timestamp(),
        groups,
        bookmarks,
    };

    let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;

    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Failed to get exe dir")?;
    let file_name = format!("bookmarks_export_{}.json", current_timestamp());
    let out_path = exe_dir.join(file_name);

    let mut file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}

fn resolve_group_name(conn: &Connection, group_id: Option<i32>) -> Result<Option<String>> {
    match group_id {
        Some(group_id) => {
            let name = conn.query_row(
                "SELECT name FROM bookmark_groups WHERE id = ?1",
                params![group_id],
                |row| row.get::<_, String>(0),
            )?;
            Ok(Some(name))
        }
        None => Ok(None),
    }
}

fn resolve_group_id_by_name(conn: &Connection, group_name: Option<&str>) -> Result<Option<i32>> {
    match group_name {
        Some(group_name) => {
            let id = conn.query_row(
                "SELECT id FROM bookmark_groups WHERE name = ?1",
                params![group_name],
                |row| row.get::<_, i32>(0),
            )?;
            Ok(Some(id))
        }
        None => Ok(None),
    }
}

fn clean_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    }
}

fn fetch_bookmark_metadata(url: &str) -> BookmarkMetadata {
    let Ok(parsed_url) = Url::parse(url) else {
        return BookmarkMetadata::default();
    };

    let client = match Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent("PasswordMan/1.0")
        .build()
    {
        Ok(client) => client,
        Err(_) => return fallback_metadata(&parsed_url),
    };

    let response = match client.get(parsed_url.clone()).send() {
        Ok(response) => response,
        Err(_) => return fallback_metadata(&parsed_url),
    };

    let final_url = response.url().clone();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !content_type.contains("text/html") && !content_type.contains("application/xhtml") {
        return fallback_metadata(&final_url);
    }

    let body = match response.text() {
        Ok(body) => body,
        Err(_) => return fallback_metadata(&final_url),
    };

    let mut metadata = BookmarkMetadata {
        site_title: extract_meta_content(&body, "property", "og:title")
            .or_else(|| extract_title_tag(&body)),
        site_description: extract_meta_content(&body, "property", "og:description")
            .or_else(|| extract_meta_content(&body, "name", "description")),
        favicon_url: extract_favicon_url(&body, &final_url),
    };

    if metadata.favicon_url.is_none() {
        metadata.favicon_url = build_default_favicon_url(&final_url);
    }
    if metadata.favicon_url.is_none() {
        metadata.favicon_url = Some(build_google_favicon_url(&final_url));
    }

    metadata
}

fn fallback_metadata(final_url: &Url) -> BookmarkMetadata {
    BookmarkMetadata {
        site_title: None,
        site_description: None,
        favicon_url: build_default_favicon_url(final_url)
            .or_else(|| Some(build_google_favicon_url(final_url))),
    }
}

fn build_default_favicon_url(url: &Url) -> Option<String> {
    let mut favicon = url.clone();
    favicon.set_path("/favicon.ico");
    favicon.set_query(None);
    favicon.set_fragment(None);
    Some(favicon.to_string())
}

fn build_google_favicon_url(url: &Url) -> String {
    format!(
        "https://www.google.com/s2/favicons?sz=64&domain_url={}",
        url.as_str()
    )
}

fn extract_title_tag(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let open_end = lower[start..].find('>')? + start + 1;
    let close = lower[open_end..].find("</title>")? + open_end;
    clean_html_text(&html[open_end..close])
}

fn extract_meta_content(html: &str, attr_name: &str, attr_value: &str) -> Option<String> {
    for tag in extract_tag_fragments(html, "meta") {
        let Some(attr) = extract_attr_value(tag, attr_name) else {
            continue;
        };
        if attr.eq_ignore_ascii_case(attr_value) {
            if let Some(content) = extract_attr_value(tag, "content") {
                return clean_html_text(&content);
            }
        }
    }
    None
}

fn extract_favicon_url(html: &str, base_url: &Url) -> Option<String> {
    for tag in extract_tag_fragments(html, "link") {
        let Some(rel) = extract_attr_value(tag, "rel") else {
            continue;
        };
        if !rel.to_ascii_lowercase().contains("icon") {
            continue;
        }
        let Some(href) = extract_attr_value(tag, "href") else {
            continue;
        };
        if let Ok(url) = base_url.join(&href) {
            return Some(url.to_string());
        }
        if let Ok(url) = Url::parse(&href) {
            return Some(url.to_string());
        }
    }
    None
}

fn extract_tag_fragments<'a>(html: &'a str, tag_name: &str) -> Vec<&'a str> {
    let lower = html.to_ascii_lowercase();
    let needle = format!("<{}", tag_name.to_ascii_lowercase());
    let mut tags = Vec::new();
    let mut cursor = 0usize;

    while let Some(found) = lower[cursor..].find(&needle) {
        let start = cursor + found;
        let Some(end_rel) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_rel + 1;
        tags.push(&html[start..end]);
        cursor = end;
    }

    tags
}

fn extract_attr_value(tag: &str, attr_name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let attr_name = attr_name.to_ascii_lowercase();
    let needle = format!("{}=", attr_name);
    let start = lower.find(&needle)? + needle.len();
    let bytes = tag.as_bytes();
    if start >= bytes.len() {
        return None;
    }

    let quote = bytes[start] as char;
    if quote == '"' || quote == '\'' {
        let end = tag[start + 1..].find(quote)? + start + 1;
        return Some(tag[start + 1..end].to_string());
    }

    let end = tag[start..]
        .find(|c: char| c.is_whitespace() || c == '>')
        .map(|offset| offset + start)
        .unwrap_or(tag.len());
    Some(tag[start..end].trim_matches('"').trim_matches('\'').to_string())
}

fn clean_html_text(value: &str) -> Option<String> {
    let decoded = value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    let compact = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        None
    } else {
        Some(compact)
    }
}
