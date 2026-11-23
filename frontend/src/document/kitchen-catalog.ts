/**
 * Les meubles de cuisine qu'on ajoute un par un, pris dans une liste (bas, hauts, colonnes, aux largeurs du commerce),
 * et leur glissé dans la vue, en pur. Un meuble ajouté est un caisson ordinaire avec ses façades, construit comme son
 * voisin (épaisseurs, fond, standard, façades et leur matière) : à droite du caisson choisi quand il est de la même
 * sorte, au-dessus ou à côté de lui sinon, à la première place libre le long du même mur, son fond sur le même plan.
 * Sans caisson dans le projet, il part de l'origine, devant le mur Y = 0 (comme l'Implantation). On y ajoute ses
 * propres meubles : décrits (nom, sorte, cotes, façades, étagères) ou repris d'un caisson du projet.
 */
import type { CaissonSpec } from "./caisson-spec";
import { cabinetPartNames, cabinetProblem } from "../features/cabinet-parts";
import { frontsMaterials } from "../features/fronts-parts";
import { WALL_UNIT } from "../features/kitchen-layout";
import { uniqueId } from "./operations";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontStyle, type FrontsFeature, type Vec3 } from "./types";

export type UnitKind = "base" | "wall" | "tall";

export interface CatalogEntry {
  id: string;
  kind: UnitKind;
  name: string;
  width: number;
  layout: FrontsFeature["layout"] | "none";
  drawers?: number;
  shelves: number;
  /** Upright boards inside, evenly spaced. */
  dividers?: number;
  /** Two rails instead of a top: the sink goes through. */
  top?: CabinetFeature["top"];
  /** One door hinged along its top (« top »: a lift-up door, « relevante ») or its bottom (« bottom »: a flap). */
  side?: "top" | "bottom";
  /** Its fronts' style when not plain: glazed in an aluminium frame (a « vitré »). */
  facade?: FrontStyle;
  /** Door(s) under a drawer: the drawer front's height (mm); English drawers behind the door(s): how many. */
  topDrawer?: number;
  innerDrawers?: number;
  /** A rounded end unit: open, its shelves a quarter round towards the end of its row (document/kitchen-shaped.ts). */
  round?: boolean;
  /** Height when not the kind's own (a short unit over the hood). */
  height?: number;
  /**
   * A casquette caisson (« sur-meuble »): set on top of the unit chosen — a wall unit, a column — instead of beside it,
   * its bottom at the top of the wall row. Not offered in the Plan de cuisine, which has its own casquette.
   */
  above?: boolean;
  /** One's own units: their depth and plinth, and their name kept as it is (no width after it). */
  depth?: number;
  plinth?: number;
  custom?: boolean;
  /** One of « Mes caissons »: the caisson it makes, its inside furnished (document/caisson-spec.ts). */
  caisson?: CaissonSpec;
}

/** Height, depth, plinth and floor-to-bottom of each kind (those of the Implantation). */
export const KINDS: Record<UnitKind, { label: string; height: number; depth: number; plinth: number; z: number }> = {
  base: { label: "Meubles bas", height: 870, depth: 560, plinth: 150, z: 0 },
  wall: { label: "Meubles hauts", height: WALL_UNIT.height, depth: WALL_UNIT.depth, plinth: 0, z: WALL_UNIT.bottom },
  tall: { label: "Colonnes", height: WALL_UNIT.bottom + WALL_UNIT.height, depth: 560, plinth: 150, z: 0 },
};

/** « Bas 1 porte » → « bas-1-porte », « Bas évier » → « bas-evier ». */
const slug = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

const entries = (kind: UnitKind, name: string, widths: number[], rest: Omit<CatalogEntry, "id" | "kind" | "name" | "width">): CatalogEntry[] =>
  widths.map((width) => ({ id: `${kind}-${slug(name)}-${width}`, kind, name, width, ...rest }));

/**
 * The units of the trade (Nobilia, IKEA Metod, Lapeyre, Foussier Rapido catalogues, 2024–2026), at their usual widths:
 * those a caisson and its fronts make — doors, drawers, a lift-up door, glazed fronts, open shelves. A pull-out (bottles,
 * spices, bin, larder) is a door on its caisson here, its fitting bought (Kesseböhmer, Blum…), out of the cut list.
 */
