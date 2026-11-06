/**
 * Un dressing en nombres : le long d'un mur (I), de deux murs en angle (L) ou de trois (U), chaque mur reçoit une
 * « Répartition » toute hauteur dont chaque case est un module du programme — penderie longue, double penderie,
 * étagères, tiroirs et étagères, penderie et tiroirs. Les modules deviennent des étapes ordinaires de l'historique
 * (Étagères dans la case, puis Penderie et Tiroirs dans ses niches) : tout se retouche ensuite à la main, niche par
 * niche. En L et en U, l'angle appartient au mur A ; les murs B et C commencent derrière sa profondeur.
 *
 * Repère (comme l'implantation de cuisine) : le mur A a sa face intérieure dans le plan Y = 0 et va vers +X ; le
 * dressing est devant lui (Y < 0). Le mur B a sa face dans le plan X = 0, le mur C dans le plan X = longueur de A ;
 * tous deux vont vers −Y. Posé dans une Pièce relevée, tout est tourné et placé contre son mur A (features/room-runs.ts),
 * chaque mur borné par ses portes et fenêtres et abaissé sous une retombée ou un rampant. Portes battantes (celles de
 * la Répartition) ou coulissantes, accessoires et hauteurs à vérifier : document/dressing-extras.ts. Pure.
 */
import type { PartitionParams, SketchGeometry } from "./sketch";
import { emptySketchGeometry } from "./sketch";
import { withEquipment } from "./equipment";
import { addLayer, layersOf } from "./layers";
import { uniqueId, uniqueName, uniqueOffsetId } from "./operations";
import { rectangleAt } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import type { CadDocument, NicheFeature, PlaneFrame, PlaneName, SketchFeature, TrimFeature } from "./types";
import { accessory, REACH_ROD, REACH_SHELF, slidingDoors, wallBand } from "./dressing-extras";
import { DRAWERS, HAT, MODULES, moduleSteps, ROD, type ModuleKind } from "./dressing-modules";
import { placeBox, placeFrame, type Placement } from "../features/room-runs";
import { sketchFrame, nearestPlane } from "../sketcher/frame";
import { nicheGeometry, nicheProblem } from "../features/niche-parts";
import { partitionLayout } from "../sketcher/partition";
import { extrusionGroups, idsFrom, partitionRecord, pathKey, rebuildChain, shelvesRecord } from "../sketcher/partition-history";

export type WallName = "A" | "B" | "C";

export interface DressingSettings {
  layout: "I" | "L" | "U";
  /** Inner length of each wall (mm). */
  lengthA: number;
  lengthB: number;
  lengthC: number;
  /** Height of the dressing (up to the ceiling), depth of its panels, their thickness, the plinth under it (mm). */
  height: number;
  depth: number;
  thickness: number;
  plinth: number;
  /** Draw the walls (on the « Pièce » layer, out of the cut list). */
  walls: boolean;
  /** The modules of each wall, from left to right as seen from the room. */
  programs: Record<WallName, ModuleKind[]>;
  /**
   * What of each wall it may take (a surveyed room's doors and windows): wall A from and to (from its start), walls B
   * and C up to (from the corner); and a lower height on a wall (under a drop or a slope).
   */
  free?: Partial<Record<WallName, [number, number]>>;
  heights?: Partial<Record<WallName, number>>;
  /** No doors, the Répartitions' own hinged doors, or sliding doors on two tracks in front. */
  doors?: "none" | "hinged" | "sliding";
  /** A pull-down rod where a rod is out of reach. */
  pullDown?: boolean;
}

const WALL_THICKNESS = 100;
const ROOM_LAYER = "Pièce";

/** A program for a wall of this length: about one module per 80 cm, in a usual order. */
export function defaultProgram(length: number): ModuleKind[] {
  const cycle: ModuleKind[] = ["long", "drawers", "double", "shelves", "rod-drawers"];
  const n = Math.max(1, Math.min(10, Math.round(length / 800)));
  return Array.from({ length: n }, (_, i) => cycle[i % cycle.length] as ModuleKind);
}

export const DRESSING: DressingSettings = {
  layout: "I", lengthA: 3000, lengthB: 2000, lengthC: 2000, height: 2500, depth: 600, thickness: 18, plinth: 80, walls: true,
  programs: { A: defaultProgram(3000), B: defaultProgram(2000 - 600), C: defaultProgram(2000 - 600) },
};

