/**
 * Le schéma d'un plan de cuisine vu de dessus, mur A en haut, comme celui du Plan de dressing (app/plan-layout-tool.ts) :
 * chaque linéaire est une zone qui se clique, ses meubles dessinés dedans à leur place ; les portes, fenêtres, prises et
 * retombées de la Pièce relevée marquées sur ses murs.
 */
import type { KitchenMark } from "../../document/kitchen-plan-room";
import { kitchenLines, kitchenRuns, kitchenSizes, runAt, type KitchenRun } from "../../document/kitchen-plan-shapes";
import type { KitchenFloorPlan } from "../../document/types";
import { heldUnits, type RunFill } from "../../features/kitchen-run-items";

const SVG = "http://www.w3.org/2000/svg";
const MARK: Record<KitchenMark["kind"], string> = { door: "#f97316", window: "#22c55e", socket: "#eab308", beam: "#a855f7" };

const svg = (tag: string, attrs: Record<string, string>, ...children: (Node | string)[]): SVGElement => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
};

const points = (outline: [number, number][]) => outline.map(([x, y]) => `${x},${-y}`).join(" ");

/** The plan from above; `labels`: its runs named, `pick`: a click opens a run, `fills`: the units on each, `marks`: its room's. */
export function kitchenSchema(p: KitchenFloorPlan, labels: ((run: KitchenRun) => string[]) | null, pick?: (run: KitchenRun) => void, fills: Record<string, RunFill> = {}, marks: KitchenMark[] = [], chosen?: string): SVGElement {
  const runs = kitchenRuns(p);
  const all = [...runs.flatMap((r) => r.zone.outline), ...marks.flatMap((m) => [m.from, m.to])];
  const [xs, ys] = [all.map((q) => q[0]), all.map((q) => -q[1])];
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0, 1);
  const pad = size * 0.04;
  const node = svg("svg", { viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`, class: "max-h-56 w-full", ...(labels ? { role: "img", "aria-label": "Schéma de la cuisine vu de dessus" } : { "aria-hidden": "true" }) });
  const { cabinet } = kitchenSizes(p);
  for (const run of runs) {
    const filled = (fills[run.id]?.placed.length ?? 0) + heldUnits(fills[run.id] ?? { spaces: [] }).length > 0;
    const shape = svg("polygon", { points: points(run.zone.outline), fill: run.id === chosen ? "#38bdf888" : filled ? "#38bdf855" : "#38bdf822", ...(pick ? { class: "cursor-pointer hover:fill-sky-400/50", "data-run": run.id } : {}) });
    if (pick) shape.addEventListener("click", () => pick(run));
    node.append(shape);
    for (const pl of [...(fills[run.id]?.placed ?? []), ...heldUnits(fills[run.id] ?? { spaces: [] })]) {
      if (pl.row !== "base") continue;
      const depth = pl.entry.custom && pl.entry.depth ? pl.entry.depth : cabinet;
      const corners = [runAt(run, pl.at, run.back), runAt(run, pl.at + pl.item.width, run.back), runAt(run, pl.at + pl.item.width, run.back + depth), runAt(run, pl.at, run.back + depth)];
      node.append(svg("polygon", { points: points(corners), fill: "none", stroke: "currentColor", "stroke-opacity": "0.45", "stroke-width": String(size / 500), "pointer-events": "none" }));
    }
  }
  for (const [[ax, ay], [bx, by]] of kitchenLines(p)) node.append(svg("line", { x1: String(ax), y1: String(-ay), x2: String(bx), y2: String(-by), stroke: "#38bdf8", "stroke-width": String(size / 300), "pointer-events": "none" }));
  for (const mark of marks) {
    node.append(svg("line", { x1: String(mark.from[0]), y1: String(-mark.from[1]), x2: String(mark.to[0]), y2: String(-mark.to[1]), stroke: MARK[mark.kind], "stroke-width": String(mark.kind === "beam" ? size / 150 : size / 60), ...(mark.kind === "beam" ? { "stroke-dasharray": `${size / 40} ${size / 60}` } : {}), "data-obstacle": mark.kind }, svg("title", {}, mark.what)));
  }
  if (labels) {
    for (const run of runs) {
      const [cx, cy] = run.zone.outline.reduce(([a, b], [x, y]) => [a + x / run.zone.outline.length, b + y / run.zone.outline.length], [0, 0]);
      const lines = labels(run);
      const height = size / 24;
      lines.forEach((line, i) => node.append(svg("text", { x: String(cx), y: String(-cy + (i - (lines.length - 1) / 2) * height * 1.2), "text-anchor": "middle", "dominant-baseline": "middle", "font-size": String(height), fill: "currentColor", "pointer-events": "none" }, line)));
    }
  }
  return node;
}
