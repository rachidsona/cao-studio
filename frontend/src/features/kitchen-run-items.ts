/**
 * Ce qu'on pose sur un linéaire de cuisine, en nombres : les meubles du catalogue (document/kitchen-catalog.ts), ses propres
 * meubles, et l'électroménager, des meubles « à contraintes » — l'évier et la plaque découpent le plan de travail, le
 * lave-vaisselle et la hotte n'ont pas de caisson, la hotte va au-dessus de la plaque, la plaque garde du plan de chaque
 * côté. Puis leur place sur le mur : de gauche à droite dans chaque rangée (en bas les bas et les colonnes, en haut les
 * hauts, la hotte et le micro-ondes), entre les angles, les portes, les fenêtres et les colonnes ; ce qui reste d'une
 * rangée basse va aux fileurs, au bout ou au début du mur. Pur.
 */
import { CATALOG, type CatalogEntry, type UnitKind } from "../document/kitchen-catalog";
import { kitchenSizes, rowStretches, type RestSide, type RunGeometry } from "../document/kitchen-plan-shapes";
import type { KitchenFloorPlan } from "../document/types";
import type { KitchenRunItem } from "../document/types";
import { freeStretches } from "./room-runs";

/** The widths a unit is sold in (mm). */
export const WIDTHS = [300, 400, 450, 500, 600, 800, 900, 1000, 1200];

export type Role = "sink" | "dishwasher" | "hob" | "hob-oven" | "oven" | "fridge" | "oven-column" | "hood" | "microwave" | "fridge-surround";

/** A freestanding fridge's surround (« Habillage réfrigérateur »): its usual height and depth, its top caisson's height, the air over the fridge and on its sides (mm). */
export const SURROUND = { height: 2300, depth: 720, caisson: 400, air: 30, side: 10, least: 200, lowest: 1200 };

export interface ApplianceModel {
  model: string;
  role: Role;
  name: string;
  kind: UnitKind;
  widths: number[];
  /** Its cabinet (none: the appliance alone, a dishwasher, a hood). */
  cabinet: Pick<CatalogEntry, "layout" | "drawers" | "shelves" | "top"> | null;
}

export const APPLIANCES: ApplianceModel[] = [
  { model: "app-sink", role: "sink", name: "Évier", kind: "base", widths: [600, 800, 1200], cabinet: { layout: "doors", shelves: 0, top: "rails" } },
  { model: "app-dishwasher", role: "dishwasher", name: "Lave-vaisselle", kind: "base", widths: [450, 600], cabinet: null },
  { model: "app-hob", role: "hob", name: "Plaque de cuisson", kind: "base", widths: [600, 800, 900], cabinet: { layout: "drawers", drawers: 2, shelves: 0 } },
  { model: "app-hob-oven", role: "hob-oven", name: "Plaque et four", kind: "base", widths: [600], cabinet: { layout: "none", shelves: 0 } },
  { model: "app-oven", role: "oven", name: "Four sous plan", kind: "base", widths: [600], cabinet: { layout: "none", shelves: 0 } },
  { model: "app-fridge", role: "fridge", name: "Colonne réfrigérateur", kind: "tall", widths: [600], cabinet: { layout: "door", shelves: 0 } },
  { model: "app-fridge-surround", role: "fridge-surround", name: "Habillage réfrigérateur américain", kind: "tall", widths: [700, 800, 900, 968, 1000, 1100, 1200], cabinet: null },
  { model: "app-oven-column", role: "oven-column", name: "Colonne four", kind: "tall", widths: [600], cabinet: { layout: "none", shelves: 1 } },
  { model: "app-hood", role: "hood", name: "Hotte", kind: "wall", widths: [600, 900], cabinet: null },
  { model: "app-microwave", role: "microwave", name: "Micro-ondes", kind: "wall", widths: [600], cabinet: { layout: "none", shelves: 0 } },
];

