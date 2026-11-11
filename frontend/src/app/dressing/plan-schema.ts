/** The Plan de dressing seen from above (plan-layout-tool.ts): its zones, named and measured, and its room's openings. */
import type { PlanObstacle } from "../../document/plan-room";
import { planLines, planZones, type PlanZone } from "../../document/plan-shapes";
import type { DressingPlan } from "../../document/types";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string>, ...children: (Node | string)[]): SVGElement => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
};

/** The plan seen from above, wall A at the top; `labels`: its zones named and measured, `pick`: a click chooses a zone; `marks`: the doors, windows and sockets of its room. */
export function planSchema(plan: DressingPlan, labels: ((zone: PlanZone) => string[]) | null, pick?: (zone: PlanZone) => void, done?: (zone: PlanZone) => boolean, marks: PlanObstacle[] = []): SVGElement {
  const zones = planZones(plan);
  const points = [...zones.flatMap((z) => z.outline), ...marks.flatMap((m) => [m.from, m.to])];
  const [xs, ys] = [points.map((p) => p[0]), points.map((p) => -p[1])];
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0);
  const pad = size * 0.04;
  const node = svg("svg", { viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`, class: "max-h-56 w-full", ...(labels ? { role: "img", "aria-label": "Schéma du plan vu de dessus" } : { "aria-hidden": "true" }) });
  for (const zone of zones) {
    const shape = svg("polygon", { points: zone.outline.map(([x, y]) => `${x},${-y}`).join(" "), fill: done?.(zone) ? "#38bdf866" : "#38bdf822", ...(pick ? { class: "cursor-pointer hover:fill-sky-400/50", "data-zone": zone.id } : {}) });
    if (pick) shape.addEventListener("click", () => pick(zone));
    node.append(shape);
  }
  for (const [[ax, ay], [bx, by]] of planLines(plan)) node.append(svg("line", { x1: String(ax), y1: String(-ay), x2: String(bx), y2: String(-by), stroke: "#38bdf8", "stroke-width": String(size / 300), "pointer-events": "none" }));
  for (const mark of marks) node.append(svg("line", { x1: String(mark.from[0]), y1: String(-mark.from[1]), x2: String(mark.to[0]), y2: String(-mark.to[1]), stroke: mark.kind === "door" ? "#f97316" : mark.kind === "window" ? "#22c55e" : "#eab308", "stroke-width": String(size / 60), "data-obstacle": mark.kind }, svg("title", {}, mark.what)));
  if (labels) {
    for (const zone of zones) {
      const [cx, cy] = zone.outline.reduce(([a, b], [x, y]) => [a + x / zone.outline.length, b + y / zone.outline.length], [0, 0]);
      const lines = labels(zone);
      const height = size / 24;
      lines.forEach((line, i) => node.append(svg("text", { x: String(cx), y: String(-cy + (i - (lines.length - 1) / 2) * height * 1.2), "text-anchor": "middle", "dominant-baseline": "middle", "font-size": String(height), fill: "currentColor", "pointer-events": "none" }, line)));
    }
  }
  return node;
}
