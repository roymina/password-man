use rusqlite::{params, Connection, Result};
use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use tauri::State;
use std::io::Write;

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

#[derive(Serialize, Deserialize, Debug)]
pub struct Bookmark {
    pub id: i32,
    pub title: String,
    pub url: String,
    pub note: Option<String>,
    pub category: Option<String>,
    pub pinned: bool,
}

pub struct AppState {
    pub db_key: Mutex<Option<String>>,
}

pub struct DbState {
    pub db_path: String,
}

impl DbState {
    pub fn new() -> Self {
        // Store database in the same directory as the exe
        // This makes the app truly portable
        let exe_path = std::env::current_exe()
            .expect("Failed to get executable path");
        let exe_dir = exe_path.parent()
            .expect("Failed to get executable directory");
        let db_path = exe_dir.join("pwd.db");
        
        Self { 
            db_path: db_path.to_string_lossy().to_string()
        }
    }

    pub fn get_connection(&self, key: Option<&str>) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        if let Some(k) = key {
            // Note: In a production app, be careful with PRAGMA key injection.
            // SQLCipher pragma syntax: PRAGMA key = 'pass';
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
    Ok(())
}

// Commands
#[tauri::command]
pub fn get_passwords(state: State<AppState>, search: Option<String>) -> Result<Vec<Password>, String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e: rusqlite::Error| e.to_string())?;

    let mut passwords = Vec::new();
    
    // Check if accessible by trying a simple query
    // This serves as "login check"
    let check = conn.prepare("SELECT count(*) FROM passwords");
    if let Err(_) = check {
        // Likely locked
        return Err("LOCKED".to_string());
    }

    if let Some(s) = search {
        let pattern = format!("%{}%", s);
        let mut stmt = conn.prepare("SELECT id, name, username, password, note, pinned, url FROM passwords WHERE name LIKE ?1 OR username LIKE ?1 OR note LIKE ?1 OR url LIKE ?1 ORDER BY pinned DESC, id DESC").map_err(|e: rusqlite::Error| e.to_string())?;
        let rows = stmt.query_map(params![pattern], |row: &rusqlite::Row| {
            Ok(Password {
                id: row.get(0)?,
                name: row.get(1)?,
                username: row.get(2)?,
                password: row.get(3)?,
                note: row.get(4)?,
                pinned: row.get(5).unwrap_or(false),
                url: row.get(6).unwrap_or(None),
            })
        }).map_err(|e: rusqlite::Error| e.to_string())?;
        
        for password_result in rows {
            let password = password_result.map_err(|e: rusqlite::Error| e.to_string())?;
            passwords.push(password);
        }
    } else {
        let mut stmt = conn.prepare("SELECT id, name, username, password, note, pinned, url FROM passwords ORDER BY pinned DESC, id DESC").map_err(|e: rusqlite::Error| e.to_string())?;
        let rows = stmt.query_map([], |row: &rusqlite::Row| {
            Ok(Password {
                id: row.get(0)?,
                name: row.get(1)?,
                username: row.get(2)?,
                password: row.get(3)?,
                note: row.get(4)?,
                pinned: row.get(5).unwrap_or(false),
                url: row.get(6).unwrap_or(None),
            })
        }).map_err(|e: rusqlite::Error| e.to_string())?;
        
        for password_result in rows {
            let password = password_result.map_err(|e: rusqlite::Error| e.to_string())?;
            passwords.push(password);
        }
    }

    Ok(passwords)
}

#[tauri::command]
pub fn add_password(state: State<AppState>, name: String, username: Option<String>, password: String, note: Option<String>, url: Option<String>) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO passwords (name, username, password, note, url, pinned) VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        params![name, username, password, note, url],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_password(state: State<AppState>, id: i32, name: String, username: Option<String>, password: String, note: Option<String>, url: Option<String>) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE passwords SET name = ?1, username = ?2, password = ?3, note = ?4, url = ?5 WHERE id = ?6",
        params![name, username, password, note, url, id],
    ).map_err(|e| e.to_string())?;
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
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_password(state: State<AppState>, id: i32) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM passwords WHERE id = ?1",
        params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// Encryption Commands
