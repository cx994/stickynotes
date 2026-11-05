import test from "node:test";
import assert from "node:assert/strict";
import {
  addRange,
  diffEdit,
  noteTitle,
  removeRange,
  shiftRanges,
  todoAdd,
  todoContentRanges,
  todoItems,
  todoRemove,
  todoToggle,
  toggleTaskLine,
} from "../src/model.ts";
import {
  collapsedTarget,
  detectSnap,
  expandedTarget,
  fittedTarget,
} from "../src/geometry.ts";

test("addRange 合并相接与重叠的区间", () => {
  assert.deepEqual(addRange([], { location: 2, length: 3 }), [
    { location: 2, length: 3 },
  ]);
  assert.deepEqual(
    addRange([{ location: 2, length: 3 }], { location: 5, length: 2 }),
    [{ location: 2, length: 5 }],
  );
  assert.deepEqual(
    addRange([{ location: 2, length: 3 }], { location: 0, length: 1 }),
    [
      { location: 0, length: 1 },
      { location: 2, length: 3 },
    ],
  );
  assert.deepEqual(
    addRange([{ location: 2, length: 3 }], { location: 3, length: 3 }),
    [{ location: 2, length: 4 }],
  );
});

test("removeRange 从中间挖断高亮", () => {
  assert.deepEqual(
    removeRange([{ location: 0, length: 10 }], { location: 4, length: 2 }),
    [
      { location: 0, length: 4 },
      { location: 6, length: 4 },
    ],
  );
  assert.deepEqual(
    removeRange([{ location: 0, length: 10 }], { location: 0, length: 3 }),
    [{ location: 3, length: 7 }],
  );
});

test("shiftRanges 跟随文字编辑平移", () => {
  // 在高亮内部插入
  assert.deepEqual(
    shiftRanges([{ location: 2, length: 4 }], { location: 4, length: 0 }, 1),
    [{ location: 2, length: 5 }],
  );
  // 在高亮之前插入
  assert.deepEqual(
    shiftRanges([{ location: 2, length: 4 }], { location: 0, length: 0 }, 2),
    [{ location: 4, length: 4 }],
  );
  // 删掉高亮中间一段
  assert.deepEqual(
    shiftRanges([{ location: 2, length: 4 }], { location: 3, length: 2 }, 0),
    [
      { location: 2, length: 1 },
      { location: 3, length: 1 },
    ],
  );
  // 整段替换会清空标记
  assert.deepEqual(
    shiftRanges([{ location: 0, length: 6 }], { location: 0, length: 6 }, 0),
    [],
  );
});

test("待办条目解析与内容范围", () => {
  const text = "[ ] 买牛奶\n[x] 写报告\n[ ] 健身";
  assert.deepEqual(todoItems(text), [
    { text: "买牛奶", done: false },
    { text: "写报告", done: true },
    { text: "健身", done: false },
  ]);
  assert.deepEqual(todoContentRanges(text), [
    { location: 4, length: 3 },
    { location: 12, length: 3 },
    { location: 20, length: 2 },
  ]);
});

test("待办勾选保留荧光位置", () => {
  const state = {
    text: "[ ] 买牛奶\n[ ] 写报告",
    highlights: [{ location: 5, length: 2 }], // 牛奶
    bolds: [],
  };
  const next = todoToggle(state, 0);
  assert.equal(next.text, "[x] 买牛奶\n[ ] 写报告");
  assert.deepEqual(next.highlights, [{ location: 5, length: 2 }]);
});

test("删除待办后标记跟着条目重定位", () => {
  const state = {
    text: "[ ] 买牛奶\n[ ] 写报告\n[ ] 健身",
    highlights: [
      { location: 5, length: 2 }, // 牛奶
      { location: 13, length: 2 }, // 报告
    ],
    bolds: [],
  };
  const next = todoRemove(state, 0);
  assert.equal(next.text, "[ ] 写报告\n[ ] 健身");
  // 牛奶的标记被丢弃，报告的标记从全局 13 移到 5
  assert.deepEqual(next.highlights, [{ location: 5, length: 2 }]);
});

test("新增待办不会打乱已有标记", () => {
  const state = {
    text: "[ ] 买牛奶",
    highlights: [{ location: 5, length: 2 }],
    bolds: [],
  };
  const next = todoAdd(state, "写报告");
  assert.equal(next.text, "[ ] 买牛奶\n[ ] 写报告");
  assert.deepEqual(next.highlights, [{ location: 5, length: 2 }]);
});

test("折叠标题", () => {
  assert.equal(noteTitle({ kind: "text", text: "# 今日计划\n内容" }), "今日计划");
  assert.equal(noteTitle({ kind: "text", text: "\n\n> 引用" }), "引用");
  assert.equal(noteTitle({ kind: "text", text: "" }), "空便签");
  assert.equal(
    noteTitle({ kind: "todo", text: "[x] 一\n[ ] 二" }),
    "1/2 · 二",
  );
  assert.equal(
    noteTitle({ kind: "todo", text: "[x] 一\n[x] 二" }),
    "2/2 · 全部完成",
  );
});

test("diffEdit 求最小改动区间", () => {
  assert.deepEqual(diffEdit("abc", "abXc"), {
    start: 2,
    removed: 0,
    inserted: 1,
  });
  assert.deepEqual(diffEdit("abc", "ac"), {
    start: 1,
    removed: 1,
    inserted: 0,
  });
  assert.equal(diffEdit("abc", "abc"), null);
});

test("预览里的任务行可勾选", () => {
  assert.equal(toggleTaskLine("- [ ] 任务\n下一行", 0), "- [x] 任务\n下一行");
  assert.equal(toggleTaskLine("- [x] 任务", 0), "- [ ] 任务");
  assert.equal(toggleTaskLine("- [X] 任务", 0), "- [ ] 任务");
  assert.equal(toggleTaskLine("普通行", 0), "普通行");
});

const work = { x: 0, y: 0, w: 1920, h: 1040 };

test("边缘吸附判定", () => {
  assert.equal(detectSnap({ x: 8, y: 100, w: 200, h: 30 }, work), "left");
  assert.equal(detectSnap({ x: 1712, y: 100, w: 200, h: 30 }, work), "right");
  assert.equal(detectSnap({ x: 500, y: 100, w: 200, h: 30 }, work), null);
});

test("折叠与展开保持贴边", () => {
  const frame = { x: 10, y: 200, w: 280, h: 280 };
  const collapsed = collapsedTarget(frame, 150, 30, "left", work);
  assert.deepEqual(collapsed, { x: 0, y: 200, w: 150, h: 30 });

  const expanded = expandedTarget(
    collapsed,
    { x: 10, y: 200, w: 280, h: 280 },
    "left",
    work,
  );
  assert.deepEqual(expanded, { x: 0, y: 200, w: 280, h: 280 });
});

test("待办窗口按内容适配并封顶到工作区", () => {
  const frame = { x: 500, y: 100, w: 280, h: 280 };
  const target = fittedTarget(frame, 300, 5000, work);
  assert.deepEqual(target, { x: 500, y: 100, w: 300, h: 940 });
});
