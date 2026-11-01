/**
 * Les meubles de cuisine qu'on ajoute un par un, pris dans une liste (bas, hauts, colonnes, aux largeurs du commerce),
 * et leur glissé dans la vue, en pur. Un meuble ajouté est un caisson ordinaire avec ses façades, construit comme son
 * voisin (épaisseurs, fond, standard, façades et leur matière) : à droite du caisson choisi quand il est de la même
 * sorte, au-dessus ou à côté de lui sinon, à la première place libre le long du même mur, son fond sur le même plan.
 * Sans caisson dans le projet, il part de l'origine, devant le mur Y = 0 (comme l'Implantation).
 */
import { cabinetPartNames } from "../features/cabinet-parts";
import { frontsMaterials } from "../features/fronts-parts";
import { WALL_UNIT } from "../features/kitchen-layout";
import { uniqueId } from "./operations";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature, type Vec3 } from "./types";

export type UnitKind = "base" | "wall" | "tall";

export interface CatalogEntry {
  id: string;
  kind: UnitKind;
  name: string;
  width: number;
  layout: FrontsFeature["layout"] | "none";
  drawers?: number;
  shelves: number;
  /** Height when not the kind's own (a short unit over the hood). */
  height?: number;
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

export const CATALOG: CatalogEntry[] = [
  ...entries("base", "Bas 1 porte", [300, 400, 450, 500, 600], { layout: "door", shelves: 1 }),
  ...entries("base", "Bas 2 portes", [800, 900, 1000, 1200], { layout: "doors", shelves: 1 }),
  ...entries("base", "Bas 3 tiroirs", [400, 500, 600, 800, 900], { layout: "drawers", drawers: 3, shelves: 0 }),
  ...entries("base", "Bas casseroliers", [600, 800, 900], { layout: "drawers", drawers: 2, shelves: 0 }),
  ...entries("base", "Bas évier", [600, 800, 1200], { layout: "doors", shelves: 0 }),
  ...entries("base", "Bas four", [600], { layout: "none", shelves: 0 }),
  ...entries("wall", "Haut 1 porte", [300, 400, 450, 500, 600], { layout: "door", shelves: 2 }),
  ...entries("wall", "Haut 2 portes", [800, 900, 1000, 1200], { layout: "doors", shelves: 2 }),
  ...entries("wall", "Haut sur hotte", [600, 900], { layout: "door", shelves: 0, height: 350 }),
  ...entries("tall", "Colonne rangement", [450, 600], { layout: "doors", shelves: 4 }),
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
  const rotation = anchor?.rotation ?? 0;
  const { along, back } = cabinetAxes(rotation);
  // Beside the last of its kind along the anchor's wall; over (or beside) the anchor when of another kind.
  const sameWall = cabinets.filter((c) => (c.rotation ?? 0) === rotation);
  const neighbour = anchor && kindOf(anchor) === entry.kind ? anchor : null;
  let start = neighbour ? neighbour.width : 0;
  const z = entry.kind === "wall" && entry.height ? k.z + k.height - height : k.z;
  const at = (s: number): Vec3 => {
    const base = anchor ? anchor.origin : ([0, 0, 0] as Vec3);
    // The origin is the front-left corner: the back plane, less the depth, then along the wall.
    const across = anchor ? [0, 1].map((i) => base[i]! + back[i]! * (anchor.depth - k.depth)) : [0, -k.depth];
    return [Math.round(across[0]! + along[0] * s), Math.round(across[1]! + along[1] * s), z];
  };
  const box = (s: number) => cabinetBox({ origin: at(s), width: entry.width, depth: k.depth, height, rotation });
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
    id: uniqueId(doc, "cb"), type: "cabinet", name: uniqueKitchenName(doc, entry), origin: at(start), width: entry.width, height, depth: k.depth,
    thickness: like?.thickness ?? 18, back: like?.back ?? "applied", backThickness: like?.backThickness ?? 3, shelves: entry.shelves,
    plinth: k.plinth, construction: like?.construction ?? "sides-through",
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
      ...(model?.hw ? { hw: model.hw } : {}),
    };
    next = { ...next, features: [...next.features, fronts] };
    const material = (model && doc.bodyInfo?.[`${model.id}${PART_SEPARATOR}0`]?.material) || "lacquer-white";
    frontsMaterials(fronts, cabinet, material).forEach((m, i) => (bodyInfo[`${fronts!.id}${PART_SEPARATOR}${i}`] = { material: m }));
  }
  return { doc: { ...next, bodyInfo }, cabinet, fronts };
}

/** « Bas 1 porte 600 », numbered when the project has one already. */
function uniqueKitchenName(doc: CadDocument, entry: CatalogEntry): string {
  const base = `${entry.name} ${entry.width}`;
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
