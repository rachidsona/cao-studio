/**
 * Équipement d'une niche de « Répartition », en géométrie pure (sans noyau : sert aussi à nommer les corps, à compter
 * la quincaillerie et à montrer l'aperçu).
 * - Penderie : une tringle ronde d'un côté à l'autre de la niche, à mi-profondeur, son axe à `drop` mm sous le haut,
 *   tenue par deux supports (disques de 3 mm contre les côtés).
 * - Tiroirs : n façades encastrées dans l'ouverture (même jeu tout autour et entre elles), chacune avec son caisson
 *   (côtés, avant, arrière, fond) sur coulisses de 12,5 mm, de la longueur du commerce qui tient dans la profondeur.
 * Les pièces sont des boîtes dans le repère de la niche : u le long de la largeur (x de l'esquisse), v vers le haut
 * (y de l'esquisse), w dans la profondeur, compté depuis le plan de l'esquisse le long de sa normale ; la face avant
 * des panneaux est à w = profondeur.
 */
import type { NicheFeature, SketchFeature, Vec3 } from "../document/types";
import { frameOf, toWorld, type SketchFrame } from "../sketcher/frame";
import { isPartition, pathKey, rebuildChain } from "../sketcher/partition-history";
import type { NicheBox } from "../sketcher/shelves";
import { DRAWER_BOTTOM, DRAWER_SIDE, SLIDE_PLAY, SLIDES } from "./fronts-parts";

export interface NicheGeometry {
  frame: SketchFrame;
  box: NicheBox;
  depth: number;
}

/** A part, in the niche's frame: a box, or the rod (a cylinder along u). */
export interface NichePart {
  name: string;
  kind: "box" | "rod" | "disc";
  /** [u0, v0, w0] and [u1, v1, w1]; a rod or a disc: from one end of its axis to the other, `radius` around it. */
  from: Vec3;
  to: Vec3;
  radius?: number;
  /** A drawer front (its handle holes), or a hardware part (bought, not cut: out of the cut list). */
  role?: "front" | "hardware";
}

export const SUPPORT = 3;
const MAX_DRAWERS = 8;

/** The niche the feature equips, with the frame of its sketch and the depth of the partition's panels. */
export function nicheGeometry(f: Pick<NicheFeature, "partition" | "niche">, sketch: SketchFeature | undefined): NicheGeometry | string {
  if (!sketch || sketch.type !== "sketch") return "L'esquisse de la répartition n'existe plus.";
  const frame = frameOf(sketch);
  // The parts are boxes along the axes: the sketch must lie in a main plane (or a parallel one).
  const straight = [frame.u, frame.v, frame.normal].every((a) => a.filter((c) => Math.abs(c) > 1e-9).length === 1);
  if (!straight) return "La répartition doit être dessinée dans un plan principal (face, dessus ou côté).";
  const record = (sketch.offsets ?? []).find((r) => r.id === f.partition);
  if (!record || !isPartition(record)) return "Cette répartition n'existe plus.";
  if (!(record.step.depth && record.step.depth > 0)) return "Les panneaux de la répartition ne sont pas extrudés : leur profondeur manque.";
  const rebuilt = rebuildChain(sketch, f.partition);
  if (typeof rebuilt === "string") return rebuilt;
  const node = rebuilt.niches.get(pathKey(f.niche));
  if (!node) return "Sa niche n'existe plus.";
  return { frame, box: node.box, depth: record.step.depth };
}

/** Why these settings cannot equip this niche, or null. */
export function nicheProblem(f: Omit<NicheFeature, "id" | "type" | "name" | "sketch" | "partition" | "niche">, n: NicheGeometry): string | null {
  const width = n.box.x1 - n.box.x0;
  const height = n.box.y1 - n.box.y0;
  if (f.fill === "rod") {
    if (!(f.diameter >= 10 && f.diameter <= 50)) return "Le diamètre de la tringle va de 10 à 50 mm.";
    if (width < 2 * SUPPORT + 50) return "La niche est trop étroite pour une tringle.";
    if (!(f.drop >= f.diameter / 2 + 5)) return `La tringle doit être à au moins ${f.diameter / 2 + 5} mm sous le haut de la niche.`;
    if (f.drop > height - f.diameter / 2) return "La tringle tombe sous le bas de la niche : réduisez la distance sous le haut.";
    return null;
  }
  if (!Number.isInteger(f.drawers) || f.drawers < 1 || f.drawers > MAX_DRAWERS) return `De 1 à ${MAX_DRAWERS} tiroirs.`;
  if (!(f.thickness > 0)) return "L'épaisseur des façades doit être positive.";
  if (!(f.gap >= 0)) return "Le jeu ne peut pas être négatif.";
  if (width < 2 * (SLIDE_PLAY + DRAWER_SIDE) + 60) return "La niche est trop étroite pour des tiroirs.";
  if ((height - (f.drawers + 1) * f.gap) / f.drawers < 80) return "La niche est trop basse pour autant de tiroirs (80 mm de façade au moins).";
  if (n.depth - f.thickness < 150) return "La niche n'est pas assez profonde pour des tiroirs.";
  return null;
}