/** A filler put on the run by hand, low or up in the wall row: a panel of its width, no cabinet. */
export const FILLER = "filler";
export const FILLER_WALL = "filler-wall";
/** Room kept free on the run, low or up: where a unit was pushed along it in the 3D (document/kitchen-moves.ts). Nothing is made there. */
export const SPACE = "space";
export const SPACE_WALL = "space-wall";
export const isSpace = (item: Pick<KitchenRunItem, "model">): boolean => item.model === SPACE || item.model === SPACE_WALL;
/** A filler or a space: no cabinet, its width only. */
export const isFiller = (item: Pick<KitchenRunItem, "model">): boolean => item.model === FILLER || item.model === FILLER_WALL || isSpace(item);

/** « base-bas-1-porte-600 » → « base-bas-1-porte ». */
export const modelOf = (entry: CatalogEntry): string => entry.id.replace(/-\d+$/, "");

export const applianceOf = (item: Pick<KitchenRunItem, "model">): ApplianceModel | undefined => APPLIANCES.find((a) => a.model === item.model);

/** What an item is, at its width: its catalogue entry (made at that width when the catalogue has not got it). */
function modelEntry(item: KitchenRunItem): CatalogEntry {
  if (item.own) return { ...item.own, width: item.width };
  if (isFiller(item)) return { id: `${item.model}-${item.width}`, kind: item.model === FILLER_WALL || item.model === SPACE_WALL ? "wall" : "base", name: isSpace(item) ? "Espace libre" : "Fileur", width: item.width, layout: "none", shelves: 0 };
  const app = applianceOf(item);
  if (app) {
    const cabinet = app.cabinet ?? { layout: "none" as const, shelves: 0 };
    return { id: `${app.model}-${item.width}`, kind: app.kind, name: app.name, width: item.width, ...cabinet, ...(cabinet.layout === "doors" && item.width <= 600 ? { layout: "door" as const } : {}) };
  }
  const exact = CATALOG.find((e) => e.id === `${item.model}-${item.width}`);
  if (exact) return exact;
  const like = CATALOG.find((e) => modelOf(e) === item.model) ?? CATALOG[0]!;
  return { ...like, id: `${item.model}-${item.width}`, width: item.width, ...(like.layout === "doors" && item.width < 600 ? { layout: "door" as const } : {}) };
}

/** What a unit's fronts and inside may be set to here: not a filler, a room kept free, an appliance without a cabinet, a furnished caisson, a rounded end. */
export const hasInside = (item: KitchenRunItem): boolean => !isFiller(item) && !item.own?.caisson && !modelEntry(item).round && (applianceOf(item)?.cabinet !== null);

/**
 * The entry of an item: its model's, with the fronts and the inside chosen for this unit over them (« Façades et
 * intérieur »). Drawers leave no room for shelves nor upright boards; upright boards none for a drawer.
 */
export function itemEntry(item: KitchenRunItem): CatalogEntry {
  const e = modelEntry(item);
  if (!hasInside(item) || [item.layout, item.drawers, item.topDrawer, item.innerDrawers, item.shelves, item.dividers].every((v) => v === undefined)) return e;
  const layout = item.layout ?? e.layout;
  const drawers = layout === "drawers";
  const dividers = drawers ? 0 : (item.dividers ?? e.dividers ?? 0);
  const doors = layout === "door" || layout === "doors";
  const top = doors && !dividers ? (item.topDrawer ?? e.topDrawer) : undefined;
  const inner = doors && !dividers ? (item.innerDrawers ?? e.innerDrawers) : undefined;
  const { topDrawer: _t, innerDrawers: _i, dividers: _d, side: _s, ...rest } = e;
  return {
    ...rest, layout, shelves: drawers ? 0 : (item.shelves ?? e.shelves), ...(drawers ? { drawers: item.drawers ?? e.drawers ?? 3 } : {}),
    ...(dividers ? { dividers } : {}), ...(top ? { topDrawer: top } : {}), ...(inner ? { innerDrawers: inner } : {}), ...(layout === "door" && e.side && !top ? { side: e.side } : {}),
  };
}

