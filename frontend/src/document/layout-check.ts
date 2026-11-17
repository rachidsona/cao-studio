/**
 * Contrôle d'implantation, en géométrie pure, sur ce qui est posé dans
 * la pièce — caissons, électroménager, plans de travail, murs, tringles — :
 * - un meuble ou un appareil qui sort de la pièce relevée ;
 * - une plaque qui ne repose pas sur un plan de travail ;
 * - une hotte au-dessus d'aucune plaque, trop basse (moins de 60 cm) ou trop haute (plus de 80 cm ; 65 à 75 conseillés) ;
 * - une plaque à moins de 60 cm de l'évier ;
 * - moins de 80 cm devant un four, un réfrigérateur, un lave-vaisselle ou un lave-linge ;
 * - un meuble haut à moins de 45 cm au-dessus de la plaque ;
 * - une tringle de penderie hors de 170 à 190 cm du sol (la basse d'une double penderie n'en est pas).
 * Les chevauchements de pièces sont ceux du Contrôle avant fabrication (fabrication-check.ts).
 */
import type { KitchenLayout } from "../features/kitchen-layout";
import type { P2 } from "../features/room-plan";
import type { Problem } from "./fabrication-check";
import type { Vec3 } from "./types";

export type Role = "hob" | "hood" | "sink" | "oven" | "fridge" | "dishwasher" | "washer" | "rail";

export interface PlacedItem {
  /** The bodies it is (to select them); empty for an item of a plan not yet made. */
  ids: string[];
  name: string;
  box: [Vec3, Vec3];
  kind: "cabinet" | "appliance" | "worktop" | "wall";
  role?: Role;
  /** Which way its front faces (plan view), when known. */
  front?: P2;
}

export interface LayoutInput {
  items: PlacedItem[];
  /** The inside of the surveyed room, seen from above (counterclockwise or not), when there is one. */
  room?: P2[];
}

const cm = (mm: number) => (Math.round(mm / 10) / 1).toLocaleString("fr-FR");
const warn = (message: string, ids: string[]): Problem => ({ kind: "layout", severity: "warning", message, bodies: ids });

const footprint = (b: [Vec3, Vec3]): P2[] => [[b[0][0], b[0][1]], [b[1][0], b[0][1]], [b[1][0], b[1][1]], [b[0][0], b[1][1]]];

/** Even-odd rule, a point on an edge counted inside (1 mm of tolerance). */
export function inPolygon(p: P2, polygon: readonly P2[], tolerance = 1): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i]!, polygon[j]!];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) {
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len)));
      if (Math.hypot(p[0] - (a[0] + t * (b[0] - a[0])), p[1] - (a[1] + t * (b[1] - a[1]))) <= tolerance) return true;
    }
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Overlap of two boxes seen from above (mm²; 0 when they only touch). */
const planOverlap = (a: [Vec3, Vec3], b: [Vec3, Vec3]) => Math.max(0, Math.min(a[1][0], b[1][0]) - Math.max(a[0][0], b[0][0])) * Math.max(0, Math.min(a[1][1], b[1][1]) - Math.max(a[0][1], b[0][1]));
const heightsOverlap = (a: [Vec3, Vec3], b: [Vec3, Vec3]) => Math.min(a[1][2], b[1][2]) - Math.max(a[0][2], b[0][2]) > 0.5;
/** Distance between two boxes seen from above (0 when they overlap). */
const planDistance = (a: [Vec3, Vec3], b: [Vec3, Vec3]) => Math.hypot(Math.max(0, b[0][0] - a[1][0], a[0][0] - b[1][0]), Math.max(0, b[0][1] - a[1][1], a[0][1] - b[1][1]));

