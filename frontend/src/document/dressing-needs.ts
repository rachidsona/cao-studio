/**
 * Le dressing rempli d'après les besoins du client : des mètres de penderie, des paires de chaussures, des tiroirs, des
 * mètres d'étagères deviennent des modules répartis dans les zones libres du plan, chacun à sa largeur usuelle ; ce qui
 * reste de place va à des étagères, ce qui ne tient pas est annoncé, et le bilan compare ce que le dressing range à ce
 * qui était demandé. Les penderies vont aux bouts d'un mur, les tiroirs au milieu, loin des angles qui les bloqueraient.
 * Pur.
 */
import { MODULES, moduleSizes, withModules, type ModuleKind } from "./dressing-modules";
import { type FillChoice, withZonePartition } from "./plan-layout";
import type { PlanZone } from "./plan-shapes";
import type { CadDocument, DressingPlan, SketchFeature } from "./types";
import { leafNiches } from "../sketcher/partition-history";

export interface DressingNeeds {
  /** Metres of rod for long clothes, then for short ones. */
  longRod: number;
  shortRod: number;
  /** Pairs of shoes. */
  shoes: number;
  drawers: number;
  /** Metres of shelf for folded clothes. */
  shelves: number;
}

export const NO_NEEDS: DressingNeeds = { longRod: 0, shortRod: 0, shoes: 0, drawers: 0, shelves: 0 };

/** The width of a pair of shoes on a shelf (mm). */
const PAIR = 220;
const { drawers: MODULE_DRAWERS, drawerZone: DRAWER_ZONE, spacing: SHELF_HEIGHT } = moduleSizes("drawers");
const SHOE_HEIGHT = moduleSizes("shoes").spacing;
/** Left to right along a wall. */
/** The need a module is for (what it was asked for). */
const NEED: Record<ModuleKind, keyof DressingNeeds | null> = { long: "longRod", double: "shortRod", drawers: "drawers", shoes: "shoes", shelves: "shelves", "rod-drawers": "drawers", trousers: null };
const PLACE: Record<ModuleKind, number> = { long: 0, shelves: 1, drawers: 2, "rod-drawers": 2, shoes: 3, trousers: 3, double: 4 };

/** What a module of this width and this inside height holds. */
function holds(kind: ModuleKind, width: number, inner: number): DressingNeeds {
  const shelves = (height: number, spacing: number) => Math.max(0, Math.floor(height / spacing));
  if (kind === "long") return { ...NO_NEEDS, longRod: width / 1000 };
  if (kind === "double") return { ...NO_NEEDS, shortRod: (2 * width) / 1000 };
  if (kind === "rod-drawers") return { ...NO_NEEDS, shortRod: width / 1000, drawers: MODULE_DRAWERS };
  if (kind === "drawers") return { ...NO_NEEDS, drawers: MODULE_DRAWERS, shelves: (width * shelves(inner - DRAWER_ZONE, SHELF_HEIGHT)) / 1000 };
  if (kind === "shoes") return { ...NO_NEEDS, shoes: shelves(inner, SHOE_HEIGHT) * Math.floor(width / PAIR) };
  if (kind === "shelves") return { ...NO_NEEDS, shelves: (width * shelves(inner, SHELF_HEIGHT)) / 1000 };
  return NO_NEEDS;
}

export interface NeedsProposal {
  /** By free zone, the modules from left to right. */
  zones: { zone: PlanZone; kinds: ModuleKind[] }[];
  /** Asked and held, need by need. */
  report: { label: string; asked: number; held: number; unit: string }[];
  /** Modules that found no place, for a need the others do not cover. */
  left: ModuleKind[];
}

const LABELS: [keyof DressingNeeds, string, string][] = [["longRod", "Penderie longue", "m"], ["shortRod", "Penderie courte", "m"], ["shoes", "Chaussures", "paires"], ["drawers", "Tiroirs", ""], ["shelves", "Étagères", "m"]];

