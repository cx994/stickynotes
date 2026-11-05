use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// 文字范围使用 UTF-16 下标，与前端 JS 字符串以及原版 macOS 实现保持一致。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextHighlight {
    pub location: usize,
    pub length: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteTheme {
    Lemon,
    Peach,
    Mint,
    Sky,
    Lilac,
}

impl Default for NoteTheme {
    fn default() -> Self {
        Self::Lemon
    }
}

impl NoteTheme {
    pub const ALL: [NoteTheme; 5] = [
        NoteTheme::Lemon,
        NoteTheme::Peach,
        NoteTheme::Mint,
        NoteTheme::Sky,
        NoteTheme::Lilac,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteMode {
    Floating,
    Normal,
    Desktop,
}

impl Default for NoteMode {
    fn default() -> Self {
        Self::Floating
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteKind {
    Text,
    Todo,
}

impl Default for NoteKind {
    fn default() -> Self {
        Self::Text
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnapEdge {
    Left,
    Right,
}

fn is_false(value: &bool) -> bool {
    !*value
}

/// 与原版 StickyNotes 的 notes.json 字段完全一致，方便直接迁移数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub kind: NoteKind,
    #[serde(default)]
    pub theme: NoteTheme,
    #[serde(default)]
    pub mode: NoteMode,
    #[serde(default)]
    pub is_preview: bool,
    #[serde(default)]
    pub is_collapsed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snap: Option<SnapEdge>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub highlights: Vec<TextHighlight>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bolds: Vec<TextHighlight>,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub ex: f64,
    pub ey: f64,
    pub ew: f64,
    pub eh: f64,
    #[serde(rename = "mw", default, skip_serializing_if = "is_false")]
    pub mw: bool,
    #[serde(rename = "mh", default, skip_serializing_if = "is_false")]
    pub mh: bool,
}

impl Note {
    pub fn new(
        kind: NoteKind,
        text: String,
        theme: NoteTheme,
        mode: NoteMode,
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            text,
            kind,
            theme,
            mode,
            is_preview: false,
            is_collapsed: false,
            snap: None,
            highlights: Vec::new(),
            bolds: Vec::new(),
            x,
            y,
            w,
            h,
            ex: x,
            ey: y,
            ew: w,
            eh: h,
            mw: false,
            mh: false,
        }
    }

    /// 文本长度按 UTF-16 计算，越界的标记直接丢弃。
    pub fn utf16_len(&self) -> usize {
        self.text.encode_utf16().count()
    }

    pub fn validate_marks(&mut self) {
        let len = self.utf16_len();
        let valid = |marks: &Vec<TextHighlight>| {
            marks
                .iter()
                .filter(|m| m.length > 0 && m.location.saturating_add(m.length) <= len)
                .cloned()
                .collect::<Vec<_>>()
        };
        self.highlights = valid(&self.highlights);
        self.bolds = valid(&self.bolds);
    }
}

/// 前端提交的增量修改。字段缺省表示“不修改”。
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePatch {
    pub text: Option<String>,
    pub theme: Option<NoteTheme>,
    pub mode: Option<NoteMode>,
    pub is_preview: Option<bool>,
    pub highlights: Option<Vec<TextHighlight>>,
    pub bolds: Option<Vec<TextHighlight>>,
}

mod iso8601 {
    use super::*;

    pub fn serialize<S>(value: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&value.to_rfc3339_opts(SecondsFormat::Secs, true))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        DateTime::parse_from_rfc3339(&raw)
            .map(|value| value.with_timezone(&Utc))
            .map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivedNote {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub kind: NoteKind,
    #[serde(default)]
    pub theme: NoteTheme,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub highlights: Vec<TextHighlight>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bolds: Vec<TextHighlight>,
    #[serde(with = "iso8601")]
    pub deleted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub has_launched_before: bool,
}
