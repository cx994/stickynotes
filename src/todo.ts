import { TextSurface } from "./editor";
import { icon } from "./icons";
import {
  todoAdd,
  todoContentRanges,
  todoItems,
  todoRemove,
  todoSetText,
  todoToggle,
  type Note,
  type TextHighlight,
  type TodoState,
} from "./model";
import type { ThemeSpec } from "./themes";
import { clear, el } from "./ui";

export interface TodoListOptions {
  note: Note;
  theme: ThemeSpec;
  painting: boolean;
  readOnly: boolean;
  onApply: (state: TodoState) => void;
  onFit: () => void;
  onExitPainting: () => void;
}

interface Row {
  surface: TextSurface;
}

export class TodoList {
  readonly element: HTMLElement;
  private readonly opts: TodoListOptions;
  private rows: Row[] = [];
  private addInput: HTMLInputElement | null = null;
  private painting: boolean;
  private focusAddAfterRender = false;

  constructor(opts: TodoListOptions) {
    this.opts = opts;
    this.painting = opts.painting;
    this.element = el("div", "todo-list");
    this.render();
  }

  private get note(): Note {
    return this.opts.note;
  }

  private get locked(): boolean {
    return this.opts.readOnly || this.painting;
  }

  private state(): TodoState {
    return {
      text: this.note.text,
      highlights: this.note.highlights,
      bolds: this.note.bolds,
    };
  }

  render(): void {
    clear(this.element);
    this.rows = [];
    const items = todoItems(this.note.text);
    const ranges = todoContentRanges(this.note.text);

    items.forEach((item, index) => {
      this.element.append(this.buildRow(item.text, item.done, index, ranges[index] ?? null));
    });

    if (!this.locked) {
      this.element.append(this.buildAddRow());
    }

    if (this.focusAddAfterRender) {
      this.focusAddAfterRender = false;
      requestAnimationFrame(() => this.addInput?.focus());
    }
  }

  private buildRow(
    text: string,
    done: boolean,
    index: number,
    range: { location: number; length: number } | null,
  ): HTMLElement {
    const row = el("div", "todo-row");
    if (done) row.classList.add("is-done");

    const check = el("button", "todo-check");
    check.type = "button";
    check.title = done ? "取消完成" : "标记完成";
    check.disabled = this.painting;
    check.append(icon(done ? "check-square" : "square", 14));
    check.addEventListener("click", (event) => {
      event.stopPropagation();
      if (this.painting) return;
      this.opts.onApply(todoToggle(this.state(), index));
      this.render();
      this.opts.onFit();
    });
    row.append(check);

    if (range) {
      const surface = new TextSurface({
        text,
        highlights: this.note.highlights,
        bolds: this.note.bolds,
        baseOffset: range.location,
        singleLine: true,
        painting: this.painting,
        editable: !this.locked,
        done,
        theme: this.opts.theme,
        onChange: (newText, highlights, bolds) => {
          const next = todoSetText(
            { text: this.note.text, highlights, bolds },
            index,
            newText,
          );
          this.opts.onApply(next);
          this.refreshOffsets();
          this.opts.onFit();
        },
        onPaintingChange: (on) => {
          if (!on) this.opts.onExitPainting();
        },
      });
      this.rows.push({ surface });
      row.append(surface.root);
    } else {
      row.append(el("span", "todo-text", text));
    }

    row.append(el("span", "todo-spacer"));

    if (!this.locked) {
      const remove = el("button", "todo-delete");
      remove.type = "button";
      remove.title = "删除这一条";
      remove.append(icon("x", 8));
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        this.opts.onApply(todoRemove(this.state(), index));
        this.render();
        this.opts.onFit();
      });
      row.append(remove);
    }

    // 已完成的那条文字不可编辑，点击文字取消勾选
    row.addEventListener("click", (event) => {
      if (this.locked || !done) return;
      const target = event.target as HTMLElement;
      if (!target.closest(".surface")) return;
      this.opts.onApply(todoToggle(this.state(), index));
      this.render();
      this.opts.onFit();
    });

    return row;
  }

  private buildAddRow(): HTMLElement {
    const row = el("div", "todo-add");
    row.append(icon("plus-circle", 14));
    const input = el("input", "todo-add-input");
    input.type = "text";
    input.placeholder = "添加待办";
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const text = input.value;
      if (!text.trim()) return;
      this.opts.onApply(todoAdd(this.state(), text));
      this.focusAddAfterRender = true;
      this.render();
      this.opts.onFit();
    });
    this.addInput = input;
    row.append(input);
    return row;
  }

  /** 条内文字变化后，后续条目的全局起点整体平移。 */
  private refreshOffsets(): void {
    const ranges = todoContentRanges(this.note.text);
    this.rows.forEach((row, index) => {
      const range = ranges[index];
      if (range) row.surface.setBaseOffset(range.location);
    });
  }

  setPainting(on: boolean): void {
    if (this.painting === on) return;
    this.painting = on;
    this.rows.forEach((row) => row.surface.setPainting(on));
    this.render();
  }

  setTheme(theme: ThemeSpec): void {
    this.opts.theme = theme;
    this.rows.forEach((row) => row.surface.setTheme(theme));
  }

  setMarks(highlights: TextHighlight[], bolds: TextHighlight[]): void {
    this.rows.forEach((row) => row.surface.setMarks(highlights, bolds));
    this.opts.onApply({ text: this.note.text, highlights, bolds });
  }

  measureHeight(): number {
    // 列表用 flex:1 撑满窗口，直接取 scrollHeight 会得到当前窗口高度，
    // 导致窗口永远缩不回去；改为量第一行到最后一行的高度再加内边距。
    const style = getComputedStyle(this.element);
    const padding =
      (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const rows = this.element.children;
    if (rows.length === 0) return padding;
    const first = rows[0].getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    return Math.ceil(last.bottom - first.top + padding);
  }
}
