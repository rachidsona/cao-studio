/**
 * Les réglages d'une zone du Plan de dressing, dans sa carte : ses portes coulissantes (combien de vantaux, ou aucune),
 * et « Mes murs » — un mur fait gardé (dans ce navigateur), ou un mur gardé reposé sur cette zone libre.
 */
import type { PlanZone } from "../../document/plan-shapes";
import { withZoneSliding, zoneDone } from "../../document/plan-layout";
import type { DressingPlan } from "../../document/types";
import { readWall, withWall, type WallTemplate } from "../../document/wall-templates";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";

const KEY = "cao.my-walls";
const SELECT = "h-7 min-w-0 flex-1 border border-gray-300 bg-white px-1 text-xs disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900";
const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const ROW = "flex min-h-8 items-center justify-between gap-2";

function readWalls(): WallTemplate[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(kept) ? (kept as WallTemplate[]) : [];
  } catch {
    return [];
  }
}

/** The settings of a zone, for its card (none for a corner). */
export function zoneSettings(planId: string, plan: DressingPlan, zone: PlanZone, editor: Editor, redraw: () => void): HTMLElement[] {
  if (zone.kind !== "run") return [];
  const rows: HTMLElement[] = [];
  // Its sliding doors.
  const count = plan.sliding?.[zone.id] ?? 0;
  const sliding = el("select", { class: SELECT, "aria-label": `Portes coulissantes, ${zone.label}`, disabled: plan.roof !== undefined, title: plan.roof ? "Un rail de porte coulissante doit être de niveau : pas sous un rampant." : "Deux rails et des vantaux qui se recouvrent de 3 cm" }, ...[0, 2, 3, 4, 5, 6].map((n) => el("option", { value: String(n), selected: n === count }, n ? `${n} vantaux` : "Aucune")));
  sliding.addEventListener("change", () => void editor.change(withZoneSliding(editor.doc, planId, zone, Number(sliding.value))).then(redraw));
  rows.push(el("label", { class: ROW }, "Portes coulissantes", sliding));
  // Kept (a wall made), or laid again (a wall kept, on this free zone).
  const walls = readWalls();
  if (zoneDone(editor.doc, plan, zone.id)) {
    const keep = el("button", { type: "button", class: SMALL, title: "Garder ce mur dans « Mes murs » (ce navigateur), pour le reposer sur une autre zone ou un autre plan" }, "Garder ce mur");
    keep.addEventListener("click", () => {
      const name = `${zone.label} (${new Date().toLocaleDateString("fr-FR")})`;
      const wall = readWall(editor.doc, plan.made?.[zone.id] as string, name);
      if (!wall) return;
      try {
        localStorage.setItem(KEY, JSON.stringify([...walls, wall]));
        editor.notify(`Mur gardé : ${name}.`, "success");
      } catch {
        editor.notify("Ce navigateur n'a pas pu garder ce mur.", "error");
      }
      redraw();
    });
    rows.push(el("div", { class: ROW }, "Mes murs", keep));
  } else if (walls.length) {
    const wall = el("select", { class: SELECT, "aria-label": `Mur gardé à poser, ${zone.label}` }, ...walls.map((w, i) => el("option", { value: String(i) }, w.name)));
    const lay = el("button", { type: "button", class: SMALL }, "Poser");
    lay.addEventListener("click", () => {
      const template = walls[Number(wall.value)];
      if (!template) return;
      const made = withWall(editor.doc, planId, zone, template);
      if (typeof made === "string") return editor.notify(made, "error");
      void editor.change(made).then(redraw);
      editor.notify(`Mur posé : ${zone.label}.`, "success");
    });
    rows.push(el("div", { class: "flex items-center gap-1" }, wall, lay));
  }
  return rows;
}
