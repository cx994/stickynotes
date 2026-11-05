import { invoke } from "@tauri-apps/api/core";
import type {
  Note,
  NoteKind,
  NoteMode,
  NoteTheme,
  SnapEdge,
  TextHighlight,
} from "./model";

export interface NotePatch {
  text?: string;
  theme?: NoteTheme;
  mode?: NoteMode;
  isPreview?: boolean;
  highlights?: TextHighlight[];
  bolds?: TextHighlight[];
}

/** 原版 JSON 会省略空的 highlights/bolds 字段，读入时补齐成空数组。 */
type NoteWire = Omit<Note, "highlights" | "bolds"> & {
  highlights?: TextHighlight[];
  bolds?: TextHighlight[];
};

function withMarks<T extends NoteWire>(
  note: T,
): T & { highlights: TextHighlight[]; bolds: TextHighlight[] } {
  return { ...note, highlights: note.highlights ?? [], bolds: note.bolds ?? [] };
}

export const api = {
  getNote: async (id: string) =>
    withMarks(await invoke<NoteWire>("get_note", { id })),

  patchNote: async (id: string, patch: NotePatch) =>
    withMarks(await invoke<NoteWire>("patch_note", { id, patch })),

  setSnap: (id: string, edge: SnapEdge | null) =>
    invoke<void>("set_snap", { id, edge }),

  setCollapsedState: (
    id: string,
    collapsed: boolean,
    snap: SnapEdge | null,
    ex: number,
    ey: number,
    ew: number,
    eh: number,
  ) =>
    invoke<void>("set_collapsed_state", {
      id,
      collapsed,
      snap,
      ex,
      ey,
      ew,
      eh,
    }),

  setManual: (id: string, mw: boolean, mh: boolean) =>
    invoke<void>("set_manual", { id, mw, mh }),

  createNote: async (kind: NoteKind) =>
    withMarks(await invoke<NoteWire>("create_note", { kind })),

  deleteNote: (id: string) => invoke<void>("delete_note", { id }),

  listHistory: async () =>
    (await invoke<(NoteWire & { deletedAt: string })[]>("list_history")).map(
      withMarks,
    ),

  restoreNote: async (id: string) =>
    withMarks(await invoke<NoteWire>("restore_note", { id })),

  deleteArchived: (id: string) => invoke<void>("delete_archived", { id }),

  showHistory: () => invoke<void>("show_history"),

  showAll: () => invoke<void>("show_all"),

  quit: () => invoke<void>("quit_app"),
};
