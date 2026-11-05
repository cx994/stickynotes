import {
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
} from "@tauri-apps/api/window";

export type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let cssPerLogical = 1;
// 无边框窗口仍带一圈不可见的缩放边框：外框位置 → 客户区位置的偏移（逻辑像素）。
let clientOffset = { x: 0, y: 0 };

/**
 * Windows 的“文本大小”辅助设置会让 WebView 的 devicePixelRatio 大于系统缩放，
 * 此时 CSS 像素比窗口逻辑像素小；把 CSS 测量值换算成窗口尺寸时要乘这个系数。
 */
export async function initUiScale(): Promise<void> {
  const current = getCurrentWindow();
  const [scale, outer, inner] = await Promise.all([
    current.scaleFactor(),
    current.outerPosition(),
    current.innerPosition(),
  ]);
  cssPerLogical = window.devicePixelRatio / scale;
  clientOffset = {
    x: (inner.x - outer.x) / scale,
    y: (inner.y - outer.y) / scale,
  };
}

export function cssToLogical(px: number): number {
  return px * cssPerLogical;
}

/** 客户区矩形（逻辑像素），与 setSize() 的口径一致。 */
export async function getFrame(): Promise<Rect> {
  const window = getCurrentWindow();
  const [position, size, scale] = await Promise.all([
    window.innerPosition(),
    window.innerSize(),
    window.scaleFactor(),
  ]);
  return {
    x: position.x / scale,
    y: position.y / scale,
    w: size.width / scale,
    h: size.height / scale,
  };
}

export async function setWindowSize(w: number, h: number): Promise<void> {
  await getCurrentWindow().setSize(
    new LogicalSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))),
  );
}

/** 参数是客户区左上角；setPosition 用的是外框位置，这里补回边框偏移。 */
export async function setWindowPosition(x: number, y: number): Promise<void> {
  await getCurrentWindow().setPosition(
    new LogicalPosition(
      Math.round(x - clientOffset.x),
      Math.round(y - clientOffset.y),
    ),
  );
}

export async function setResizable(resizable: boolean): Promise<void> {
  await getCurrentWindow().setResizable(resizable);
}

export async function startResizeDragging(
  direction: ResizeDirection,
): Promise<void> {
  await getCurrentWindow().startResizeDragging(direction);
}

/** 当前显示器的工作区（去掉任务栏），逻辑像素。 */
export async function getWorkArea(): Promise<Rect> {
  const monitor = await currentMonitor();
  if (!monitor) {
    return { x: 0, y: 0, w: window.screen.availWidth, h: window.screen.availHeight };
  }
  const scale = monitor.scaleFactor;
  const position = monitor.workArea.position.toLogical(scale);
  const size = monitor.workArea.size.toLogical(scale);
  return { x: position.x, y: position.y, w: size.width, h: size.height };
}

export async function onWindowResized(handler: () => void): Promise<() => void> {
  return getCurrentWindow().onResized(() => handler());
}

/** 让窗口水平方向平滑归位（贴边吸附松手后的 0.18s 动画）。 */
export async function animateWindowX(
  targetX: number,
  y: number,
  duration = 180,
): Promise<void> {
  const start = await getFrame();
  const startX = start.x;
  const delta = targetX - startX;
  if (Math.abs(delta) < 0.5) return;
  const startTime = performance.now();
  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      void setWindowPosition(startX + delta * eased, y);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
