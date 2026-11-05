use crate::store::Store;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::menu::CheckMenuItem;
use tauri::Wry;

pub struct AppState {
    pub store: Arc<Store>,
    pub quitting: AtomicBool,
}

pub struct TrayState {
    pub autostart: CheckMenuItem<Wry>,
}
