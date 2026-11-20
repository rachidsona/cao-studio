/** « Mes murs » dans le Plan de dressing : garder un mur fait, le reposer sur une zone libre. Gardés dans ce navigateur. */
import type { PlanZone } from "../../document/plan-shapes";
import { zoneDone } from "../../document/plan-layout";
import type { DressingPlan } from "../../document/types";
import { readWall, withWall, type WallTemplate } from "../../document/wall-templates";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";

const KEY = "cao.my-walls";
const SELECT = "h-7 min-w-0 flex-1 border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

function readWalls(): WallTemplate[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(kept) ? (kept as WallTemplate[]) : [];
  } catch {
    return [];
  }
}

export function wallsSection(planId: string, plan: DressingPlan, zones: PlanZone[], editor: Editor, redraw: () => void): HTMLElement[] {
  const runs = zones.filter((z) => z.kind === "run");
  const done = runs.filter((z) => zoneDone(editor.doc, plan, z.id));
  const free = runs.filter((z) => !zoneDone(editor.doc, plan, z.id));
  const walls = readWalls();
  const rows: HTMLElement[] = [];
  if (done.length) {
    const from = el("select", { class: SELECT, "aria-label": "Mur à garder" }, ...done.map((z) => el("option", { value: z.id }, z.label)));
    const keep = el("button", { type: "button", class: SMALL }, "Garder");
    keep.addEventListener("click", () => {
      const zone = done.find((z) => z.id === from.value);
      const name = `${zone?.label ?? "Mur"} (${new Date().toLocaleDateString("fr-FR")})`;
      const wall = zone ? readWall(editor.doc, plan.made?.[zone.id] as string, name) : null;
      if (!wall) return;
      try {
        localStorage.setItem(KEY, JSON.stringify([...walls, wall]));
        editor.notify(`Mur gardé : ${name}.`, "success");
      } catch {
        editor.notify("Ce navigateur n'a pas pu garder ce mur.", "error");
      }
      redraw();
    });
    rows.push(el("div", { class: "flex gap-1" }, from, keep));
  }
  if (walls.length && free.length) {
    const wall = el("select", { class: SELECT, "aria-label": "Mur gardé" }, ...walls.map((w, i) => el("option", { value: String(i) }, w.name)));
    const to = el("select", { class: SELECT, "aria-label": "Zone où le poser" }, ...free.map((z) => el("option", { value: z.id }, z.label)));
    const lay = el("button", { type: "button", class: SMALL }, "Poser");
    lay.addEventListener("click", () => {
      const zone = free.find((z) => z.id === to.value);
      const template = walls[Number(wall.value)];
      if (!zone || !template) return;
      const made = withWall(editor.doc, planId, zone, template);
      if (typeof made === "string") return editor.notify(made, "error");
      void editor.change(made).then(redraw);
      editor.notify(`Mur posé : ${zone.label}.`, "success");
    });
    rows.push(el("div", { class: "flex gap-1" }, wall, to, lay));
  }
  return rows.length ? [el("h3", { class: "panel-title" }, "Mes murs"), ...rows] : [];
}
