/**
 * Équipement d'une niche de « Répartition », en géométrie pure (sans noyau : sert aussi à nommer les corps, à compter
 * la quincaillerie et à montrer l'aperçu).
 * - Penderie : une tringle ronde d'un côté à l'autre de la niche, à mi-profondeur, son axe à `drop` mm sous le haut,
 *   tenue par deux supports (disques de 3 mm contre les côtés).
 * - Tiroirs : n façades encastrées dans l'ouverture (un jeu en haut, un en bas, un entre elles, un de côté), chacune avec son caisson
 *   (côtés, avant, arrière, fond) sur coulisses de 12,5 mm, de la longueur du commerce qui tient dans la profondeur.
 * - Portes (de toute la répartition) : une porte en applique devant chaque case. Elle couvre le dessus et le dessous ;
 *   un côté extérieur ou un côté double (chaque case a le sien), elle le couvre en entier ; un côté simple, elle en
 *   couvre la moitié, l'autre moitié est à la porte voisine ; deux cases sans côté entre elles ont chacune leur porte,
 *   qui se rejoignent au milieu de la place du côté absent.
 * - Fond (de toute la répartition) : en applique derrière les panneaux, sur le dessus, le dessous et les côtés ; un seul
 *   pour tout le placard, ou un par case (coupé au milieu d'un côté simple, comme les portes ; un seul pour des cases
 *   sans côté entre elles).
 * Les pièces sont des boîtes dans le repère de la niche : u le long de la largeur (x de l'esquisse), v vers le haut
 * (y de l'esquisse), w dans la profondeur, compté depuis le plan de l'esquisse le long de sa normale ; la face avant
 * des panneaux est à w = profondeur.
 */
import type { PartitionParams } from "../document/sketch";
import type { NicheFeature, SketchFeature, Vec3 } from "../document/types";
import { hingeCount } from "./fronts-parts";
import { partitionLayout } from "../sketcher/partition";
import { frameOf, toWorld, type SketchFrame } from "../sketcher/frame";
import { isPartition, pathKey, rebuildChain } from "../sketcher/partition-history";
import type { NicheBox } from "../sketcher/shelves";
import { DRAWER_BOTTOM, DRAWER_SIDE, SLIDE_PLAY, SLIDES } from "./fronts-parts";

export interface NicheGeometry {
  frame: SketchFrame;
  box: NicheBox;
  depth: number;
  /** The partition's measures and where it stands in the sketch (the doors follow its cases and dividers). */
  step?: { input: PartitionParams; origin: [number, number] };
  /** Cut at an angle: its front is not a straight line in front of its niches. */
  cut?: boolean;
}

/** A part, in the niche's frame: a box, or the rod (a cylinder along u). */
export interface NichePart {
  name: string;
  /** « handle »: the handle of a front, in 3D, from its first hole (`from`) to its second (`to`, the same for a knob). */
  kind: "box" | "rod" | "disc" | "handle";
  /** [u0, v0, w0] and [u1, v1, w1]; a rod or a disc: from one end of its axis to the other, `radius` around it. */
  from: Vec3;
  to: Vec3;
  radius?: number;
  /** A drawer front or a door (its handle holes), or a hardware part (bought, not cut: out of the cut list). */
  role?: "front" | "hardware";
  /** A door: the edge its handle goes along (the other one has the hinges). */
  handle?: "left" | "right";
  /** A handle: the index of the front it is on (it swings or slides with it). */
  of?: number;
}

export const SUPPORT = 3;
const MAX_DRAWERS = 8;

