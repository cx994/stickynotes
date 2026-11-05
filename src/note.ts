import { ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "./api";
import { TextSurface } from "./editor";
import {
  BAR_HEIGHT,
  MIN_WIDTH,
  SNAP_THRESHOLD,
  collapsedTarget,
  detectSnap,
  expandedTarget,
  fittedTarget,
  type Rect,
} from "./geometry";
import { icon } from "./icons";
import { renderMarkdown } from "./markdown";
import {
  noteTitle,
  toggleTaskLine,
  todoItems,
  type Note,
  type NoteMode,
  type NoteTheme,
  type SnapEdge,
  type TodoState,
} from "./model";
import { THEMES, THEME_ORDER, applyTheme, rgb } from "./themes";
import { TodoList } from "./todo";
import { barButton, el, showMenu, type MenuItem } from "./ui";
import * as win from "./win";

const FONT_FAMILY =
  '"Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
const COMPACT_WIDTH = 260;

const noteId = new URLSearchParams(location.search).get("id");
if (!noteId) throw new Error("missing note id");

const note: Note = await api.getNote(noteId);
await win.initUiScale();
const app = document.getElementById("app")!;

// MARK: - DOM 骨架

const root = el("div", "note");
root.dataset.kind = note.kind;

const bar = el("div", "bar");
const closeBtn = barButton("x", "删除这张便签", "close");
const newBtn = barButton("plus", "新建便签", "new");
const titleEl = el("span", "bar-title");
const spacer = el("span", "bar-spacer");
const colors = el("span", "colors hover-only");
const divider = el("span", "bar-divider hover-only");
const modeBtn = barButton("pin", "窗口模式", "mode hover-only");
const compactBtn = barButton("ellipsis", "颜色与窗口模式", "compact-menu hover-only");
const eraseAllBtn = barButton("eraser", "清空这张便签的全部高亮", "erase-all");
const highlighterBtn = barButton("highlighter", "荧光笔 (Ctrl+Shift+H)", "highlighter");
const previewBtn = barButton("eye", "预览 (只读干净视图)", "preview");
const collapseBtn = barButton("collapse", "折叠成一行标题", "collapse");
bar.append(
  closeBtn,
  newBtn,
  titleEl,
  spacer,
  colors,
  divider,
  modeBtn,
  compactBtn,
  eraseAllBtn,
  highlighterBtn,
  previewBtn,
  collapseBtn,
);

const content = el("div", "content");
const resizeHandles = buildResizeHandles();
root.append(bar, content, resizeHandles);
app.append(root);

const dots = new Map<NoteTheme, HTMLButtonElement>();
for (const key of THEME_ORDER) {
  const dot = el("button", "color-dot");
  dot.type = "button";
  dot.title = THEMES[key].name;
  dot.style.background = rgb(THEMES[key].bar);
  dot.style.setProperty("--dot-accent", rgb(THEMES[key].accent));
  dot.addEventListener("click", () => setTheme(key));
  colors.append(dot);
  dots.set(key, dot);
}

// MARK: - 状态

let painting = false;
let compact = false;
let surface: TextSurface | null = null;
let todoList: TodoList | null = null;
let contentKey = "";
let fitting = false;
let fitScheduled = false;

// MARK: - 主题 / 顶栏

applyTheme(note.theme);

function renderChrome(): void {
  root.classList.toggle("collapsed", note.isCollapsed);
  root.classList.toggle("previewing", note.isPreview);
  root.classList.toggle("painting", painting);
  root.classList.toggle("compact", compact);
  root.classList.toggle("snap-left", note.isCollapsed && note.snap === "left");
  root.classList.toggle("snap-right", note.isCollapsed && note.snap === "right");
  root.dataset.theme = note.theme;

  titleEl.textContent = note.isCollapsed ? noteTitle(note) : "";

  modeBtn.replaceChildren(icon(modeIcon(note.mode), 12));
  modeBtn.title = `窗口模式: ${modeName(note.mode)}`;
  previewBtn.replaceChildren(icon(note.isPreview ? "pencil" : "eye", 12));
  previewBtn.title = note.isPreview ? "回到编辑" : "预览 (只读干净视图)";
  collapseBtn.replaceChildren(icon(note.isCollapsed ? "expand" : "collapse", 12));
  collapseBtn.title = note.isCollapsed ? "展开便签" : "折叠成一行标题";
  highlighterBtn.classList.toggle("active", painting);
  highlighterBtn.title = painting
    ? "退出荧光笔 (Esc)"
    : "荧光笔 (Ctrl+Shift+H): 拖动涂抹, 退格擦除";
  eraseAllBtn.style.display =
    painting && note.highlights.length > 0 && !note.isPreview && !note.isCollapsed
      ? ""
      : "none";

  for (const [key, dot] of dots) {
    dot.classList.toggle("active", key === note.theme);
  }
}

function modeIcon(mode: NoteMode): string {
  if (mode === "floating") return "pin";
  if (mode === "desktop") return "desktop";
  return "window";
}

function modeName(mode: NoteMode): string {
  if (mode === "floating") return "置顶悬浮";
  if (mode === "desktop") return "贴在桌面";
  return "普通窗口";
}

function updateCompact(): void {
  const next = !note.isCollapsed && window.innerWidth < COMPACT_WIDTH;
  if (next !== compact) {
    compact = next;
    renderChrome();
  }
}

function setTheme(theme: NoteTheme): void {
  if (note.theme === theme) return;
  note.theme = theme;
  applyTheme(theme);
  surface?.setTheme(THEMES[theme]);
  todoList?.setTheme(THEMES[theme]);
  renderChrome();
  void api.patchNote(note.id, { theme });
}

function setMode(mode: NoteMode): void {
  if (note.mode === mode) return;
  note.mode = mode;
  renderChrome();
  void api.patchNote(note.id, { mode });
}

function setPreview(on: boolean): void {
  if (note.isPreview === on) return;
  painting = false;
  note.isPreview = on;
  renderChrome();
  renderContent();
  void api.patchNote(note.id, { isPreview: on });
}

function setPainting(on: boolean): void {
  if (note.isPreview || note.isCollapsed) on = false;
  if (painting === on) return;
  painting = on;
  surface?.setPainting(on);
  todoList?.setPainting(on);
  renderChrome();
}

function clearHighlights(): void {
  if (surface) {
    surface.setMarks([], note.bolds);
    applyState({ text: note.text, highlights: [], bolds: note.bolds });
  } else if (todoList) {
    todoList.setMarks([], note.bolds);
  } else {
    note.highlights = [];
    void api.patchNote(note.id, { highlights: [] });
  }
  renderChrome();
  if (note.isPreview) renderContent(true);
}

// MARK: - 内容

function renderContent(force = false): void {
  const key = `${note.kind}:${note.isPreview}:${note.isCollapsed}`;
  if (!force && key === contentKey) {
    surface?.setTheme(THEMES[note.theme]);
    todoList?.setTheme(THEMES[note.theme]);
    return;
  }
  contentKey = key;

  surface?.dispose();
  surface = null;
  todoList = null;
  content.replaceChildren();
  content.hidden = note.isCollapsed;
  if (note.isCollapsed) return;

  if (note.kind === "todo") {
    todoList = new TodoList({
      note,
      theme: THEMES[note.theme],
      painting,
      readOnly: note.isPreview,
      onApply: (state) => applyState(state),
      onFit: scheduleFit,
      onExitPainting: () => setPainting(false),
    });
    content.append(todoList.element);
    scheduleFit();
  } else if (note.isPreview) {
    const markdown = el("div", "markdown");
    renderMarkdown(markdown, note.text, {
      highlights: note.highlights,
      bolds: note.bolds,
      onToggleTask: togglePreviewTask,
      onOpenLink: openExternal,
    });
    content.append(markdown);
  } else {
    surface = new TextSurface({
      text: note.text,
      highlights: note.highlights,
      bolds: note.bolds,
      theme: THEMES[note.theme],
      painting,
      editable: true,
      onChange: (text, highlights, bolds) =>
        applyState({ text, highlights, bolds }),
      onPaintingChange: (on) => {
        if (!on) setPainting(false);
      },
    });
    content.append(surface.root);
    requestAnimationFrame(() => surface?.focus());
  }
}

function applyState(state: TodoState): void {
  note.text = state.text;
  note.highlights = state.highlights;
  note.bolds = state.bolds;
  void api.patchNote(note.id, {
    text: note.text,
    highlights: note.highlights,
    bolds: note.bolds,
  });
  if (note.isCollapsed) void refreshCollapsedWidth();
  renderChrome();
}

function togglePreviewTask(lineIndex: number): void {
  note.text = toggleTaskLine(note.text, lineIndex);
  void api.patchNote(note.id, { text: note.text });
  renderContent(true);
}

function openExternal(url: string): void {
  if (!/^(https?:|mailto:)/i.test(url)) return;
  void openUrl(url);
}

// MARK: - 折叠 / 吸附

function measureContext(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d context unavailable");
  return context;
}

function collapsedWidth(title: string): number {
  const context = measureContext();
  context.font = `600 12px ${FONT_FAMILY}`;
  return Math.max(120, Math.ceil(context.measureText(title).width) + 52);
}

function fittingWidth(): number {
  const context = measureContext();
  context.font = `14px ${FONT_FAMILY}`;
  let max = 0;
  for (const item of todoItems(note.text)) {
    max = Math.max(max, context.measureText(item.text).width);
  }
  const locked = note.isPreview || painting;
  const chrome = 13 * 2 + 16 + 7 * 2 + (locked ? 0 : 7 + 10);
  return Math.min(Math.max(MIN_WIDTH, Math.ceil(max) + chrome + 2), 360);
}

async function toggleCollapse(): Promise<void> {
  if (note.isCollapsed) {
    await expandNote();
  } else {
    await collapseNote();
  }
}

async function collapseNote(): Promise<void> {
  const [frame, work] = await Promise.all([win.getFrame(), win.getWorkArea()]);
  note.ex = frame.x;
  note.ey = frame.y;
  note.ew = frame.w;
  note.eh = frame.h;

  const edge = detectSnap(frame, work, win.cssToLogical(SNAP_THRESHOLD));
  const width = win.cssToLogical(collapsedWidth(noteTitle(note)));
  const target = collapsedTarget(
    frame,
    width,
    win.cssToLogical(BAR_HEIGHT),
    edge,
    work,
  );

  note.isCollapsed = true;
  note.snap = edge;
  painting = false;
  note.x = target.x;
  note.y = target.y;
  note.w = target.w;
  note.h = target.h;

  await api.setCollapsedState(
    note.id,
    true,
    edge,
    note.ex,
    note.ey,
    note.ew,
    note.eh,
  );
  await win.setResizable(false);
  await win.setWindowSize(target.w, target.h);
  await win.setWindowPosition(target.x, target.y);
  renderContent();
  renderChrome();
}

async function expandNote(): Promise<void> {
  const [frame, work] = await Promise.all([win.getFrame(), win.getWorkArea()]);
  const target = expandedTarget(
    frame,
    { x: note.ex, y: note.ey, w: note.ew, h: note.eh },
    note.snap ?? null,
    work,
  );

  note.isCollapsed = false;
  note.snap = null;
  note.x = target.x;
  note.y = target.y;
  note.w = target.w;
  note.h = target.h;

  await api.setCollapsedState(
    note.id,
    false,
    null,
    target.x,
    target.y,
    target.w,
    target.h,
  );
  await win.setResizable(true);
  await win.setWindowSize(target.w, target.h);
  await win.setWindowPosition(target.x, target.y);
  renderContent();
  renderChrome();
}

async function refreshCollapsedWidth(): Promise<void> {
  if (!note.isCollapsed) return;
  const [frame, work] = await Promise.all([win.getFrame(), win.getWorkArea()]);
  const width = win.cssToLogical(collapsedWidth(noteTitle(note)));
  const target = collapsedTarget(
    frame,
    width,
    win.cssToLogical(BAR_HEIGHT),
    note.snap ?? null,
    work,
  );
  note.x = target.x;
  note.y = target.y;
  note.w = target.w;
  note.h = target.h;
  await win.setWindowSize(target.w, target.h);
  await win.setWindowPosition(target.x, target.y);
}

// MARK: - 待办自动适配大小

function scheduleFit(): void {
  if (note.kind !== "todo" || note.isCollapsed || fitScheduled) return;
  fitScheduled = true;
  requestAnimationFrame(() => {
    fitScheduled = false;
    void fitTodo();
  });
}

async function fitTodo(): Promise<void> {
  if (note.kind !== "todo" || note.isCollapsed || fitting) return;
  fitting = true;
  try {
    const [frame, work] = await Promise.all([win.getFrame(), win.getWorkArea()]);
    const width = note.mw ? frame.w : win.cssToLogical(fittingWidth());
    const height = note.mh
      ? frame.h
      : win.cssToLogical(BAR_HEIGHT + (todoList?.measureHeight() ?? 0));
    const target = fittedTarget(frame, width, height, work);
    if (
      Math.abs(target.x - frame.x) < 0.5 &&
      Math.abs(target.y - frame.y) < 0.5 &&
      Math.abs(target.w - frame.w) < 0.5 &&
      Math.abs(target.h - frame.h) < 0.5
    ) {
      return;
    }
    await win.setWindowSize(target.w, target.h);
    await win.setWindowPosition(target.x, target.y);
  } finally {
    fitting = false;
  }
}

// MARK: - 拖动 / 缩放

interface DragState {
  startX: number;
  startY: number;
  frame: Rect | null;
  work: Rect | null;
  moved: boolean;
  lastX: number;
  lastY: number;
}

let drag: DragState | null = null;
let pendingPosition: { x: number; y: number } | null = null;
let positionRaf = 0;

function schedulePosition(x: number, y: number): void {
  pendingPosition = { x, y };
  if (positionRaf) return;
  positionRaf = requestAnimationFrame(() => {
    positionRaf = 0;
    const position = pendingPosition;
    pendingPosition = null;
    if (position) void win.setWindowPosition(position.x, position.y);
  });
}

bar.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if ((event.target as HTMLElement).closest("button")) return;

  const state: DragState = {
    startX: event.screenX,
    startY: event.screenY,
    frame: null,
    work: null,
    moved: false,
    lastX: 0,
    lastY: 0,
  };
  drag = state;
  bar.setPointerCapture(event.pointerId);

  void Promise.all([win.getFrame(), win.getWorkArea()]).then(([frame, work]) => {
    if (drag !== state) return;
    state.frame = frame;
    state.work = work;
    state.lastX = frame.x;
    state.lastY = frame.y;
  });
});