export { MODULES };
export type { ModuleKind };

export const wallsOf = (s: Pick<DressingSettings, "layout">): WallName[] => (s.layout === "I" ? ["A"] : s.layout === "L" ? ["A", "B"] : ["A", "B", "C"]);

/** Where the Répartition of a wall goes: its sketch plane, and where it starts and how long it is along it. */
export function wallRun(s: DressingSettings, wall: WallName): { plane: PlaneName; offset: number; frame?: PlaneFrame; start: number; length: number } {
  if (wall === "A") {
    const [from, to] = s.free?.A ?? [0, s.lengthA];
    return { plane: "XZ", offset: 0, start: from, length: to - from };
  }
  // Wall B: the plane X = 0, u along +Y, the panels towards +X; it runs from its far end to behind wall A's depth.
  const end = s.free?.[wall]?.[1] ?? (wall === "B" ? s.lengthB : s.lengthC);
  if (wall === "B") return { plane: "YZ", offset: 0, start: -end, length: end - s.depth };
  // Wall C faces −X: a plane at X = lengthA whose normal is −X (the panels come off the wall), u along −Y.
  return { plane: "YZ", offset: s.lengthA, frame: { origin: [s.lengthA, 0, 0], xDir: [0, -1, 0], normal: [-1, 0, 0] }, start: s.depth, length: end - s.depth };
}

/** Where a run of a wall lies, from and to along it as features/room-runs measures (B and C: from the corner). */
export function runSpan(s: DressingSettings, wall: WallName): [number, number] {
  const run = wallRun(s, wall);
  return wall === "B" ? [-(run.start + run.length), -run.start] : [run.start, run.start + run.length];
}

const heightOf = (s: DressingSettings, wall: WallName) => Math.min(s.height, s.heights?.[wall] ?? s.height);

export function partitionInput(s: DressingSettings, wall: WallName): PartitionParams {
  const program = s.programs[wall];
  // A Répartition has 2 cases at least: one module is 2 cases joined « sans côté ».
  const one = program.length === 1;
  const cases = Math.max(2, program.length);
  return {
    length: wallRun(s, wall).length, height: heightOf(s, wall), thickness: s.thickness, cases,
    dividers: Array.from({ length: cases - 1 }, () => (one ? ("none" as const) : ("single" as const))),
    widths: one ? [1, 1] : program.map((k) => MODULES[k].share), boards: true, plinth: s.plinth, outer: "board", single: "board", double: "side",
  };
}

/** Why this dressing cannot be made, or null. */
export function dressingProblem(s: DressingSettings): string | null {
  if (!(s.height >= 1200 && s.height <= 4000)) return "La hauteur va de 120 à 400 cm.";
  if (!(s.depth >= 300 && s.depth <= 900)) return "La profondeur va de 30 à 90 cm.";
  if (!(s.thickness >= 10 && s.thickness <= 40)) return "L'épaisseur des panneaux va de 10 à 40 mm.";
  if (!(s.plinth >= 0 && s.plinth <= 300)) return "Le socle va de 0 à 30 cm.";
  for (const wall of wallsOf(s)) {
    const program = s.programs[wall];
    if (!program.length) return `Le mur ${wall} n'a aucun module.`;
    const run = wallRun(s, wall);
    if (run.length < 400 * program.length) return `Le mur ${wall} est trop court pour ${program.length} module${program.length > 1 ? "s" : ""} (40 cm au moins chacun${wall === "A" ? "" : ", après la profondeur du mur A"}).`;
  }
  return null;
}

/** The steps of a module in its case `i`: the divisions (by path of the niche), then the equipments of niches. */
const DOORS = { gap: 3, thickness: 18, handles: true };

export interface DressingResult {
  doc: CadDocument;
  /** The features added, in history order. */
  added: string[];
  /** Equipments left out (a niche too small for them), said to the user. */
  problems: string[];
  /** Heights out of reach, accessories added. */
  notes: string[];
}

/**
 * The document with the dressing in it: one sketch and its Répartition per wall, the modules, the doors and the
 * accessories; the walls, unless it stands in a surveyed room (`place`: where its wall A is in it).
 */
