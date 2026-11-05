import {
  addRange,
  covers,
  coversFully,
  diffEdit,
  maxRange,
  removeRange,
  shiftRanges,
  type TextHighlight,
  type TextRange,
} from "./model";
import { highlighterColor, type ThemeSpec } from "./themes";
import { el, showMenuAt, type MenuItem } from "./ui";

export interface TextSurfaceOptions {
  text: string;
  highlights: TextHighlight[];
  bolds: TextHighlight[];
  theme: ThemeSpec;
  /** 本条文字在整张便签 text 中的起点，用于待办逐条编辑 */
  baseOffset?: number;
  singleLine?: boolean;
  painting?: boolean;
  editable?: boolean;
  done?: boolean;
  placeholder?: string;
  onChange: (
    text: string,
    highlights: TextHighlight[],
    bolds: TextHighlight[],
  ) => void;
  onPaintingChange?: (on: boolean) => void;
}

const FONT_FAMILY =
  '"Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

let graphemeSegmenter: Intl.Segmenter | null = null;
try {
  graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
} catch {
  graphemeSegmenter = null;
}

function previousGrapheme(text: string, index: number): number {
  if (index <= 0) return 0;
  if (graphemeSegmenter) {
    let previous = 0;
    for (const part of graphemeSegmenter.segment(text.slice(0, index))) {
      if (part.index < index) previous = part.index;
    }
    return previous;
  }
  const code = text.charCodeAt(index - 1);
  if (code >= 0xdc00 && code <= 0xdfff && index >= 2) return index - 2;
  return index - 1;
}

function trimBlanks(text: string, range: TextRange): TextRange | null {
  let lo = range.location;
  let hi = maxRange(range);
  const blank = (index: number) => /\s/.test(text[index] ?? "");
  while (lo < hi && blank(lo)) lo += 1;
  while (hi > lo && blank(hi - 1)) hi -= 1;
  return hi > lo ? { location: lo, length: hi - lo } : null;
}

/** 跨行选区按换行切开并削掉两端空白，避免色块铺到行尾。 */
function lineSegments(text: string, range: TextRange): TextRange[] {
  const out: TextRange[] = [];
  let start = range.location;
  const end = maxRange(range);
  for (let i = range.location; i < end; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x0a || code === 0x0d) {
      if (i > start) out.push({ location: start, length: i - start });
      start = i + 1;
    }
  }
  if (end > start) out.push({ location: start, length: end - start });
  return out
    .map((segment) => trimBlanks(text, segment))
    .filter((segment): segment is TextRange => segment !== null);
}

function highlighterCursor(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(-45 12 12)"><rect x="9" y="2" width="6" height="12" rx="1.4" fill="${color}" stroke="#4a4030" stroke-width="1"/><path d="M9 14h6l-1.4 4.2h-3.2z" fill="#f0c96a" stroke="#4a4030" stroke-width="1"/><rect x="10" y="18.2" width="4" height="3" rx=".8" fill="#4a4030"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 21, crosshair`;
}

export class TextSurface {
  readonly root: HTMLElement;
  private readonly mirror: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly opts: TextSurfaceOptions;
  private text: string;
  private highlights: TextHighlight[];
  private bolds: TextHighlight[];
  private theme: ThemeSpec;
  private baseOffset: number;
  private painting: boolean;
  private editable: boolean;
  private done: boolean;

  constructor(opts: TextSurfaceOptions) {
    this.opts = opts;
    this.text = opts.text;
    this.highlights = opts.highlights;
    this.bolds = opts.bolds;
    this.theme = opts.theme;
    this.baseOffset = opts.baseOffset ?? 0;
    this.painting = opts.painting ?? false;
    this.editable = opts.editable ?? true;
    this.done = opts.done ?? false;

    this.root = el("div", "surface");
    if (opts.singleLine) this.root.classList.add("surface--single");
    if (this.done) this.root.classList.add("is-done");

    this.mirror = el("div", "surface-mirror");
    this.mirror.setAttribute("aria-hidden", "true");

    this.input = el("textarea", "surface-input");
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.input.wrap = "soft";
    this.input.rows = 1;
    this.input.value = this.text;
    // 赋值会把光标移到末尾，聚焦时便滚到底部；打开便签应当从开头显示。
    this.input.setSelectionRange(0, 0);
    if (opts.placeholder) this.input.placeholder = opts.placeholder;
    if (opts.singleLine) this.input.classList.add("surface-input--single");

    this.root.append(this.mirror, this.input);
    this.bind();
    this.renderMirror();
    this.applyState();
  }

