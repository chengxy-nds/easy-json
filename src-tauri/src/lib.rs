use std::env;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[tauri::command]
fn is_installed() -> bool {
    if let Ok(exe_path) = env::current_exe() {
        let path_str = exe_path.to_string_lossy();
        // 检查是否在 /Applications 或 ~/Applications 下
        path_str.contains("/Applications/")
    } else {
        true // 无法判断时默认已安装，不弹窗
    }
}

#[tauri::command]
fn read_clipboard() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![is_installed, read_clipboard])
        .setup(|app| {
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let icon_bytes = include_bytes!("../icons/icon-32.png");
            let img = image::load_from_memory(icon_bytes)
                .expect("Failed to decode tray icon")
                .to_rgba8();
            let (w, h) = img.dimensions();
            let icon = tauri::image::Image::new_owned(img.into_raw(), w, h);

            let app_handle = app.handle().clone();
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("easyJSON")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |_, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.close();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray_handle, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app_h = tray_handle.app_handle();
                        if let Some(w) = app_h.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
