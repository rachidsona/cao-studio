/**
 * La bande de face d'un linéaire de cuisine, à l'échelle, comme sur une planche de cuisiniste : le mur et ses portes et
 * fenêtres, le plan de travail, en bas les meubles bas et les colonnes, en haut les meubles hauts, la hotte et le
 * micro-ondes, chacun dessiné par app/unit-elevation.ts ; les fileurs, les angles (pris par les meubles de l'angle), et
 * la place libre hachurée, en pointillés, avec sa largeur (cm) ; les appareils posés à la main (Électroménager), en
 * sombre, là où la 3D les a. Un clic choisit un meuble, le glisser
 * le change de place dans sa rangée.
 */
import { cornerSide, wallCornerSide } from "../../document/kitchen-corners";
import { kitchenSizes, zoneSpan, type KitchenRun, type RunGeometry } from "../../document/kitchen-plan-shapes";
import type { HandAppliance } from "../../document/kitchen-hand-appliances";
import type { KitchenFloorPlan } from "../../document/types";
import { applianceOf, isFiller, itemSize, type Placed, type RunFill } from "../../features/kitchen-run-items";
import { BRASS, elevationBody } from "./unit-elevation";

const SVG = "http://www.w3.org/2000/svg";
const WALL = "fill-gray-50 dark:fill-gray-900";
const PANEL = "fill-gray-100 stroke-gray-500 dark:fill-gray-700 dark:stroke-gray-400";
const STONE = "fill-gray-400 stroke-gray-600 dark:fill-gray-500 dark:stroke-gray-300";
const DEAD = "fill-gray-200 dark:fill-gray-800";
/** Each strip its own hatch (an id is for the whole page). */
let hatches = 0;

const rect = (x: number, y: number, w: number, h: number, tone: string, extra = "") => `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" class="${tone}" vector-effect="non-scaling-stroke" ${extra}/>`;

/** What a placed item looks like from the front, at the plan's heights. */
function drawing(pl: Placed, p: KitchenFloorPlan): { body: string; z: number; height: number } {
  const s = kitchenSizes(p);
  const role = applianceOf(pl.item)?.role;
  const w = pl.item.width;
  // A filler put by hand: a plain panel, between plinth and worktop or the height of the wall row.
  if (isFiller(pl.item)) {
    const [z, top] = pl.row === "wall" ? [s.wallBottom, s.wallTop] : [s.plinth, s.base];
    return { body: rect(0, 0, w, top - z, PANEL, 'data-hand-filler=""'), z, height: top - z };
  }
  if (role === "hood") {
    // Its canopy over the hob, its duct up to the top of the wall units.
    const z = p.worktopHeight + 650;
    const height = Math.max(100, s.wallTop - z);
    return { body: `${rect(w / 2 - 125, 0, 250, height - 100, PANEL)}${rect(0, height - 100, w, 100, PANEL)}`, z, height };
  }
  const { height, z } = itemSize(p, pl.item, pl.entry);
  const entry = role === "dishwasher" ? { ...pl.entry, layout: "door" as const } : pl.entry;
  return { body: elevationBody({ ...entry, height, plinth: pl.row === "wall" ? 0 : (entry.plinth ?? s.plinth) }).body, z, height };
}

