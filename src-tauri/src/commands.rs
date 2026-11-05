use crate::model::{
    ArchivedNote, Note, NoteKind, NoteMode, NotePatch, NoteTheme, SnapEdge, TextHighlight,
};
use crate::state::AppState;
use crate::windows;
use chrono::Utc;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

const WELCOME_NOTE: &str = "\
# 欢迎使用便签 👋

这是一张支持 **Markdown** 的便签:

- 点右上角 👁 预览渲染效果
- 点 ✏️ 回到编辑模式
- 鼠标悬停顶栏可换颜色、切换窗口模式
- [ ] 待办事项写法
- [x] 已完成事项

> 内容自动保存, 拖动边缘可调整大小

任务栏托盘图标 📝 可以新建便签、查看历史。";

pub struct NewNoteOptions {
    pub kind: NoteKind,
    pub text: String,
    pub theme: Option<NoteTheme>,
    pub mode: NoteMode,
    pub preview: bool,
    pub highlights: Vec<TextHighlight>,
    pub bolds: Vec<TextHighlight>,
    pub width: f64,
    pub height: f64,
}

impl NewNoteOptions {
    pub fn new(kind: NoteKind) -> Self {
        Self {
            kind,
            text: String::new(),
            theme: None,
            mode: NoteMode::Floating,
            preview: false,
            highlights: Vec::new(),
            bolds: Vec::new(),
            width: 280.0,
            height: 280.0,
        }
    }
}

fn next_theme(notes: &[Note]) -> NoteTheme {
    NoteTheme::ALL
        .iter()
        .copied()
        .find(|theme| !notes.iter().any(|note| note.theme == *theme))
        .unwrap_or(NoteTheme::ALL[notes.len() % NoteTheme::ALL.len()])
}

pub fn create_note_internal(
    app: &AppHandle,
    options: NewNoteOptions,
) -> Result<Note, String> {
    let (work_x, work_y, work_w, work_h) = windows::primary_work_area(app);
    let state = app.state::<AppState>();

    let note = state.store.write(|store| {
        let cascade = (store.notes.len() % 8) as f64 * 28.0;
        let x = work_x + work_w / 2.0 - options.width / 2.0 + cascade;
        let y = work_y + work_h / 2.0 - options.height / 2.0 + cascade;
        let theme = options.theme.unwrap_or_else(|| next_theme(&store.notes));

        let mut note = Note::new(
            options.kind,
            options.text.clone(),
            theme,
            options.mode,
            x,
            y,
            options.width,
            options.height,
        );
        note.is_preview = options.preview;
        note.highlights = options.highlights.clone();
        note.bolds = options.bolds.clone();
        note.validate_marks();
        store.notes.push(note.clone());
        note
    });

    windows::create_note_window(app, &note).map_err(|error| error.to_string())?;
    Ok(note)
}

pub fn create_welcome_note(app: &AppHandle) -> Result<Note, String> {
    let mut options = NewNoteOptions::new(NoteKind::Text);
    options.text = WELCOME_NOTE.to_string();
    options.theme = Some(NoteTheme::Lemon);
    options.width = 320.0;
    options.height = 360.0;
    create_note_internal(app, options)
}

#[tauri::command]
pub fn get_note(state: State<'_, AppState>, id: String) -> Result<Note, String> {
    state
        .store
        .read(|store| store.notes.iter().find(|note| note.id == id).cloned())
        .ok_or_else(|| "note not found".to_string())
}

#[tauri::command]
pub fn patch_note(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    patch: NotePatch,
) -> Result<Note, String> {
    let NotePatch {
        text,
        theme,
        mode,
        is_preview,
        highlights,
        bolds,
    } = patch;

    let note = state.store.write(|store| {
        let Some(note) = store.notes.iter_mut().find(|note| note.id == id) else {
            return Err("note not found".to_string());
        };
        if let Some(text) = text {
            note.text = text;
            // 整段替换后旧范围已不可靠；调用方要保留标记必须一起传。
            if highlights.is_none() {
                note.highlights.clear();
            }
            if bolds.is_none() {
                note.bolds.clear();
            }
        }
        if let Some(highlights) = highlights {
            note.highlights = highlights;
        }
        if let Some(bolds) = bolds {
            note.bolds = bolds;
        }
        if let Some(theme) = theme {
            note.theme = theme;
        }
        if let Some(mode) = mode {
            note.mode = mode;
        }
        if let Some(is_preview) = is_preview {
            note.is_preview = is_preview;
        }
        note.validate_marks();
        Ok(note.clone())
    })?;

    if let Some(mode) = mode {
        if let Some(window) = app.get_webview_window(&windows::note_label(&id)) {
            windows::apply_mode(&window, mode);
        }
    }
    Ok(note)
}

