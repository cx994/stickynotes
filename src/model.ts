// 数据模型与纯逻辑。范围下标全部是 UTF-16，和原版 macOS 实现以及 JS 字符串一致。

export type NoteTheme = "lemon" | "peach" | "mint" | "sky" | "lilac";
export type NoteMode = "floating" | "normal" | "desktop";
export type NoteKind = "text" | "todo";
export type SnapEdge = "left" | "right";

export interface TextHighlight {
  location: number;
  length: number;
}

export interface Note {
  id: string;
  text: string;
  kind: NoteKind;
  theme: NoteTheme;
  mode: NoteMode;
  isPreview: boolean;
  isCollapsed: boolean;
  snap?: SnapEdge | null;
  highlights: TextHighlight[];
  bolds: TextHighlight[];
  x: number;
  y: number;
  w: number;
  h: number;
  ex: number;
  ey: number;
  ew: number;
  eh: number;
  mw?: boolean;
  mh?: boolean;
}

export interface TodoItem {
  text: string;
  done: boolean;
}

export interface ArchivedNote {
  id: string;
  text: string;
  kind: NoteKind;
  theme: NoteTheme;
  highlights: TextHighlight[];
  bolds: TextHighlight[];
  deletedAt: string;
}

export interface TextRange {
  location: number;
  length: number;
}

export interface TodoState {
  text: string;
  highlights: TextHighlight[];
  bolds: TextHighlight[];
}

export function toRange(mark: TextHighlight): TextRange {
  return { location: mark.location, length: mark.length };
}

export function maxRange(range: TextRange): number {
  return range.location + range.length;
}

export function intersect(a: TextRange, b: TextRange): TextRange | null {
  const start = Math.max(a.location, b.location);
  const end = Math.min(maxRange(a), maxRange(b));
  return end > start ? { location: start, length: end - start } : null;
}