export interface StripHost {
  plan: KitchenFloorPlan;
  run: KitchenRun;
  geometry: RunGeometry;
  fill: RunFill;
  chosen: string | null;
  /** The units chosen together (Maj, Ctrl or ⌘ + clic). */
  picked?: readonly string[];
  /** A unit clicked; `add`: with Maj, Ctrl or ⌘, added to those chosen (or taken out). */
  pick(id: string, add?: boolean): void;
  /** The item moved to this place among those of its row. */
  move(id: string, index: number): void;
  /** The chosen unit's width, pulled by its right edge (mm). */
  resize?(id: string, width: number): void;
  /** A corner clicked: its settings. */
  corner?(): void;
  /** The appliances put by hand in front of the run (Électroménager). */
  appliances?: readonly HandAppliance[];
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
  const hatch = `kitchen-hatch-${++hatches}`;
  // The room left free, hatched (not a corner: the units of the corner take it).
  const empty = (x: number, z0: number, w: number, h: number, what: string) => (w > 1 && h > 1 ? `<rect x="${x}" y="${y(z0 + h)}" width="${w}" height="${h}" fill="url(#${hatch})" pointer-events="none" data-empty="${what}"/>` : "");
  const parts: string[] = [
    `<defs><pattern id="${hatch}" patternUnits="userSpaceOnUse" width="70" height="70" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="70" class="stroke-red-500/70 dark:stroke-red-400/70" stroke-width="10"/></pattern></defs>`,
    rect(0, 0, L, H, WALL),
  ];
  for (const sp of g.spans) parts.push(rect(sp.from, y(Math.min(sp.top, H)), sp.to - sp.from, Math.min(sp.top, H) - sp.bottom, sp.bottom > 0 ? "fill-emerald-100 stroke-emerald-500 dark:fill-emerald-950" : "fill-orange-100 stroke-orange-500 dark:fill-orange-950", `data-span="${sp.bottom > 0 ? "window" : "door"}"`));
  // The corners, where the other run's units stand or the corner stays dead.
  if (g.base[0] > 1 && run.left !== "free") parts.push(rect(0, y(s.base), g.base[0], s.base, DEAD, 'data-corner="left"'));
  if (L - g.base[1] > 1 && run.right !== "free") parts.push(rect(g.base[1], y(s.base), L - g.base[1], s.base, DEAD, 'data-corner="right"'));
  /** A corner front's width (cm), and what it is: the door, the fixed panel, the filler. */
  const frontSize = (f: { from: number; to: number; kind: string }, z0: number, z1: number) => {
    const w = f.to - f.from;
    const what = f.kind === "door" ? "porte" : f.kind === "blind" ? "fixe" : "fileur";
    const mid = y((z0 + z1) / 2);
    return w < 40 ? "" : `<text x="${(f.from + f.to) / 2}" y="${mid}" text-anchor="middle" font-size="${w < 250 ? 60 : 90}" class="fill-gray-700 dark:fill-gray-200" pointer-events="none" data-corner-width="${f.kind}">${Number((w / 10).toFixed(1)).toLocaleString("fr-FR")}</text><text x="${(f.from + f.to) / 2}" y="${mid + 80}" text-anchor="middle" font-size="55" class="fill-gray-500 dark:fill-gray-400" pointer-events="none">${what}</text>`;
  };
  // What each corner has: its filler, or its unit's panel and door, each with its width.
  for (const side of ["left", "right"] as const) {
    // Up in the wall row: a wall corner unit's panel and door, or its filler.
    const high = g.wall ? wallCornerSide(p, run, side) : null;
    for (const f of high?.fronts ?? []) {
      parts.push(rect(f.from, y(s.wallTop), f.to - f.from, s.wallTop - s.wallBottom, f.kind === "blind" ? `${PANEL} opacity-70` : PANEL, `data-wall-corner-front="${f.kind}"`));
      parts.push(frontSize(f, s.wallBottom, s.wallTop));
      if (f.kind === "door") {
        const hx = side === "left" ? f.from + 40 : f.to - 40;
        parts.push(`<line x1="${hx}" y1="${y(s.wallBottom + 60)}" x2="${hx}" y2="${y(s.wallBottom + 260)}" stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke"/>`);
      }
    }
    const corner = cornerSide(p, run, side, fill.walls[side === "left" ? 0 : 1]);
    if (!corner) continue;
    for (const f of corner.fronts) {
      const tone = f.kind === "blind" ? `${PANEL} opacity-70` : PANEL;
      parts.push(rect(f.from, y(s.base), f.to - f.from, s.base - s.plinth, tone, `data-corner-front="${f.kind}"`));
      parts.push(frontSize(f, s.plinth, s.base));
      if (f.kind === "door") {
        const hx = side === "left" ? f.from + 40 : f.to - 40;
        parts.push(`<line x1="${hx}" y1="${y(s.base - 60)}" x2="${hx}" y2="${y(s.base - 260)}" stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke"/>`);
      }
    }
    const [a, b] = corner.cabinet ?? [side === "left" ? 0 : g.base[1], side === "left" ? g.base[0] : L];
    parts.push(`<text x="${(a + b) / 2}" y="${H + 120}" text-anchor="middle" font-size="80" class="fill-gray-500 dark:fill-gray-400" pointer-events="none"><title>${corner.name}</title>${corner.kind === "dead" ? "angle" : "angle ✓"}</text>`);
  }
  const [w0, w1] = zoneSpan(run);
  if (fill.placed.some((pl) => pl.row === "base")) parts.push(rect(w0, y(p.worktopHeight), w1 - w0, p.worktopHeight - s.base, STONE));
  for (const [a, b] of fill.fillers) parts.push(rect(a, y(s.base), b - a, s.base - s.plinth, PANEL, 'data-filler=""'));
  // The room left open, dashed, with its width (cm).
  const open = (a: number, b: number, z0: number, z1: number, row: string) =>
    `${rect(a, y(z1), b - a, z1 - z0, "fill-sky-50/60 stroke-sky-500 dark:fill-sky-950/40", `stroke-dasharray="6 4" data-free="${row}"`)}${empty(a, z0, b - a, z1 - z0, "free")}<text x="${(a + b) / 2}" y="${y((z0 + z1) / 2) + 30}" text-anchor="middle" font-size="90" class="fill-sky-700 dark:fill-sky-300" pointer-events="none">${Number(((b - a) / 10).toFixed(1)).toLocaleString("fr-FR")}</text>`;
  for (const [a, b] of fill.free) parts.push(open(a, b, 0, s.base, "base"));
  for (const [a, b] of fill.wallFree) parts.push(open(a, b, s.wallBottom, s.wallTop, "wall"));
  parts.push(`<line x1="-40" y1="${H}" x2="${L + 40}" y2="${H}" class="stroke-gray-500" vector-effect="non-scaling-stroke"/>`);
  node.innerHTML = parts.join("");
  // A corner (its unit, its filler, its dead square) clicked: its settings open.
  if (host.corner) {
    for (const piece of node.querySelectorAll<SVGElement>("[data-corner], [data-corner-front], [data-wall-corner-front]")) {
      piece.style.cursor = "pointer";
      piece.addEventListener("click", () => host.corner?.());
    }
  }
  // The chosen unit's edge, drawn last: over the unit next to it.
  let handle = () => {};
  for (const pl of fill.placed) {
    const { body, z, height } = drawing(pl, p);
    const group = document.createElementNS(SVG, "g");
    group.setAttribute("transform", `translate(${pl.at} ${y(z + height)})`);
    group.setAttribute("data-item", pl.item.id);
    group.setAttribute("class", "cursor-grab");
    const label = `${pl.entry.name} ${Math.round(pl.item.width / 10)}`;
    const chosen = pl.item.id === host.chosen;
    const picked = host.picked?.includes(pl.item.id) ?? false;
    if (picked) group.setAttribute("data-picked", "");
    group.innerHTML = `<title>${label}</title>${body}${chosen || picked ? rect(0, 0, pl.item.width, height, picked ? "fill-sky-400/25" : "fill-none", `stroke="${BRASS}" stroke-width="3"`) : ""}<text x="${pl.item.width / 2}" y="${pl.row === "wall" ? -30 : height + 120}" text-anchor="middle" font-size="90" class="fill-gray-600 dark:fill-gray-300" pointer-events="none">${Math.round(pl.item.width / 10)}</text>`;
    drag(node, group, pl, fill, host);
    if (chosen && host.resize && !applianceOf(pl.item)) handle = () => edge(node, pl, y(z + height), height, host.resize!);
    node.append(group);
  }
  handle();
  // The appliances put by hand, over the units: as the 3D has them.
  for (const a of host.appliances ?? []) {
    const shape = document.createElementNS(SVG, "g");
    shape.setAttribute("data-hand-appliance", a.id);
    shape.setAttribute("pointer-events", "none");
    shape.innerHTML = `<title>${a.name}</title>${rect(a.from, y(a.z1), a.to - a.from, a.z1 - a.z0, "fill-gray-800/90 stroke-gray-950 dark:fill-gray-950/90 dark:stroke-gray-300")}`;
    node.append(shape);
  }
  return node;
}