/** Every part, in body order; none when the settings are impossible. */
export function nicheParts(f: NicheFeature, n: NicheGeometry): NichePart[] {
  if (nicheProblem(f, n)) return [];
  const { x0, x1, y0, y1 } = n.box;
  const D = n.depth;
  if (f.fill === "rod") {
    const r = f.diameter / 2;
    const [v, w] = [y1 - f.drop, D / 2];
    return [
      { name: "Tringle", kind: "rod", from: [x0 + SUPPORT, v, w], to: [x1 - SUPPORT, v, w], radius: r, role: "hardware" },
      { name: "Support gauche", kind: "disc", from: [x0, v, w], to: [x0 + SUPPORT, v, w], radius: r + 8, role: "hardware" },
      { name: "Support droit", kind: "disc", from: [x1 - SUPPORT, v, w], to: [x1, v, w], radius: r + 8, role: "hardware" },
    ];
  }
  const g = f.gap;
  const T = f.thickness;
  const count = f.drawers;
  const h = (y1 - y0 - (count + 1) * g) / count;
  // The fronts are inset: their outer face flush with the front of the panels (w = D).
  const room = D - T - 10;
  const length = [...SLIDES].reverse().find((l) => l <= room) ?? Math.max(100, Math.floor(room / 10) * 10);
  const [bx0, bx1] = [x0 + SLIDE_PLAY, x1 - SLIDE_PLAY];
  const [wa, wb] = [D - T - 2, D - T - 2 - length];
  const parts: NichePart[] = [];
  const box = (name: string, from: Vec3, to: Vec3, role?: NichePart["role"]) => parts.push({ name, kind: "box", from, to, ...(role ? { role } : {}) });
  for (let i = 0; i < count; i++) {
    // Drawers numbered from the top.
    const top = y1 - g - i * (h + g);
    const bottom = top - h;
    const k = i + 1;
    box(`Façade tiroir ${k}`, [x0 + g, bottom, D - T], [x1 - g, top, D], "front");
    // The box behind: 10 mm above the bottom of its front, 30 mm lower than it.
    const vb = bottom + 10;
    const height = Math.max(60, h - 30);
    box(`Tiroir ${k} — côté gauche`, [bx0, vb, wb], [bx0 + DRAWER_SIDE, vb + height, wa]);
    box(`Tiroir ${k} — côté droit`, [bx1 - DRAWER_SIDE, vb, wb], [bx1, vb + height, wa]);
    box(`Tiroir ${k} — avant`, [bx0 + DRAWER_SIDE, vb + DRAWER_BOTTOM, wa - DRAWER_SIDE], [bx1 - DRAWER_SIDE, vb + height, wa]);
    box(`Tiroir ${k} — arrière`, [bx0 + DRAWER_SIDE, vb + DRAWER_BOTTOM, wb], [bx1 - DRAWER_SIDE, vb + height, wb + DRAWER_SIDE]);
    box(`Tiroir ${k} — fond`, [bx0 + DRAWER_SIDE, vb, wb + DRAWER_SIDE], [bx1 - DRAWER_SIDE, vb + DRAWER_BOTTOM, wa - DRAWER_SIDE]);
  }
  return parts;
}

/** A point of the niche's frame in the world. */
export function nicheWorld(n: Pick<NicheGeometry, "frame">, [u, v, w]: Vec3): Vec3 {
  const p = toWorld(n.frame, u, v);
  return [p[0] + n.frame.normal[0] * w, p[1] + n.frame.normal[1] * w, p[2] + n.frame.normal[2] * w];
}

/** The two opposite corners of a box part in the world, lowest first on every axis. */
export function worldBox(n: Pick<NicheGeometry, "frame">, part: Pick<NichePart, "from" | "to">): [Vec3, Vec3] {
  const a = nicheWorld(n, part.from);
  const b = nicheWorld(n, part.to);
  return [[0, 1, 2].map((i) => Math.min(a[i]!, b[i]!)) as Vec3, [0, 1, 2].map((i) => Math.max(a[i]!, b[i]!)) as Vec3];
}

const sketchOf = (features: readonly { id: string; type: string }[], id: string) => features.find((x) => x.id === id) as SketchFeature | undefined;

/** The parts of the feature in this document (none when its niche is gone or the settings impossible). */
export function nichePartsIn(features: readonly { id: string; type: string }[], f: NicheFeature): NichePart[] {
  const n = nicheGeometry(f, sketchOf(features, f.sketch));
  return typeof n === "string" ? [] : nicheParts(f, n);
}

export function nichePartNames(features: readonly { id: string; type: string }[], f: NicheFeature): string[] {
  return nichePartsIn(features, f).map((p) => p.name);
}

/** Default material of each part: drawer fronts like the panels (none set), birch plywood boxes, HDF bottoms. */
export function nicheMaterials(features: readonly { id: string; type: string }[], f: NicheFeature): (string | null)[] {
  return nichePartsIn(features, f).map((p) => (p.role ? null : p.name.endsWith("fond") ? "hdf" : "birch-plywood"));
}

export const ROD = "Tringle de penderie Ø25 (m)";
export const ROD_SUPPORT = "Support de tringle";

/** Hardware of the equipment (to buy, and in the quote): the rod by the metre and its supports, or slides and handles. */
export function nicheHardware(features: readonly { id: string; type: string }[], f: NicheFeature): { name: string; quantity: number; unit?: string }[] {
  const parts = nichePartsIn(features, f);
  if (!parts.length) return [];
  if (f.fill === "rod") {
    const rod = parts.find((p) => p.kind === "rod");
    const metres = rod ? Math.round((rod.to[0] - rod.from[0]) / 10) / 100 : 0;
    return [
      { name: f.diameter === 25 ? ROD : `Tringle de penderie Ø${f.diameter} (m)`, quantity: metres, unit: "m" },
      { name: ROD_SUPPORT, quantity: 2 },
    ];
  }
  const fronts = parts.filter((p) => p.role === "front").length;
  return [{ name: "Coulisse de tiroir (paire)", quantity: fronts }, ...(f.handles ? [{ name: "Poignée entraxe 128 mm", quantity: fronts }] : [])];
}
