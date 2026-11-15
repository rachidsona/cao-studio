/**
 * Les modules de dressing : ce qu'une case devient — penderie longue, double penderie, étagères, tiroirs et étagères,
 * penderie et tiroirs, chaussures, porte-pantalons —, en étapes ordinaires de l'historique : des Étagères qui divisent la
 * niche, puis Penderie et Tiroirs dans les niches obtenues. L'assistant Dressing (dressing-plan.ts) s'en sert case par
 * case, l'outil Module (app/module-tool.ts) dans les niches d'une Répartition. Un module dit aussi ce qui ne va pas :
 * une tringle ou une étagère hors de portée, une tringle trop longue, une étagère qui fléchit, des cintres qui ne
 * tiennent pas dans la profondeur. Pur.
 */
import { nicheGeometry, nicheParts, nicheProblem, worldBox, type NicheGeometry, type NichePart } from "../features/niche-parts";
import { shelfCheck } from "../features/shelf-sag";
import { extrusionGroups, idsFrom, pathKey, rebuildChain, shelvesRecord, withNicheHeight } from "../sketcher/partition-history";
import { partBox, shelfLayout, type NicheBox } from "../sketcher/shelves";
import { REACH_ROD, REACH_SHELF } from "./dressing-extras";
import { withEquipment } from "./equipment";
import { findFeature, uniqueId, uniqueName, uniqueOffsetId } from "./operations";
import type { ShelfParams } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import type { ModuleFormula } from "./module-program";
import type { CadDocument, NicheFeature, SketchFeature, TrimFeature, Vec3 } from "./types";

export type ModuleKind = "long" | "double" | "shelves" | "drawers" | "rod-drawers" | "shoes" | "trousers";

/** The modules: their name, and their share of the wall (a hanging module is wider than a column of shelves). */
export const MODULES: Record<ModuleKind, { label: string; share: number }> = {
  long: { label: "Penderie longue", share: 900 },
  double: { label: "Double penderie", share: 900 },
  shelves: { label: "Étagères", share: 600 },
  drawers: { label: "Tiroirs et étagères", share: 700 },
  "rod-drawers": { label: "Penderie et tiroirs", share: 900 },
  shoes: { label: "Chaussures (étagères tous les 20 cm)", share: 600 },
  trousers: { label: "Porte-pantalons coulissant", share: 800 },
};

/** Height of the top niche over a rod (the « chapeau » shelf), of the drawers' niche, and the spacing of shelves (mm). */
export const HAT = 300;
const DRAWER_ZONE = 720;
const SHELF_SPACING = 350;
const SHOE_SPACING = 200;
export const ROD = { diameter: 25, drop: 60 };
export const DRAWERS = { drawers: 3, gap: 3, sideGap: 3, thickness: 18, handles: true };

/** Beyond this, a rod bends (mm). */
export const LONGEST_ROD = 1200;
/** A hanger needs this depth inside (mm). */
const HANGER_DEPTH = 520;
/** What a shelf of a dressing carries: folded clothes (kg per metre). */
const CLOTHES = 10;
const TROUSERS_HEIGHT = 900;
export const TROUSERS = "Porte-pantalons coulissant";

/** The accessory of a porte-pantalons in this niche, as a box of the world. */
export function trousersBox(here: NicheGeometry): [Vec3, Vec3] {
  const { x0, x1, y0 } = here.box;
  return worldBox(here, { from: [x0 + 20, y0 + TROUSERS_HEIGHT, 30], to: [x1 - 20, y0 + TROUSERS_HEIGHT + 80, here.depth - 30] });
}

/** The sizes of a module (mm), and how many drawers. */
export interface ModuleSizes {
  hat: number;
  drawerZone: number;
  spacing: number;
  drawers: number;
  /** How many shelves in its column, whatever the spacing says. */
  shelves?: number;
  /** Niches of a set height: by their path from the niche of the module (« 1.2 »). */
  heights?: Record<string, number>;
  rod?: { diameter: number; drop: number };
  /**
   * The drawer fronts: their gaps, thickness and handles, and their style — plain, framed, fluted or slatted, with its
   * sizes (features/door-decor.ts) — given to the drawers of the module.
   */
  front?: { gap: number; bottomGap: number; betweenGap: number; sideGap: number; thickness: number; handles: boolean } & FrontLook;
}