/** The models one adds to a run, by family: those of the catalogue (one per name), then the appliances. */
export function runModels(): { model: string; name: string; kind: UnitKind; widths: number[]; appliance: boolean }[] {
  // The casquette caissons are the plan's own casquette (« Caissons à porte relevante »), not units of a row.
  const names = [...new Set(CATALOG.filter((e) => !e.above).map((e) => modelOf(e)))];
  const own = names.map((model) => {
    const entries = CATALOG.filter((e) => modelOf(e) === model);
    return { model, name: entries[0]!.name, kind: entries[0]!.kind, widths: entries.map((e) => e.width), appliance: false };
  });
  return [...own, ...APPLIANCES.map((a) => ({ model: a.model, name: a.name, kind: a.kind, widths: a.widths, appliance: true }))];
}

let counter = 0;
/** A new item of a model, its id free in the run. */
export function newItem(items: readonly KitchenRunItem[], model: string, width: number, own?: CatalogEntry): KitchenRunItem {
  const used = new Set(items.map((i) => i.id));
  let id = "";
  do id = `k${(++counter).toString(36)}`;
  while (used.has(id));
  return { id, model, width, ...(own ? { own } : {}) };
}

export const rowOf = (entry: CatalogEntry): "base" | "wall" => (entry.kind === "wall" ? "wall" : "base");

/** A unit's height, depth and bottom where it stands (mm): its own when set, else its model's at the plan's heights. */
export function itemSize(p: KitchenFloorPlan, item: KitchenRunItem, entry: CatalogEntry = itemEntry(item)): { height: number; depth: number; z: number } {
  const s = kitchenSizes(p);
  const own = entry.custom && entry.depth ? entry.depth : undefined;
  if (rowOf(entry) === "wall") {
    const height = item.height ?? entry.height ?? s.wallTop - s.wallBottom;
    return { height, depth: item.depth ?? own ?? p.wallDepth, z: s.wallTop - height };
  }
  // A fridge's surround: as high as a freestanding fridge and its caisson ask, as deep as the fridge.
  if (entry.id.startsWith("app-fridge-surround-")) return { height: item.height ?? Math.min(p.height, SURROUND.height), depth: item.depth ?? SURROUND.depth, z: 0 };
  if (entry.kind === "tall") return { height: item.height ?? s.wallTop, depth: item.depth ?? s.cabinet, z: 0 };
  return { height: s.base, depth: item.depth ?? own ?? s.cabinet, z: 0 };
}

/** The fridge's height in its surround (mm): its own when set, else under a 40 cm caisson; always 20 cm of caisson over it. */
export function surroundFridge(p: KitchenFloorPlan, item: KitchenRunItem): number {
  const { height } = itemSize(p, item);
  return Math.min(item.fridge ?? height - SURROUND.caisson - SURROUND.air, height - SURROUND.air - SURROUND.least);
}

/** What a unit's sizes may be (mm): its width; its height (none for a base unit, under the worktop); its depth. */
export function sizeLimits(p: KitchenFloorPlan, entry: CatalogEntry): { width: [number, number]; height: [number, number] | null; depth: [number, number] } {
  const s = kitchenSizes(p);
  if (entry.id.startsWith(`${SPACE}-`) || entry.id.startsWith(`${SPACE_WALL}-`)) return { width: [1, 6000], height: null, depth: [0, 0] };
  if (entry.id.startsWith(`${FILLER}-`) || entry.id.startsWith(`${FILLER_WALL}-`)) return { width: [10, 300], height: null, depth: [0, 0] };
  if (rowOf(entry) === "wall") return { width: [100, 2400], height: [200, s.wallTop - p.worktopHeight - 100], depth: [150, 600] };
  if (entry.id.startsWith("app-fridge-surround-")) return { width: [700, 1400], height: [1600, p.height], depth: [500, 850] };
  if (entry.kind === "tall") return { width: [100, 2400], height: [1200, p.height], depth: [200, s.cabinet] };
  return { width: [100, 2400], height: null, depth: [200, s.cabinet] };
}