/** The chosen unit's right edge: pulled, its width follows by the centimetre, shown as it goes; let go, it is set. */
function edge(node: SVGSVGElement, pl: Placed, top: number, height: number, resize: (id: string, width: number) => void): void {
  const w0 = pl.item.width;
  const handle = document.createElementNS(SVG, "g");
  handle.setAttribute("class", "cursor-ew-resize");
  handle.setAttribute("data-resize", pl.item.id);
  handle.innerHTML = `<title>Tirer pour changer la largeur</title><rect x="-30" y="0" width="60" height="${height}" fill="transparent"/><rect x="-9" y="${height / 2 - 120}" width="18" height="240" rx="6" fill="${BRASS}"/><text y="-60" text-anchor="middle" font-size="90" fill="${BRASS}" pointer-events="none"></text>`;
  const at = (w: number) => handle.setAttribute("transform", `translate(${pl.at + w} ${top})`);
  at(w0);
  const label = handle.querySelector("text")!;
  handle.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    down.stopPropagation();
    const matrix = node.getScreenCTM()?.inverse();
    const x = (event: PointerEvent) => (matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix).x : event.clientX);
    const start = x(down);
    let width = w0;
    handle.setPointerCapture?.(down.pointerId);
    const motion = (event: PointerEvent) => {
      width = Math.min(2400, Math.max(100, Math.round((w0 + x(event) - start) / 10) * 10));
      at(width);
      label.textContent = `${Number((width / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", motion);
      handle.removeEventListener("pointerup", up);
      if (width !== w0) resize(pl.item.id, width);
    };
    handle.addEventListener("pointermove", motion);
    handle.addEventListener("pointerup", up);
  });
  node.append(handle);
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
      if (!moved) return host.pick(pl.item.id, event.shiftKey || event.ctrlKey || event.metaKey);
      const middle = pl.at + (x(event) - start) + pl.item.width / 2;
      const others = fill.placed.filter((o) => o.row === pl.row && o.item.id !== pl.item.id);
      host.move(pl.item.id, others.filter((o) => o.at + o.item.width / 2 < middle).length);
    };
    group.addEventListener("pointermove", motion);
    group.addEventListener("pointerup", up);
  });
}