  private bind(): void {
    this.input.addEventListener("input", this.handleInput);
    this.input.addEventListener("scroll", this.handleScroll);
    this.input.addEventListener("keydown", this.handleKeyDown);
    this.input.addEventListener("mouseup", this.handleMouseUp);
    this.input.addEventListener("contextmenu", this.handleContextMenu);
  }

  dispose(): void {
    this.input.removeEventListener("input", this.handleInput);
    this.input.removeEventListener("scroll", this.handleScroll);
    this.input.removeEventListener("keydown", this.handleKeyDown);
    this.input.removeEventListener("mouseup", this.handleMouseUp);
    this.input.removeEventListener("contextmenu", this.handleContextMenu);
    this.root.remove();
  }

  focus(): void {
    if (!this.painting) this.input.focus();
  }

  setBaseOffset(offset: number): void {
    this.baseOffset = offset;
  }

  setMarks(highlights: TextHighlight[], bolds: TextHighlight[]): void {
    this.highlights = highlights;
    this.bolds = bolds;
    this.renderMirror();
  }

  setTheme(theme: ThemeSpec): void {
    this.theme = theme;
    this.applyState();
  }

  setPainting(on: boolean): void {
    if (this.painting === on) return;
    this.painting = on;
    this.applyState();
    if (on) this.input.focus();
  }

  setEditable(editable: boolean): void {
    this.editable = editable;
    this.applyState();
  }

  setDone(done: boolean): void {
    this.done = done;
    this.root.classList.toggle("is-done", done);
    this.applyState();
  }

  private applyState(): void {
    this.input.readOnly = this.painting || !this.editable || this.done;
    this.input.style.cursor = this.painting
      ? highlighterCursor(highlighterColor(this.theme.key))
      : "";
    this.root.classList.toggle("is-painting", this.painting);
    this.root.classList.toggle("is-readonly", !this.editable);
    this.root.classList.toggle("is-done", this.done);
  }

  private handleScroll = (): void => {
    this.mirror.style.transform = `translateY(${-this.input.scrollTop}px)`;
  };

  private handleInput = (): void => {
    const newText = this.input.value;
    if (newText === this.text) return;
    const edit = diffEdit(this.text, newText);
    this.text = newText;
    if (edit) {
      const replaced = {
        location: edit.start + this.baseOffset,
        length: edit.removed,
      };
      this.highlights = shiftRanges(this.highlights, replaced, edit.inserted);
      this.bolds = shiftRanges(this.bolds, replaced, edit.inserted);
    }
    this.renderMirror();
    this.opts.onChange(this.text, this.highlights, this.bolds);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const mod = event.ctrlKey || event.metaKey;

    if (mod && event.shiftKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      this.setPainting(!this.painting);
      this.opts.onPaintingChange?.(this.painting);
      return;
    }
    if (event.key === "Escape" && this.painting) {
      event.preventDefault();
      this.setPainting(false);
      this.opts.onPaintingChange?.(false);
      return;
    }
    if (this.painting && event.key === "Backspace") {
      event.preventDefault();
      this.eraseBackward();
      return;
    }
    if (this.painting && event.key === "Delete") {
      event.preventDefault();
      return;
    }
    if (
      mod &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "b" &&
      !this.painting
    ) {
      event.preventDefault();
      this.toggleBold();
      return;
    }
    if (this.opts.singleLine && event.key === "Enter") {
      event.preventDefault();
    }
  };

  private handleMouseUp = (): void => {
    if (!this.painting) return;
    const start = this.input.selectionStart;
    const end = this.input.selectionEnd;
    if (end <= start) return;
    const segments = lineSegments(this.text, {
      location: start,
      length: end - start,
    });
    if (segments.length === 0) return;
    let marks = this.highlights;
    for (const segment of segments) {
      marks = addRange(marks, {
        location: segment.location + this.baseOffset,
        length: segment.length,
      });
    }
    this.highlights = marks;
    this.input.setSelectionRange(end, end);
    this.renderMirror();
    this.opts.onChange(this.text, this.highlights, this.bolds);
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const selection = {
      location: this.input.selectionStart,
      length: this.input.selectionEnd - this.input.selectionStart,
    };
    const globalSelection = {
      location: selection.location + this.baseOffset,
      length: selection.length,
    };
    const hasSelection = selection.length > 0;
    const items: MenuItem[] = [
      {
        label: "撤销",
        icon: "undo",
        disabled: this.painting,
        action: () => this.runEdit("undo"),
      },
      {
        label: "重做",
        icon: "undo",
        disabled: this.painting,
        action: () => this.runEdit("redo"),
      },
      { separator: true },
      {
        label: "剪切",
        disabled: this.painting || !hasSelection,
        action: () => this.runEdit("cut"),
      },
      {
        label: "拷贝",
        disabled: !hasSelection,
        action: () => this.runEdit("copy"),
      },
      {
        label: "粘贴",
        disabled: this.painting,
        action: () => void this.paste(),
      },
      {
        label: "全选",
        disabled: this.text.length === 0,
        action: () => {
          this.input.focus();
          this.input.select();
        },
      },
      { separator: true },
      {
        label: coversFully(this.bolds, globalSelection) ? "取消加粗" : "加粗",
        icon: "bold",
        disabled: this.painting || !hasSelection,
        action: () => this.toggleBold(),
      },
      { separator: true },
      {
        label: this.painting ? "退出荧光笔 (Ctrl+Shift+H)" : "荧光笔 (Ctrl+Shift+H)",
        icon: "highlighter",
        checked: this.painting,
        action: () => {
          this.setPainting(!this.painting);
          this.opts.onPaintingChange?.(this.painting);
        },
      },
      {
        label: "擦除所选高亮",
        icon: "eraser",
        disabled: !covers(this.highlights, globalSelection) && !this.highlightAtCursor(),
        action: () => this.eraseSelection(globalSelection),
      },
      {
        label: "清空全部高亮",
        icon: "eraser",
        disabled: this.highlights.length === 0,
        action: () => {
          this.highlights = [];
          this.renderMirror();
          this.opts.onChange(this.text, this.highlights, this.bolds);
        },
      },
    ];
    showMenuAt(event.clientX, event.clientY, items);
  };

