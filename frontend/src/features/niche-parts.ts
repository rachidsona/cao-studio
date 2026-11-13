/**
 * Équipement d'une niche de « Répartition », en géométrie pure (sans noyau : sert aussi à nommer les corps, à compter
 * la quincaillerie et à montrer l'aperçu).
 * - Penderie : une tringle ronde d'un côté à l'autre de la niche, à mi-profondeur, son axe à `drop` mm sous le haut,
 *   tenue par deux supports (disques de 3 mm contre les côtés).
 * - Tiroirs : n façades encastrées dans l'ouverture (un jeu en haut, un en bas, un entre elles, un de côté), chacune avec son caisson
 *   (côtés, avant, arrière, fond) sur coulisses de 12,5 mm, de la longueur du commerce qui tient dans la profondeur. En
 *   applique (`mount`), les façades passent devant les panneaux et couvrent la moitié de ceux autour de la niche (le
 *   panneau entier au bord du meuble), comme une porte ; leurs jeux de bord sont alors partagés avec la voisine (moitié).
 * - Porte sur niches : en applique comme une porte de case, ou encastrée dans les niches (un jeu tout autour, sa face
 *   au nu des panneaux).
 * - Portes (de toute la répartition) : une porte en applique devant chaque case. Elle couvre le dessus et le dessous ;
 *   un côté extérieur ou un côté double (chaque case a le sien), elle le couvre en entier ; un côté simple, elle en
 *   couvre la moitié, l'autre moitié est à la porte voisine ; deux cases sans côté entre elles ont chacune leur porte,
 *   qui se rejoignent au milieu de la place du côté absent.
 * - Porte vitrée (portes de case ou sur niches) : la porte est le cadre en profilé alu ; son verre trempé vient après
 *   les poignées (« Vitre porte n »), au milieu de l'épaisseur, et pivote avec elle (glass-door.ts).
 * - Accessoire : une pièce achetée du catalogue (accessory-parts.ts), posée à une hauteur dans la niche.
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
import { isPartition, pathKey, rebuildChain, type NicheNode } from "../sketcher/partition-history";
import type { NicheBox } from "../sketcher/shelves";
import { DRAWER_BOTTOM, DRAWER_SIDE, SLIDE_PLAY, SLIDES } from "./fronts-parts";
import { accessoryHardware, accessoryParts, accessoryProblem } from "./accessory-parts";
import { ALU_HINGE, glassFrame, glassHardware, glassPane, glassProblem, handleInset, isGlass } from "./glass-door";

export interface NicheGeometry {
  frame: SketchFrame;
  box: NicheBox;
  depth: number;
  /** The partition's measures and where it stands in the sketch (the doors follow its cases and dividers). */
  step?: { input: PartitionParams; origin: [number, number] };
  /** Cut at an angle: its front is not a straight line in front of its niches. */
  cut?: boolean;
  /** What fronts overlaid on the niche cover: out to the middle of the panels around it (drawers « en applique »). */
  outer?: NicheBox;
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
  /** A handle or the glass of a door: the index of the front it is on (it swings or slides with it). */
  of?: number;
}

export const SUPPORT = 3;
export const MAX_DRAWERS = 8;

/** The niche the feature equips, with the frame of its sketch and the depth of the partition's panels. */
export function nicheGeometry(f: Pick<NicheFeature, "partition" | "niche"> & { fill?: NicheFeature["fill"]; span?: number[][]; mount?: NicheFeature["mount"] }, sketch: SketchFeature | undefined): NicheGeometry | string {
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
  if (f.fill === "door") {
    const box = doorBox(rebuilt.niches, [f.niche, ...(f.span ?? [])], step);
    if (typeof box === "string") return box;
    // Inset: in the niches themselves; overlaid: over half the panels around them.
    return { frame, box: f.mount === "inset" ? box.inner : box.outer, depth: record.step.depth, step, ...cut };
  }
  const node = rebuilt.niches.get(pathKey(f.niche));
  if (!node) return "Sa niche n'existe plus.";
  const over = f.fill === "drawers" && f.mount === "overlay" ? doorBox(rebuilt.niches, [f.niche], step) : null;
  return { frame, box: node.box, depth: record.step.depth, step, ...cut, ...(over && typeof over !== "string" ? { outer: over.outer } : {}) };
}

/**
 * What a door over these niches covers: the rectangle they make, out to the middle of the panels around it (to the
 * middle of the space to the next niche: half a simple panel, a whole one of a double side), and over the whole panel
 * at the edge of the cabinet — as the door of a case. The niches must make a rectangle, with no other niche inside.
 */