/** 并入一段，与已有高亮相接/重叠的自动合成一段。 */
export function addRange(
  marks: TextHighlight[],
  range: TextRange,
): TextHighlight[] {
  if (range.length <= 0) return marks;
  const all = [...marks.map(toRange), range]
    .filter((r) => r.length > 0)
    .sort((a, b) => a.location - b.location);
  const out: TextRange[] = [];
  for (const r of all) {
    const last = out[out.length - 1];
    if (last && r.location <= maxRange(last)) {
      const end = Math.max(maxRange(last), maxRange(r));
      out[out.length - 1] = { location: last.location, length: end - last.location };
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** 挖掉一段，被从中间穿过的高亮断成两截。 */
export function removeRange(
  marks: TextHighlight[],
  range: TextRange,
): TextHighlight[] {
  if (range.length <= 0) return marks;
  const out: TextRange[] = [];
  for (const mark of marks) {
    const overlap = intersect(mark, range);
    if (!overlap) {
      out.push(toRange(mark));
      continue;
    }
    if (mark.location < overlap.location) {
      out.push({
        location: mark.location,
        length: overlap.location - mark.location,
      });
    }
    if (maxRange(overlap) < maxRange(mark)) {
      out.push({
        location: maxRange(overlap),
        length: maxRange(mark) - maxRange(overlap),
      });
    }
  }
  return out.filter((r) => r.length > 0);
}

export function covers(marks: TextHighlight[], range: TextRange): boolean {
  return marks.some((m) => intersect(m, range) !== null);
}

/** 整段都落在同一段标记之内。 */
export function coversFully(marks: TextHighlight[], range: TextRange): boolean {
  if (range.length <= 0) return false;
  return marks.some(
    (m) =>
      range.location >= m.location &&
      maxRange(range) <= m.location + m.length,
  );
}

/**
 * 文字被替换后平移标记。落进替换区里的部分直接丢掉，
 * 所以全选改写会让标记自然清空。
 */
export function shiftRanges(
  marks: TextHighlight[],
  replaced: TextRange,
  newLength: number,
): TextHighlight[] {
  const delta = newLength - replaced.length;
  const oldEnd = maxRange(replaced);
  const out: TextRange[] = [];
  for (const mark of marks) {
    const r = toRange(mark);
    const hEnd = maxRange(r);
    if (hEnd <= replaced.location) {
      out.push(r);
    } else if (r.location >= oldEnd) {
      out.push({ location: r.location + delta, length: r.length });
    } else if (replaced.length === 0) {
      // 在高亮内部打字：新字一并纳进这段高亮
      out.push({ location: r.location, length: r.length + delta });
    } else {
      if (r.location < replaced.location) {
        out.push({
          location: r.location,
          length: replaced.location - r.location,
        });
      }
      if (hEnd > oldEnd) {
        out.push({ location: oldEnd + delta, length: hEnd - oldEnd });
      }
    }
  }
  return out.filter((r) => r.length > 0);
}

export function normalizeMarks(
  marks: TextHighlight[],
  textLength: number,
): TextHighlight[] {
  let out: TextHighlight[] = [];
  for (const mark of marks) {
    if (
      Number.isFinite(mark.location) &&
      Number.isFinite(mark.length) &&
      mark.location >= 0 &&
      mark.length > 0 &&
      mark.location + mark.length <= textLength
    ) {
      out = addRange(out, mark);
    }
  }
  return out;
}

// MARK: - 待办事项
// 待办便签把条目存在 text 里，每行一条："[ ] 内容" 或 "[x] 内容"

export function todoItems(text: string): TodoItem[] {
  const items: TodoItem[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[x] ") || trimmed.startsWith("[X] ")) {
      items.push({ text: trimmed.slice(4), done: true });
    } else if (trimmed.startsWith("[ ] ")) {
      items.push({ text: trimmed.slice(4), done: false });
    } else {
      items.push({ text: trimmed, done: false });
    }
  }
  return items;
}

/** 第 index 条待办正文在 text 里的范围（不含前缀和行首空白）。 */
export function todoContentRanges(text: string): (TextRange | null)[] {
  const out: (TextRange | null)[] = [];
  let offset = 0;
  let item = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      const lead = line.indexOf(trimmed);
      let prefix = 0;
      if (
        trimmed.startsWith("[x] ") ||
        trimmed.startsWith("[X] ") ||
        trimmed.startsWith("[ ] ")
      ) {
        prefix = 4;
      }
      const length = trimmed.length - prefix;
      out[item] = length > 0 ? { location: offset + lead + prefix, length } : null;
      item += 1;
    }
    offset += line.length + 1;
  }
  return out;
}

export function todoContentRange(text: string, index: number): TextRange | null {
  return todoContentRanges(text)[index] ?? null;
}

