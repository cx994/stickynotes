import type { NoteTheme } from "./model";

export interface ThemeSpec {
  key: NoteTheme;
  name: string;
  /** 便签主体背景色（低饱和莫兰迪色） */
  bg: [number, number, number];
  /** 顶栏轻微加深的颜色 */
  bar: [number, number, number];
  /** 同色系强调色 */
  accent: [number, number, number];
  /** 荧光色，带透明度 */
  highlighter: [number, number, number, number];
  /** 正文暖墨色 */
  text: [number, number, number];
}

export const THEMES: Record<NoteTheme, ThemeSpec> = {
  lemon: {
    key: "lemon",
    name: "柠檬黄",
    bg: [0.97, 0.95, 0.88],
    bar: [0.93, 0.89, 0.76],
    accent: [0.71, 0.58, 0.22],
    highlighter: [1.0, 0.38, 0.3, 0.44],
    text: [0.16, 0.15, 0.13],
  },
  peach: {
    key: "peach",
    name: "蜜桃粉",
    bg: [0.98, 0.93, 0.91],
    bar: [0.95, 0.85, 0.82],
    accent: [0.8, 0.47, 0.4],
    highlighter: [1.0, 0.72, 0.08, 0.56],
    text: [0.16, 0.15, 0.13],
  },
  mint: {
    key: "mint",
    name: "薄荷绿",
    bg: [0.92, 0.95, 0.92],
    bar: [0.84, 0.9, 0.85],
    accent: [0.36, 0.58, 0.44],
    highlighter: [0.57, 0.36, 1.0, 0.42],
    text: [0.16, 0.15, 0.13],
  },
  sky: {
    key: "sky",
    name: "天空蓝",
    bg: [0.92, 0.94, 0.97],
    bar: [0.83, 0.88, 0.94],
    accent: [0.34, 0.53, 0.74],
    highlighter: [0.55, 0.86, 0.22, 0.48],
    text: [0.16, 0.15, 0.13],
  },
  lilac: {
    key: "lilac",
    name: "丁香紫",
    bg: [0.95, 0.93, 0.97],
    bar: [0.88, 0.84, 0.94],
    accent: [0.55, 0.45, 0.73],
    highlighter: [0.12, 0.78, 0.69, 0.45],
    text: [0.16, 0.15, 0.13],
  },
};

export const THEME_ORDER: NoteTheme[] = ["lemon", "peach", "mint", "sky", "lilac"];

export function rgb(color: [number, number, number]): string {
  const [r, g, b] = color.map((v) => Math.round(v * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

export function rgba(
  color: [number, number, number, number],
): string {
  const [r, g, b] = color.slice(0, 3).map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${color[3]})`;
}

export function applyTheme(theme: NoteTheme): void {
  const spec = THEMES[theme];
  const style = document.documentElement.style;
  style.setProperty("--note-bg", `rgba(${spec.bg.map((v) => Math.round(v * 255)).join(", ")}, 0.82)`);
  style.setProperty("--bar-bg", `rgba(${spec.bar.map((v) => Math.round(v * 255)).join(", ")}, 0.5)`);
  style.setProperty("--bar-solid", rgb(spec.bar));
  style.setProperty("--accent", rgb(spec.accent));
  style.setProperty("--accent-soft", `rgba(${spec.accent.map((v) => Math.round(v * 255)).join(", ")}, 0.16)`);
  style.setProperty("--ink", rgb(spec.text));
  style.setProperty("--hl", rgba(spec.highlighter));
  style.setProperty(
    "--hl-solid",
    `rgb(${spec.highlighter.slice(0, 3).map((v) => Math.round(v * 255)).join(", ")})`,
  );
}

/** 高亮色本体（不含透明度），用于荧光笔光标。 */
export function highlighterColor(theme: NoteTheme): string {
  return `rgb(${THEMES[theme].highlighter.slice(0, 3).map((v) => Math.round(v * 255)).join(", ")})`;
}
