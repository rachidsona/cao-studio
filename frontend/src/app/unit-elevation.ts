/**
 * Le dessin de face d'un meuble de cuisine pour le catalogue, à l'échelle, comme sur une planche de cuisiniste : caisson,
 * socle, portes, tiroirs, poignées, four, robinet de l'évier ; et sa description en une ligne. Tout est calculé
 * depuis ses cotes, sans le noyau. Les tons viennent du thème ; les poignées gardent leur laiton.
 */
import { KINDS, type CatalogEntry, type UnitKind } from "../document/kitchen-catalog";

/** Laiton : the one colour that does not follow the theme, on the handles and what is chosen. */
export const BRASS = "#b8975a";
/** Pixels per mm for each kind: all the units of a family are drawn at one scale, so that they can be compared. */
const SCALE: Record<UnitKind, number> = { base: 0.07, wall: 0.07, tall: 0.04 };
const GAP = 14;
const TAP = 130;

const PANEL = "fill-gray-100 stroke-gray-500 dark:fill-gray-700 dark:stroke-gray-400";
const BODY = "fill-gray-200 stroke-gray-500 dark:fill-gray-800 dark:stroke-gray-400";
const GLASS = "fill-gray-700 stroke-gray-500 dark:fill-gray-950 dark:stroke-gray-400";

const box = (x: number, y: number, w: number, h: number, tone: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${tone}" vector-effect="non-scaling-stroke"/>`;
const handle = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BRASS}" stroke-width="1.6" stroke-linecap="square" vector-effect="non-scaling-stroke"/>`;

/** The units whose name says what is built in. */
const hasOven = (e: CatalogEntry) => /four/i.test(e.name);
const hasSink = (e: CatalogEntry) => /évier/i.test(e.name);

/** How high a door's handle sits: within reach, low on a wall unit, high on a base unit. */
function doorGrip(kind: UnitKind, top: number, bottom: number): [number, number] {
  const length = Math.min(160, (bottom - top) * 0.3);
  const start = kind === "wall" ? bottom - 50 - length : top + (kind === "base" ? 50 : (bottom - top) * 0.4);
  return [start, start + length];
}

/** The fronts of a part of the unit, between two heights. */
function fronts(e: CatalogEntry, x0: number, x1: number, top: number, bottom: number): string {
  const door = (a: number, b: number, grip: number) => {
    const [y0, y1] = doorGrip(e.kind, top, bottom);
    return box(a, top, b - a, bottom - top, PANEL) + handle(grip, y0, grip, y1);
  };
  if (e.layout === "door") return door(x0, x1, x1 - 45);
  if (e.layout === "doors") {
    const middle = (x0 + x1) / 2;
    return door(x0, middle - GAP / 2, middle - 45) + door(middle + GAP / 2, x1, middle + 45);
  }
  if (e.layout === "drawers") {
    const n = e.drawers ?? 3;
    const h = (bottom - top - (n - 1) * GAP) / n;
    return Array.from({ length: n }, (_, i) => {
      const y = top + i * (h + GAP);
      return box(x0, y, x1 - x0, h, PANEL) + handle(x0 + (x1 - x0) * 0.3, y + 42, x1 - (x1 - x0) * 0.3, y + 42);
    }).join("");
  }
  return "";
}

/** An oven in its niche: its controls, its window and its handle. */
function oven(x0: number, x1: number, top: number): string {
  const h = Math.min(595, x1 - x0);
  return box(x0, top, x1 - x0, h, BODY) + box(x0 + 40, top + 150, x1 - x0 - 80, h - 200, GLASS) + handle(x0 + 60, top + 105, x1 - 60, top + 105);
}

/** The drawing, in SVG, at the scale of its family, standing on its floor line. */
export function elevation(e: CatalogEntry): string {
  const kind = KINDS[e.kind];
  const [W, H, plinth] = [e.width, e.height ?? kind.height, e.plinth ?? kind.plinth];
  const carcass = H - plinth;
  const [x0, x1, top, bottom] = [GAP, W - GAP, GAP, carcass - GAP];
  let inside: string;
  if (!hasOven(e)) inside = fronts(e, x0, x1, top, bottom);
  else if (e.kind === "tall") {
    const at = (bottom - top) * 0.3;
    const door = { ...e, layout: "door" as const };
    inside = fronts(door, x0, x1, top, at - GAP) + oven(x0, x1, at) + fronts(door, x0, x1, at + 595 + GAP, bottom);
  } else inside = oven(x0, x1, top);
  const above = hasSink(e) ? TAP : 0;
  const tap = above ? `<path d="M${W / 2 - 40} 0 V${-above + 25} Q${W / 2 - 40} ${-above} ${W / 2} ${-above} Q${W / 2 + 45} ${-above} ${W / 2 + 45} ${-above + 45}" fill="none" stroke="${BRASS}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>` : "";
  const legs = plinth ? box(GAP, carcass, W - 2 * GAP, plinth, BODY) : "";
  const k = SCALE[e.kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * k).toFixed(1)}" height="${((H + above) * k).toFixed(1)}" viewBox="0 ${-above} ${W} ${H + above}" aria-hidden="true">${tap}${legs}${box(0, 0, W, carcass, BODY)}${inside}</svg>`;
}

/** What it is, in a few words. */
export function unitSummary(e: CatalogEntry): string {
  const shelves = e.top === "rails" ? "2 traverses" : e.shelves ? `${e.shelves} étagère${e.shelves > 1 ? "s" : ""}` : "";
  const what = hasOven(e) ? "Niche pour four" : e.layout === "drawers" ? `${e.drawers ?? 3} tiroirs` : e.layout === "doors" ? "2 portes" : e.layout === "door" ? "1 porte" : "Sans façade";
  return [what, shelves].filter(Boolean).join(" · ");
}