#[tauri::command]
pub fn unlock_db(state: State<AppState>, password: String) -> Result<(), String> {
    let db = DbState::new();
    // Try to connect with this password
    let conn = db.get_connection(Some(&password)).map_err(|e| e.to_string())?;
    
    // Verify by running a simple query
    let mut stmt = conn.prepare("SELECT count(*) FROM passwords").map_err(|_| "Invalid Password".to_string())?;
    let _ = stmt.query_row([], |_| Ok(())).map_err(|_| "Invalid Password".to_string())?;

    // Run migrations in case the DB was upgraded while encrypted
    let _ = run_migrations(&conn);

    // If successful, store in State
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
    
    // Check if we can access DB (if we are setting password for first time on unencrypted DB, connection is fine)
    // Execute rekey
    conn.execute(&format!("PRAGMA rekey = '{}'", password), []).map_err(|e| e.to_string())?;
    
    // Update key
    *key_guard = Some(password);
    Ok(())
}

#[tauri::command]
pub fn remove_db_password(state: State<AppState>) -> Result<(), String> {
    let mut key_guard = state.db_key.lock().unwrap();
    let current_key = key_guard.as_deref();

    if current_key.is_none() {
        return Ok(()); // Already removed or not set
    }

    let db = DbState::new();
    let conn = db.get_connection(current_key).map_err(|e| e.to_string())?;

    // Rekey to empty/NULL to decrypt
    conn.execute("PRAGMA rekey = ''", []).map_err(|e| e.to_string())?;

    *key_guard = None;
    Ok(())
}

