/**
 * Le style des portes d'une Répartition, dans son panneau : plate, à cadre (panneau en retrait, usinée dans la masse)
 * ou vitrée (cadre en profilé alu autour d'un verre trempé), avec la largeur du cadre et, pour une porte vitrée, le
 * verre et la finition du cadre (features/glass-door.ts).
 */
import type { DoorSettings } from "../document/sketch";
import { GLASS_FRAME, GLASS_KINDS, PROFILE_FINISHES, styleChange, type DoorStyle } from "../features/glass-door";

/** The rows of the panel the style needs: a length field and a list, as the panel makes them. */
export interface StyleFields {
  number(label: string, mm: number, set: (mm: number) => void): HTMLElement;
  select(label: string, value: string, options: [string, string][], set: (v: string) => void): HTMLElement;
}

export const DOOR_STYLES: [DoorStyle, string][] = [
  ["flat", "Plate"],
  ["frame", "À cadre (panneau en retrait, usinée dans la masse)"],
  ["glass", "Vitrée (cadre alu)"],
];

export function doorStyleRows(doors: DoorSettings, set: (change: Partial<DoorSettings>) => void, ui: StyleFields): HTMLElement[] {
  const rows = [ui.select("Style des portes", doors.style ?? "flat", DOOR_STYLES, (v) => set(styleChange(v as DoorStyle, doors)))];
  if (doors.style === "frame") {
    rows.push(ui.number("Largeur du cadre", doors.frameWidth ?? 70, (v) => set({ frameWidth: v })), ui.number("Retrait du panneau", doors.frameDepth ?? 6, (v) => set({ frameDepth: v })));
  }
  if (doors.style === "glass") {
    rows.push(
      ui.number("Largeur du cadre alu", doors.frameWidth ?? GLASS_FRAME, (v) => set({ frameWidth: v })),
      ui.select("Verre", doors.glass ?? "clear", [...GLASS_KINDS].map(([k, l]): [string, string] => [k, `${l} (trempé 4 mm)`]), (v) => set({ glass: v as DoorSettings["glass"] })),
      ui.select("Cadre", doors.profile ?? "brushed", [...PROFILE_FINISHES], (v) => set({ profile: v as DoorSettings["profile"] })),
    );
  }
  return rows;
}