/** How the drawer fronts of a module look (missing: plain). */
export type FrontLook = Partial<Pick<NicheFeature, "style" | "frameWidth" | "frameDepth" | "pitch" | "grooves">>;

export const moduleSizes = (kind: ModuleKind): ModuleSizes => ({ hat: HAT, drawerZone: DRAWER_ZONE, spacing: kind === "shoes" ? SHOE_SPACING : SHELF_SPACING, drawers: DRAWERS.drawers });

/** What each module has, for the panel of the tool. */
export const moduleHas = (kind: ModuleKind) => ({
  hat: kind === "long" || kind === "double" || kind === "rod-drawers" || kind === "trousers",
  drawers: kind === "drawers" || kind === "rod-drawers",
  spacing: kind === "shelves" || kind === "shoes" || kind === "drawers",
  rod: kind === "long" || kind === "double" || kind === "rod-drawers",
});

export interface ModuleSteps {
  divisions: { niche: number[]; input: ShelfParams }[];
  equip: { niche: number[]; fill: "rod" | "drawers" }[];
}

/** The steps of a module in the niche at `root`, `innerHeight` high. */
export function moduleSteps(kind: ModuleKind, root: number[], innerHeight: number, thickness: number, sizes: ModuleSizes = moduleSizes(kind)): ModuleSteps {
  const steps = baseSteps(kind, root, innerHeight, thickness, sizes);
  // A niche of a set height: in the last division on its way.
  for (const [key, height] of Object.entries(sizes.heights ?? {})) {
    const path = [...root, ...key.split(".").map(Number)];
    for (let k = path.length - 1; k >= root.length; k--) {
      const division = steps.divisions.find((d) => pathKey(d.niche) === pathKey(path.slice(0, k)));
      if (!division || (path[k] as number) > division.input.count) continue;
      division.input = withNicheHeight(division.input, path[k] as number, height);
      break;
    }
  }
  return steps;
}

function baseSteps(kind: ModuleKind, root: number[], innerHeight: number, thickness: number, sizes: ModuleSizes): ModuleSteps {
  const { hat, drawerZone, spacing } = sizes;
  const shelves = (count: number, mode: ShelfParams["mode"] = "equal", fixed = 300): ShelfParams => ({ count, thickness, mode, fixed });
  const columns = (height: number) => sizes.shelves ?? Math.max(1, Math.round(height / spacing) - 1);
  const upper = innerHeight - drawerZone - thickness;
  switch (kind) {
    case "long":
      return { divisions: [{ niche: root, input: shelves(1, "top", hat) }], equip: [{ niche: [...root, 0], fill: "rod" }] };
    case "double":
      return {
        divisions: [{ niche: root, input: shelves(1, "top", hat) }, { niche: [...root, 0], input: shelves(1) }],
        equip: [{ niche: [...root, 0, 0], fill: "rod" }, { niche: [...root, 0, 1], fill: "rod" }],
      };
    case "shelves":
    case "shoes":
      return { divisions: [{ niche: root, input: shelves(columns(innerHeight)) }], equip: [] };
    case "trousers":
      return { divisions: [{ niche: root, input: shelves(1, "top", hat) }], equip: [] };
    case "drawers":
      return { divisions: [{ niche: root, input: shelves(1, "bottom", drawerZone) }, ...(columns(upper) > 0 ? [{ niche: [...root, 1], input: shelves(columns(upper)) }] : [])], equip: [{ niche: [...root, 0], fill: "drawers" }] };
    case "rod-drawers":
      return { divisions: [{ niche: root, input: shelves(1, "bottom", drawerZone) }, { niche: [...root, 1], input: shelves(1, "top", hat) }], equip: [{ niche: [...root, 0], fill: "drawers" }, { niche: [...root, 1, 0], fill: "rod" }] };
  }
}

export interface ModuleLayout {
  steps: ModuleSteps;
  /** The shelves, as boxes of the sketch. */
  shelves: NicheBox[];
  /** The niches left, nothing dividing them. */
  niches: NicheBox[];
  /** The same, from the bottom, with their path from the niche of the module and what goes in them. */
  leaves: { key: string; box: NicheBox; fill?: "rod" | "drawers" }[];
  /** What goes in the niches, with their boxes. */
  equip: { fill: "rod" | "drawers"; box: NicheBox }[];
}

