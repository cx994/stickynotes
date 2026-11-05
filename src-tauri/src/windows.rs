use crate::commands::create_note_internal;
use crate::model::{Note, NoteKind, NoteMode};
use crate::state::{AppState, TrayState};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

pub fn note_label(id: &str) -> String {
    format!("note-{id}")
}

/// 创建一张便签的无边框窗口。窗口内容由前端 index.html 渲染。
pub fn create_note_window(app: &AppHandle, note: &Note) -> tauri::Result<WebviewWindow> {
    let label = note_label(&note.id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        return Ok(window);
    }

    let width = if note.w >= 50.0 { note.w } else { 280.0 };
    let height = if note.h >= 50.0 { note.h } else { 280.0 };

    let window = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(format!("index.html?id={}", note.id).into()),
    )
    .title("便签")
    .inner_size(width, height)
    .position(note.x, note.y)
    .decorations(false)
    .transparent(true)
    .resizable(!note.is_collapsed)
    .shadow(true)
    .skip_taskbar(true)
    .visible(false)
    .focused(note.mode != NoteMode::Desktop)
    .build()?;

    // 保存的是客户区坐标；无边框窗口仍有一圈不可见的缩放边框，
    // 把外框位置补偿回去，让客户区落在 note.x / note.y。
    if let (Ok(outer), Ok(inner)) = (window.outer_position(), window.inner_position()) {
        let (dx, dy) = (inner.x - outer.x, inner.y - outer.y);
        if dx != 0 || dy != 0 {
            let _ = window.set_position(tauri::PhysicalPosition::new(outer.x - dx, outer.y - dy));
        }
    }

    apply_mode(&window, note.mode);

    // Windows 11 上用 Acrylic 替代 macOS 的 NSVisualEffectView。
    // CSS 里的半透明主题色叠在它上面，得到同样的磨砂玻璃效果。
    #[cfg(target_os = "windows")]
    {
        let _ = window_vibrancy::apply_acrylic(&window, Some((250, 249, 245, 110)));
    }

    window.show()?;
    if note.mode != NoteMode::Desktop {
        let _ = window.set_focus();
    }
    Ok(window)
}

pub fn apply_mode(window: &WebviewWindow, mode: NoteMode) {
    let _ = window.set_skip_taskbar(true);
    match mode {
        NoteMode::Floating => {
            let _ = window.set_always_on_top(true);
            let _ = window.set_always_on_bottom(false);
        }
        NoteMode::Normal => {
            let _ = window.set_always_on_top(false);
            let _ = window.set_always_on_bottom(false);
        }
        NoteMode::Desktop => {
            let _ = window.set_always_on_top(false);
            let _ = window.set_always_on_bottom(true);
        }
    }
}

/// 主显示器工作区（逻辑像素）：x, y, width, height
pub fn primary_work_area(app: &AppHandle) -> (f64, f64, f64, f64) {
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.work_area().position.to_logical::<f64>(scale);
        let size = monitor.work_area().size.to_logical::<f64>(scale);
        return (position.x, position.y, size.width, size.height);
    }
    (0.0, 0.0, 1440.0, 900.0)
}

/// 托盘图标左键 / 重复启动：把所有便签带到前面。
pub fn show_all(app: &AppHandle) {
    let notes = {
        let state = app.state::<AppState>();
        state.store.read(|store| store.notes.clone())
    };

    for note in notes {
        let label = note_label(&note.id);
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();

        // 贴在桌面的便签临时浮上来露个脸, 3 秒后沉回去。
        if note.mode == NoteMode::Desktop {
            let _ = window.set_always_on_top(true);
            let handle = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if let Some(window) = handle.get_webview_window(&label) {
                    apply_mode(&window, NoteMode::Desktop);
                }
            });
        }
    }

    if let Some(window) = app.get_webview_window("history") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn spawn_note(app: &AppHandle, kind: NoteKind) {
    let app = app.clone();
    std::thread::spawn(move || {
        let _ = create_note_internal(&app, crate::commands::NewNoteOptions::new(kind));
    });
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let new_text = MenuItem::with_id(app, "new-text", "新建文字便签", true, None::<&str>)?;
    let new_todo = MenuItem::with_id(app, "new-todo", "新建待办事项", true, None::<&str>)?;
    let history = MenuItem::with_id(app, "history", "历史便签", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;

    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "开机自动启动",
        true,
        autostart_enabled,
        None::<&str>,
    )?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::new(app)?;
    menu.append(&new_text)?;
    menu.append(&new_todo)?;
    menu.append(&history)?;
    menu.append(&separator1)?;
    menu.append(&autostart)?;
    menu.append(&separator2)?;
    menu.append(&quit)?;

    let icon = app
        .default_window_icon()
        .cloned()
        .or_else(|| Image::from_bytes(include_bytes!("../icons/32x32.png")).ok())
        .expect("application icon");

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("便签")
        .menu(&menu)
        // 和 macOS 状态栏一致：左键直接展开菜单。
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            // 托盘回调跑在事件循环线程上，建窗口必须挪到后台线程，否则会卡死事件循环。
            "new-text" => spawn_note(app, NoteKind::Text),
            "new-todo" => spawn_note(app, NoteKind::Todo),
            "history" => {
                let app = app.clone();
                std::thread::spawn(move || {
                    let _ = crate::commands::show_history_window(&app);
                });
            }
            "autostart" => {
                let currently = app.autolaunch().is_enabled().unwrap_or(false);
                let _ = if currently {
                    app.autolaunch().disable()
                } else {
                    app.autolaunch().enable()
                };
                let now = app.autolaunch().is_enabled().unwrap_or(false);
                let state = app.state::<TrayState>();
                let _ = state.autostart.set_checked(now);
            }
            "quit" => crate::commands::quit(app),
            _ => {}
        })
        .build(app)?;

    app.manage(TrayState { autostart });
    Ok(())
}