/** The niche the feature equips, with the frame of its sketch and the depth of the partition's panels. */
export function nicheGeometry(f: Pick<NicheFeature, "partition" | "niche"> & { fill?: NicheFeature["fill"] }, sketch: SketchFeature | undefined): NicheGeometry | string {
  if (!sketch || sketch.type !== "sketch") return "L'esquisse de la répartition n'existe plus.";
  const frame = frameOf(sketch);
  // The parts are boxes along the axes: the sketch must lie in a main plane (or a parallel one).
  const straight = [frame.u, frame.v, frame.normal].every((a) => a.filter((c) => Math.abs(c) > 1e-9).length === 1);
  if (!straight) return "La répartition doit être dessinée dans un plan principal (face, dessus ou côté).";
  const record = (sketch.offsets ?? []).find((r) => r.id === f.partition);
  if (!record || !isPartition(record)) return "Cette répartition n'existe plus.";
  if (!(record.step.depth && record.step.depth > 0)) return "Les panneaux de la répartition ne sont pas extrudés : leur profondeur manque.";
  const step = { input: record.step.input, origin: record.step.origin };
  const cut = sketch.clip ? { cut: true } : {};
  if (f.fill === "doors" || f.fill === "back") {
    const [x, y] = record.step.origin;
    return { frame, box: { x0: x, y0: y, x1: x + record.step.input.length, y1: y + record.step.input.height }, depth: record.step.depth, step, ...cut };
  }
  const rebuilt = rebuildChain(sketch, f.partition);
  if (typeof rebuilt === "string") return rebuilt;
  const node = rebuilt.niches.get(pathKey(f.niche));
  if (!node) return "Sa niche n'existe plus.";
  return { frame, box: node.box, depth: record.step.depth, step, ...cut };
}

/**
 * Where each case's front reaches, from the left, as [x0, x1] relative to the partition: over the outer side or its own
 * panel of a double side whole, to the middle of a simple side, or of the place of a side left out.
 */
function caseFronts(input: PartitionParams, caseWidths: readonly number[]): [number, number][] {
  const e = input.thickness;
  const reach = (kind: string | undefined) => (kind === "single" || kind === "none" ? e / 2 : e);
  let x = e;
  return caseWidths.map((w, i): [number, number] => {
    const [a, b] = [x, x + w];
    x = b + (input.dividers[i] === "double" ? 2 * e : e);
    return [a - reach(input.dividers[i - 1]), b + reach(input.dividers[i])];
  });
}

/**
 * The doors of a partition, from the left, as rectangles of the sketch [x0, y0, x1, y1]: one per case, even for cases
 * joined without a side (they then meet in the middle of the side's place), `gap` mm apart and `gap` / 2 in from the
 * outer edges. The doors starting on a case of `skipped` are left out.
 */
export function partitionDoors(input: PartitionParams, origin: [number, number], gap: number, joined: readonly number[] = [], skipped: readonly number[] = []): [number, number, number, number][] | string {
  const layout = partitionLayout(input);
  if (typeof layout === "string") return layout;
  const [ox, oy] = origin;
  const bottom = input.boards ? input.plinth : 0;
  // Cases sharing a door: it goes from the left of the first to the right of the last.
  const fronts = caseFronts(input, layout.caseWidths).reduce<[number, number, number][]>((all, [a, b], i) => {
    const last = all[all.length - 1];
    if (last && joined.includes(i - 1)) last[1] = b;
    else all.push([a, b, i]);
    return all;
  }, []);
  return fronts.filter(([, , first]) => !skipped.includes(first)).map(([a, b]): [number, number, number, number] => [ox + a + gap / 2, oy + bottom + gap / 2, ox + b - gap / 2, oy + input.height - gap / 2]);
}

/**
 * The back panels of a partition, from the left, as [x0, x1] of the sketch: the whole length, or one per case (cut in
 * the middle of a simple side, like the doors; cases joined without a side share one, nothing stands there to hold a
 * joint).
 */
export function partitionBacks(input: PartitionParams, origin: [number, number], split: "whole" | "cases" = "whole"): [number, number][] | string {
  if (split === "whole") return [[origin[0], origin[0] + input.length]];
  const layout = partitionLayout(input);
  if (typeof layout === "string") return layout;
  const spans: [number, number][] = [];
  caseFronts(input, layout.caseWidths).forEach(([a, b], i) => {
    const last = spans[spans.length - 1];
    if (last && input.dividers[i - 1] === "none") last[1] = origin[0] + b;
    else spans.push([origin[0] + a, origin[0] + b]);
  });
  return spans;
}