export const CATALOG: CatalogEntry[] = [
  ...entries("base", "Bas 1 porte", [150, 200, 300, 400, 450, 500, 600], { layout: "door", shelves: 1 }),
  ...entries("base", "Bas 2 portes", [800, 900, 1000, 1200], { layout: "doors", shelves: 1 }),
  ...entries("base", "Bas 3 tiroirs", [400, 500, 600, 800, 900], { layout: "drawers", drawers: 3, shelves: 0 }),
  ...entries("base", "Bas 4 tiroirs", [300, 400, 500, 600, 800, 900], { layout: "drawers", drawers: 4, shelves: 0 }),
  ...entries("base", "Bas 5 tiroirs", [400, 600], { layout: "drawers", drawers: 5, shelves: 0 }),
  ...entries("base", "Bas casseroliers", [600, 800, 900], { layout: "drawers", drawers: 2, shelves: 0 }),
  ...entries("base", "Bas tiroir et porte", [300, 400, 450, 500, 600], { layout: "door", shelves: 1, topDrawer: 150 }),
  ...entries("base", "Bas tiroir et 2 portes", [800, 900, 1000, 1200], { layout: "doors", shelves: 1, topDrawer: 150 }),
  ...entries("base", "Bas tiroirs à l'anglaise", [400, 500, 600, 800, 900], { layout: "doors", shelves: 0, innerDrawers: 3 }),
  ...entries("base", "Bas évier", [600, 800, 1200], { layout: "doors", shelves: 0, top: "rails" }),
  ...entries("base", "Bas four", [600], { layout: "none", shelves: 0 }),
  ...entries("base", "Bas coulissant bouteilles et épices", [150, 200, 300, 400], { layout: "door", shelves: 3 }),
  ...entries("base", "Bas poubelle coulissante", [300, 400, 450, 500, 600], { layout: "door", shelves: 0 }),
  ...entries("base", "Bas ouvert", [150, 200, 300, 400, 600], { layout: "none", shelves: 2 }),
  ...entries("base", "Bas terminal arrondi", [300, 400, 560], { layout: "none", shelves: 1, round: true }),
  ...entries("wall", "Haut 1 porte", [200, 300, 400, 450, 500, 600], { layout: "door", shelves: 2 }),
  ...entries("wall", "Haut 2 portes", [800, 900, 1000, 1200], { layout: "doors", shelves: 2 }),
  ...entries("wall", "Haut vitré", [300, 400, 450, 500, 600, 800, 900, 1000], { layout: "doors", shelves: 2, facade: { style: "glass" } }),
  ...entries("wall", "Haut relevant", [600, 800, 900, 1000, 1200], { layout: "door", side: "top", shelves: 1 }),
  ...entries("wall", "Haut relevant bas", [600, 800, 900, 1200], { layout: "door", side: "top", shelves: 0, height: 360 }),
  ...entries("wall", "Haut égouttoir", [600, 800, 900], { layout: "doors", shelves: 1 }),
  ...entries("wall", "Haut ouvert", [150, 200, 300, 400, 600, 800], { layout: "none", shelves: 2 }),
  ...entries("wall", "Haut terminal arrondi", [300, 350], { layout: "none", shelves: 1, round: true }),
  ...entries("wall", "Haut sur hotte", [600, 900], { layout: "door", shelves: 0, height: 350 }),
  ...entries("wall", "Casquette relevante", [300, 400, 450, 500, 600, 800, 900, 1000, 1200], { layout: "door", side: "top", shelves: 0, height: 350, above: true }),
  ...entries("wall", "Casquette sur colonne", [400, 450, 500, 600], { layout: "door", side: "top", shelves: 0, height: 350, depth: 560, above: true }),
  ...entries("tall", "Colonne rangement", [400, 450, 500, 600], { layout: "doors", shelves: 4 }),
  ...entries("tall", "Colonne garde-manger", [300, 400, 450, 500, 600], { layout: "door", shelves: 5 }),
  ...entries("tall", "Colonne coulissante étroite", [150, 200, 300, 400], { layout: "door", shelves: 5 }),
  ...entries("tall", "Colonne balais", [400, 450, 500, 600], { layout: "door", shelves: 1 }),
  ...entries("tall", "Colonne vitrine", [400, 450, 500, 600], { layout: "door", shelves: 4, facade: { style: "glass" } }),
  ...entries("tall", "Colonne four", [600], { layout: "none", shelves: 1 }),
  ...entries("tall", "Colonne réfrigérateur", [600], { layout: "door", shelves: 0 }),
];
// A single door that wide would not open well: two.
for (const e of CATALOG) if (e.layout === "doors" && e.width < 600) e.layout = "door";

