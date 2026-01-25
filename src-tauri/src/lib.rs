mod db;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

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
            db::remove_db_password
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
