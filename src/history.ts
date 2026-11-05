import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { icon } from "./icons";
import { todoItems, type ArchivedNote } from "./model";
import { THEMES, rgb } from "./themes";
import { el } from "./ui";

const app = document.getElementById("app")!;
const root = el("div", "history");
app.append(root);

const WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

interface DayGroup {
  date: Date;
  items: ArchivedNote[];
}

function dayLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}

function timeLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function groupByDay(items: ArchivedNote[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const item of items) {
    const date = new Date(item.deletedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, { date, items: [item] });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((group) => ({
      date: group.date,
      items: group.items.sort(
        (a, b) =>
          new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
      ),
    }));
}

function renderEmpty(): void {
  const empty = el("div", "history-empty");
  const clock = el("div", "history-empty-icon");
  clock.append(icon("clock", 34));
  empty.append(
    clock,
    el("div", "history-empty-title", "还没有历史便签"),
    el("div", "history-empty-sub", "删除的便签会按日期归档到这里"),
  );
  root.append(empty);
}

function renderItem(item: ArchivedNote): HTMLElement {
  const row = el("div", "history-row");

  const dot = el("span", "history-dot");
  dot.style.background = rgb(THEMES[item.theme].bar);
  dot.style.borderColor = `color-mix(in srgb, ${rgb(THEMES[item.theme].accent)} 40%, transparent)`;
  row.append(dot);

  const main = el("div", "history-main");
  const meta = el("div", "history-meta");
  const date = new Date(item.deletedAt);
  meta.append(
    el("span", "history-kind", item.kind === "todo" ? "✅ 待办事项" : "📝 文字便签"),
    el("span", "history-time", timeLabel(date)),
  );
  main.append(meta);

  if (item.kind === "todo") {
    const list = el("div", "history-todo");
    for (const todo of todoItems(item.text)) {
      const line = el("div", `history-todo-item${todo.done ? " done" : ""}`);
      const box = el("span", "history-todo-box");
      box.append(icon(todo.done ? "check-square" : "square", 11));
      line.append(box, el("span", "history-todo-text", todo.text));
      list.append(line);
    }
    main.append(list);
  } else {
    main.append(el("div", "history-text", item.text));
  }
  row.append(main);

  const actions = el("div", "history-actions");
  const restore = el("button", "history-action");
  restore.type = "button";
  restore.title = "恢复成便签";
  restore.append(icon("undo", 15));
  restore.addEventListener("click", () => {
    void api.restoreNote(item.id).then(refresh);
  });

  const remove = el("button", "history-action danger");
  remove.type = "button";
  remove.title = "彻底删除";
  remove.append(icon("trash", 13));
  remove.addEventListener("click", () => void removeItem(item));

  actions.append(restore, remove);
  row.append(actions);
  return row;
}

function render(items: ArchivedNote[]): void {
  root.replaceChildren();
  if (items.length === 0) {
    renderEmpty();
    return;
  }
  for (const group of groupByDay(items)) {
    root.append(el("div", "history-day", dayLabel(group.date)));
    for (const item of group.items) {
      root.append(renderItem(item));
    }
  }
}

async function refresh(): Promise<void> {
  render(await api.listHistory());
}

async function removeItem(item: ArchivedNote): Promise<void> {
  const ok = await ask("彻底删除后无法找回。", {
    title: "彻底删除这条历史?",
    kind: "warning",
    okLabel: "删除",
    cancelLabel: "取消",
  });
  if (!ok) return;
  await api.deleteArchived(item.id);
  await refresh();
}

void listen("history-changed", () => void refresh());
void refresh();