export function dressingDocument(base: CadDocument, s: DressingSettings, place?: Placement): DressingResult {
  const problems: string[] = [];
  const notes: string[] = [];
  const extras: TrimFeature["parts"] = [];
  let doc = base;
  for (const wall of wallsOf(s)) {
    const run = wallRun(s, wall);
    const input = partitionInput(s, wall);
    const layout = partitionLayout(input);
    if (typeof layout === "string") {
      problems.push(`Mur ${wall} : ${layout}`);
      continue;
    }
    const innerHeight = layout.inner[1] - layout.inner[0];
    if (heightOf(s, wall) < s.height) notes.push(`Mur ${wall} : hauteur ramenée à ${Math.round(heightOf(s, wall) / 10)} cm sous le plafond bas (retombée ou rampant).`);
    // Accessories and the reach: the rods under a hat shelf, the top shelves.
    const [p0, p1] = runSpan(s, wall);
    const along = (x: number) => (wall === "B" ? p1 - x : p0 + x);
    const rodHeight = layout.inner[1] - HAT - s.thickness - ROD.drop;
    let high = false;
    s.programs[wall].forEach((kind, i) => {
      const [x0, x1] = (s.programs[wall].length === 1 ? [layout.caseSpans[0]![0], layout.caseSpans.at(-1)![1]] : layout.caseSpans[i]) ?? [0, 0];
      const [a, b] = [along(x0), along(x1)].sort((m, n) => m - n) as [number, number];
      if ((kind === "long" || kind === "double" || kind === "rod-drawers") && rodHeight > REACH_ROD) {
        if (s.pullDown) extras.push(accessory(wall, s.lengthA, a, b, s.depth, rodHeight, "Penderie escamotable"));
        else notes.push(`Mur ${wall}, case ${i + 1} : tringle à ${Math.round(rodHeight / 10)} cm, hors de portée (plus de ${REACH_ROD / 10} cm) — cochez « Penderie escamotable ».`);
      }
      if (kind === "trousers") extras.push(accessory(wall, s.lengthA, a, b, s.depth, layout.inner[0] + 900, "Porte-pantalons coulissant"));
      if ((kind === "shelves" || kind === "drawers" || kind === "shoes") && layout.inner[1] > REACH_SHELF + 300) high = true;
    });
    if (high) notes.push(`Mur ${wall} : les étagères au-dessus de ${REACH_SHELF / 10} cm ne s'atteignent qu'avec un marchepied.`);
    if (s.doors === "sliding") extras.push(...slidingDoors((p, q, a, b, z0, z1) => wallBand(wall, s.lengthA, p, q, a, b, z0, z1), wall, p0, p1, s.depth, heightOf(s, wall), s.plinth, s.thickness));
    const steps = s.programs[wall].map((kind, i) => moduleSteps(kind, [i], innerHeight, s.thickness));
    const divisions = steps.flatMap((m) => m.divisions);
    const ids = idsFrom(uniqueOffsetId(doc), 1 + divisions.length);
    const partitionId = ids[0] as string;
    const record = partitionRecord(partitionId, `Dressing — mur ${wall}`, input, [run.start, 0], s.depth);
    if (s.doors === "hinged" && record.step?.kind === "partition") record.step.doors = { ...DOORS };
    const records = [
      record,
      ...divisions.map((d, k) => shelvesRecord(ids[k + 1] as string, `Étagères ${k + 1}`, partitionId, d.niche, d.input, s.depth)),
    ];
    const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: records }, partitionId);
    if (typeof rebuilt === "string") {
      problems.push(`Mur ${wall} : ${rebuilt}`);
      continue;
    }
    problems.push(...rebuilt.problems.map((p) => `Mur ${wall} — ${p}`));
    const sketchId = uniqueId(doc, "sk");
    // In a surveyed room, the wall's plane as a construction plane, turned and moved onto the room's wall.
    const own = sketchFrame(run.plane, run.offset);
    const frame = place ? placeFrame(place, run.frame ?? { origin: own.origin, xDir: own.u, normal: own.normal }) : run.frame;
    const sketch: SketchFeature = {
      id: sketchId, type: "sketch", name: `Dressing — mur ${wall}`, plane: frame ? nearestPlane(frame.normal) : run.plane, offset: run.offset, ...(frame ? { frame } : {}),
      ...emptySketchGeometry(),
    };
    doc = { ...doc, features: [...doc.features, sketch] };
    doc = withSketchExtrusion(doc, sketchId, rebuilt.geometry as SketchGeometry, { groups: extrusionGroups([], rebuilt) });
    // The equipments, in the niches the divisions made.
    const placed = doc.features.find((f) => f.id === sketchId) as SketchFeature;
    const equipment: NicheFeature[] = [];
    let probe = doc;
    // (The hinged doors are the Répartition's own: its « Portes » equipment comes with its extrusion.)
    for (const e of steps.flatMap((m) => m.equip)) {
      if (!rebuilt.niches.has(pathKey(e.niche))) continue;
      const title = e.fill === "rod" ? "Penderie" : "Tiroirs";
      const f: NicheFeature = {
        id: uniqueId(probe, e.fill === "rod" ? "pd" : "td"), type: "niche", name: uniqueName(probe, title), sketch: sketchId, partition: partitionId,
        niche: e.niche, fill: e.fill, ...ROD, ...DRAWERS,
      };
      const geometry = nicheGeometry(f, placed);
      const problem = typeof geometry === "string" ? geometry : nicheProblem(f, geometry);
      if (problem) {
        problems.push(`Mur ${wall}, case ${(e.niche[0] ?? 0) + 1} : ${title.toLowerCase()} impossible — ${problem}`);
        continue;
      }
      equipment.push(f);
      probe = { ...probe, features: [...probe.features, f] };
    }
    doc = withEquipment(doc, equipment);
  }
  if (extras.length) {
    const parts = extras.map((part) => {
      const [from, to] = place ? placeBox(place, part.from, part.to) : [part.from, part.to];
      return { ...part, from, to };
    });
    doc = { ...doc, features: [...doc.features, { id: uniqueId(doc, "fi"), type: "trim", name: uniqueName(doc, s.doors === "sliding" ? "Portes coulissantes" : "Accessoires"), parts }] };
    const added = parts.filter((p) => p.hardware && p.item !== "Rail de porte coulissante").map((p) => p.item);
    if (added.length) notes.push(`Accessoires ajoutés au devis : ${[...new Set(added)].map((n) => `${added.filter((x) => x === n).length} × ${n}`).join(", ")}.`);
  }
  if (s.walls && !place) doc = withWalls(doc, s);
  const known = new Set(base.features.map((f) => f.id));
  return { doc, added: doc.features.filter((f) => !known.has(f.id)).map((f) => f.id), problems, notes };
}