/** Along the width (its left to its right) and towards its back, for a cabinet turned this way. */
export function cabinetAxes(rotation: number): { along: [number, number]; back: [number, number] } {
  const r = (((rotation % 360) + 360) % 360) / 90;
  const along: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  return { along: along[r]!, back: along[(r + 1) % 4]! };
}

/** The box a cabinet fills, in the model (turned with it). */
export function cabinetBox(c: Pick<CabinetFeature, "origin" | "width" | "depth" | "height" | "rotation">): [Vec3, Vec3] {
  const { along, back } = cabinetAxes(c.rotation ?? 0);
  const xs = [0, c.width].flatMap((a) => [0, c.depth].map((d) => c.origin[0] + along[0] * a + back[0] * d));
  const ys = [0, c.width].flatMap((a) => [0, c.depth].map((d) => c.origin[1] + along[1] * a + back[1] * d));
  return [
    [Math.min(...xs), Math.min(...ys), c.origin[2]],
    [Math.max(...xs), Math.max(...ys), c.origin[2] + c.height],
  ];
}

/** The kind of an existing cabinet, from where it stands and how tall it is. */
export function kindOf(c: CabinetFeature): UnitKind {
  if (c.origin[2] >= 600) return "wall";
  return c.height >= 1500 ? "tall" : "base";
}

/** The same cabinet turned a quarter to the left about the middle of its footprint. */
export function turnCabinet(c: CabinetFeature): CabinetFeature {
  const rotation = (((c.rotation ?? 0) + 90) % 360) as NonNullable<CabinetFeature["rotation"]>;
  const half = (rot: number) => {
    const { along, back } = cabinetAxes(rot);
    return [0, 1].map((i) => (along[i]! * c.width + back[i]! * c.depth) / 2);
  };
  const [a, b] = [half(c.rotation ?? 0), half(rotation)];
  const origin: Vec3 = [Math.round(c.origin[0] + a[0]! - b[0]!), Math.round(c.origin[1] + a[1]! - b[1]!), c.origin[2]];
  return { ...c, origin, rotation };
}

const overlaps = (a: [Vec3, Vec3], b: [Vec3, Vec3]) => [0, 1, 2].every((i) => a[0][i]! < b[1][i]! - 0.5 && b[0][i]! < a[1][i]! - 0.5);

