/**
 * Le dessin de face d'un meuble de cuisine pour le catalogue, à l'échelle, comme sur une planche de cuisiniste : caisson,
 * socle, portes, tiroirs, poignées, four, robinet de l'évier ; et sa description en une ligne. Tout est calculé
 * depuis ses cotes, sans le noyau. Les tons viennent du thème ; les poignées gardent leur laiton.
 */
import { KINDS, type CatalogEntry, type UnitKind } from "../../document/kitchen-catalog";
import { drawerHeights } from "../../features/fronts-parts";

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
const hasMicrowave = (e: CatalogEntry) => /micro-ondes/i.test(e.name);

/** How high a door's handle sits: within reach, low on a wall unit, high on a base unit. */
function doorGrip(kind: UnitKind, top: number, bottom: number): [number, number] {
  const length = Math.min(160, (bottom - top) * 0.3);
  const start = kind === "wall" ? bottom - 50 - length : top + (kind === "base" ? 50 : (bottom - top) * 0.4);
  return [start, start + length];
}

/** The fronts of a part of the unit, between two heights. */
function fronts(e: CatalogEntry, x0: number, x1: number, top: number, bottom: number): string {
  // A drawer over the door(s): its front at the top, the doors under it.
  if (e.topDrawer && e.layout !== "drawers" && e.layout !== "none") {
    const under = top + e.topDrawer;
    return box(x0, top, x1 - x0, e.topDrawer - GAP, PANEL) + handle(x0 + (x1 - x0) * 0.3, top + 42, x1 - (x1 - x0) * 0.3, top + 42) + fronts({ ...e, topDrawer: undefined }, x0, x1, under, bottom);
  }
  // Glazed: the glass inside its frame.
  const pane = (a: number, b: number) => (e.facade?.style === "glass" ? box(a + 45, top + 45, b - a - 90, bottom - top - 90, GLASS) : "");
  const door = (a: number, b: number, grip: number) => {
    const [y0, y1] = doorGrip(e.kind, top, bottom);
    return box(a, top, b - a, bottom - top, PANEL) + pane(a, b) + handle(grip, y0, grip, y1);
  };
  // Lift-up (hinged along its top) or flap (along its bottom): the handle along the edge that opens.
  if (e.layout === "door" && e.side) {
    const y = e.side === "top" ? bottom - 45 : top + 45;
    return box(x0, top, x1 - x0, bottom - top, PANEL) + pane(x0, x1) + handle(x0 + (x1 - x0) * 0.3, y, x1 - (x1 - x0) * 0.3, y);
  }
  if (e.layout === "door") return door(x0, x1, x1 - 45);
  if (e.layout === "doors") {
    const middle = (x0 + x1) / 2;
    return door(x0, middle - GAP / 2, middle - 45) + door(middle + GAP / 2, x1, middle + 45);
  }
  if (e.layout === "drawers") {
    const heights = drawerHeights(bottom - top, e.drawers ?? 3, GAP, e.drawerShares);
    let y = top;
    return heights.map((h) => {
      const front = box(x0, y, x1 - x0, h, PANEL) + handle(x0 + (x1 - x0) * 0.3, y + 42, x1 - (x1 - x0) * 0.3, y + 42);
      y += h + GAP;
      return front;
    }).join("");
  }
  // Open: its shelves, seen from the front.
  const n = e.top === "rails" ? 0 : e.shelves;
  const d = e.dividers ?? 0;
  const uprights = Array.from({ length: d }, (_, j) => box(x0 + ((x1 - x0) * (j + 1)) / (d + 1) - 9, top, 18, bottom - top, PANEL)).join("");
  return Array.from({ length: n }, (_, i) => box(x0, top + ((bottom - top) * (i + 1)) / (n + 1) - 9, x1 - x0, 18, PANEL)).join("") + uprights;
}

/** Its inside, its fronts taken off (« Sans portes » of the strip): shelves, uprights, drawers as their boxes. */
function opened(e: CatalogEntry, x0: number, x1: number, top: number, bottom: number): string {
  const tray = (y: number, h: number) => box(x0 + 30, y, x1 - x0 - 60, h, `${BODY} [stroke-dasharray:6_4]`);
  const stack = (n: number, from: number, shares?: readonly number[]) => {
    let y = from;
    return drawerHeights(bottom - from, n, GAP, shares).map((h) => (y += h + GAP, tray(y - h - GAP + h * 0.35, h * 0.65))).join("");
  };
  if (e.layout === "drawers") return stack(e.drawers ?? 3, top, e.drawerShares);
  // Under a sink: no top, its two rails, front and back, seen as one.
  if (e.top === "rails") return box(x0, top, x1 - x0, 60, PANEL);
  // A drawer over the doors; English drawers behind them, in their lower half.
  const drawer = e.topDrawer && e.layout !== "none" ? tray(top + e.topDrawer * 0.35, e.topDrawer * 0.65 - GAP) : "";
  const from = e.topDrawer && e.layout !== "none" ? top + e.topDrawer : top;
  const inner = e.innerDrawers ? stack(e.innerDrawers, (from + bottom) / 2) : "";
  return drawer + inner + fronts({ ...e, layout: "none", topDrawer: undefined }, x0, x1, from, e.innerDrawers ? (from + bottom) / 2 : bottom);
}