// ─── Bookmark Commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_bookmarks(
    state: State<AppState>,
    search: Option<String>,
    category: Option<String>,
) -> Result<Vec<Bookmark>, String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();

    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e: rusqlite::Error| e.to_string())?;

    let check = conn.prepare("SELECT count(*) FROM bookmarks");
    if let Err(_) = check {
        return Err("LOCKED".to_string());
    }

    let mut bookmarks = Vec::new();
    let base_order = "ORDER BY pinned DESC, id DESC";

    let rows: Vec<Bookmark> = match (search, category) {
        (Some(s), Some(c)) => {
            let pattern = format!("%{}%", s);
            let mut stmt = conn.prepare(&format!(
                "SELECT id, title, url, note, category, pinned FROM bookmarks \
                 WHERE category = ?1 AND (title LIKE ?2 OR url LIKE ?2 OR note LIKE ?2) {}",
                base_order
            )).map_err(|e: rusqlite::Error| e.to_string())?;
            let rows = stmt.query_map(params![c, pattern], map_bookmark_row)
                .map_err(|e: rusqlite::Error| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            rows
        }
        (Some(s), None) => {
            let pattern = format!("%{}%", s);
            let mut stmt = conn.prepare(&format!(
                "SELECT id, title, url, note, category, pinned FROM bookmarks \
                 WHERE title LIKE ?1 OR url LIKE ?1 OR note LIKE ?1 OR category LIKE ?1 {}",
                base_order
            )).map_err(|e: rusqlite::Error| e.to_string())?;
            let rows = stmt.query_map(params![pattern], map_bookmark_row)
                .map_err(|e: rusqlite::Error| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            rows
        }
        (None, Some(c)) => {
            let mut stmt = conn.prepare(&format!(
                "SELECT id, title, url, note, category, pinned FROM bookmarks \
                 WHERE category = ?1 {}",
                base_order
            )).map_err(|e: rusqlite::Error| e.to_string())?;
            let rows = stmt.query_map(params![c], map_bookmark_row)
                .map_err(|e: rusqlite::Error| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            rows
        }
        (None, None) => {
            let mut stmt = conn.prepare(&format!(
                "SELECT id, title, url, note, category, pinned FROM bookmarks {}",
                base_order
            )).map_err(|e: rusqlite::Error| e.to_string())?;
            let rows = stmt.query_map([], map_bookmark_row)
                .map_err(|e: rusqlite::Error| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            rows
        }
    };

    bookmarks.extend(rows);
    Ok(bookmarks)
}

fn map_bookmark_row(row: &rusqlite::Row) -> rusqlite::Result<Bookmark> {
    Ok(Bookmark {
        id: row.get(0)?,
        title: row.get(1)?,
        url: row.get(2)?,
        note: row.get(3)?,
        category: row.get(4)?,
        pinned: row.get(5).unwrap_or(false),
    })
}

#[tauri::command]
pub fn add_bookmark(
    state: State<AppState>,
    title: String,
    url: String,
    note: Option<String>,
    category: Option<String>,
) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO bookmarks (title, url, note, category, pinned) VALUES (?1, ?2, ?3, ?4, 0)",
        params![title, url, note, category],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_bookmark(
    state: State<AppState>,
    id: i32,
    title: String,
    url: String,
    note: Option<String>,
    category: Option<String>,
) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE bookmarks SET title = ?1, url = ?2, note = ?3, category = ?4 WHERE id = ?5",
        params![title, url, note, category, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_bookmark(state: State<AppState>, id: i32) -> Result<(), String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
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
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_bookmark_categories(state: State<AppState>) -> Result<Vec<String>, String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT category FROM bookmarks WHERE category IS NOT NULL AND category != '' ORDER BY category"
    ).map_err(|e| e.to_string())?;
    let cats: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(cats)
}

#[tauri::command]
pub fn export_bookmarks(state: State<AppState>) -> Result<String, String> {
    let key_guard = state.db_key.lock().unwrap();
    let key = key_guard.as_deref();
    let db = DbState::new();
    let conn = db.get_connection(key).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, title, url, note, category, pinned FROM bookmarks ORDER BY category, title"
    ).map_err(|e| e.to_string())?;
    let bookmarks: Vec<Bookmark> = stmt.query_map([], map_bookmark_row)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Group by category
    let mut categories: Vec<String> = bookmarks.iter()
        .filter_map(|b| b.category.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    categories.sort();

    let mut html = String::from(
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>\n\
         <!-- This is an automatically generated file. -->\n\
         <META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\n\
         <TITLE>Bookmarks</TITLE>\n\
         <H1>Bookmarks</H1>\n\
         <DL><p>\n"
    );

    // Uncategorized first
    let uncategorized: Vec<&Bookmark> = bookmarks.iter()
        .filter(|b| b.category.is_none() || b.category.as_deref() == Some(""))
        .collect();
    for bm in &uncategorized {
        let note_attr = bm.note.as_deref().map(|n| format!(" SHORTCUTURL=\"{}\"", n)).unwrap_or_default();
        html.push_str(&format!(
            "    <DT><A HREF=\"{}\"{}>{}</A>\n",
            bm.url, note_attr, bm.title
        ));
    }

    // Categorized
    for cat in &categories {
        html.push_str(&format!("    <DT><H3>{}</H3>\n    <DL><p>\n", cat));
        for bm in bookmarks.iter().filter(|b| b.category.as_deref() == Some(cat.as_str())) {
            let note_attr = bm.note.as_deref().map(|n| format!(" SHORTCUTURL=\"{}\"", n)).unwrap_or_default();
            html.push_str(&format!(
                "        <DT><A HREF=\"{}\"{}>{}</A>\n",
                bm.url, note_attr, bm.title
            ));
        }
        html.push_str("    </DL><p>\n");
    }

    html.push_str("</DL><p>\n");

    // Write to exe directory
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Failed to get exe dir")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let file_name = format!("bookmarks_export_{}.html", now);
    let out_path = exe_dir.join(&file_name);

    let mut file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
    file.write_all(html.as_bytes()).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}
