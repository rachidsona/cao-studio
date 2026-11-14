/**
 * Plan technique d'une cuisine, en calcul pur : ce que le plombier et l'électricien doivent amener au mur avant la
 * pose, d'après les appareils posés et les plans de travail — arrivées d'eau froide et chaude et évacuation de l'évier,
 * eau et évacuation du lave-vaisselle, lignes spécialisées (plaque 32 A, four 20 A, lave-vaisselle, réfrigérateur,
 * micro-ondes, cave à vin 16 A), prises de la hotte et sa sortie d'air, prises au-dessus du plan de travail (pas
 * au-dessus de l'évier ni de la plaque). Chaque point est sur la face du mur, coté depuis le début du mur (son coin
 * gauche, vu de la pièce) et depuis le sol. Les murs sont ceux des plans de travail (« Plan de travail A » : mur A),
 * sinon numérotés. Les hauteurs sont des repères d'usage (NF C 15-100 pour le nombre de prises) : l'installateur
 * les valide. Pur.
 */
import { applianceDef } from "../features/appliance-library";
import { cabinetAxes } from "./kitchen-catalog";
import type { ApplianceFeature, CadDocument, SketchFeature, Vec3 } from "./types";

export type TechKind = "cold" | "hot" | "drain" | "socket" | "line32" | "line20" | "duct";

export interface TechPoint {
  kind: TechKind;
  label: string;
  /** Along the wall from its start (mm), and the height from the floor. */
  u: number;
  z: number;
}

export interface TechWall {
  name: string;
  /** The way its length runs, and the way to the wall (from the room), in the floor plane. */
  along: [number, number];
  back: [number, number];
  /** Where the wall's face stands along `back`, and where the wall starts along `along` (mm). */
  plane: number;
  start: number;
  /** What stands against it, as [from, to] along it and from the floor: to draw it. */
  items: { name: string; u0: number; u1: number; z0: number; z1: number }[];
  points: TechPoint[];
}

type Box = [Vec3, Vec3];
type Item = { name: string; category?: string; place?: string; along: [number, number]; back: [number, number]; box: Box };

/** Repères (mm). */
const H = { cold: 500, drain: 400, low: 300, cable: 300, aboveTop: 100, sinkSpread: 100 };
/** No socket closer than this to a sink's or a hob's middle (mm), along the wall. */
const CLEAR = 600;

const dot = (p: readonly number[], d: readonly number[]) => p[0]! * d[0]! + p[1]! * d[1]!;

function applianceItem(a: ApplianceFeature): Item {
  const { along, back } = cabinetAxes(a.rotation ?? 0);
  const corners = [0, a.width].flatMap((w) => [0, a.depth].map((d) => [a.origin[0] + along[0] * w + back[0] * d, a.origin[1] + along[1] * w + back[1] * d]));
  const xs = corners.map((c) => c[0]!);
  const ys = corners.map((c) => c[1]!);
  const def = applianceDef(a.model);
  return { name: a.name, category: def?.category, place: def?.place, along, back, box: [[Math.min(...xs), Math.min(...ys), a.origin[2]], [Math.max(...xs), Math.max(...ys), a.origin[2] + a.height]] };
}

/** The worktops of a kitchen plan: their name and box, from their rectangle sketch and their thickness. */
export function worktops(doc: CadDocument): { id: string; name: string; box: Box }[] {
  return doc.features.flatMap((f) => {
    if (f.type !== "extrude" || f.suppressed || !/^Plan de travail/.test(f.name)) return [];
    const s = doc.features.find((x): x is SketchFeature => x.id === f.sketch && x.type === "sketch");
    if (!s?.points.length) return [];
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    const z0 = s.offset ?? 0;
    return [{ id: f.id, name: f.name, box: [[Math.min(...xs), Math.min(...ys), z0], [Math.max(...xs), Math.max(...ys), z0 + f.distance]] as Box }];
  });
}

/** Where along `along` a box spans, and how far it reaches along `back` (its back face). */
const span = (b: Box, d: readonly number[]) => {
  const v = [b[0][0], b[1][0]].flatMap((x) => [b[0][1], b[1][1]].map((y) => dot([x, y], d)));
  return [Math.min(...v), Math.max(...v)] as [number, number];
};