/** Which way an item faces: away from the wall its back is against (within 150 mm); null when no wall backs it. */
export function inferFront(box: [Vec3, Vec3], walls: readonly PlacedItem[]): P2 | null {
  let best: { front: P2; overlap: number } | null = null;
  const dirs: P2[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const d of dirs) {
    const axis = d[0] ? 0 : 1;
    const other = 1 - axis;
    const face = d[axis]! > 0 ? box[1][axis]! : box[0][axis]!;
    for (const w of walls) {
      const gap = d[axis]! > 0 ? w.box[0][axis]! - face : face - w.box[1][axis]!;
      if (gap < -1 || gap > 150) continue;
      const overlap = Math.min(box[1][other]!, w.box[1][other]!) - Math.max(box[0][other]!, w.box[0][other]!);
      if (overlap <= 0 || !heightsOverlap(box, w.box)) continue;
      if (!best || overlap > best.overlap) best = { front: [0 - d[0] || 0, 0 - d[1] || 0], overlap };
    }
  }
  return best?.front ?? null;
}

export function layoutProblems(input: LayoutInput): Problem[] {
  const out: Problem[] = [];
  const { items, room } = input;
  const furniture = items.filter((i) => i.kind === "cabinet" || i.kind === "appliance");
  const of = (role: Role) => items.filter((i) => i.role === role);
  const label = (i: PlacedItem) => `« ${i.name} »`;

  if (room?.length) {
    for (const i of furniture) if (footprint(i.box).some((p) => !inPolygon(p, room))) out.push(warn(`${label(i)} sort de la pièce.`, i.ids));
  }
  const worktops = items.filter((i) => i.kind === "worktop");
  for (const hob of of("hob")) {
    const c: P2 = [(hob.box[0][0] + hob.box[1][0]) / 2, (hob.box[0][1] + hob.box[1][1]) / 2];
    if (worktops.length && !worktops.some((w) => c[0] >= w.box[0][0] - 1 && c[0] <= w.box[1][0] + 1 && c[1] >= w.box[0][1] - 1 && c[1] <= w.box[1][1] + 1)) out.push(warn(`${label(hob)} n'est pas posée sur un plan de travail.`, hob.ids));
  }
  for (const hood of of("hood")) {
    const hob = of("hob").find((h) => planOverlap(hood.box, h.box) > 0);
    if (!hob) {
      out.push(warn(`La hotte ${label(hood)} n'est au-dessus d'aucune plaque de cuisson.`, hood.ids));
      continue;
    }
    const clearance = hood.box[0][2] - hob.box[1][2];
    if (clearance < 600) out.push(warn(`La hotte ${label(hood)} est trop basse au-dessus de la plaque (${cm(clearance)} cm, 60 cm au moins).`, [...hood.ids, ...hob.ids]));
    else if (clearance > 800) out.push(warn(`La hotte ${label(hood)} est trop haute au-dessus de la plaque (${cm(clearance)} cm ; 65 à 75 cm conseillés).`, [...hood.ids, ...hob.ids]));
  }
  for (const hob of of("hob")) {
    for (const sink of of("sink")) {
      const d = planDistance(hob.box, sink.box);
      if (d < 600) out.push(warn(`La plaque ${label(hob)} est à ${cm(d)} cm de l'évier (60 cm au moins).`, [...hob.ids, ...sink.ids]));
    }
  }
  const walls = items.filter((i) => i.kind === "wall");
  for (const a of furniture) {
    if (!a.role || !["oven", "fridge", "dishwasher", "washer"].includes(a.role)) continue;
    const front = a.front ?? inferFront(a.box, walls);
    if (!front) continue;
    const zone: [Vec3, Vec3] = [[...a.box[0]] as Vec3, [...a.box[1]] as Vec3];
    const axis = front[0] ? 0 : 1;
    if (front[axis] > 0) {
      zone[0][axis] = a.box[1][axis];
      zone[1][axis] = a.box[1][axis] + 800;
    } else {
      zone[1][axis] = a.box[0][axis];
      zone[0][axis] = a.box[0][axis] - 800;
    }
    const blocker = furniture.find((b) => b !== a && planOverlap(zone, b.box) > 0 && heightsOverlap(a.box, b.box));
    if (blocker) out.push(warn(`Moins de 80 cm devant ${label(a)} : ${label(blocker)} est dans le passage.`, [...a.ids, ...blocker.ids]));
  }
  for (const hob of of("hob")) {
    for (const c of items.filter((i) => i.kind === "cabinet" && i.box[0][2] > 0.5 && planOverlap(i.box, hob.box) > 0)) {
      const clearance = c.box[0][2] - hob.box[1][2];
      if (clearance >= 0 && clearance < 450) out.push(warn(`Le meuble haut ${label(c)} est à ${cm(clearance)} cm au-dessus de la plaque (45 cm au moins).`, [...c.ids, ...hob.ids]));
    }
  }
  const rails = of("rail");
  for (const rail of rails) {
    const z = (rail.box[0][2] + rail.box[1][2]) / 2;
    // The low rod of a double hanging (another rod right over it) hangs about 1 m up, by design.
    const under = rails.some((r) => r !== rail && r.box[0][2] > rail.box[1][2] && [0, 1].every((i) => Math.min(r.box[1][i]!, rail.box[1][i]!) > Math.max(r.box[0][i]!, rail.box[0][i]!) - 1e-6));
    if (!under && (z < 1700 || z > 1900)) out.push(warn(`La tringle ${label(rail)} est à ${cm(z)} cm du sol (170 à 190 cm conseillés).`, rail.ids));
  }
  return out;
}