function doorBox(niches: Map<string, NicheNode>, paths: number[][], step: { input: PartitionParams; origin: [number, number] }): { inner: NicheBox; outer: NicheBox } | string {
  const chosen = paths.map((p) => niches.get(pathKey(p)));
  if (chosen.some((n) => !n)) return "Une niche de cette porte n'existe plus : refaites la porte.";
  const boxes = chosen.map((n) => n!.box);
  const box = { x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)), x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)) };
  const keys = [...niches.keys()];
  const chosenKeys = new Set(paths.map(pathKey));
  const leaves = [...niches.values()].filter((n) => !keys.some((k) => k.startsWith(`${pathKey(n.path)}.`)) && !chosenKeys.has(pathKey(n.path)));
  const EPS = 1e-6;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;
  if (leaves.some((n) => overlap(n.box.x0, n.box.x1, box.x0, box.x1) && overlap(n.box.y0, n.box.y1, box.y0, box.y1))) return "Les niches d'une porte doivent former un rectangle, sans autre niche au milieu.";
  const [ox, oy] = step.origin;
  const outer = { x0: ox, x1: ox + step.input.length, y0: oy + (step.input.boards ? step.input.plinth : 0), y1: oy + step.input.height };
  const across = (n: NicheNode, along: "x" | "y") => (along === "x" ? overlap(n.box.y0, n.box.y1, box.y0, box.y1) : overlap(n.box.x0, n.box.x1, box.x0, box.x1));
  const below = (edge: number, along: "x" | "y", end: "0" | "1") => {
    const near = leaves.filter((n) => across(n, along) && (end === "0" ? n.box[`${along}1`] <= edge + EPS : n.box[`${along}0`] >= edge - EPS));
    if (!near.length) return outer[`${along}${end}`];
    const next = end === "0" ? Math.max(...near.map((n) => n.box[`${along}1`])) : Math.min(...near.map((n) => n.box[`${along}0`]));
    return (edge + next) / 2;
  };
  return { inner: box, outer: { x0: below(box.x0, "x", "0"), x1: below(box.x1, "x", "1"), y0: below(box.y0, "y", "0"), y1: below(box.y1, "y", "1") } };
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

/** Why doors of these sizes cannot have this style: a frame too wide or a panel too thin, a glass door impossible. */
function styleProblem(f: Pick<NicheFeature, "style" | "frameWidth" | "frameDepth" | "glass" | "profile" | "thickness">, doors: { width: number; height: number }[]): string | null {
  if (f.style === "frame") {
    const [w, d] = [f.frameWidth ?? 70, f.frameDepth ?? 6];
    if (doors.some((door) => Math.min(door.width, door.height) - 2 * w < 40)) return "Le cadre est trop large pour ces portes.";
    if (!(d < f.thickness - 3)) return "Le panneau doit rester épais d'au moins 3 mm : réduisez le retrait.";
  }
  return glassProblem(f, doors, f.thickness);
}

/** Why these settings cannot equip this niche, or null. */
export function nicheProblem(f: Omit<NicheFeature, "id" | "type" | "name" | "sketch" | "partition" | "niche">, n: NicheGeometry): string | null {
  if (n.cut && f.fill === "drawers") return "Pas de tiroirs dans un angle coupé : ils sortiraient par le pan coupé.";
  if (n.cut && (f.fill === "doors" || f.fill === "door")) return "Un angle coupé n'a pas ces portes : cochez « Porte sur le pan coupé » dans le Plan de dressing.";
  if (f.fill === "accessory") return accessoryProblem(f, n);
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
  if (f.fill === "door") {
    if (!(f.thickness > 0)) return "L'épaisseur de la porte doit être positive.";
    if (!(f.gap >= 0)) return "Le jeu ne peut pas être négatif.";
    if (f.mount === "inset" && !(f.thickness < n.depth)) return "La porte encastrée doit être moins épaisse que la profondeur des niches.";
    const g = f.mount === "inset" ? 2 * f.gap : f.gap;
    if (Math.min(width, height) - g < 50) return "Le jeu est trop grand pour cette porte.";
    return styleProblem(f, [{ width: width - g, height: height - g }]);
  }
  if (f.fill === "doors") {
    if (!(f.thickness > 0)) return "L'épaisseur des portes doit être positive.";
    if (!(f.gap >= 0)) return "Le jeu ne peut pas être négatif.";
    const doors = n.step ? partitionDoors(n.step.input, n.step.origin, f.gap, f.joined, f.skipped) : "La répartition manque.";
    if (typeof doors === "string") return doors;
    if (doors.some(([x0, , x1]) => x1 - x0 < 50)) return "Le jeu est trop grand pour ces portes.";
    return styleProblem(f, doors.map(([x0, y0, x1, y1]) => ({ width: x1 - x0, height: y1 - y0 })));
  }
  if (!Number.isInteger(f.drawers) || f.drawers < 1 || f.drawers > MAX_DRAWERS) return `De 1 à ${MAX_DRAWERS} tiroirs.`;
  if (!(f.thickness > 0)) return "L'épaisseur des façades doit être positive.";
  if ([f.gap, f.bottomGap ?? f.gap, f.sideGap ?? f.gap, f.betweenGap ?? f.gap].some((v) => !(v >= 0))) return "Le jeu ne peut pas être négatif.";
  const fronts = drawerFronts(f, n);
  if (fronts.x1 - fronts.x0 < 60) return "Le jeu de côté est trop grand pour la largeur de la niche.";
  if (width < 2 * (SLIDE_PLAY + DRAWER_SIDE) + 60) return "La niche est trop étroite pour des tiroirs.";
  if (fronts.h < 80) return "La niche est trop basse pour autant de tiroirs (80 mm de façade au moins).";
  if (n.depth - (n.outer ? 0 : f.thickness) < 150) return "La niche n'est pas assez profonde pour des tiroirs.";
  return null;
}