/** A new cabinet of this entry and its fronts beside `anchor` (else the last cabinet), built as it is. */
export function addKitchenUnit(doc: CadDocument, entry: CatalogEntry, anchorId?: string): { doc: CadDocument; cabinet: CabinetFeature; fronts: FrontsFeature | null } {
  const cabinets = doc.features.filter((f): f is CabinetFeature => f.type === "cabinet" && !f.suppressed);
  const anchor = cabinets.find((c) => c.id === anchorId) ?? cabinets.at(-1);
  const k = KINDS[entry.kind];
  const height = entry.height ?? k.height;
  const depth = entry.depth ?? k.depth;
  const rotation = anchor?.rotation ?? 0;
  const { along, back } = cabinetAxes(rotation);
  // Beside the last of its kind along the anchor's wall; over (or beside) the anchor when of another kind.
  const sameWall = cabinets.filter((c) => (c.rotation ?? 0) === rotation);
  // A casquette caisson goes over the unit chosen (beside it when that one is a casquette too), on the wall row's top.
  const z = entry.above ? k.z + k.height : entry.kind === "wall" && entry.height ? k.z + k.height - height : k.z;
  const neighbour = anchor && kindOf(anchor) === entry.kind && (!entry.above || anchor.origin[2] >= z - 1) ? anchor : null;
  let start = neighbour ? neighbour.width : 0;
  const at = (s: number): Vec3 => {
    const base = anchor ? anchor.origin : ([0, 0, 0] as Vec3);
    // The origin is the front-left corner: the back plane, less the depth, then along the wall.
    const across = anchor ? [0, 1].map((i) => base[i]! + back[i]! * (anchor.depth - depth)) : [0, -depth];
    return [Math.round(across[0]! + along[0] * s), Math.round(across[1]! + along[1] * s), z];
  };
  const box = (s: number) => cabinetBox({ origin: at(s), width: entry.width, depth, height, rotation });
  // The first free place along the wall: past each cabinet in the way.
  for (let guard = 0; guard < cabinets.length + 1; guard++) {
    const hit = sameWall.find((c) => overlaps(box(start), cabinetBox(c)));
    if (!hit) break;
    const [lo, hi] = cabinetBox(hit);
    const ends = [lo, hi].map((p) => [0, 1].reduce((sum, i) => sum + (p[i]! - (anchor?.origin[i] ?? 0)) * along[i]!, 0));
    start = Math.max(...ends);
  }
  const like = anchor ?? null;
  const cabinet: CabinetFeature = {
    id: uniqueId(doc, "cb"), type: "cabinet", name: uniqueKitchenName(doc, entry), origin: at(start), width: entry.width, height, depth,
    thickness: like?.thickness ?? 18, back: like?.back ?? "applied", backThickness: like?.backThickness ?? 3, shelves: entry.shelves, ...(entry.dividers ? { dividers: entry.dividers } : {}),
    plinth: entry.plinth ?? k.plinth, construction: like?.construction ?? "sides-through", ...(entry.top ? { top: entry.top } : {}),
    ...(rotation ? { rotation } : {}), ...(like?.standard ? { standard: like.standard } : {}),
  };
  let next: CadDocument = { ...doc, features: [...doc.features, cabinet] };
  const bodyInfo = { ...next.bodyInfo };
  const carcass = like ? (doc.bodyInfo?.[`${like.id}${PART_SEPARATOR}0`]?.material ?? "melamine-white") : "melamine-white";
  cabinetPartNames(cabinet).forEach((name, i) => (bodyInfo[`${cabinet.id}${PART_SEPARATOR}${i}`] = { material: name === "Fond" ? "hdf" : carcass }));
  let fronts: FrontsFeature | null = null;
  if (entry.layout !== "none") {
    const all = doc.features.filter((f): f is FrontsFeature => f.type === "fronts" && !f.suppressed);
    const model = all.find((f) => f.cabinet === anchor?.id) ?? all.at(-1);
    fronts = {
      id: uniqueId(next, "fr"), type: "fronts", name: `Façades ${cabinet.name}`, cabinet: cabinet.id, layout: entry.layout, drawers: entry.drawers ?? 3,
      mount: model?.mount ?? "overlay", gap: model?.gap ?? 3, thickness: model?.thickness ?? 19, hinges: model?.hinges ?? true, handles: model?.handles ?? true,
      ...(model?.hw ? { hw: model.hw } : {}), ...(entry.side && entry.layout === "door" ? { side: entry.side } : {}), ...(entry.facade ?? {}), ...(entry.topDrawer ? { topDrawer: entry.topDrawer } : {}), ...(entry.innerDrawers ? { innerDrawers: entry.innerDrawers } : {}),
    };
    next = { ...next, features: [...next.features, fronts] };
    const material = (model && doc.bodyInfo?.[`${model.id}${PART_SEPARATOR}0`]?.material) || "lacquer-white";
    frontsMaterials(fronts, cabinet, material).forEach((m, i) => (bodyInfo[`${fronts!.id}${PART_SEPARATOR}${i}`] = { material: m }));
  }
  return { doc: { ...next, bodyInfo }, cabinet, fronts };
}

