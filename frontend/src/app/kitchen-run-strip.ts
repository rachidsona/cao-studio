/**
 * La bande de face d'un linéaire de cuisine, à l'échelle, comme sur une planche de cuisiniste : le mur et ses portes et
 * fenêtres, le plan de travail, en bas les meubles bas et les colonnes, en haut les meubles hauts, la hotte et le
 * micro-ondes, chacun dessiné par app/unit-elevation.ts ; les fileurs et les angles. Un clic choisit un meuble, le glisser
 * le change de place dans sa rangée.
 */
import { kitchenSizes, zoneSpan, type KitchenRun, type RunGeometry } from "../document/kitchen-plan-shapes";
import type { KitchenFloorPlan } from "../document/types";
import { applianceOf, type Placed, type RunFill } from "../features/kitchen-run-items";
import { BRASS, elevationBody } from "./unit-elevation";

const SVG = "http://www.w3.org/2000/svg";
const PLINTH = 150;
const WALL = "fill-gray-50 dark:fill-gray-900";
const PANEL = "fill-gray-100 stroke-gray-500 dark:fill-gray-700 dark:stroke-gray-400";
const STONE = "fill-gray-400 stroke-gray-600 dark:fill-gray-500 dark:stroke-gray-300";
const DEAD = "fill-gray-200 dark:fill-gray-800";

const rect = (x: number, y: number, w: number, h: number, tone: string, extra = "") => `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" class="${tone}" vector-effect="non-scaling-stroke" ${extra}/>`;

/** What a placed item looks like from the front, at the plan's heights. */
function drawing(pl: Placed, p: KitchenFloorPlan): { body: string; z: number; height: number } {
  const s = kitchenSizes(p);
  const role = applianceOf(pl.item)?.role;
  const w = pl.item.width;
  if (role === "hood") {
    // Its canopy over the hob, its duct up to the top of the wall units.
    const z = p.worktopHeight + 650;
    const height = Math.max(100, s.wallTop - z);
    return { body: `${rect(w / 2 - 125, 0, 250, height - 100, PANEL)}${rect(0, height - 100, w, 100, PANEL)}`, z, height };
  }
  const height = pl.row === "wall" ? (pl.entry.height ?? s.wallTop - s.wallBottom) : pl.entry.kind === "tall" ? s.wallTop : s.base;
  const z = pl.row === "wall" ? s.wallTop - height : 0;
  const entry = role === "dishwasher" ? { ...pl.entry, layout: "door" as const } : pl.entry;
  return { body: elevationBody({ ...entry, height, plinth: pl.row === "wall" ? 0 : (entry.plinth ?? PLINTH) }).body, z, height };
}

export interface StripHost {
  plan: KitchenFloorPlan;
  run: KitchenRun;
  geometry: RunGeometry;
  fill: RunFill;
  chosen: string | null;
  pick(id: string): void;
  /** The item moved to this place among those of its row. */
  move(id: string, index: number): void;
}

/** The strip, in an SVG scaled to its width. */
export function runStrip(host: StripHost): SVGSVGElement {
  const { plan: p, run, geometry: g, fill } = host;
  const s = kitchenSizes(p);
  const H = p.height;
  const L = run.length;
  const y = (z: number) => H - z;
  const node = document.createElementNS(SVG, "svg");
  node.setAttribute("viewBox", `-40 -40 ${L + 80} ${H + 200}`);
  node.setAttribute("class", "w-full select-none");
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", `Face de ${run.label.toLowerCase()}`);
  node.style.setProperty("--brass", BRASS);
  const parts: string[] = [rect(0, 0, L, H, WALL)];
  for (const sp of g.spans) parts.push(rect(sp.from, y(Math.min(sp.top, H)), sp.to - sp.from, Math.min(sp.top, H) - sp.bottom, sp.bottom > 0 ? "fill-emerald-100 stroke-emerald-500 dark:fill-emerald-950" : "fill-orange-100 stroke-orange-500 dark:fill-orange-950", `data-span="${sp.bottom > 0 ? "window" : "door"}"`));
  // The corners, where the other run's units stand or the corner stays dead.
  if (g.base[0] > 1 && run.left !== "free") parts.push(rect(0, y(s.base), g.base[0], s.base, DEAD));
  if (L - g.base[1] > 1 && run.right !== "free") parts.push(rect(g.base[1], y(s.base), L - g.base[1], s.base, DEAD));
  const [w0, w1] = zoneSpan(run);
  if (fill.placed.some((pl) => pl.row === "base")) parts.push(rect(w0, y(p.worktopHeight), w1 - w0, p.worktopHeight - s.base, STONE));
  for (const [a, b] of fill.fillers) parts.push(rect(a, y(s.base), b - a, s.base - PLINTH, PANEL, 'data-filler=""'));
  parts.push(`<line x1="-40" y1="${H}" x2="${L + 40}" y2="${H}" class="stroke-gray-500" vector-effect="non-scaling-stroke"/>`);
  node.innerHTML = parts.join("");
  for (const pl of fill.placed) {
    const { body, z, height } = drawing(pl, p);
    const group = document.createElementNS(SVG, "g");
    group.setAttribute("transform", `translate(${pl.at} ${y(z + height)})`);
    group.setAttribute("data-item", pl.item.id);
    group.setAttribute("class", "cursor-grab");
    const label = `${pl.entry.name} ${Math.round(pl.item.width / 10)}`;
    const chosen = pl.item.id === host.chosen;
    group.innerHTML = `<title>${label}</title>${body}${chosen ? rect(0, 0, pl.item.width, height, "fill-none", `stroke="${BRASS}" stroke-width="3"`) : ""}<text x="${pl.item.width / 2}" y="${pl.row === "wall" ? -30 : height + 120}" text-anchor="middle" font-size="90" class="fill-gray-600 dark:fill-gray-300" pointer-events="none">${Math.round(pl.item.width / 10)}</text>`;
    drag(node, group, pl, fill, host);
    node.append(group);
  }
  return node;
}

/** Pressed and let go where it was: chosen; dragged: put among its row where it is dropped. */
function drag(node: SVGSVGElement, group: SVGGElement, pl: Placed, fill: RunFill, host: StripHost): void {
  group.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    down.stopPropagation();
    const matrix = node.getScreenCTM()?.inverse();
    const x = (event: PointerEvent) => (matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix).x : event.clientX);
    const start = x(down);
    let moved = false;
    group.setPointerCapture?.(down.pointerId);
    const motion = (event: PointerEvent) => {
      const dx = x(event) - start;
      if (Math.abs(dx) > 20) moved = true;
      group.setAttribute("transform", `translate(${pl.at + dx} ${group.transform.baseVal.consolidate()?.matrix.f ?? 0})`);
    };
    const up = (event: PointerEvent) => {
      group.removeEventListener("pointermove", motion);
      group.removeEventListener("pointerup", up);
      if (!moved) return host.pick(pl.item.id);
      const middle = pl.at + (x(event) - start) + pl.item.width / 2;
      const others = fill.placed.filter((o) => o.row === pl.row && o.item.id !== pl.item.id);
      host.move(pl.item.id, others.filter((o) => o.at + o.item.width / 2 < middle).length);
    };
    group.addEventListener("pointermove", motion);
    group.addEventListener("pointerup", up);
  });
}
