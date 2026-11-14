/**
 * Le style des portes d'une Répartition, dans son panneau : plate, à cadre (panneau en retrait, usinée dans la masse),
 * cannelée ou à tasseaux (rainures verticales ou horizontales dans la face, features/door-decor.ts) ou vitrée (cadre en profilé alu autour d'un verre trempé), avec la largeur du cadre et, pour une porte vitrée, le
 * verre et la finition du cadre (features/glass-door.ts).
 */
import type { DoorSettings } from "../document/sketch";
import { el } from "../ui/dom";
import { DECOR_DEFAULTS, DECOR_LABELS, isDecor, type DecorSettings } from "../features/door-decor";
import { GLASS_FRAME, GLASS_KINDS, PROFILE_FINISHES, styleChange, type DoorStyle } from "../features/glass-door";

/** The rows of the panel the style needs: a length field and a list, as the panel makes them. */
export interface StyleFields {
  number(label: string, mm: number, set: (mm: number) => void): HTMLElement;
  select(label: string, value: string, options: [string, string][], set: (v: string) => void): HTMLElement;
}

export const DOOR_STYLES: [DoorStyle, string][] = [
  ["flat", "Plate"],
  ["frame", "À cadre (panneau en retrait, usinée dans la masse)"],
  ...DECOR_LABELS,
  ["glass", "Vitrée (cadre alu)"],
];

/** The rows of a fluted or slatted door: the spacing of its grooves, their depth, the plain border top and bottom. */
export function decorRows(s: DecorSettings, set: (change: Pick<DecorSettings, "pitch" | "frameDepth" | "frameWidth" | "grooves">) => void, number: StyleFields["number"]): HTMLElement[] {
  if (!isDecor(s)) return [];
  const d = DECOR_DEFAULTS[s.style];
  const across = s.grooves === "horizontal";
  // Across the door or up and down: the border is then at its sides, or at its top and bottom.
  const box = el("input", { type: "checkbox", checked: across, "aria-label": "Rainures horizontales", "data-decor-across": "" });
  box.addEventListener("change", () => set({ grooves: box.checked ? "horizontal" : undefined }));
  return [
    number(s.style === "slats" ? "Entraxe des tasseaux" : "Entraxe des cannelures", s.pitch ?? d.pitch, (v) => set({ pitch: v })),
    number("Profondeur des rainures", s.frameDepth ?? d.frameDepth, (v) => set({ frameDepth: v })),
    el("label", { class: "flex items-center gap-2" }, box, "Rainures horizontales"),
    number(across ? "Bordure à gauche et à droite" : "Bordure en haut et en bas", s.frameWidth ?? d.frameWidth, (v) => set({ frameWidth: v })),
  ];
}

export function doorStyleRows(doors: DoorSettings, set: (change: Partial<DoorSettings>) => void, ui: StyleFields): HTMLElement[] {
  const rows = [ui.select("Style des portes", doors.style ?? "flat", DOOR_STYLES, (v) => set(styleChange(v as DoorStyle, doors)))];
  if (doors.style === "frame") {
    rows.push(ui.number("Largeur du cadre", doors.frameWidth ?? 70, (v) => set({ frameWidth: v })), ui.number("Retrait du panneau", doors.frameDepth ?? 6, (v) => set({ frameDepth: v })));
  }
  rows.push(...decorRows(doors, set, ui.number));
  if (doors.style === "glass") {
    rows.push(
      ui.number("Largeur du cadre alu", doors.frameWidth ?? GLASS_FRAME, (v) => set({ frameWidth: v })),
      ui.select("Verre", doors.glass ?? "clear", [...GLASS_KINDS].map(([k, l]): [string, string] => [k, `${l} (trempé 4 mm)`]), (v) => set({ glass: v as DoorSettings["glass"] })),
      ui.select("Cadre", doors.profile ?? "brushed", [...PROFILE_FINISHES], (v) => set({ profile: v as DoorSettings["profile"] })),
    );
  }
  return rows;
}