  private highlightAtCursor(): boolean {
    const position = this.input.selectionStart + this.baseOffset;
    return this.highlights.some(
      (mark) => position >= mark.location && position < mark.location + mark.length,
    );
  }

  private runEdit(command: "undo" | "redo" | "cut" | "copy"): void {
    this.input.focus();
    try {
      document.execCommand(command);
    } catch {
      // WebView 不支持时静默失败，键盘快捷键仍然可用
    }
  }

  private async paste(): Promise<void> {
    this.input.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (text) document.execCommand("insertText", false, text);
    } catch {
      // 没有剪贴板权限时交给系统快捷键
    }
  }

  private eraseSelection(range: TextRange): void {
    let target = range;
    if (target.length === 0) {
      const position = target.location;
      const mark = this.highlights.find(
        (m) => position >= m.location && position < m.location + m.length,
      );
      if (!mark) return;
      target = { location: mark.location, length: mark.length };
    }
    this.highlights = removeRange(this.highlights, target);
    this.renderMirror();
    this.opts.onChange(this.text, this.highlights, this.bolds);
  }

  private eraseBackward(): void {
    const start = this.input.selectionStart;
    const end = this.input.selectionEnd;
    if (end > start) {
      this.highlights = removeRange(this.highlights, {
        location: start + this.baseOffset,
        length: end - start,
      });
      this.input.setSelectionRange(start, start);
    } else {
      if (start <= 0) return;
      const previous = previousGrapheme(this.text, start);
      this.highlights = removeRange(this.highlights, {
        location: previous + this.baseOffset,
        length: start - previous,
      });
      this.input.setSelectionRange(previous, previous);
    }
    this.renderMirror();
    this.opts.onChange(this.text, this.highlights, this.bolds);
  }

  private toggleBold(): void {
    const start = this.input.selectionStart;
    const end = this.input.selectionEnd;
    if (end <= start) return;
    const range = {
      location: start + this.baseOffset,
      length: end - start,
    };
    this.bolds = coversFully(this.bolds, range)
      ? removeRange(this.bolds, range)
      : addRange(this.bolds, range);
    this.renderMirror();
    this.opts.onChange(this.text, this.highlights, this.bolds);
  }

  private renderMirror(): void {
    const text = this.text;
    const boundaries = new Set<number>([0, text.length]);
    for (const mark of [...this.highlights, ...this.bolds]) {
      boundaries.add(Math.max(0, Math.min(text.length, mark.location)));
      boundaries.add(
        Math.max(0, Math.min(text.length, mark.location + mark.length)),
      );
    }
    const points = [...boundaries].sort((a, b) => a - b);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      if (end <= start) continue;
      const segment = text.slice(start, end);
      const highlighted = this.highlights.some(
        (mark) => mark.location < end && mark.location + mark.length > start,
      );
      const bold = this.bolds.some(
        (mark) => mark.location < end && mark.location + mark.length > start,
      );
      if (!highlighted && !bold) {
        fragment.append(document.createTextNode(segment));
      } else {
        const span = el("span");
        if (highlighted) span.classList.add("mk-hl");
        if (bold) span.classList.add("mk-bold");
        span.textContent = segment;
        fragment.append(span);
      }
    }
    // 末尾空行也要占一行高度，光标才能和文字对齐
    fragment.append(document.createTextNode("​"));
    this.mirror.replaceChildren(fragment);
  }
}