bar.addEventListener("pointermove", (event) => {
  const state = drag;
  if (!state || !state.frame || !state.work) return;
  const dx = win.cssToLogical(event.screenX - state.startX);
  const dy = win.cssToLogical(event.screenY - state.startY);
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.moved = true;
  state.lastX = state.frame.x + dx;
  state.lastY = state.frame.y + dy;
  schedulePosition(state.lastX, state.lastY);

  if (note.isCollapsed) {
    const edge = detectSnap(
      { x: state.lastX, y: state.lastY, w: state.frame.w, h: state.frame.h },
      state.work,
    );
    if (edge !== (note.snap ?? null)) {
      note.snap = edge;
      renderChrome();
      void api.setSnap(note.id, edge);
    }
  }
});

function endDrag(event: PointerEvent): void {
  const state = drag;
  drag = null;
  if (bar.hasPointerCapture(event.pointerId)) {
    bar.releasePointerCapture(event.pointerId);
  }
  if (!state || !state.moved || !note.isCollapsed || !note.snap || !state.work) {
    return;
  }
  const width = state.frame?.w ?? note.w;
  const targetX =
    note.snap === "left"
      ? state.work.x
      : state.work.x + state.work.w - width;
  void win.animateWindowX(targetX, state.lastY);
}

bar.addEventListener("pointerup", endDrag);
bar.addEventListener("pointercancel", endDrag);

