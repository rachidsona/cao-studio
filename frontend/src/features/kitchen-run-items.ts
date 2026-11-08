/**
 * Ce qu'on pose sur un linéaire de cuisine, en nombres : les meubles du catalogue (document/kitchen-catalog.ts), ses propres
 * meubles, et l'électroménager, des meubles « à contraintes » — l'évier et la plaque découpent le plan de travail, le
 * lave-vaisselle et la hotte n'ont pas de caisson, la hotte va au-dessus de la plaque, la plaque garde du plan de chaque
 * côté. Puis leur place sur le mur : de gauche à droite dans chaque rangée (en bas les bas et les colonnes, en haut les
 * hauts, la hotte et le micro-ondes), entre les angles, les portes, les fenêtres et les colonnes ; ce qui reste d'une
 * rangée basse va aux fileurs, au bout ou au début du mur. Pur.
 */
import { CATALOG, type CatalogEntry, type UnitKind } from "../document/kitchen-catalog";
import { rowStretches, type RunGeometry } from "../document/kitchen-plan-shapes";
import type { KitchenRunItem } from "../document/types";
import { freeStretches } from "./room-runs";

/** The widths a unit is sold in (mm). */
export const WIDTHS = [300, 400, 450, 500, 600, 800, 900, 1000, 1200];

export type Role = "sink" | "dishwasher" | "hob" | "hob-oven" | "oven" | "fridge" | "oven-column" | "hood" | "microwave";

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
  { model: "app-oven-column", role: "oven-column", name: "Colonne four", kind: "tall", widths: [600], cabinet: { layout: "none", shelves: 1 } },
  { model: "app-hood", role: "hood", name: "Hotte", kind: "wall", widths: [600, 900], cabinet: null },
  { model: "app-microwave", role: "microwave", name: "Micro-ondes", kind: "wall", widths: [600], cabinet: { layout: "none", shelves: 0 } },
];

/** « base-bas-1-porte-600 » → « base-bas-1-porte ». */
export const modelOf = (entry: CatalogEntry): string => entry.id.replace(/-\d+$/, "");

export const applianceOf = (item: Pick<KitchenRunItem, "model">): ApplianceModel | undefined => APPLIANCES.find((a) => a.model === item.model);

/** What an item is, at its width: its catalogue entry (made at that width when the catalogue has not got it). */
export function itemEntry(item: KitchenRunItem): CatalogEntry {
  if (item.own) return { ...item.own, width: item.width };
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

/** The models one adds to a run, by family: those of the catalogue (one per name), then the appliances. */
export function runModels(): { model: string; name: string; kind: UnitKind; widths: number[]; appliance: boolean }[] {
  const names = [...new Set(CATALOG.map((e) => modelOf(e)))];
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

/** An item at its place: along the run from its left (mm), in its row. */
export interface Placed {
  item: KitchenRunItem;
  entry: CatalogEntry;
  row: "base" | "wall";
  at: number;
}

/** A run filled: what stands where, the fillers of the base row, what does not fit, and what to look at. */
export interface RunFill {
  placed: Placed[];
  fillers: [number, number][];
  /** The free stretches of the base row. */
  stretches: [number, number][];
  missing: KitchenRunItem[];
  problems: string[];
}

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;
/** A filler wider than this is a unit missing (mm). */
const WIDE_FILLER = 150;
const MIN_FILLER = 3;
const HOB_SIDE = 300;

/** The items of a row in its stretches, in their order, each where the one before ends; the rest at the end, the start, or both. */
function pack(stretches: [number, number][], items: Omit<Placed, "at">[], rest: RunGeometry["rest"]): { placed: Placed[]; gaps: [number, number][]; missing: Omit<Placed, "at">[] } {
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

/** A run's items at their place: the base row (and the columns), then the wall row around the columns. */
export function fillRun(g: RunGeometry, items: readonly KitchenRunItem[], heights: { worktop: number; wallBottom: number; wallTop: number }): RunFill {
  const all = items.map((item) => {
    const entry = itemEntry(item);
    return { item, entry, row: rowOf(entry) };
  });
  const stretches = rowStretches(g, g.base, 0, heights.worktop);
  const base = pack(stretches, all.filter((i) => i.row === "base"), g.rest);
  const columns = base.placed.filter((p) => p.entry.kind === "tall").map((p) => ({ from: p.at, to: p.at + p.item.width, what: p.entry.name, bottom: 0, top: Infinity }));
  const high = g.wall ? rowStretches(g, g.wall, heights.wallBottom, heights.wallTop).flatMap(([a, b]) => freeStretches(columns, a, b, 0, 1)) : [];
  const walls = all.filter((i) => i.row === "wall");
  const wall = g.wall ? pack(high, walls, g.rest) : { placed: [], gaps: [], missing: walls };
  const problems: string[] = [];
  const free = Math.max(0, ...base.gaps.map(([a, b]) => b - a));
  for (const m of base.missing) problems.push(`${m.entry.name} ${cm(m.item.width)} ne tient pas : ${free >= 1 ? `il reste ${cm(free)} au plus` : "le mur est plein"}.`);
  for (const m of wall.missing) problems.push(g.wall ? `${m.entry.name} ${cm(m.item.width)} ne tient pas en haut.` : g.low ? `${m.entry.name} : le plafond est trop bas pour des meubles hauts.` : `${m.entry.name} : pas de mur derrière pour un meuble haut.`);
  const fillers = base.gaps.filter(([a, b]) => b - a >= MIN_FILLER);
  for (const [a, b] of fillers) if (b - a > WIDE_FILLER) problems.push(`Fileur de ${cm(b - a)} : un meuble de plus le comblerait.`);
  const placed = [...base.placed, ...wall.placed];
  problems.push(...constraints(placed, g, stretches));
  return { placed, fillers, stretches, missing: [...base.missing, ...wall.missing].map((m) => m.item), problems };
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