#[tauri::command]
pub fn set_snap(
    state: State<'_, AppState>,
    id: String,
    edge: Option<SnapEdge>,
) -> Result<(), String> {
    state.store.write(|store| {
        if let Some(note) = store.notes.iter_mut().find(|note| note.id == id) {
            note.snap = edge;
        }
    });
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn set_collapsed_state(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    collapsed: bool,
    snap: Option<SnapEdge>,
    ex: f64,
    ey: f64,
    ew: f64,
    eh: f64,
) -> Result<(), String> {
    state.store.write(|store| {
        if let Some(note) = store.notes.iter_mut().find(|note| note.id == id) {
            note.is_collapsed = collapsed;
            note.snap = snap;
            note.ex = ex;
            note.ey = ey;
            note.ew = ew;
            note.eh = eh;
        }
    });
    if let Some(window) = app.get_webview_window(&windows::note_label(&id)) {
        let _ = window.set_resizable(!collapsed);
    }
    Ok(())
}

#[tauri::command]
pub fn set_manual(
    state: State<'_, AppState>,
    id: String,
    mw: bool,
    mh: bool,
) -> Result<(), String> {
    state.store.write(|store| {
        if let Some(note) = store.notes.iter_mut().find(|note| note.id == id) {
            note.mw = mw;
            note.mh = mh;
        }
    });
    Ok(())
}

// 建窗口必须离开主线程：同步命令跑在主线程上，build() 会等待事件循环而互相卡死。
#[tauri::command]
pub async fn create_note(app: AppHandle, kind: NoteKind) -> Result<Note, String> {
    create_note_internal(&app, NewNoteOptions::new(kind))
}

#[tauri::command]
pub fn delete_note(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let removed = state.store.write(|store| {
        let index = store.notes.iter().position(|note| note.id == id)?;
        let note = store.notes.remove(index);
        if !note.text.trim().is_empty() {
            store.archived.insert(
                0,
                ArchivedNote {
                    id: uuid::Uuid::new_v4().to_string(),
                    text: note.text.clone(),
                    kind: note.kind,
                    theme: note.theme,
                    highlights: note.highlights.clone(),
                    bolds: note.bolds.clone(),
                    deleted_at: Utc::now(),
                },
            );
        }
        Some(note)
    });

    if removed.is_some() {
        let _ = app.emit("history-changed", ());
    }
    if let Some(window) = app.get_webview_window(&windows::note_label(&id)) {
        let _ = window.destroy();
    }
    Ok(())
}

#[tauri::command]
pub fn list_history(state: State<'_, AppState>) -> Vec<ArchivedNote> {
    state.store.read(|store| store.archived.clone())
}

#[tauri::command]
pub async fn restore_note(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Note, String> {
    let item = state.store.write(|store| {
        let index = store.archived.iter().position(|item| item.id == id)?;
        Some(store.archived.remove(index))
    });
    let Some(item) = item else {
        return Err("history item not found".to_string());
    };
    let _ = app.emit("history-changed", ());

    let mut options = NewNoteOptions::new(item.kind);
    options.text = item.text;
    options.theme = Some(item.theme);
    options.highlights = item.highlights;
    options.bolds = item.bolds;
    create_note_internal(&app, options)
}

#[tauri::command]
pub fn delete_archived(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state
        .store
        .write(|store| store.archived.retain(|item| item.id != id));
    let _ = app.emit("history-changed", ());
    Ok(())
}

pub fn show_history_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("history") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "history", WebviewUrl::App("history.html".into()))
        .title("历史便签")
        .inner_size(460.0, 540.0)
        .min_inner_size(400.0, 320.0)
        .center()
        .resizable(true)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn show_history(app: AppHandle) -> Result<(), String> {
    show_history_window(&app)
}

#[tauri::command]
pub fn show_all(app: AppHandle) {
    windows::show_all(&app);
}

pub fn quit(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.quitting.store(true, Ordering::SeqCst);
    state.store.save_now();
    app.exit(0);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    quit(&app);
}