function buildResizeHandles(): HTMLElement {
  const wrap = el("div", "resize-handles");
  const definitions: Array<{
    cls: string;
    direction:
      | "North"
      | "South"
      | "East"
      | "West"
      | "NorthEast"
      | "NorthWest"
      | "SouthEast"
      | "SouthWest";
    width: boolean;
    height: boolean;
  }> = [
    { cls: "n", direction: "North", width: false, height: true },
    { cls: "s", direction: "South", width: false, height: true },
    { cls: "e", direction: "East", width: true, height: false },
    { cls: "w", direction: "West", width: true, height: false },
    { cls: "ne", direction: "NorthEast", width: true, height: true },
    { cls: "nw", direction: "NorthWest", width: true, height: true },
    { cls: "se", direction: "SouthEast", width: true, height: true },
    { cls: "sw", direction: "SouthWest", width: true, height: true },
  ];

  for (const definition of definitions) {
    const handle = el("div", `rz rz-${definition.cls}`);
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (definition.width) note.mw = true;
      if (definition.height) note.mh = true;
      void api.setManual(note.id, !!note.mw, !!note.mh);
      void win.startResizeDragging(definition.direction);
    });
    wrap.append(handle);
  }
  return wrap;
}

// MARK: - 顶栏动作

closeBtn.addEventListener("click", () => void confirmDelete());
newBtn.addEventListener("click", () => {
  showMenu(newBtn, [
    { label: "📝 文字便签", action: () => void api.createNote("text") },
    { label: "✅ 待办事项", action: () => void api.createNote("todo") },
  ]);
});
modeBtn.addEventListener("click", () => showMenu(modeBtn, modeItems()));
compactBtn.addEventListener("click", () => {
  const items: MenuItem[] = THEME_ORDER.map((key) => ({
    label: THEMES[key].name,
    checked: note.theme === key,
    action: () => setTheme(key),
  }));
  items.push({ separator: true }, ...modeItems());
  showMenu(compactBtn, items);
});
eraseAllBtn.addEventListener("click", () => {
  if (note.kind === "text" && surface) {
    surface.setMarks([], note.bolds);
    applyState({ text: note.text, highlights: [], bolds: note.bolds });
  } else if (todoList) {
    todoList.setMarks([], note.bolds);
  }
  renderChrome();
});
highlighterBtn.addEventListener("click", () => setPainting(!painting));
previewBtn.addEventListener("click", () => setPreview(!note.isPreview));
collapseBtn.addEventListener("click", () => void toggleCollapse());

function modeItems(): MenuItem[] {
  return [
    {
      label: "置顶悬浮",
      icon: "pin",
      checked: note.mode === "floating",
      action: () => setMode("floating"),
    },
    {
      label: "普通窗口",
      icon: "window",
      checked: note.mode === "normal",
      action: () => setMode("normal"),
    },
    {
      label: "贴在桌面",
      icon: "desktop",
      checked: note.mode === "desktop",
      action: () => setMode("desktop"),
    },
  ];
}

async function confirmDelete(): Promise<void> {
  if (note.text.trim()) {
    const ok = await ask(
      "便签会归档到「历史便签」里, 可以随时查看或恢复。",
      {
        title: "删除这张便签?",
        kind: "warning",
        okLabel: "删除",
        cancelLabel: "取消",
      },
    );
    if (!ok) return;
  }
  await api.deleteNote(note.id);
}

// MARK: - 启动

renderChrome();
renderContent();
updateCompact();
window.addEventListener("resize", updateCompact);
void win.onWindowResized(updateCompact);
