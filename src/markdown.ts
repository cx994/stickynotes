import { type TextHighlight } from "./model";
import { el } from "./ui";

export interface MarkdownOptions {
  highlights: TextHighlight[];
  bolds: TextHighlight[];
  onToggleTask: (lineIndex: number) => void;
  onOpenLink: (url: string) => void;
}

interface InlineToken {
  text: string;
  start: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

/**
 * 极简行内解析：**粗体** *斜体* `代码` [链接](url)。
 * 每个 token 都带源码起点，渲染后仍然能把荧光/加粗落在正确的字上。
 */
function parseInline(source: string, base: number): InlineToken[] {
  const tokens: InlineToken[] = [];
  let index = 0;
  let plainStart = 0;

  const pushPlain = (end: number) => {
    if (end > plainStart) {
      tokens.push({ text: source.slice(plainStart, end), start: base + plainStart });
    }
  };

  while (index < source.length) {
    const char = source[index];

    if (char === "`") {
      const close = source.indexOf("`", index + 1);
      if (close > index) {
        pushPlain(index);
        tokens.push({
          text: source.slice(index + 1, close),
          start: base + index + 1,
          code: true,
        });
        index = close + 1;
        plainStart = index;
        continue;
      }
    }

    if (source.startsWith("**", index) || source.startsWith("__", index)) {
      const marker = source.slice(index, index + 2);
      const close = source.indexOf(marker, index + 2);
      if (close > index + 2) {
        pushPlain(index);
        tokens.push({
          text: source.slice(index + 2, close),
          start: base + index + 2,
          bold: true,
        });
        index = close + 2;
        plainStart = index;
        continue;
      }
    }

    if (char === "*" || char === "_") {
      const close = source.indexOf(char, index + 1);
      if (close > index + 1) {
        pushPlain(index);
        tokens.push({
          text: source.slice(index + 1, close),
          start: base + index + 1,
          italic: true,
        });
        index = close + 1;
        plainStart = index;
        continue;
      }
    }

    if (char === "[") {
      const close = source.indexOf("]", index + 1);
      if (close > index && source[close + 1] === "(") {
        const end = source.indexOf(")", close + 2);
        if (end > close) {
          pushPlain(index);
          tokens.push({
            text: source.slice(index + 1, close),
            start: base + index + 1,
            href: source.slice(close + 2, end),
          });
          index = end + 1;
          plainStart = index;
          continue;
        }
      }
    }

    index += 1;
  }

  pushPlain(source.length);
  return tokens;
}

function appendInline(
  parent: HTMLElement,
  source: string,
  base: number,
  options: MarkdownOptions,
): void {
  const tokens = parseInline(source, base);
  for (const token of tokens) {
    const tokenEnd = token.start + token.text.length;
    const boundaries = new Set<number>([0, token.text.length]);
    for (const mark of [...options.highlights, ...options.bolds]) {
      const lo = Math.max(mark.location, token.start) - token.start;
      const hi = Math.min(mark.location + mark.length, tokenEnd) - token.start;
      if (hi > lo) {
        boundaries.add(lo);
        boundaries.add(hi);
      }
    }
    const points = [...boundaries].sort((a, b) => a - b);

    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      if (end <= start) continue;
      const absoluteStart = token.start + start;
      const absoluteEnd = token.start + end;
      const highlighted = options.highlights.some(
        (mark) => mark.location < absoluteEnd && mark.location + mark.length > absoluteStart,
      );
      const boldMark = options.bolds.some(
        (mark) => mark.location < absoluteEnd && mark.location + mark.length > absoluteStart,
      );

      let node: HTMLElement;
      if (token.code) {
        node = el("code", "md-code");
      } else if (token.href) {
        const link = el("a", "md-link");
        link.href = "#";
        const href = token.href;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          options.onOpenLink(href);
        });
        node = link;
      } else {
        node = el("span");
      }

      node.textContent = token.text.slice(start, end);
      if (token.bold || boldMark) node.classList.add("md-bold");
      if (token.italic) node.classList.add("md-italic");
      if (highlighted) node.classList.add("md-hl");
      parent.append(node);
    }
  }
}

function renderLine(
  line: string,
  lineIndex: number,
  sourceOffset: number,
  options: MarkdownOptions,
): HTMLElement {
  const trimmed = line.trim();
  if (!trimmed) return el("div", "md-empty");
  const lead = line.indexOf(trimmed);

  const heading = (level: 1 | 2 | 3, prefix: number): HTMLElement => {
    const node = el("div", `md-h md-h${level}`);
    appendInline(node, trimmed.slice(prefix), sourceOffset + lead + prefix, options);
    return node;
  };

  if (trimmed.startsWith("### ")) return heading(3, 4);
  if (trimmed.startsWith("## ")) return heading(2, 3);
  if (trimmed.startsWith("# ")) return heading(1, 2);

  if (trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ")) {
    return taskLine(trimmed.slice(6), sourceOffset + lead + 6, true, lineIndex, options);
  }
  if (trimmed.startsWith("- [ ] ")) {
    return taskLine(trimmed.slice(6), sourceOffset + lead + 6, false, lineIndex, options);
  }

  if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    const node = el("div", "md-li");
    node.append(el("span", "md-bullet", "•"));
    const text = el("div", "md-li-text");
    appendInline(text, trimmed.slice(2), sourceOffset + lead + 2, options);
    node.append(text);
    return node;
  }

  if (trimmed.startsWith("> ")) {
    const node = el("div", "md-quote");
    node.append(el("span", "md-quote-bar"));
    const text = el("div", "md-quote-text");
    appendInline(text, trimmed.slice(2), sourceOffset + lead + 2, options);
    node.append(text);
    return node;
  }

  if (trimmed === "---" || trimmed === "***") {
    return el("div", "md-hr");
  }

  const node = el("div", "md-p");
  appendInline(node, line, sourceOffset, options);
  return node;
}

function taskLine(
  text: string,
  sourceOffset: number,
  done: boolean,
  lineIndex: number,
  options: MarkdownOptions,
): HTMLElement {
  const node = el("div", `md-task${done ? " is-done" : ""}`);
  const check = el("button", "md-check");
  check.type = "button";
  check.title = done ? "取消完成" : "标记完成";
  const box = el("span", "md-check-box");
  if (done) box.textContent = "✓";
  check.append(box);
  check.addEventListener("click", () => options.onToggleTask(lineIndex));
  node.append(check);

  const content = el("div", "md-task-text");
  appendInline(content, text, sourceOffset, options);
  node.append(content);
  return node;
}

export function renderMarkdown(
  container: HTMLElement,
  source: string,
  options: MarkdownOptions,
): void {
  container.replaceChildren();
  const lines = source.split("\n");
  let offset = 0;
  lines.forEach((line, index) => {
    container.append(renderLine(line, index, offset, options));
    offset += line.length + 1;
  });
}