/** Why these settings cannot equip this niche, or null. */
export function nicheProblem(f: Omit<NicheFeature, "id" | "type" | "name" | "sketch" | "partition" | "niche">, n: NicheGeometry): string | null {
  if (n.cut && f.fill === "drawers") return "Pas de tiroirs dans un angle coupé : ils sortiraient par le pan coupé.";
  if (n.cut && f.fill === "doors") return "Un angle coupé n'a pas ces portes : cochez « Porte sur le pan coupé » dans le Plan de dressing.";
  const width = n.box.x1 - n.box.x0;
  const height = n.box.y1 - n.box.y0;
  if (f.fill === "rod") {
    if (!(f.diameter >= 10 && f.diameter <= 50)) return "Le diamètre de la tringle va de 10 à 50 mm.";
    if (width < 2 * SUPPORT + 50) return "La niche est trop étroite pour une tringle.";
    if (!(f.drop >= f.diameter / 2 + 5)) return `La tringle doit être à au moins ${f.diameter / 2 + 5} mm sous le haut de la niche.`;
    if (f.drop > height - f.diameter / 2) return "La tringle tombe sous le bas de la niche : réduisez la distance sous le haut.";
    return null;
  }
  if (f.fill === "back") {
    if (!(f.thickness > 0)) return "L'épaisseur du fond doit être positive.";
    const backs = n.step ? partitionBacks(n.step.input, n.step.origin, f.split) : "La répartition manque.";
    return typeof backs === "string" ? backs : null;
  }
  if (f.fill === "doors") {
    if (!(f.thickness > 0)) return "L'épaisseur des portes doit être positive.";
    if (!(f.gap >= 0)) return "Le jeu ne peut pas être négatif.";
    const doors = n.step ? partitionDoors(n.step.input, n.step.origin, f.gap, f.joined, f.skipped) : "La répartition manque.";
    if (typeof doors === "string") return doors;
    if (doors.some(([x0, , x1]) => x1 - x0 < 50)) return "Le jeu est trop grand pour ces portes.";
    if (f.style === "frame") {
      const [w, d] = [f.frameWidth ?? 70, f.frameDepth ?? 6];
      if (doors.some(([x0, y0, x1, y1]) => Math.min(x1 - x0, y1 - y0) - 2 * w < 40)) return "Le cadre est trop large pour ces portes.";
      if (!(d < f.thickness - 3)) return "Le panneau doit rester épais d'au moins 3 mm : réduisez le retrait.";
    }
    return null;
  }
  if (!Number.isInteger(f.drawers) || f.drawers < 1 || f.drawers > MAX_DRAWERS) return `De 1 à ${MAX_DRAWERS} tiroirs.`;
  if (!(f.thickness > 0)) return "L'épaisseur des façades doit être positive.";
  if ([f.gap, f.bottomGap ?? f.gap, f.sideGap ?? f.gap, f.betweenGap ?? f.gap].some((v) => !(v >= 0))) return "Le jeu ne peut pas être négatif.";
  if (width - 2 * (f.sideGap ?? f.gap) < 60) return "Le jeu de côté est trop grand pour la largeur de la niche.";
  if (width < 2 * (SLIDE_PLAY + DRAWER_SIDE) + 60) return "La niche est trop étroite pour des tiroirs.";
  if (frontHeight(height, f) < 80) return "La niche est trop basse pour autant de tiroirs (80 mm de façade au moins).";
  if (n.depth - f.thickness < 150) return "La niche n'est pas assez profonde pour des tiroirs.";
  return null;
}

