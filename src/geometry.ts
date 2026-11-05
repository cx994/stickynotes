import type { SnapEdge } from "./model";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const BAR_HEIGHT = 30;
export const MIN_WIDTH = 184;
export const SNAP_THRESHOLD = 16;

/** 完整窗口是否贴近工作区左/右边缘（Windows 坐标：y 向下）。 */
export function detectSnap(
  frame: Rect,
  work: Rect,
  threshold = SNAP_THRESHOLD,
): SnapEdge | null {
  const leftDistance = Math.abs(frame.x - work.x);
  const rightDistance = Math.abs(work.x + work.w - (frame.x + frame.w));
  const nearLeft = leftDistance <= threshold;
  const nearRight = rightDistance <= threshold;
  if (nearLeft && nearRight) return leftDistance <= rightDistance ? "left" : "right";
  if (nearLeft) return "left";
  if (nearRight) return "right";
  return null;
}

/** 折叠成标题条：保持顶边不动，吸附时直接贴住对应屏幕边缘。 */
export function collapsedTarget(
  frame: Rect,
  width: number,
  barHeight: number,
  edge: SnapEdge | null,
  work: Rect,
): Rect {
  const x =
    edge === "left"
      ? work.x
      : edge === "right"
        ? work.x + work.w - width
        : frame.x;
  return { x, y: frame.y, w: width, h: barHeight };
}

/** 展开：保持折叠条的顶边不动，吸附端贴住屏幕边缘。 */
export function expandedTarget(
  collapsedFrame: Rect,
  savedExpandedFrame: Rect,
  edge: SnapEdge | null,
  work: Rect,
): Rect {
  const x =
    edge === "left"
      ? work.x
      : edge === "right"
        ? work.x + work.w - savedExpandedFrame.w
        : collapsedFrame.x;
  return {
    x,
    y: collapsedFrame.y,
    w: savedExpandedFrame.w,
    h: savedExpandedFrame.h,
  };
}

/** 待办便签按内容重定尺寸：顶边不动，贴右边缘的保持右边缘。 */
export function fittedTarget(
  frame: Rect,
  width: number,
  height: number,
  work: Rect,
): Rect {
  const maxHeight = Math.max(120, work.y + work.h - frame.y);
  const clampedHeight = Math.min(height, maxHeight);
  const anchorRight = detectSnap(frame, work) === "right";
  const x = anchorRight ? frame.x + frame.w - width : frame.x;
  return { x, y: frame.y, w: width, h: clampedHeight };
}