/** What these zones of this plan can hold of these needs. */
export function proposeNeeds(needs: DressingNeeds, plan: DressingPlan, free: readonly PlanZone[]): NeedsProposal {
  const inner = plan.height - plan.plinth - 2 * plan.thickness;
  const share = (kind: ModuleKind) => MODULES[kind].share;
  const each = (need: number, kind: ModuleKind, unit: keyof DressingNeeds) => Array.from({ length: Math.ceil(need / holds(kind, share(kind), inner)[unit] - 1e-9) }, () => kind);
  const asked = [each(needs.longRod, "long", "longRod"), each(needs.shortRod, "double", "shortRod"), each(needs.drawers, "drawers", "drawers"), each(needs.shoes, "shoes", "shoes"), each(needs.shelves, "shelves", "shelves")];
  const inTurn = Array.from({ length: Math.max(...asked.map((a) => a.length)) }, (_, turn) => asked.flatMap((a) => a[turn] ?? [])).flat();
  const pack = (order: ModuleKind[]) => {
    const room = [...free].sort((a, b) => b.run.length - a.run.length).map((zone) => ({ zone, kinds: [] as ModuleKind[], left: zone.run.length - plan.thickness }));
    const left: ModuleKind[] = [];
    for (const kind of order) {
      const place = room.find((r) => r.left >= share(kind) + plan.thickness);
      if (!place) left.push(kind);
      else {
        place.kinds.push(kind);
        place.left -= share(kind) + plan.thickness;
      }
    }
    return { room, left };
  };
  // The widest first fit the most; when they cannot all fit, one of each need in turn shares the lack of room out.
  const widest = pack([...inTurn].sort((a, b) => share(b) - share(a)));
  const { room, left } = widest.left.length ? pack(inTurn) : widest;
  for (const place of room) while (place.left >= share("shelves") + plan.thickness) {
    place.kinds.push("shelves");
    place.left -= share("shelves") + plan.thickness;
  }
  const zones = room.filter((r) => r.kinds.length).map(({ zone, kinds }) => ({ zone, kinds: [...kinds].sort((a, b) => PLACE[a] - PLACE[b]) }));
  const held = { ...NO_NEEDS };
  for (const { zone, kinds } of zones) {
    const total = kinds.reduce((sum, k) => sum + share(k), 0);
    const free = zone.run.length - (kinds.length + 1) * plan.thickness;
    for (const kind of kinds) {
      const has = holds(kind, (share(kind) / total) * free, inner);
      for (const key of Object.keys(held) as (keyof DressingNeeds)[]) held[key] += has[key];
    }
  }
  // The widened modules may hold what one that found no place was for: only the lack still there is announced.
  const lacking = left.filter((kind, i) => {
    const unit = NEED[kind];
    const before = left.slice(0, i).filter((k) => k === kind).length;
    return !unit || held[unit] + before * holds(kind, share(kind), inner)[unit] < needs[unit] - 1e-9;
  });
  return { zones, left: lacking, report: LABELS.filter(([key]) => needs[key] > 0).map(([key, label, unit]) => ({ label, asked: needs[key], held: held[key], unit })) };
}

/** The proposal built: a Répartition for each zone, a module in each of its cases. A string: why it cannot be. */
export function withNeeds(base: CadDocument, planId: string, proposal: NeedsProposal, thickness: number): CadDocument | string {
  let doc = base;
  for (const { zone, kinds } of proposal.zones) {
    const fill: FillChoice = { label: "", cases: kinds.map((k) => MODULES[k].share), rest: null, filler: false };
    const made = withZonePartition(doc, planId, zone, fill);
    if (typeof made === "string") return `${zone.label} : ${made}`;
    doc = made.doc;
    for (const [i, kind] of kinds.entries()) {
      const sketch = doc.features.find((f): f is SketchFeature => f.id === made.sketch && f.type === "sketch");
      const leaf = sketch && leafNiches(sketch).find((n) => n.path.length === 1 && n.path[0] === i);
      if (!leaf) return `${zone.label} : la case ${i + 1} n'existe pas.`;
      const next = withModules(doc, made.sketch, [leaf], kind, thickness, moduleSizes(kind));
      if (typeof next === "string") return `${zone.label}, case ${i + 1} : ${next}`;
      doc = next;
    }
  }
  return doc;
}
