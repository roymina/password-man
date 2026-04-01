mod db;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg(target_os = "windows")]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .manage(db::AppState {
            db_key: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            db::get_passwords,
            db::add_password,
            db::update_password,
            db::delete_password,
            db::toggle_pin_password,
            db::unlock_db,
            db::set_db_password,
            db::remove_db_password,
            db::get_bookmarks,
            db::add_bookmark,
            db::update_bookmark,
            db::delete_bookmark,
            db::toggle_pin_bookmark,
            db::get_bookmark_categories,
            db::export_bookmarks,
            open_url,
            autostart_is_enabled,
            autostart_enable,
            autostart_disable
        ])
        .setup(|app| {
// Initialize Database
            let db = db::DbState::new();
            if let Err(e) = db.init() {
                eprintln!("Failed to initialize database: {}", e);
            }

            // System Tray
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let open_i = MenuItem::with_id(app, "open", "打开主界面", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("PasswordMan")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                             let _ = window.show();
                             let _ = window.set_focus();
                        }
                    }
                })
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of close
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn open_url(url: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<String>).map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart_is_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|e| e.to_string())?;
        let value_name = app.package_info().name.clone();
        let value: Result<String, _> = run_key.get_value(&value_name);
        return Ok(value.is_ok());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app; // silence unused warnings
        Err("autostart is only supported via registry on Windows".into())
    }
}

#[tauri::command]
fn autostart_enable(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run_key, _) = hkcu
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|e| e.to_string())?;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let value_name = app.package_info().name.clone();
        let value = format!("\"{}\"", exe_path.display());
        run_key
            .set_value(value_name, &value)
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("autostart is only supported via registry on Windows".into())
    }
}

#[tauri::command]
fn autostart_disable(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu
            .open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                winreg::enums::KEY_WRITE,
            )
            .map_err(|e| e.to_string())?;
        let value_name = app.package_info().name.clone();
        let _ = run_key.delete_value(value_name);
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("autostart is only supported via registry on Windows".into())
    }
}