/** Every part, in body order; none when the settings are impossible. */
export function nicheParts(f: NicheFeature, n: NicheGeometry): NichePart[] {
  if (nicheProblem(f, n)) return [];
  const { x0, x1, y0, y1 } = n.box;
  const D = n.depth;
  if (f.fill === "back") {
    const backs = n.step ? partitionBacks(n.step.input, n.step.origin, f.split) : [];
    if (typeof backs === "string") return [];
    // Behind the sketch plane, where the panels start: over the top, the bottom and the sides, from end to end.
    return backs.map(([a, b], i, all): NichePart => ({ name: all.length > 1 ? `Fond ${i + 1}` : "Fond", kind: "box", from: [a, y0, -f.thickness], to: [b, y1, 0] }));
  }
  if (f.fill === "doors") {
    const doors = n.step ? partitionDoors(n.step.input, n.step.origin, f.gap, f.joined, f.skipped) : [];
    if (typeof doors === "string") return [];
    // In front of the panels; hinged on the side chosen, else on the left, then on the right, in turn (a pair opens from
    // the middle). The handle goes along the other edge.
    const parts = doors.map(([a, b, c, d], i): NichePart => {
      const hinge = f.hinges?.[i] ?? (i % 2 === 0 ? "left" : "right");
      return { name: `Porte ${i + 1}`, kind: "box", from: [a, b, D], to: [c, d, D + f.thickness], role: "front", handle: hinge === "left" ? "right" : "left" };
    });
    // The handles, after the doors (their numbers stay): along the edge opposite the hinges, 40 mm in, at mid-height.
    if (f.handles) parts.forEach((door, i) => {
      const u = door.handle === "left" ? door.from[0] + 40 : door.to[0] - 40;
      const v = (door.from[1] + door.to[1]) / 2;
      parts.push({ name: `Poignée porte ${i + 1}`, kind: "handle", from: [u, v - half(f), door.to[2]], to: [u, v + half(f), door.to[2]], role: "hardware", of: i });
    });
    return parts;
  }
  if (f.fill === "rod") {
    const r = f.diameter / 2;
    const [v, w] = [y1 - f.drop, D / 2];
    return [
      { name: "Tringle", kind: "rod", from: [x0 + SUPPORT, v, w], to: [x1 - SUPPORT, v, w], radius: r, role: "hardware" },
      { name: "Support gauche", kind: "disc", from: [x0, v, w], to: [x0 + SUPPORT, v, w], radius: r + 8, role: "hardware" },
      { name: "Support droit", kind: "disc", from: [x1 - SUPPORT, v, w], to: [x1, v, w], radius: r + 8, role: "hardware" },
    ];
  }
  // Above the top front and under the bottom one, between two fronts, and on their sides.
  const g = f.gap;
  const between = f.betweenGap ?? f.gap;
  const side = f.sideGap ?? f.gap;
  const T = f.thickness;
  const count = f.drawers;
  const h = frontHeight(y1 - y0, f);
  // The fronts are inset: their outer face flush with the front of the panels (w = D).
  const room = D - T - 10;
  const length = [...SLIDES].reverse().find((l) => l <= room) ?? Math.max(100, Math.floor(room / 10) * 10);
  const [bx0, bx1] = [x0 + SLIDE_PLAY, x1 - SLIDE_PLAY];
  const [wa, wb] = [D - T - 2, D - T - 2 - length];
  const parts: NichePart[] = [];
  const box = (name: string, from: Vec3, to: Vec3, role?: NichePart["role"]) => parts.push({ name, kind: "box", from, to, ...(role ? { role } : {}) });
  for (let i = 0; i < count; i++) {
    // Drawers numbered from the top.
    const top = y1 - g - i * (h + between);
    const bottom = top - h;
    const k = i + 1;
    box(`Façade tiroir ${k}`, [x0 + side, bottom, D - T], [x1 - side, top, D], "front");
    // The box behind: 10 mm above the bottom of its front, 30 mm lower than it.
    const vb = bottom + 10;
    const height = Math.max(60, h - 30);
    box(`Tiroir ${k} — côté gauche`, [bx0, vb, wb], [bx0 + DRAWER_SIDE, vb + height, wa]);
    box(`Tiroir ${k} — côté droit`, [bx1 - DRAWER_SIDE, vb, wb], [bx1, vb + height, wa]);
    box(`Tiroir ${k} — avant`, [bx0 + DRAWER_SIDE, vb + DRAWER_BOTTOM, wa - DRAWER_SIDE], [bx1 - DRAWER_SIDE, vb + height, wa]);
    box(`Tiroir ${k} — arrière`, [bx0 + DRAWER_SIDE, vb + DRAWER_BOTTOM, wb], [bx1 - DRAWER_SIDE, vb + height, wb + DRAWER_SIDE]);
    box(`Tiroir ${k} — fond`, [bx0 + DRAWER_SIDE, vb, wb + DRAWER_SIDE], [bx1 - DRAWER_SIDE, vb + DRAWER_BOTTOM, wa - DRAWER_SIDE]);
  }
  // The handles of the drawers, after every other part: across the middle of each front.
  if (f.handles) {
    parts.forEach((front, i) => {
      if (front.role !== "front") return;
      const [u, v] = [(front.from[0] + front.to[0]) / 2, (front.from[1] + front.to[1]) / 2];
      parts.push({ name: `Poignée ${front.name.replace(/^Façade /, "")}`, kind: "handle", from: [u - half(f), v, front.to[2]], to: [u + half(f), v, front.to[2]], role: "hardware", of: i });
    });
  }
  return parts;
}

