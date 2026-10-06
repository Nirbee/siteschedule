import { materialLink } from "@/components/tasks/format";
import { materialToInput, type MaterialView } from "@/lib/services/tasks";
import type { ChosenMaterial } from "./form-types";

/** Stored materials → picker items (for editing). */
export function toChosen(materials: MaterialView[]): ChosenMaterial[] {
  return materials.map((m) => ({
    key: m.kind === "media" ? `m:${m.mediaId}` : m.kind === "note" ? `n:${m.noteId}` : `u:${m.url}`,
    input: materialToInput(m),
    label: materialLink(m).label,
    pageCount: null,
  }));
}
