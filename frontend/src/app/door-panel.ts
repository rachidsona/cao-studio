/**
 * « Modifier les portes… » du menu d'une porte de caisson (app/door-menu.ts), comme celui des tiroirs : un petit panneau
 * à l'endroit du clic — une ou deux portes, pose en applique ou encastrée, jeu, épaisseur, style (plate, à cadre,
 * cannelée, à tasseaux, vitrée), charnières, poignées —, chaque changement fait aussitôt et annulable un par un
 * (document/door-edit.ts). Échap, un clic ailleurs ou « Fermer » le range.
 */
import { withDoorsChanged, withDoorStyle, type DoorsPatch } from "../document/door-edit";
import { findFeature } from "../document/operations";
import type { CadDocument, FrontsFeature } from "../document/types";
import { swingsUp } from "../features/fronts-parts";
import type { DoorStyle } from "../features/glass-door";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import type { Editor } from "./editor";

const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-1.5 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[7rem_1fr] items-center gap-1.5";

/** The styles a cabinet's doors can take. */
export const DOOR_STYLES: [DoorStyle, string][] = [
  ["flat", "Plate"],
  ["frame", "À cadre"],
  ["fluted", "Cannelée"],
  ["slats", "À tasseaux"],
  ["glass", "Vitrée (cadre alu)"],
];

let panel: HTMLElement | null = null;
const closePanel = () => {
  panel?.remove();
  panel = null;
};

/** The settings of a cabinet's doors, at the pointer (`bodyId`: the door clicked, for its style). */
export function openDoorsPanel(x: number, y: number, editor: Editor, featureId: string, bodyId: string): void {
  closePanel();
  const box = el("div", { class: "fixed z-50 w-64 space-y-1.5 border border-gray-200 bg-white p-2.5 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-900", role: "dialog", "aria-label": "Modifier les portes", "data-doors-panel": "" });
  box.addEventListener("pointerdown", (event) => event.stopPropagation());
  panel = box;
  let message = "";
  const draw = () => {
    const f = findFeature(editor.doc, featureId);
    if (f?.type !== "fronts" || f.layout === "drawers") return closePanel();
    const unit = editor.unit;
    const done = (made: CadDocument | string) => {
      message = typeof made === "string" ? made : "";
      if (typeof made === "string") return draw();
      void editor.change(made).then(draw);
    };
    const apply = (patch: DoorsPatch) => done(withDoorsChanged(editor.doc, featureId, patch));
    const select = (label: string, value: string, options: [string, string][], change: (v: string) => void, disabled = false) => {
      const s = el("select", { class: FIELD, "aria-label": label, disabled }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
      s.addEventListener("change", () => change(s.value));
      return el("label", { class: ROW }, label, s);
    };
    const length = (label: string, key: "gap" | "thickness", value: number) => {
      const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(value, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
      const commit = () => {
        const v = parseNumber(input.value);
        if (v !== null && fromDisplay(v, unit) !== value) apply({ [key]: fromDisplay(v, unit) });
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") commit();
        if (event.key === "Escape") closePanel();
      });
      return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
    };
    const check = (label: string, checked: boolean, change: (v: boolean) => void, disabled = false) => {
      const input = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked, disabled, "aria-label": label });
      input.addEventListener("change", () => change(input.checked));
      return el("label", { class: "flex min-h-7 items-center gap-2" }, input, label);
    };
    const up = swingsUp(f);
    const close = el("button", { type: "button", class: "h-7 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Fermer");
    close.addEventListener("click", closePanel);
    const rows: (HTMLElement | null)[] = [
      el("p", { class: "font-semibold text-sky-700 dark:text-sky-400" }, `Portes — ${findFeature(editor.doc, f.cabinet)?.name ?? f.name}`),
      select("Nombre de portes", f.layout, [["door", "Une porte"], ["doors", "Deux portes"]], (v) => apply({ layout: v as FrontsFeature["layout"] }), up),
      select("Pose", f.mount, [["overlay", "En applique"], ["inset", "Encastrée"]], (v) => apply({ mount: v as FrontsFeature["mount"] })),
      length("Jeu", "gap", f.gap),
      length("Épaisseur", "thickness", f.thickness),
      select("Style", f.style ?? "flat", DOOR_STYLES, (v) => done(withDoorStyle(editor.doc, bodyId, v as DoorStyle))),
      check("Charnières (percées)", f.hinges, (v) => apply({ hinges: v })),
      check(f.grip === "gorge" ? "Sans poignée (gorge)" : "Poignées", f.handles, (v) => apply({ handles: v }), f.grip === "gorge"),
      message ? el("p", { class: "bg-amber-50 px-2 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-100", role: "alert" }, message) : null,
      close,
    ];
    box.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  };
  draw();
  document.body.append(box);
  const { width, height } = box.getBoundingClientRect();
  box.style.left = `${Math.max(4, Math.min(x, innerWidth - width - 4))}px`;
  box.style.top = `${Math.max(4, Math.min(y, innerHeight - height - 4))}px`;
  // A press elsewhere, or Échap, puts it away.
  const away = (event: Event) => {
    if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.contains(event.target as Node)) {
      closePanel();
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", away);
    }
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", away);
  });
}
