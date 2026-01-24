use rusqlite::{params, Connection, Result};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Password {
    pub id: i32,
    pub name: String,
    pub username: Option<String>,
    pub password: String,
    pub note: Option<String>,
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

    pub fn get_connection(&self) -> Result<Connection> {
        Connection::open(&self.db_path)
    }

    pub fn init(&self) -> Result<()> {
        let conn = self.get_connection()?;
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
        Ok(())
    }
}

// Commands
#[tauri::command]
pub fn get_passwords(search: Option<String>) -> Result<Vec<Password>, String> {
    let db = DbState::new();
    let conn = db.get_connection().map_err(|e: rusqlite::Error| e.to_string())?;

    let mut passwords = Vec::new();
    
    if let Some(s) = search {
        let pattern = format!("%{}%", s);
        let mut stmt = conn.prepare("SELECT id, name, username, password, note FROM passwords WHERE name LIKE ?1 OR username LIKE ?1 OR note LIKE ?1").map_err(|e: rusqlite::Error| e.to_string())?;
        let rows = stmt.query_map(params![pattern], |row: &rusqlite::Row| {
            Ok(Password {
                id: row.get(0)?,
                name: row.get(1)?,
                username: row.get(2)?,
                password: row.get(3)?,
                note: row.get(4)?,
            })
        }).map_err(|e: rusqlite::Error| e.to_string())?;
        
        for password_result in rows {
            let password = password_result.map_err(|e: rusqlite::Error| e.to_string())?;
            passwords.push(password);
        }
    } else {
        let mut stmt = conn.prepare("SELECT id, name, username, password, note FROM passwords").map_err(|e: rusqlite::Error| e.to_string())?;
        let rows = stmt.query_map([], |row: &rusqlite::Row| {
            Ok(Password {
                id: row.get(0)?,
                name: row.get(1)?,
                username: row.get(2)?,
                password: row.get(3)?,
                note: row.get(4)?,
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
pub fn add_password(name: String, username: Option<String>, password: String, note: Option<String>) -> Result<(), String> {
    let db = DbState::new();
    let conn = db.get_connection().map_err(|e: rusqlite::Error| e.to_string())?;
    conn.execute(
        "INSERT INTO passwords (name, username, password, note) VALUES (?1, ?2, ?3, ?4)",
        params![name, username, password, note],
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_password(id: i32, name: String, username: Option<String>, password: String, note: Option<String>) -> Result<(), String> {
    let db = DbState::new();
    let conn = db.get_connection().map_err(|e: rusqlite::Error| e.to_string())?;
    conn.execute(
        "UPDATE passwords SET name = ?1, username = ?2, password = ?3, note = ?4 WHERE id = ?5",
        params![name, username, password, note, id],
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_password(id: i32) -> Result<(), String> {
    let db = DbState::new();
    let conn = db.get_connection().map_err(|e: rusqlite::Error| e.to_string())?;
    conn.execute(
        "DELETE FROM passwords WHERE id = ?1",
        params![id],
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}