function rebuildTodoText(items: TodoItem[]): string {
  return items.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`).join("\n");
}

interface HighlightAnchor {
  item: number;
  offset: number;
  length: number;
}

function anchorsOf(marks: TextHighlight[], text: string): HighlightAnchor[] {
  if (marks.length === 0) return [];
  const ranges = todoContentRanges(text);
  const out: HighlightAnchor[] = [];
  ranges.forEach((range, item) => {
    if (!range) return;
    for (const mark of marks) {
      const overlap = intersect(mark, range);
      if (overlap) {
        out.push({
          item,
          offset: overlap.location - range.location,
          length: overlap.length,
        });
      }
    }
  });
  return out;
}

function rebuiltFrom(anchors: HighlightAnchor[], text: string): TextHighlight[] {
  const ranges = todoContentRanges(text);
  let out: TextHighlight[] = [];
  for (const anchor of anchors) {
    const range = ranges[anchor.item];
    if (!range) continue;
    const length = Math.min(anchor.length, Math.max(0, range.length - anchor.offset));
    if (length <= 0) continue;
    out = addRange(out, { location: range.location + anchor.offset, length });
  }
  return out;
}

function writeTodos(
  state: TodoState,
  items: TodoItem[],
  carried?: { h: HighlightAnchor[]; b: HighlightAnchor[] },
): TodoState {
  const kept = carried ?? {
    h: anchorsOf(state.highlights, state.text),
    b: anchorsOf(state.bolds, state.text),
  };
  const text = rebuildTodoText(items);
  return {
    text,
    highlights: rebuiltFrom(kept.h, text),
    bolds: rebuiltFrom(kept.b, text),
  };
}

export function todoToggle(state: TodoState, index: number): TodoState {
  const items = todoItems(state.text);
  if (index < 0 || index >= items.length) return state;
  items[index].done = !items[index].done;
  return writeTodos(state, items);
}

/** 只由条内直接编辑调用；标记已经由编辑器按全局范围平移过。 */
export function todoSetText(
  state: TodoState,
  index: number,
  text: string,
): TodoState {
  const items = todoItems(state.text);
  if (index < 0 || index >= items.length) return state;
  items[index].text = text;
  return {
    text: rebuildTodoText(items),
    highlights: state.highlights,
    bolds: state.bolds,
  };
}

export function todoAdd(state: TodoState, text: string): TodoState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const items = todoItems(state.text);
  items.push({ text: trimmed, done: false });
  return writeTodos(state, items);
}

export function todoRemove(state: TodoState, index: number): TodoState {
  const items = todoItems(state.text);
  if (index < 0 || index >= items.length) return state;
  const drop = (list: HighlightAnchor[]) =>
    list
      .filter((a) => a.item !== index)
      .map((a) => ({ ...a, item: a.item > index ? a.item - 1 : a.item }));
  const carried = {
    h: drop(anchorsOf(state.highlights, state.text)),
    b: drop(anchorsOf(state.bolds, state.text)),
  };
  items.splice(index, 1);
  return writeTodos(state, items, carried);
}

/** 文字便签 Markdown 里的任务行：按行号切换 "- [ ]" ↔ "- [x]"。 */
export function toggleTaskLine(text: string, lineIndex: number): string {
  const lines = text.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  const line = lines[lineIndex];
  const unchecked = line.indexOf("- [ ] ");
  if (unchecked >= 0) {
    lines[lineIndex] =
      line.slice(0, unchecked) + "- [x] " + line.slice(unchecked + 6);
    return lines.join("\n");
  }
  let checked = line.indexOf("- [x] ");
  if (checked < 0) checked = line.indexOf("- [X] ");
  if (checked >= 0) {
    lines[lineIndex] =
      line.slice(0, checked) + "- [ ] " + line.slice(checked + 6);
    return lines.join("\n");
  }
  return text;
}

// MARK: - 折叠标题

const TITLE_PREFIXES = [
  "# ",
  "## ",
  "### ",
  "- [x] ",
  "- [X] ",
  "- [ ] ",
  "[x] ",
  "[X] ",
  "[ ] ",
  "- ",
  "* ",
  "> ",
];

export function noteTitle(note: Pick<Note, "kind" | "text">): string {
  if (note.kind === "todo") {
    const items = todoItems(note.text);
    if (items.length > 0) {
      const done = items.filter((item) => item.done).length;
      const current = items.find((item) => !item.done)?.text ?? "全部完成";
      return `${done}/${items.length} · ${current}`;
    }
  }
  for (const line of note.text.split("\n")) {
    let text = line.trim();
    if (!text) continue;
    for (const prefix of TITLE_PREFIXES) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length);
        break;
      }
    }
    if (text) return text;
  }
  return "空便签";
}

// MARK: - 文本 diff（编辑器用）

export interface TextEdit {
  start: number;
  removed: number;
  inserted: number;
}

/** 求旧串到新串的最小中间改动区间。 */
export function diffEdit(oldText: string, newText: string): TextEdit | null {
  if (oldText === newText) return null;
  let start = 0;
  const minLength = Math.min(oldText.length, newText.length);
  while (start < minLength && oldText[start] === newText[start]) start += 1;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  return {
    start,
    removed: oldEnd - start,
    inserted: newEnd - start,
  };
}