/** Every part, in body order; none when the settings are impossible. */
export function nicheParts(f: NicheFeature, n: NicheGeometry): NichePart[] {
  if (nicheProblem(f, n)) return [];
  if (f.fill === "accessory") return accessoryParts(f, n);
  const { x0, x1, y0, y1 } = n.box;
  const D = n.depth;
  if (f.fill === "back") {
    const backs = n.step ? partitionBacks(n.step.input, n.step.origin, f.split) : [];
    if (typeof backs === "string") return [];
    // Behind the sketch plane, where the panels start: over the top, the bottom and the sides, from end to end.
    return backs.map(([a, b], i, all): NichePart => ({ name: all.length > 1 ? `Fond ${i + 1}` : "Fond", kind: "box", from: [a, y0, -f.thickness], to: [b, y1, 0] }));
  }
  if (f.fill === "doors" || f.fill === "door") {
    // An inset door: a gap all round in its niches, its face flush with the panels'; else half a gap to its neighbours.
    const inset = f.fill === "door" && f.mount === "inset";
    const g = inset ? f.gap : f.gap / 2;
    const doors = f.fill === "door" ? [[x0 + g, y0 + g, x1 - g, y1 - g] as const] : n.step ? partitionDoors(n.step.input, n.step.origin, f.gap, f.joined, f.skipped) : [];
    if (typeof doors === "string") return [];
    const [w0, w1] = inset ? [D - f.thickness, D] : [D, D + f.thickness];
    // In front of the panels; hinged on the side chosen, else on the left, then on the right, in turn (a pair opens from
    // the middle). The handle goes along the other edge.
    const parts = doors.map(([a, b, c, d], i): NichePart => {
      const hinge = f.hinges?.[i] ?? (i % 2 === 0 ? "left" : "right");
      return { name: `Porte ${i + 1}`, kind: "box", from: [a, b, w0], to: [c, d, w1], role: "front", handle: hinge === "left" ? "right" : "left" };
    });
    // The handles, after the doors (their numbers stay): along the edge opposite the hinges, 40 mm in (on the frame of
    // a glass door), at mid-height.
    const count = parts.length;
    const handleIn = handleInset(f);
    if (f.handles) parts.forEach((door, i) => {
      const u = door.handle === "left" ? door.from[0] + handleIn : door.to[0] - handleIn;
      const v = (door.from[1] + door.to[1]) / 2;
      parts.push({ name: `Poignée porte ${i + 1}`, kind: "handle", from: [u, v - half(f), door.to[2]], to: [u, v + half(f), door.to[2]], role: "hardware", of: i });
    });
    // The glass of each glazed door, last: bought, it turns with its door.
    if (isGlass(f)) parts.slice(0, count).forEach((door, i) => {
      const [from, to] = glassPane(door.from, door.to, 2, glassFrame(f));
      parts.push({ name: `Vitre porte ${i + 1}`, kind: "box", from, to, role: "hardware", of: i });
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
  const between = f.betweenGap ?? f.gap;
  const T = f.thickness;
  const count = f.drawers;
  const fronts = drawerFronts(f, n);
  const h = fronts.h;
  // Inset fronts: their outer face flush with the front of the panels (w = D); overlaid ones in front of the panels.
  const overlay = !!n.outer;
  const [f0, f1] = overlay ? [D, D + T] : [D - T, D];
  const room = f0 - 10;
  const length = [...SLIDES].reverse().find((l) => l <= room) ?? Math.max(100, Math.floor(room / 10) * 10);
  const [bx0, bx1] = [x0 + SLIDE_PLAY, x1 - SLIDE_PLAY];
  const [wa, wb] = [f0 - 2, f0 - 2 - length];
  const parts: NichePart[] = [];
  const box = (name: string, from: Vec3, to: Vec3, role?: NichePart["role"]) => parts.push({ name, kind: "box", from, to, ...(role ? { role } : {}) });
  for (let i = 0; i < count; i++) {
    // Drawers numbered from the top.
    const top = fronts.y1 - i * (h + between);
    const bottom = top - h;
    const k = i + 1;
    box(`Façade tiroir ${k}`, [fronts.x0, bottom, f0], [fronts.x1, top, f1], "front");
    // The box behind: 10 mm above the bottom of its front, 30 mm lower than it — inside the niche (an overlaid front
    // reaches over the panels around it).
    const vb = Math.max(bottom + 10, y0 + 2);
    const height = Math.max(60, Math.min(top - 20, y1 - 5) - vb);
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

/**
 * Where the drawer fronts lie across the niche (x0, x1), the top of the first (y1), and each one's height: in the niche
 * less its gaps; overlaid, over half the panels around it, half the gaps at its edges (the other half is the neighbour's).
 */
function drawerFronts(f: Pick<NicheFeature, "drawers" | "gap" | "bottomGap" | "betweenGap" | "sideGap">, n: Pick<NicheGeometry, "box" | "outer">): { x0: number; x1: number; y1: number; h: number } {
  const r = n.outer ?? n.box;
  const k = n.outer ? 0.5 : 1;
  const [top, bottom, side] = [f.gap * k, (f.bottomGap ?? f.gap) * k, (f.sideGap ?? f.gap) * k];
  return { x0: r.x0 + side, x1: r.x1 - side, y1: r.y1 - top, h: (r.y1 - r.y0 - top - bottom - (f.drawers - 1) * (f.betweenGap ?? f.gap)) / f.drawers };
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
  // A pull-out shelf is a board like the panels.
  if (f.fill === "accessory") return nichePartsIn(features, f).map(() => null);
  return nichePartsIn(features, f).map((p) => (p.role ? null : p.name.endsWith("fond") ? "hdf" : "birch-plywood"));
}

export const ROD = "Tringle de penderie Ø25 (m)";
export const ROD_SUPPORT = "Support de tringle";

/** Hardware of the equipment (to buy, and in the quote): the rod by the metre and its supports, or slides and handles. */
export function nicheHardware(features: readonly { id: string; type: string }[], f: NicheFeature): { name: string; quantity: number; unit?: string; price?: number }[] {
  const parts = nichePartsIn(features, f);
  if (!parts.length || f.fill === "back") return [];
  if (f.fill === "accessory") return accessoryHardware(f, parts);
  if (f.fill === "rod") {
    const rod = parts.find((p) => p.kind === "rod");
    const metres = rod ? Math.round((rod.to[0] - rod.from[0]) / 10) / 100 : 0;
    return [
      { name: f.diameter === 25 ? ROD : `Tringle de penderie Ø${f.diameter} (m)`, quantity: metres, unit: "m" },
      { name: ROD_SUPPORT, quantity: 2 },
    ];
  }
  const fronts = parts.filter((p) => p.role === "front").length;
  if (f.fill === "doors" || f.fill === "door") {
    const doors = parts.filter((p) => p.role === "front");
    const hinges = doors.reduce((sum, p) => sum + hingeCount(p.to[1] - p.from[1]), 0);
    // A glass door: its glass and its aluminium frame bought, hinges made for the frame.
    const glass = glassHardware(f, doors.map((p) => ({ from: p.from, to: p.to, depth: 2 as const })));
    return [{ name: isGlass(f) ? ALU_HINGE : "Charnière à boîtier Ø35", quantity: hinges }, ...(f.handles ? [{ name: "Poignée entraxe 128 mm", quantity: fronts }] : []), ...glass];
  }
  return [{ name: "Coulisse de tiroir (paire)", quantity: fronts }, ...(f.handles ? [{ name: "Poignée entraxe 128 mm", quantity: fronts }] : [])];
}
