use crate::model::{ArchivedNote, Note, Settings};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;

pub struct StoreInner {
    pub notes: Vec<Note>,
    pub archived: Vec<ArchivedNote>,
    pub settings: Settings,
}

pub struct Store {
    inner: Mutex<StoreInner>,
    dir: PathBuf,
    save_tx: Sender<()>,
}

impl Store {
    pub fn new(dir: PathBuf) -> Arc<Self> {
        let _ = fs::create_dir_all(&dir);

        let notes = read_json::<Vec<Note>>(&dir.join("notes.json")).unwrap_or_default();
        let mut notes = notes;
        for note in &mut notes {
            note.validate_marks();
            // 损坏/异常的窗口尺寸给出一个可用的兜底，避免出现 0×0 的窗口。
            if note.w < 50.0 || note.h < 50.0 {
                note.w = 280.0;
                note.h = 280.0;
                note.x = 200.0;
                note.y = 200.0;
            }
            if note.ew < 50.0 || note.eh < 50.0 {
                note.ex = note.x;
                note.ey = note.y;
                note.ew = note.w;
                note.eh = note.h;
            }
        }

        let archived = read_json::<Vec<ArchivedNote>>(&dir.join("history.json")).unwrap_or_default();
        let settings = read_json::<Settings>(&dir.join("settings.json")).unwrap_or_default();

        let (save_tx, save_rx) = channel::<()>();
        let store = Arc::new(Self {
            inner: Mutex::new(StoreInner {
                notes,
                archived,
                settings,
            }),
            dir,
            save_tx,
        });

        // 停止修改 1 秒后落盘，和原版一致。
        let weak: Weak<Store> = Arc::downgrade(&store);
        std::thread::spawn(move || loop {
            match save_rx.recv() {
                Ok(()) => {}
                Err(_) => break,
            }
            loop {
                match save_rx.recv_timeout(Duration::from_millis(1000)) {
                    Ok(()) => continue,
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            if let Some(store) = weak.upgrade() {
                store.save_now();
            }
        });

        store
    }

    pub fn read<R>(&self, f: impl FnOnce(&StoreInner) -> R) -> R {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        f(&inner)
    }

    pub fn write<R>(&self, f: impl FnOnce(&mut StoreInner) -> R) -> R {
        let result = {
            let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            f(&mut inner)
        };
        self.request_save();
        result
    }

    pub fn request_save(&self) {
        let _ = self.save_tx.send(());
    }

    pub fn save_now(&self) {
        let (notes, archived, settings) = {
            let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            (
                inner.notes.clone(),
                inner.archived.clone(),
                inner.settings.clone(),
            )
        };
        write_json(&self.dir.join("notes.json"), &notes);
        write_json(&self.dir.join("history.json"), &archived);
        write_json(&self.dir.join("settings.json"), &settings);
    }
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let data = fs::read(path).ok()?;
    match serde_json::from_slice(&data) {
        Ok(value) => Some(value),
        Err(error) => {
            eprintln!("failed to read {}: {error}", path.display());
            None
        }
    }
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) {
    let Ok(data) = serde_json::to_vec_pretty(value) else {
        return;
    };
    let tmp = path.with_extension("json.tmp");
    if fs::write(&tmp, &data).is_err() {
        return;
    }
    // Windows 上 rename 不能覆盖已有文件，先删再改名。
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    let _ = fs::rename(&tmp, path);
}