/** `item` put after the one `after` names when it is of its row, else at the end of its row. */
export function insertItem(items: readonly KitchenRunItem[], item: KitchenRunItem, after?: string | null): KitchenRunItem[] {
  const row = rowOf(itemEntry(item));
  const chosen = items.findIndex((i) => i.id === after);
  const at = chosen >= 0 && rowOf(itemEntry(items[chosen]!)) === row ? chosen + 1 : items.reduce((last, i, k) => (rowOf(itemEntry(i)) === row ? k + 1 : last), items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/**
 * The items with the rooms kept free side by side in a row (no unit of that row between them) made one « Espace
 * libre », their widths summed: a unit deleted, then one slid beside it, leave one room, not three.
 */
export function joinedSpaces(items: readonly KitchenRunItem[]): KitchenRunItem[] {
  const out: KitchenRunItem[] = [];
  const last = new Map<string, number>();
  for (const item of items) {
    const row = rowOf(itemEntry(item));
    const k = last.get(row);
    const prev = k === undefined ? undefined : out[k];
    if (prev && isSpace(prev) && !prev.furnished && isSpace(item) && !item.furnished) {
      out[k!] = { ...prev, width: Math.round((prev.width + item.width) * 10) / 10 };
      continue;
    }
    last.set(row, out.length);
    out.push(item);
  }
  return out.length === items.length ? [...items] : out;
}

/**
 * `item` put in the room kept free in its row — an « Espace libre » no furnished caisson holds, wide enough for it, the
 * narrowest such —, in its place there, that room keeping what is left of it; null when there is none.
 */
export function inKeptRoom(given: readonly KitchenRunItem[], item: KitchenRunItem): KitchenRunItem[] | null {
  const items = joinedSpaces(given);
  const row = rowOf(itemEntry(item));
  const space = items.filter((i) => isSpace(i) && !i.furnished && rowOf(itemEntry(i)) === row && i.width >= item.width - 0.5).sort((a, b) => a.width - b.width)[0];
  if (!space) return null;
  const at = items.indexOf(space);
  const left = space.width - item.width;
  return [...items.slice(0, at), item, ...(left >= 1 ? [{ ...space, width: left }] : []), ...items.slice(at + 1)];
}

/** The run item of a catalogue entry (one's own unit kept whole). */
export function entryItem(items: readonly KitchenRunItem[], entry: CatalogEntry): KitchenRunItem {
  return entry.custom ? newItem(items, entry.id, entry.width, entry) : newItem(items, modelOf(entry), entry.width);
}

/** An item at its place: along the run from its left (mm), in its row. */
export interface Placed {
  item: KitchenRunItem;
  entry: CatalogEntry;
  row: "base" | "wall";
  at: number;
}

/** A run filled: what stands where, the fillers of the base row, the room left open, what does not fit, and what to look at. */
export interface RunFill {
  placed: Placed[];
  /** Up to 15 cm: closed by a filler. */
  fillers: [number, number][];
  /** Wider: left open, to be filled by a unit, in the base row and in the wall row. */
  free: [number, number][];
  wallFree: [number, number][];
  /** At the left and right ends: the room between the wall and the corner unit, moved off it (the rest « contre les murs »). */
  walls: [number, number];
  /** The free stretches of the base row. */
  stretches: [number, number][];
  /** The room kept free, at its place (out of `placed`: nothing is made there). */
  spaces: Placed[];
  /** The run's items as they are placed: a unit put in the room kept free, before what is left of that room. */
  items: KitchenRunItem[];
  missing: KitchenRunItem[];
  problems: string[];
}

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;
/** Wider than this, room is left open rather than closed by a filler (mm), as Finitions does. */
export const WIDE_FILLER = 150;
const MIN_FILLER = 3;
const HOB_SIDE = 300;

/** The items of a row in its stretches, in their order, each where the one before ends; the rest at the end, the start, or both. */
function pack(stretches: [number, number][], items: Omit<Placed, "at">[], rest: Exclude<RunGeometry["rest"], "walls">): { placed: Placed[]; gaps: [number, number][]; missing: Omit<Placed, "at">[] } {
  const used = stretches.map(() => 0);
  const groups: Omit<Placed, "at">[][] = stretches.map(() => []);
  const missing: Omit<Placed, "at">[] = [];
  let k = 0;
  for (const it of items) {
    const j = stretches.findIndex(([a, b], i) => i >= k && used[i]! + it.item.width <= b - a + 1e-6);
    if (j < 0) {
      missing.push(it);
      continue;
    }
    k = j;
    used[j]! += it.item.width;
    groups[j]!.push(it);
  }
  const placed: Placed[] = [];
  const gaps: [number, number][] = [];
  stretches.forEach(([a, b], i) => {
    const group = groups[i]!;
    const left = b - a - used[i]!;
    // Columns at the ends of a stretch stay against them: what is left goes between them and the others.
    const tall = (it: Omit<Placed, "at">) => it.entry.kind === "tall";
    let lead = 0;
    while (lead < group.length && tall(group[lead]!)) lead++;
    let trail = group.length;
    while (trail > lead && tall(group[trail - 1]!)) trail--;
    const before = rest === "start" ? left : rest === "both" ? left / 2 : 0;
    let at = a;
    group.forEach((it, k) => {
      const gap = (k === lead ? before : 0) + (k === trail ? left - before : 0);
      if (gap > 1e-6) gaps.push([at, at + gap]);
      at += gap;
      placed.push({ ...it, at });
      at += it.item.width;
    });
    const end = (lead === group.length ? before : 0) + (trail === group.length ? left - before : 0);
    if (end > 1e-6) gaps.push([at, at + end]);
  });
  return { placed, gaps, missing };
}

type Heights = { worktop: number; wallBottom: number; wallTop: number };

/** The two rows packed: the base row (and the columns), then the wall row around the columns. */
function packedRows(g: RunGeometry, items: readonly KitchenRunItem[], heights: Heights) {
  const all = items.map((item) => {
    const entry = itemEntry(item);
    return { item, entry, row: rowOf(entry) };
  });
  const stretches = rowStretches(g, g.base, 0, heights.worktop);
  // « Contre les murs »: the rest at the ends with a corner unit, which then moves into it, off the wall.
  const [ml, mr] = g.movable ?? [false, false];
  const rest: Exclude<RestSide, "walls"> = g.rest !== "walls" ? g.rest : ml && mr ? "both" : ml ? "start" : mr ? "end" : g.ends[0] !== "free" && g.ends[1] !== "free" ? "both" : g.ends[0] !== "free" ? "start" : "end";
  const base = pack(stretches, all.filter((i) => i.row === "base"), rest);
  const columns = base.placed.filter((p) => p.entry.kind === "tall").map((p) => ({ from: p.at, to: p.at + p.item.width, what: p.entry.name, bottom: 0, top: Infinity }));
  const high = g.wall ? rowStretches(g, g.wall, heights.wallBottom, heights.wallTop).flatMap(([a, b]) => freeStretches(columns, a, b, 0, 1)) : [];
  const highs = all.filter((i) => i.row === "wall");
  const wall = g.wall ? pack(high, highs, rest) : { placed: [], gaps: [], missing: highs };
  return { stretches, base, wall, ml, mr };
}

/**
 * The items with each unit that finds no room put in the room kept free in its row (an « Espace libre » no furnished
 * caisson holds), the first where it then stands: the unit takes its place there, the space keeps what is left of it
 * (a narrower space goes whole, the unit taking the open room beside it too). The same array when nothing moves.
 */
export function settledItems(g: RunGeometry, items: readonly KitchenRunItem[], heights: Heights): readonly KitchenRunItem[] {
  let list = items;
  const tried = new Set<string>();
  for (let guard = 0; guard <= items.length; guard++) {
    const { base, wall } = packedRows(g, list, heights);
    const m = [...base.missing, ...wall.missing].find((x) => !isSpace(x.item) && !tried.has(x.item.id));
    if (!m) break;
    tried.add(m.item.id);
    const out = new Set([...base.missing, ...wall.missing].map((x) => x.item.id));
    for (const space of list.filter((i) => isSpace(i) && !i.furnished && rowOf(itemEntry(i)) === m.row)) {
      // In its place, the space keeping what is left of it; with the open room beside it when it is narrower.
      const left = space.width - m.item.width;
      const others = list.filter((i) => i !== m.item);
      const at = others.indexOf(space);
      const moved = [...others.slice(0, at), m.item, ...(left >= 1 ? [{ ...space, width: left }] : []), ...others.slice(at + 1)];
      const again = packedRows(g, moved, heights);
      // It stands now, and nothing that stood is pushed out.
      if ([...again.base.missing, ...again.wall.missing].some((x) => x.item.id === m.item.id || !out.has(x.item.id))) continue;
      list = moved;
      break;
    }
  }
  return list;
}

/**
 * A run's items at their place: the base row (and the columns), then the wall row around the columns. A unit with no
 * room left takes the room kept free (`settledItems`): `items` gives them in that order.
 */
export function fillRun(g: RunGeometry, given: readonly KitchenRunItem[], heights: Heights): RunFill {
  const items = settledItems(g, given, heights);
  const { stretches, base, wall, ml, mr } = packedRows(g, items, heights);
  const walls: [number, number] = [0, 0];
  if (g.rest === "walls" && base.placed.length) {
    const at = (x: number) => base.gaps.findIndex(([a, b]) => Math.abs((x === g.base[0] ? a : b) - x) < 1e-6);
    for (const [i, edge, ok] of [[0, g.base[0], ml], [1, g.base[1], mr]] as const) {
      const k = ok ? at(edge) : -1;
      if (k < 0) continue;
      const [a, b] = base.gaps[k]!;
      walls[i] = b - a;
      base.gaps.splice(k, 1);
    }
  }
  const problems: string[] = [];
  const most = Math.max(0, ...base.gaps.map(([a, b]) => b - a));
  for (const m of base.missing) problems.push(`${m.entry.name} ${cm(m.item.width)} ne tient pas : ${most >= 1 ? `il reste ${cm(most)} au plus` : "le mur est plein"}.`);
  for (const m of wall.missing) problems.push(g.wall ? `${m.entry.name} ${cm(m.item.width)} ne tient pas en haut.` : g.low ? `${m.entry.name} : le plafond est trop bas pour des meubles hauts.` : `${m.entry.name} : pas de mur derrière pour un meuble haut.`);
  // A filler closes a narrow rest beside what stands — a unit, a caisson furnished by hand, a corner — never between
  // two places kept free, nor at a free end past one: that room is left open.
  const stands = (x: number) => base.placed.some((pl) => (!isSpace(pl.item) || !!pl.item.furnished) && (Math.abs(pl.at - x) < 1e-6 || Math.abs(pl.at + pl.item.width - x) < 1e-6)) || g.ends.some((end, i) => end !== "free" && Math.abs(g.base[i]! - x) < 1e-6);
  const narrow = base.gaps.filter(([a, b]) => b - a >= MIN_FILLER && b - a <= WIDE_FILLER);
  const fillers = narrow.filter(([a, b]) => stands(a) || stands(b));
  // The room kept free stays open, whatever its width: nothing stands there, it is not closed by a filler.
  const spaced: Placed[] = [];
  const kept = (row: Placed[]) => {
    spaced.push(...row.filter((pl) => isSpace(pl.item)));
    const spaces = row.filter((pl) => isSpace(pl.item)).map((pl): [number, number] => [pl.at, pl.at + pl.item.width]);
    row.splice(0, row.length, ...row.filter((pl) => !isSpace(pl.item)));
    return spaces;
  };
  const free = joined([...base.gaps.filter(([a, b]) => b - a > WIDE_FILLER), ...narrow.filter((gap) => !fillers.includes(gap)), ...kept(base.placed)]);
  const wallFree = joined([...wall.gaps.filter(([a, b]) => b - a > WIDE_FILLER), ...kept(wall.placed)]);
  const placed = [...base.placed, ...wall.placed];
  problems.push(...constraints(placed, g, stretches));
  return { placed, fillers, free, wallFree, walls, stretches, spaces: spaced, items: items as KitchenRunItem[], missing: [...base.missing, ...wall.missing].map((m) => m.item), problems };
}

/** Stretches side by side made one, in their order. */
function joined(stretches: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of [...stretches].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** The room left open in a row (`gaps`: its free stretches), less the room furnished caissons hold: they stand there. */
export function openRoom(fill: Pick<RunFill, "free" | "wallFree" | "spaces">, row: "base" | "wall", gaps: readonly [number, number][] = row === "wall" ? fill.wallFree : fill.free): [number, number][] {
  const kept = fill.spaces.filter((pl) => pl.row === row && pl.item.furnished).map((pl): [number, number] => [pl.at, pl.at + pl.item.width]);
  return gaps.flatMap(([a, b]) => {
    let parts: [number, number][] = [[a, b]];
    for (const [k0, k1] of kept) parts = parts.flatMap(([p0, p1]): [number, number][] => (k1 <= p0 || k0 >= p1 ? [[p0, p1]] : [[p0, Math.max(p0, k0)], [Math.min(p1, k1), p1]]));
    return parts.filter(([p0, p1]) => p1 - p0 >= 1);
  });
}

/**
 * The widest room left open in a row of a filled run (mm), for a unit put there: the open stretches, those a filler
 * closes and the room kept free, not the room a furnished caisson holds; 0 when the row is full.
 */
export function widestRoom(fill: Pick<RunFill, "free" | "wallFree" | "fillers" | "spaces">, row: "base" | "wall"): number {
  return Math.max(0, ...openRoom(fill, row, row === "wall" ? fill.wallFree : [...fill.free, ...fill.fillers]).map(([a, b]) => b - a));
}

/** The room left on a run, in words: « 137,1 cm libres en bas, 60 cm + 120 cm en haut ». */
export function spaceLeft(fill: Pick<RunFill, "free" | "wallFree" | "spaces">, length: (mm: number) => string, wall = true): string {
  const list = (gaps: [number, number][]) => gaps.map(([a, b]) => length(b - a)).join(" + ");
  const [low, high] = [openRoom(fill, "base"), openRoom(fill, "wall")];
  const base = low.length ? `${list(low)} libres en bas` : "le bas est plein";
  if (!wall) return base;
  return `${base}, ${high.length ? `${list(high)} en haut` : "le haut est plein"}`;
}

/** What the appliances of a run want: the hood over the hob, worktop on both sides of the hob, the dishwasher by the sink. */
function constraints(placed: Placed[], g: RunGeometry, stretches: [number, number][]): string[] {
  const out: string[] = [];
  const role = (p: Placed) => applianceOf(p.item)?.role;
  const base = placed.filter((p) => p.row === "base").sort((a, b) => a.at - b.at);
  const hobs = base.filter((p) => role(p) === "hob" || role(p) === "hob-oven");
  const mid = (p: Placed) => p.at + p.item.width / 2;
  const windowOver = (p: Placed) => g.spans.some((s) => s.bottom > 0 && Math.min(s.to, p.at + p.item.width) - Math.max(s.from, p.at) > p.item.width / 2);
  for (const hood of placed.filter((p) => role(p) === "hood")) if (!hobs.some((h) => mid(h) > hood.at && mid(h) < hood.at + hood.item.width)) out.push("La hotte n'est pas au-dessus d'une plaque.");
  for (const hob of hobs) {
    const i = base.indexOf(hob);
    const stretch = stretches.find(([a, b]) => hob.at >= a - 1e-6 && hob.at + hob.item.width <= b + 1e-6) ?? g.base;
    const tall = [base[i - 1], base[i + 1]].some((n) => n?.entry.kind === "tall" && (Math.abs(n.at + n.item.width - hob.at) < 1 || Math.abs(hob.at + hob.item.width - n.at) < 1));
    // At a corner the worktop goes on round it.
    const short = (side: number, room: number) => room < HOB_SIDE && !(Math.abs(stretch[side]! - g.base[side]!) < 1e-6 && g.ends[side] !== "free");
    if (tall || short(0, hob.at - stretch[0]) || short(1, stretch[1] - hob.at - hob.item.width)) out.push("Gardez au moins 30 cm de plan de chaque côté de la plaque (pas contre une colonne ni au bout du plan).");
    if (windowOver(hob)) out.push("La plaque est sous une fenêtre : le rideau et le courant d'air gênent la cuisson.");
  }
  const sinks = base.filter((p) => role(p) === "sink");
  for (const dw of base.filter((p) => role(p) === "dishwasher")) {
    const i = base.indexOf(dw);
    if (!sinks.length || ![base[i - 1], base[i + 1]].some((n) => n && role(n) === "sink")) out.push("Le lave-vaisselle n'est pas à côté de l'évier.");
  }
  for (const col of base.filter((p) => p.entry.kind === "tall")) if (windowOver(col)) out.push(`${col.entry.name} est devant une fenêtre.`);
  return [...new Set(out)];
}
