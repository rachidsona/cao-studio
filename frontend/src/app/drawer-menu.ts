/**
 * Le menu des tiroirs : un clic droit sur un tiroir (sa façade, son caisson ou sa poignée) dans la vue, sans outil en
 * cours. « Modifier les tiroirs… » ouvre, pour ceux d'un caisson, un petit panneau à l'endroit du clic — nombre, pose
 * (en applique ou encastrés), jeu, épaisseur, poignées —, chaque changement fait aussitôt et annulable un par un ; pour ceux
 * d'une niche de Répartition, leur outil Tiroirs, réglé comme ils sont. On sélectionne aussi le meuble entier, on change
 * les tiroirs d'un caisson en porte, ou on les supprime (document/drawer-edit.ts).
 */
import { drawersOf, withDrawersAsDoor, withDrawersChanged, withDrawersRemoved, type DrawersPatch } from "../document/drawer-edit";
import { findFeature } from "../document/operations";
import type { CadDocument, FrontsFeature } from "../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import { openTreeMenu, type TreeMenuItem } from "../ui/tree-menu";
import { modifyMenuItem } from "./isolate-selection";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { wholeOf } from "./move-whole";

const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-1.5 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[7rem_1fr] items-center gap-1.5";

let panel: HTMLElement | null = null;
const closePanel = () => {
  panel?.remove();
  panel = null;
};

/** The settings of a cabinet's drawers, at the pointer: each change made at once. */
export function openDrawersPanel(x: number, y: number, editor: Editor, featureId: string): void {
  closePanel();
  const box = el("div", { class: "fixed z-50 w-64 space-y-1.5 border border-gray-200 bg-white p-2.5 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-900", role: "dialog", "aria-label": "Modifier les tiroirs", "data-drawers-panel": "" });
  box.addEventListener("pointerdown", (event) => event.stopPropagation());
  panel = box;
  let message = "";
  const draw = () => {
    const f = findFeature(editor.doc, featureId);
    if (f?.type !== "fronts" || f.layout !== "drawers") return closePanel();
    const unit = editor.unit;
    const apply = (patch: DrawersPatch) => {
      const made = withDrawersChanged(editor.doc, featureId, patch);
      message = typeof made === "string" ? made : "";
      if (typeof made === "string") return draw();
      void editor.change(made).then(draw);
    };
    const select = (label: string, value: string, options: [string, string][], change: (v: string) => void) => {
      const s = el("select", { class: FIELD, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
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
    const handles = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: f.handles, disabled: f.grip === "gorge" });
    handles.addEventListener("change", () => apply({ handles: handles.checked }));
    const close = el("button", { type: "button", class: "h-7 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Fermer");
    close.addEventListener("click", closePanel);
    const rows: (HTMLElement | null)[] = [
      el("p", { class: "font-semibold text-sky-700 dark:text-sky-400" }, `Tiroirs — ${(findFeature(editor.doc, f.cabinet)?.name ?? f.name)}`),
      select("Nombre de tiroirs", String(f.drawers), Array.from({ length: 8 }, (_, i): [string, string] => [String(i + 1), String(i + 1)]), (v) => apply({ drawers: Number(v) })),
      select("Pose", f.mount, [["overlay", "En applique"], ["inset", "Encastrés"]], (v) => apply({ mount: v as FrontsFeature["mount"] })),
      length("Jeu", "gap", f.gap),
      length("Épaisseur", "thickness", f.thickness),
      el("label", { class: "flex min-h-7 items-center gap-2" }, handles, f.grip === "gorge" ? "Sans poignée (gorge)" : "Poignées"),
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

/** The menu of the drawers under the pointer; false when it is no drawer. */
export function openDrawerMenu(event: MouseEvent, viewport: Viewport, editor: Editor, bodyId: string): boolean {
  const doc = editor.doc;
  const drawers = drawersOf(doc, bodyId);
  const f = drawers && findFeature(doc, drawers.feature);
  if (!drawers || !f) return false;
  const apply = (made: CadDocument | string, done: string) => {
    if (typeof made === "string") return editor.notify(made, "info");
    void editor.change(made);
    editor.notify(done, "success");
  };
  const whole = wholeOf(doc, bodyId, viewport.displayedBodies);
  const name = f.type === "fronts" ? (findFeature(doc, f.cabinet)?.name ?? f.name) : f.name;
  const selection = modifyMenuItem(editor, bodyId);
  const items: TreeMenuItem[] = [
    { heading: `Tiroirs — ${name}` },
    ...(selection ? [{ label: selection[0], run: selection[1] }] : []),
    {
      label: "Modifier les tiroirs…",
      run: () => {
        if (f.type === "fronts") openDrawersPanel(event.clientX, event.clientY, editor, f.id);
        else if (f.type === "niche") editor.sketches.startEquip("drawers", f.sketch, f);
      },
    },
    ...(whole ? [{ label: `Sélectionner « ${whole.name} » entier`, run: () => {
      viewport.clearSelection();
      for (const id of whole.bodies) viewport.toggleInSelection("body", id);
    } }] : []),
    ...(f.type === "fronts" ? [{ label: "Remplacer par une porte", run: () => apply(withDrawersAsDoor(doc, f.id), "Les tiroirs sont devenus une porte.") }] : []),
    "separator",
    { label: "Supprimer les tiroirs", danger: true, run: () => apply(withDrawersRemoved(doc, f.id), "Tiroirs supprimés (Annuler les remet).") },
  ];
  openTreeMenu(event.clientX, event.clientY, items);
  return true;
}