/** The plan: the walls with their points, and what is missing or worth saying. */
export function techPlan(doc: CadDocument): { walls: TechWall[]; notes: string[] } {
  const items: Item[] = doc.features.flatMap((f) => (f.type === "appliance" && !f.suppressed ? [applianceItem(f)] : []));
  const tops = worktops(doc);
  // The walls: one per way the backs face and where they stand (within 10 cm).
  const walls: (TechWall & { key: string })[] = [];
  const wallOf = (along: [number, number], back: [number, number], plane: number): TechWall & { key: string } => {
    const found = walls.find((w) => w.back[0] === back[0] && w.back[1] === back[1] && Math.abs(w.plane - plane) < 100);
    if (found) {
      found.plane = Math.max(found.plane, plane);
      return found;
    }
    const wall = { key: `${back.join(",")}:${Math.round(plane)}`, name: "", along, back, plane, start: Infinity, items: [], points: [] };
    walls.push(wall);
    return wall;
  };
  const placed = items.map((it) => ({ it, wall: wallOf(it.along, it.back, span(it.box, it.back)[1]) }));
  // A worktop goes with the wall its back reaches (its long side along it), and names it.
  const topWalls = tops.flatMap((t) => {
    const wall = walls.find((w) => Math.abs(span(t.box, w.back)[1] - w.plane) < 150 && span(t.box, w.along)[1] - span(t.box, w.along)[0] > span(t.box, w.back)[1] - span(t.box, w.back)[0]);
    if (!wall) return [];
    const letter = /^Plan de travail (\S+?)\d*$/.exec(t.name)?.[1];
    if (letter && !wall.name) wall.name = letter === "îlot" ? "Îlot" : `Mur ${letter}`;
    return [{ t, wall }];
  });
  for (const w of walls) {
    const spans = [...placed.filter((p) => p.wall === w).map((p) => span(p.it.box, w.along)), ...topWalls.filter((x) => x.wall === w).map((x) => span(x.t.box, w.along))];
    w.start = Math.min(...spans.map((s) => s[0]));
  }
  walls.forEach((w, i) => (w.name ||= `Mur ${i + 1}`));
  const notes: string[] = [];
  const u = (w: TechWall, b: Box) => {
    const [a, c] = span(b, w.along);
    return { u0: a - w.start, u1: c - w.start, mid: (a + c) / 2 - w.start };
  };
  const add = (w: TechWall, kind: TechKind, label: string, at: number, z: number) => {
    // Two boxes at one place (the oven's under the hob's): side by side, 15 cm apart.
    let x = Math.round(at);
    while (w.points.some((p) => Math.abs(p.u - x) < 100 && Math.abs(p.z - z) < 100)) x += 150;
    w.points.push({ kind, label, u: x, z: Math.round(z) });
  };
  /** What an appliance needs at the wall: `mid` its middle along it, `u0`–`u1` its span, `bottom`–`top` its height. */
  const needs = (wall: TechWall, category: string | undefined, place: string | undefined, u0: number, u1: number, bottom: number, top: number) => {
    const mid = (u0 + u1) / 2;
    switch (category) {
      case "sink":
        add(wall, "hot", "Eau chaude", mid - H.sinkSpread, H.cold);
        add(wall, "cold", "Eau froide", mid + H.sinkSpread, H.cold);
        add(wall, "drain", "Évacuation Ø40", mid, H.drain);
        break;
      case "dishwasher": {
        // Its water and its socket in the cabinet beside it, on the sink's side when there is one.
        const sink = wall.points.find((p) => p.label === "Évacuation Ø40")?.u ?? sinksOf(wall)[0];
        const side = sink !== undefined && sink < mid ? u0 - 150 : u1 + 150;
        add(wall, "socket", "Prise lave-vaisselle 16 A (circuit seul)", side, H.low);
        if (sink === undefined || Math.abs(sink - mid) > 1200) {
          add(wall, "cold", "Eau froide lave-vaisselle", side, H.cold);
          add(wall, "drain", "Évacuation lave-vaisselle Ø40", side, H.drain);
        }
        break;
      }
      case "hob":
        add(wall, "line32", "Sortie de câble plaque 32 A", mid, H.cable);
        break;
      case "oven":
        // Under the worktop: low behind it; in a column: under it, in the cabinet below.
        add(wall, "line20", "Prise four 20 A (circuit seul)", mid, bottom < 500 ? H.low : Math.max(H.low, bottom - 100));
        break;
      case "microwave":
        add(wall, "socket", "Prise micro-ondes 16 A", mid, Math.max(H.low, bottom - 100));
        break;
      case "fridge":
        add(wall, "socket", "Prise réfrigérateur 16 A", mid, place === "in" ? top + 100 : H.low);
        break;
      case "wine":
        add(wall, "socket", "Prise cave à vin 16 A", mid, H.low);
        break;
      case "hood":
        // Hidden in its chimney, above its body.
        add(wall, "socket", "Prise hotte 16 A", mid, Math.min(top - 100, bottom + 600));
        add(wall, "duct", "Sortie d'air hotte Ø150", mid, Math.min(top - 50, bottom + 800));
        break;
    }
  };
  // The sinks and hobs cut in the worktops (a kitchen plan's), each with its wall and its middle along it.
  const cuts = doc.features.flatMap((f) => {
    if (f.type !== "machining" || f.kind !== "cutout" || f.suppressed || !f.cutouts) return [];
    const top = topWalls.find((x) => x.t.id === f.target);
    if (!top) return [];
    const [lo, hi] = top.t.box;
    const axis = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 1;
    return f.cutouts.flatMap((c) => {
      const kind = c.appliance.startsWith("sink") ? "sink" : c.appliance.startsWith("hob") ? "hob" : null;
      if (!kind) return [];
      const at: [number, number] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
      at[axis] = lo[axis]! + c.along;
      const half = (c.size?.[0] ?? (kind === "sink" ? 780 : 560)) / 2;
      const u = dot(at, top.wall.along) - top.wall.start;
      return [{ kind, wall: top.wall, u0: u - half, u1: u + half, z: lo[2] }];
    });
  });
  const sinksOf = (wall: TechWall) => cuts.filter((c) => c.wall === wall && c.kind === "sink").map((c) => (c.u0 + c.u1) / 2);
  for (const c of cuts) {
    // A sink or a hob also placed as an appliance there: its water or its line once, at the appliance.
    const placedToo = placed.some((p) => p.wall === c.wall && p.it.category === c.kind && Math.abs(u(c.wall, p.it.box).mid - (c.u0 + c.u1) / 2) < 600);
    if (!placedToo) needs(c.wall, c.kind, undefined, c.u0, c.u1, c.z, c.z);
  }
  for (const { it, wall } of placed) {
    const { u0, u1 } = u(wall, it.box);
    const [bottom, top] = [it.box[0][2], it.box[1][2]];
    wall.items.push({ name: it.name, u0, u1, z0: bottom, z1: top });
    needs(wall, it.category, it.place, u0, u1, bottom, top);
  }
  // Sockets over the worktops: one every 1,2 m or so, none near a sink or a hob.
  let counter = 0;
  for (const { t, wall } of topWalls) {
    const { u0, u1 } = u(wall, t.box);
    wall.items.push({ name: t.name, u0, u1, z0: t.box[0][2], z1: t.box[1][2] });
    const blocked = [...placed.filter((p) => p.wall === wall && (p.it.category === "sink" || p.it.category === "hob")).map((p) => u(wall, p.it.box).mid), ...cuts.filter((c) => c.wall === wall).map((c) => (c.u0 + c.u1) / 2)];
    const free = (x: number) => blocked.every((b) => Math.abs(b - x) >= CLEAR);
    const count = Math.max(1, Math.round((u1 - u0) / 1200));
    const wanted = Array.from({ length: count }, (_, i) => u0 + ((u1 - u0) * (i + 0.5)) / count);
    for (const x of wanted) {
      // The nearest free place to where it would go.
      const near = Array.from({ length: Math.floor((u1 - u0 - 200) / 50) + 1 }, (_, k) => u0 + 100 + k * 50).filter(free).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
      if (near === undefined || wall.points.some((p) => p.kind === "socket" && p.z === Math.round(t.box[1][2] + H.aboveTop) && Math.abs(p.u - near) < 300)) continue;
      add(wall, "socket", "Prise plan de travail 16 A", near, t.box[1][2] + H.aboveTop);
      counter++;
    }
  }
  for (const w of walls) w.points.sort((a, b) => a.u - b.u || a.z - b.z);
  if (!items.some((i) => i.category === "sink") && !cuts.some((c) => c.kind === "sink")) notes.push("Aucun évier posé : pas d'arrivée d'eau ni d'évacuation.");
  if (tops.length && counter < 4) notes.push(`${counter} prise${counter > 1 ? "s" : ""} au-dessus du plan de travail : la norme en demande 4 dans une cuisine (6 prises en tout).`);
  if (!walls.length) notes.push("Aucun appareil ni plan de travail : posez la cuisine d'abord.");
  return { walls: walls.map(({ key: _key, ...w }) => w), notes };
}

export const TECH_LABELS: Record<TechKind, string> = { cold: "Eau froide", hot: "Eau chaude", drain: "Évacuation", socket: "Prise", line32: "Ligne 32 A", line20: "Ligne 20 A", duct: "Sortie d'air" };