/** An oven in its niche: its controls, its window and its handle. */
function oven(x0: number, x1: number, top: number): string {
  const h = Math.min(595, x1 - x0);
  return box(x0, top, x1 - x0, h, BODY) + box(x0 + 40, top + 150, x1 - x0 - 80, h - 200, GLASS) + handle(x0 + 60, top + 105, x1 - 60, top + 105);
}

/** The drawing in mm, its top at 0 and the floor at its height (a tap above, at negative y), with no frame: to be placed; `open`, without its fronts. */
export function elevationBody(e: CatalogEntry, open = false): { body: string; width: number; height: number; above: number } {
  const kind = KINDS[e.kind];
  const [W, H, plinth] = [e.width, e.height ?? kind.height, e.plinth ?? kind.plinth];
  const carcass = H - plinth;
  const [x0, x1, top, bottom] = [GAP, W - GAP, GAP, carcass - GAP];
  let inside: string;
  if (hasMicrowave(e)) inside = box(x0, top + 120, x1 - x0, Math.min(380, bottom - top - 120), GLASS);
  else if (!hasOven(e)) inside = open ? opened(e, x0, x1, top, bottom) : fronts(e, x0, x1, top, bottom);
  else if (e.kind === "tall") {
    const at = (bottom - top) * 0.3;
    const door = { ...e, layout: "door" as const };
    inside = fronts(door, x0, x1, top, at - GAP) + oven(x0, x1, at) + fronts(door, x0, x1, at + 595 + GAP, bottom);
  } else inside = oven(x0, x1, top);
  const above = hasSink(e) ? TAP : 0;
  const tap = above ? `<path d="M${W / 2 - 40} 0 V${-above + 25} Q${W / 2 - 40} ${-above} ${W / 2} ${-above} Q${W / 2 + 45} ${-above} ${W / 2 + 45} ${-above + 45}" fill="none" stroke="${BRASS}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>` : "";
  const legs = plinth ? box(GAP, carcass, W - 2 * GAP, plinth, BODY) : "";
  return { body: `${tap}${legs}${box(0, 0, W, carcass, BODY)}${inside}`, width: W, height: H, above };
}

/** The drawing, in SVG, at the scale of its family, standing on its floor line. */
export function elevation(e: CatalogEntry): string {
  const { body, width: W, height: H, above } = elevationBody(e);
  const k = SCALE[e.kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * k).toFixed(1)}" height="${((H + above) * k).toFixed(1)}" viewBox="0 ${-above} ${W} ${H + above}" aria-hidden="true">${body}</svg>`;
}

/** What it is, in a few words. */
export function unitSummary(e: CatalogEntry): string {
  // One of « Mes caissons »: its inside as it was kept.
  if (e.caisson) return ["Caisson aménagé", e.caisson.doors ? "portes" : "", e.caisson.cases.some((c) => c.equipment.some((q) => q.feature.fill === "drawers")) ? "tiroirs" : ""].filter(Boolean).join(" · ");
  const shelves = e.top === "rails" ? "2 traverses" : e.shelves ? `${e.shelves} étagère${e.shelves > 1 ? "s" : ""}` : "";
  const door = e.side === "top" ? "1 porte relevante" : e.side === "bottom" ? "1 abattant" : "1 porte";
  const what = hasOven(e) ? "Niche pour four" : e.layout === "drawers" ? `${e.drawers ?? 3} tiroirs` : e.layout === "doors" ? "2 portes" : e.layout === "door" ? door : e.shelves ? "Ouvert" : "Sans façade";
  const drawer = e.topDrawer && e.layout !== "drawers" ? "1 tiroir" : "";
  const inner = e.innerDrawers ? `${e.innerDrawers} tiroirs à l'anglaise` : "";
  const uprights = e.dividers ? `${e.dividers} cloison${e.dividers > 1 ? "s" : ""}` : "";
  return [drawer, what, e.facade?.style === "glass" ? "vitré" : "", inner, shelves, uprights].filter(Boolean).join(" · ");
}