/** A module laid out in this niche, or why it does not fit. */
export function moduleLayout(box: NicheBox, root: number[], kind: ModuleKind, thickness: number, sizes: ModuleSizes): ModuleLayout | string {
  const steps = moduleSteps(kind, root, box.y1 - box.y0, thickness, sizes);
  const nodes = new Map<string, NicheBox>([[pathKey(root), box]]);
  const cut = new Set<string>();
  const shelves: NicheBox[] = [];
  for (const d of steps.divisions) {
    const node = nodes.get(pathKey(d.niche));
    if (!node) return "Ce module ne tient pas dans cette niche.";
    const layout = shelfLayout(node, d.input);
    if (typeof layout === "string") return layout;
    cut.add(pathKey(d.niche));
    shelves.push(...layout.shelves.map((span) => partBox(node, span, layout)));
    layout.niches.forEach((span, k) => nodes.set(pathKey([...d.niche, k]), partBox(node, span, layout)));
  }
  const equip = steps.equip.map((e) => ({ fill: e.fill, box: nodes.get(pathKey(e.niche)) as NicheBox }));
  const left = [...nodes].filter(([key]) => !cut.has(key));
  const fills = new Map(steps.equip.map((e) => [pathKey(e.niche), e.fill]));
  const leaves = left.map(([key, b]) => ({ key: key.slice(pathKey(root).length + 1), box: b, ...(fills.has(key) ? { fill: fills.get(key) as "rod" | "drawers" } : {}) })).sort((a, b) => a.box.y0 - b.box.y0);
  return { steps, shelves, niches: left.map(([, b]) => b), leaves, equip };
}

const equipment = (fill: "rod" | "drawers", sizes: ModuleSizes) => ({ ...ROD, ...DRAWERS, ...sizes.rod, ...sizes.front, drawers: sizes.drawers, fill });

/** The parts of what goes in a niche of a module: the preview, and why it is impossible. */
export function moduleEquipment(geometry: NicheGeometry, layout: ModuleLayout, sizes: ModuleSizes): { parts: { geometry: NicheGeometry; part: NichePart }[]; problem: string | null } {
  const parts: { geometry: NicheGeometry; part: NichePart }[] = [];
  for (const e of layout.equip) {
    const here = { ...geometry, box: e.box };
    const f = { id: "preview", type: "niche", name: "", sketch: "", partition: "", niche: [], ...equipment(e.fill, sizes) } as NicheFeature;
    const problem = nicheProblem(f, here);
    if (problem) return { parts: [], problem };
    parts.push(...nicheParts(f, here).map((part) => ({ geometry: here, part })));
  }
  return { parts, problem: null };
}

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;

