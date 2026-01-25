use rusqlite::{params, Connection, Result};
use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use tauri::State;

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
        // Init attempts to open without key mostly to check existence or creaet new
        // If it's encrypted, this might fail on creating table if we don't have key.
        // But for fresh start, it works.
        // For encrypted existing start, we might skip init here or handle error.
        
        // We will try to connect with NO key first.
        let conn = self.get_connection(None)?;
        
        // Try to create table. If encrypted, this will fail with "Not a database" or similar.
        let res = conn.execute(
            "CREATE TABLE IF NOT EXISTS passwords (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT,
                password TEXT NOT NULL,
                note TEXT
            )",
            [],
        );

        match res {
            Ok(_) => {
                // Try to add pinned column if it doesn't exist
                let _ = conn.execute("ALTER TABLE passwords ADD COLUMN pinned BOOLEAN DEFAULT 0", []);
                // Try to add url column if it doesn't exist
                let _ = conn.execute("ALTER TABLE passwords ADD COLUMN url TEXT", []);
                Ok(())
            },
            Err(e) => {
                // If error is related to encryption (e.g. file is encrypted but we didn't provide key),
                // we treat it as Success (initialization skipped, waiting for unlock).
                // rusqlite error: SqliteFailure(Error { code: NotADB, extended_code: 26 }, Some("file is not a database"))
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