const ROLES: [RegExp, Role][] = [
  [/^plaque/i, "hob"],
  [/^hotte\b/i, "hood"],
  [/^évier|^sink/i, "sink"],
  [/^four\b/i, "oven"],
  [/réfrigérateur|frigo/i, "fridge"],
  [/^lave-vaisselle/i, "dishwasher"],
  [/^lave-linge/i, "washer"],
  [/^tringle/i, "rail"],
];

/** The role of an appliance or a cabinet by its name (a « Colonne réfrigérateur », a « Four (colonne) »). */
export const roleOf = (name: string): Role | undefined => ROLES.find(([p]) => p.test(name.trim()))?.[1];

/** The footprint box of a cabinet from its front-left-bottom corner, its turn and its sizes. */
export function cabinetBox(origin: Vec3, rotation: 0 | 90 | 180 | 270, width: number, height: number, depth: number): [Vec3, Vec3] {
  const [x, y, z] = origin;
  const lo: Vec3 = rotation === 0 ? [x, y, z] : rotation === 90 ? [x - depth, y, z] : rotation === 180 ? [x - width, y - depth, z] : [x, y - width, z];
  const size: Vec3 = rotation === 90 || rotation === 270 ? [depth, width, height] : [width, depth, height];
  return [lo, [lo[0] + size[0], lo[1] + size[1], lo[2] + size[2]]];
}

const FRONTS: Record<0 | 90 | 180 | 270, P2> = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] };

/** What a kitchen plan (not yet made) puts in the room, with the sink taken from the worktop's cut-out. */
export function fromKitchenLayout(layout: KitchenLayout): LayoutInput {
  const items: PlacedItem[] = layout.units.map((u) => ({ ids: [], name: u.name, box: cabinetBox(u.origin, u.rotation, u.width, u.height, u.depth), kind: "cabinet", role: roleOf(u.name) === "fridge" ? "fridge" : undefined, front: FRONTS[u.rotation] }));
  for (const b of layout.boxes) {
    if (b.kind === "wall") items.push({ ids: [], name: b.name, box: [b.from, b.to], kind: "wall" });
    else if (b.kind === "worktop") {
      items.push({ ids: [], name: b.name, box: [b.from, b.to], kind: "worktop" });
      for (const h of b.holes ?? []) if (h.appliance.startsWith("sink")) items.push({ ids: [], name: "Évier", box: [[h.at[0] - 250, h.at[1] - 200, b.to[2]], [h.at[0] + 250, h.at[1] + 200, b.to[2] + 5]], kind: "appliance", role: "sink" });
    } else if (b.kind === "appliance") {
      const role = roleOf(b.name);
      if (role && role !== "rail") items.push({ ids: [], name: b.name, box: [b.from, b.to], kind: "appliance", role });
    }
  }
  return { items };
}
