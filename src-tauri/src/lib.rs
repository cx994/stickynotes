mod commands;
mod model;
mod state;
mod store;
mod windows;

use crate::model::NoteKind;
use crate::state::AppState;
use crate::store::Store;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

fn data_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join("StickyNotes");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    let label = window.label();
    let Some(id) = label.strip_prefix("note-").map(str::to_string) else {
        return;
    };

    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            let scale = window.scale_factor().unwrap_or(1.0);
            // 客户区几何：和前端 getFrame()、setSize() 的口径保持一致。
            let (Ok(position), Ok(size)) = (window.inner_position(), window.inner_size())
            else {
                return;
            };
            let position = position.to_logical::<f64>(scale);
            let size = size.to_logical::<f64>(scale);
            let state = window.app_handle().state::<AppState>();
            state.store.write(|store| {
                if let Some(note) = store.notes.iter_mut().find(|note| note.id == id) {
                    note.x = position.x;
                    note.y = position.y;
                    note.w = size.width;
                    note.h = size.height;
                }
            });
        }
        WindowEvent::CloseRequested { api, .. } => {
            // 便签由应用统一管理：Alt+F4 不直接关掉，删除请走顶栏 ✕。
            let quitting = window
                .app_handle()
                .state::<AppState>()
                .quitting
                .load(Ordering::SeqCst);
            if !quitting {
                api.prevent_close();
            }
        }
        _ => {}
    }
}

pub fn run() {
    tauri::Builder::default()
        // 单实例插件必须最先注册
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_all(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let store: Arc<Store> = Store::new(data_dir());
            app.manage(AppState {
                store: store.clone(),
                quitting: AtomicBool::new(false),
            });

            windows::setup_tray(&handle)?;

            let (notes, first_launch) = store.read(|inner| {
                (
                    inner.notes.clone(),
                    !inner.settings.has_launched_before,
                )
            });

            if notes.is_empty() {
                if first_launch {
                    store.write(|inner| inner.settings.has_launched_before = true);
                    commands::create_welcome_note(&handle)?;
                } else {
                    commands::create_note_internal(
                        &handle,
                        commands::NewNoteOptions::new(NoteKind::Text),
                    )?;
                }
            } else {
                for note in notes {
                    windows::create_note_window(&handle, &note)?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_note,
            commands::patch_note,
            commands::set_snap,
            commands::set_collapsed_state,
            commands::set_manual,
            commands::create_note,
            commands::delete_note,
            commands::list_history,
            commands::restore_note,
            commands::delete_archived,
            commands::show_history,
            commands::show_all,
            commands::quit_app,
        ])
        .on_window_event(handle_window_event)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::ExitRequested { api, .. } => {
                // 关掉最后一张便签后应用继续驻留托盘
                if !app.state::<AppState>().quitting.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
            RunEvent::Exit => {
                app.state::<AppState>().store.save_now();
            }
            _ => {}
        });
}
