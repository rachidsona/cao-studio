/**
 * Les rangées du panneau de Déplacer venues des autres logiciels : les types de déplacement en boutons (Fusion 360),
 * le pivot posé au centre, au bas ou au coin (« Définir le pivot » de Fusion, le pivot de 3ds Max), et la case de
 * mesure de SketchUp — ce qui est tapé, l'axe bloqué, les copies — avec les touches.
 */
import type { Vec3 } from "../document/types";
import { el } from "../ui/dom";

export type InputMode = "relative" | "distance" | "absolute" | "points";

const BUTTON = "border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const PRESSED = "border border-sky-600 bg-sky-50 text-sky-800 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-200";

/** As Fusion's types of move: one button each, the one in use pressed. */
export function modeButtons(current: InputMode, choose: (mode: InputMode) => void): HTMLElement {
  const modes: [InputMode, string, string][] = [
    ["points", "Point à point", "Un point de l'objet, puis le point où l'amener (il suit la souris)"],
    ["relative", "Translation", "Décalage ΔX, ΔY, ΔZ (les flèches du manipulateur)"],
    ["distance", "Sur un axe", "Une distance le long d'un axe"],
    ["absolute", "Position", "La position absolue du centre"],
  ];
  return el("div", { class: "grid grid-cols-2 gap-1", role: "group", "aria-label": "Type de déplacement" }, ...modes.map(([mode, label, title]) => {
    const on = current === mode;
    const b = el("button", { type: "button", title, "aria-pressed": String(on), "data-move-mode": mode, class: `h-7 text-[11px] font-medium ${on ? PRESSED : BUTTON}` }, label);
    b.addEventListener("click", () => choose(mode));
    return b;
  }));
}

/** The pivot put at the centre of the box, the middle of its bottom, or its lowest corner. */
export function pivotButtons([min, max]: [Vec3, Vec3], put: (pivot: Vec3) => void): HTMLElement {
  const mid = (i: number) => (min[i]! + max[i]!) / 2;
  const at = (label: string, p: Vec3) => {
    const b = el("button", { type: "button", class: `h-7 flex-1 text-[11px] ${BUTTON}`, "data-pivot": label, title: `Pivot : ${label.toLowerCase()} de ce qui est déplacé` }, label);
    b.addEventListener("click", () => put(p));
    return b;
  };
  return el("div", { class: "flex items-center gap-1", role: "group", "aria-label": "Pivot" }, el("span", { class: "w-12 shrink-0 text-gray-500 dark:text-gray-400" }, "Pivot"), at("Centre", [mid(0), mid(1), mid(2)]), at("Bas", [mid(0), mid(1), min[2]!]), at("Coin", [...min] as Vec3));
}

/** SketchUp's measurements box: what is typed (else the move, the axis kept, the copies), and the keys. */
export function measureRows({ typed, length, axis, copies }: { typed: string; length: string; axis: 0 | 1 | 2 | null; copies: number }): HTMLElement[] {
  const shown = typed ? `Mesure : ${typed}▏` : `Déplacement : ${length}${axis !== null ? ` · bloqué sur ${"XYZ"[axis]}` : ""}${copies ? ` · ${copies} copie${copies > 1 ? "s" : ""}` : ""}`;
  return [
    el("p", { class: `px-2 py-1 font-mono ${typed ? "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100" : "text-gray-500 dark:text-gray-400"}`, "data-move-typed": "" }, shown),
    el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, "Au clavier : une distance puis Entrée ; 10;20;0 un vecteur ; x5 cinq copies, /5 réparties. → X, ← Y, ↑ Z bloquent un axe (↓ le libère). Alt : copie ; Maj + glisser une flèche : copie."),
  ];
}
