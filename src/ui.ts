import { icon } from "./icons";

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface MenuItem {
  label?: string;
  icon?: string;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}

let openMenu: HTMLElement | null = null;
let openMenuCleanup: (() => void) | null = null;

export function closeMenu(): void {
  openMenuCleanup?.();
  openMenuCleanup = null;
  openMenu?.remove();
  openMenu = null;
}

/** 在指定坐标弹出一个轻量 HTML 菜单（窗口内使用）。 */
export function showMenuAt(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const menu = el("div", "menu");
  for (const item of items) {
    if (item.separator) {
      menu.append(el("div", "menu-sep"));
      continue;
    }
    const row = el("button", "menu-item");
    row.type = "button";
    if (item.disabled) row.disabled = true;
    if (item.icon) row.append(icon(item.icon, 12));
    const label = el("span", "menu-label", item.label ?? "");
    row.append(label);
    if (item.checked) {
      const check = el("span", "menu-check");
      check.append(icon("check", 11));
      row.append(check);
    }
    if (!item.disabled && item.action) {
      row.addEventListener("click", () => {
        closeMenu();
        item.action?.();
      });
    }
    menu.append(row);
  }
  document.body.append(menu);

  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const left = clamp(x, 4, Math.max(4, window.innerWidth - width - 4));
  const top = clamp(y, 4, Math.max(4, window.innerHeight - height - 4));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onPointerDown = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) closeMenu();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeMenu();
  };
  const timer = window.setTimeout(() => {
    window.addEventListener("pointerdown", onPointerDown, true);
  }, 0);
  window.addEventListener("keydown", onKeyDown, true);
  openMenu = menu;
  openMenuCleanup = () => {
    window.clearTimeout(timer);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onKeyDown, true);
  };
}

/** 在某个元素下方/上方弹出菜单。 */
export function showMenu(anchor: HTMLElement, items: MenuItem[]): void {
  const rect = anchor.getBoundingClientRect();
  showMenuAt(rect.left + rect.width / 2 - 70, rect.bottom + 4, items);
}

export function barButton(
  name: string,
  title: string,
  extraClass = "",
): HTMLButtonElement {
  const button = el("button", `bar-btn ${extraClass}`.trim());
  button.type = "button";
  button.title = title;
  button.append(icon(name, 12));
  return button;
}