/** The walls behind the dressing, as boxes on the « Pièce » layer (out of the cut list and the quote). */
function withWalls(base: CadDocument, s: DressingSettings): CadDocument {
  const t = WALL_THICKNESS;
  const boxes: { name: string; from: [number, number, number]; to: [number, number, number] }[] = [{ name: "Mur A", from: [s.layout === "I" ? 0 : -t, 0, 0], to: [s.lengthA + (s.layout === "U" ? t : 0), t, s.height] }];
  if (s.layout !== "I") boxes.push({ name: "Mur B", from: [-t, -s.lengthB, 0], to: [0, 0, s.height] });
  if (s.layout === "U") boxes.push({ name: "Mur C", from: [s.lengthA, -s.lengthC, 0], to: [s.lengthA + t, 0, s.height] });
  let doc = base;
  let layer = layersOf(doc).find((l) => l.name === ROOM_LAYER)?.id;
  if (!layer) ({ doc, id: layer } = addLayer(doc, ROOM_LAYER));
  for (const box of boxes) {
    const [w, d, h] = [0, 1, 2].map((i) => box.to[i]! - box.from[i]!) as [number, number, number];
    const sketchId = uniqueId(doc, "sk");
    doc = { ...doc, features: [...doc.features, { id: sketchId, type: "sketch", name: uniqueName(doc, "Esquisse"), plane: "XY", offset: 0, hidden: true, ...rectangleAt(box.from[0] + w / 2, box.from[1] + d / 2, w, d) }] };
    const id = uniqueId(doc, "ex");
    doc = { ...doc, features: [...doc.features, { id, type: "extrude", name: box.name, sketch: sketchId, distance: h, operation: "new" }] };
    doc = { ...doc, bodyNames: { ...doc.bodyNames, [id]: box.name }, bodyInfo: { ...doc.bodyInfo, [id]: { room: true, layer } } };
  }
  return doc;
}