/** What is worth saying of a module that fits: `floor` is the height of the floor in the sketch, `depth` that of the panels. */
export function moduleWarnings(layout: ModuleLayout, floor: number, depth: number, thickness: number): string[] {
  const warnings: string[] = [];
  const rods = layout.equip.filter((e) => e.fill === "rod");
  for (const rod of rods) {
    const height = rod.box.y1 - ROD.drop - floor;
    if (height > REACH_ROD) warnings.push(`Tringle à ${cm(height)} du sol : hors de portée (plus de ${cm(REACH_ROD)}).`);
  }
  const width = rods[0] ? rods[0].box.x1 - rods[0].box.x0 : 0;
  if (width > LONGEST_ROD) warnings.push(`Tringle de ${cm(width)} : elle fléchit au-delà de ${cm(LONGEST_ROD)}, prévoyez un support au milieu ou une cloison.`);
  if (rods.length && depth < HANGER_DEPTH) warnings.push(`Profondeur de ${cm(depth)} : les cintres demandent ${cm(HANGER_DEPTH)}.`);
  const top = Math.max(0, ...layout.shelves.map((s) => s.y1 - floor));
  if (top > REACH_SHELF) warnings.push(`Étagère à ${cm(top)} du sol : il faut un marchepied (plus de ${cm(REACH_SHELF)}).`);
  const shelf = layout.shelves[0];
  if (shelf) {
    const check = shelfCheck([[0, 0, 0], [shelf.x1 - shelf.x0, depth, thickness]], undefined, CLOTHES);
    if (!check.ok) warnings.push(`Étagère de ${cm(check.span)} : elle fléchit de ${check.sag.toFixed(1).replace(".", ",")} mm sous du linge (limite ${check.limit.toFixed(1).replace(".", ",")} mm)${check.thicknessNeeded ? ` ; il faudrait ${check.thicknessNeeded} mm d'épaisseur` : ""}.`);
  }
  return warnings;
}

/** A module for each niche: where, and what. */
export interface ModulePick {
  partition: string;
  path: number[];
  box: NicheBox;
}

/**
 * These modules in the niches of this sketch, as one change: their Étagères in the history of the Répartition, their
 * Penderies and Tiroirs, and the accessory of a porte-pantalons. A string: why it is impossible.
 */
export function withModules(base: CadDocument, sketchId: string, picks: ModulePick[], kind: ModuleKind, thickness: number, sizes: ModuleSizes, formula?: ModuleFormula): CadDocument | string {
  const g = findFeature(base, sketchId);
  if (g?.type !== "sketch") return "L'esquisse de la répartition n'existe plus.";
  // Left to right, bottom to top: the pieces are numbered in that order.
  const order = [...picks].sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0);
  const laid = order.map((pick) => ({ pick, layout: moduleLayout(pick.box, pick.path, kind, thickness, sizes) }));
  const bad = laid.find((l) => typeof l.layout === "string");
  if (bad) return bad.layout as string;
  const offsets = [...(g.offsets ?? [])];
  const count = laid.reduce((n, l) => n + (l.layout as ModuleLayout).steps.divisions.length, 0);
  const ids = idsFrom(uniqueOffsetId(base), count);
  const added = new Set<string>();
  const number = () => Math.max(0, ...offsets.map((r) => /^Étagères (\d+)$/.exec(r.name)?.[1]).filter((n): n is string => n !== undefined).map(Number)) + 1;
  for (const { pick, layout } of laid) {
    const depth = offsets.find((r) => r.id === pick.partition)?.step;
    for (const [k, d] of (layout as ModuleLayout).steps.divisions.entries()) {
      const id = ids[added.size] as string;
      const record = shelvesRecord(id, `Étagères ${number()}`, pick.partition, d.niche, d.input, depth?.kind === "partition" ? depth.depth : undefined);
      // A module programmed: its first division keeps the program (module-program.ts).
      offsets.push(k === 0 && formula ? { ...record, formula: structuredClone(formula) } : record);
      added.add(id);
    }
  }
  let geometry = { ...g, offsets };
  const groups = [];
  for (const partition of new Set(order.map((p) => p.partition))) {
    const rebuilt = rebuildChain(geometry, partition);
    if (typeof rebuilt === "string") return rebuilt;
    if (rebuilt.problems.length) return rebuilt.problems.join(" ");
    geometry = { ...geometry, ...rebuilt.geometry };
    groups.push(...extrusionGroups(g.offsets ?? [], rebuilt, added));
  }
  let doc = withSketchExtrusion(base, sketchId, geometry, { groups });
  const placed = findFeature(doc, sketchId) as SketchFeature;
  const features: NicheFeature[] = [];
  const extras: TrimFeature["parts"] = [];
  let probe = doc;
  for (const { pick, layout } of laid) {
    for (const e of (layout as ModuleLayout).steps.equip) {
      const title = e.fill === "rod" ? "Penderie" : "Tiroirs";
      const f: NicheFeature = {
        id: uniqueId(probe, e.fill === "rod" ? "pd" : "td"), type: "niche", name: uniqueName(probe, title), sketch: sketchId, partition: pick.partition, niche: e.niche, ...equipment(e.fill, sizes),
      };
      const here = nicheGeometry(f, placed);
      if (typeof here === "string") return here;
      const problem = nicheProblem(f, here);
      if (problem) return problem;
      features.push(f);
      probe = { ...probe, features: [...probe.features, f] };
    }
    if (kind === "trousers") {
      const here = nicheGeometry({ partition: pick.partition, niche: [...pick.path, 0] }, placed);
      if (typeof here === "string") return here;
      const [from, to] = trousersBox(here);
      extras.push({ name: TROUSERS, from, to, hardware: true, item: TROUSERS });
    }
  }
  doc = withEquipment(doc, features);
  if (extras.length) doc = { ...doc, features: [...doc.features, { id: uniqueId(doc, "fi"), type: "trim", name: uniqueName(doc, "Accessoires"), parts: extras }] };
  return doc;
}