/** « Bas 1 porte 600 », numbered when the project has one already. */
function uniqueKitchenName(doc: CadDocument, entry: CatalogEntry): string {
  const base = entry.custom ? entry.name : `${entry.name} ${entry.width}`;
  const used = new Set(doc.features.map((f) => f.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/** The cabinet slid by `delta` on the floor (rounded to the millimetre). */
export function slideCabinet(c: CabinetFeature, delta: Vec3): CabinetFeature {
  return { ...c, origin: [Math.round(c.origin[0] + delta[0]), Math.round(c.origin[1] + delta[1]), c.origin[2]] };
}

type Box = [Vec3, Vec3];

/** What a cabinet is stuck to: a face of another body (its point, its normal, that body's box), or a corner. */
export type StickTarget = { kind: "face"; point: Vec3; normal: Vec3; other: Box } | { kind: "point"; point: Vec3 };

/**
 * The slide on the floor that sticks a cabinet (its box, fronts included) to a target, null when it cannot:
 * - a side face: the cabinet's opposite side on it, its back in line with the other's back;
 * - a wall or a front: the cabinet's back (or front) on it, centred on the point clicked;
 * - a corner: the cabinet's corner nearest to it (seen from above) on it.
 * A face lying flat (a top, an underside) gives nothing: the cabinet keeps its height.
 */
export function stickDelta(box: Box, rotation: number, target: StickTarget): Vec3 | null {
  if (target.kind === "point") {
    const corners = [box[0][0], box[1][0]].flatMap((x) => [box[0][1], box[1][1]].map((y): [number, number] => [x, y]));
    const [cx, cy] = corners.reduce((a, b) => (Math.hypot(b[0] - target.point[0], b[1] - target.point[1]) < Math.hypot(a[0] - target.point[0], a[1] - target.point[1]) ? b : a));
    return [target.point[0] - cx, target.point[1] - cy, 0];
  }
  const n = target.normal;
  if (Math.abs(n[2]) > 0.7) return null;
  const i = Math.abs(n[0]) >= Math.abs(n[1]) ? 0 : 1;
  const j = 1 - i;
  const delta: Vec3 = [0, 0, 0];
  // The face looks towards +i: the cabinet's low side goes on it; towards −i, its high side.
  delta[i] = target.point[i]! - (n[i]! > 0 ? box[0][i]! : box[1][i]!);
  const { back } = cabinetAxes(rotation);
  if (Math.abs(back[j]!) > 0.5) {
    // Side by side: the backs in line.
    delta[j] = back[j]! > 0 ? target.other[1][j]! - box[1][j]! : target.other[0][j]! - box[0][j]!;
  } else delta[j] = target.point[j]! - (box[0][j]! + box[1][j]!) / 2;
  return delta;
}

/** One's own unit from what is typed, or why it cannot be built. */
export function customEntry(e: Omit<CatalogEntry, "id" | "custom">): CatalogEntry | string {
  const name = e.name.trim();
  if (!name) return "Donnez un nom au meuble.";
  const height = e.height ?? KINDS[e.kind].height;
  const problem = cabinetProblem({ width: e.width, height, depth: e.depth ?? KINDS[e.kind].depth, thickness: 18, backThickness: 3, back: "applied", plinth: e.plinth ?? KINDS[e.kind].plinth, shelves: e.shelves });
  if (problem) return problem;
  if (e.layout === "drawers" && !(Number.isInteger(e.drawers) && e.drawers! >= 1 && e.drawers! <= 8)) return "De 1 à 8 tiroirs.";
  return { ...e, name, height, id: `own-${slug(name)}-${Date.now().toString(36)}`, custom: true };
}

/** One's own unit made from a cabinet of the project: its sort, its sizes, its fronts and shelves. */
export function entryFromCabinet(doc: CadDocument, c: CabinetFeature): CatalogEntry {
  const fronts = doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === c.id && !f.suppressed);
  const name = c.name.replace(/\s*\(\d+\)$/, "");
  return {
    id: `own-${slug(name)}-${Date.now().toString(36)}`, kind: kindOf(c), name, width: c.width, height: c.height, depth: c.depth, plinth: c.plinth,
    shelves: c.shelves, layout: fronts?.layout ?? "none", ...(fronts?.layout === "drawers" ? { drawers: fronts.drawers } : {}), ...(c.top ? { top: c.top } : {}), custom: true,
  };
}