/** The height of each drawer front in a niche this high: what the gaps leave, shared. */
function frontHeight(height: number, f: Pick<NicheFeature, "drawers" | "gap" | "bottomGap" | "betweenGap">): number {
  return (height - f.gap - (f.bottomGap ?? f.gap) - (f.drawers - 1) * (f.betweenGap ?? f.gap)) / f.drawers;
}

/** Half the spacing of the handle's holes (128 mm unless another handle was chosen; 0 for a knob). */
const half = (f: Pick<NicheFeature, "hw">) => (f.hw?.handleSpacing ?? 128) / 2;

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

/**
 * Default material of each part: drawer fronts like the panels (none set), birch plywood boxes, HDF bottoms; a back in
 * HDF up to 10 mm, else like the panels.
 */
export function nicheMaterials(features: readonly { id: string; type: string }[], f: NicheFeature): (string | null)[] {
  if (f.fill === "back") return nichePartsIn(features, f).map(() => (f.thickness <= 10 ? "hdf" : null));
  return nichePartsIn(features, f).map((p) => (p.role ? null : p.name.endsWith("fond") ? "hdf" : "birch-plywood"));
}

export const ROD = "Tringle de penderie Ø25 (m)";
export const ROD_SUPPORT = "Support de tringle";

/** Hardware of the equipment (to buy, and in the quote): the rod by the metre and its supports, or slides and handles. */
export function nicheHardware(features: readonly { id: string; type: string }[], f: NicheFeature): { name: string; quantity: number; unit?: string }[] {
  const parts = nichePartsIn(features, f);
  if (!parts.length || f.fill === "back") return [];
  if (f.fill === "rod") {
    const rod = parts.find((p) => p.kind === "rod");
    const metres = rod ? Math.round((rod.to[0] - rod.from[0]) / 10) / 100 : 0;
    return [
      { name: f.diameter === 25 ? ROD : `Tringle de penderie Ø${f.diameter} (m)`, quantity: metres, unit: "m" },
      { name: ROD_SUPPORT, quantity: 2 },
    ];
  }
  const fronts = parts.filter((p) => p.role === "front").length;
  if (f.fill === "doors") {
    const hinges = parts.filter((p) => p.role === "front").reduce((sum, p) => sum + hingeCount(p.to[1] - p.from[1]), 0);
    return [{ name: "Charnière à boîtier Ø35", quantity: hinges }, ...(f.handles ? [{ name: "Poignée entraxe 128 mm", quantity: fronts }] : [])];
  }
  return [{ name: "Coulisse de tiroir (paire)", quantity: fronts }, ...(f.handles ? [{ name: "Poignée entraxe 128 mm", quantity: fronts }] : [])];
}
