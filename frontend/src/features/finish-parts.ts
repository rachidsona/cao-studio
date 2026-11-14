/**
 * Finitions d'un meuble, en géométrie pure : les planches qui l'habillent, ajustées à sa taille et aux murs —
 * - les joues de finition, contre ses côtés, du sol au-dessus (avec un dépassement en haut si l'on veut) ;
 * - les fileurs, en façade, qui comblent le jour jusqu'au mur voisin (jusqu'à un écart maximal) ;
 * - le bandeau haut, en façade, jusqu'au plafond quand il y en a un (sinon de la hauteur choisie) ;
 * - la plinthe, en retrait sous la façade, là où le bas du meuble est libre (sous un socle), de la hauteur libre.
 * Avec un relevé de chantier (wall-survey.ts : faux aplomb et hors d'équerre des murs, plafond pas de niveau), le
 * fileur et le bandeau suivent le mur réel — leur contour est à recouper aux largeurs données —, une joue contre un mur
 * qui avance un peu est recoupée, la plinthe suit le sol ; un mur (de côté ou du fond) qui avance trop dit que le meuble
 * ne rentre pas, et de combien : ce sont les `problems`, que le contrôle avant fabrication reprend.
 * Les murs sont les corps « pièce » du modèle. La face avant est choisie (−Y par défaut : le meuble regarde vers −Y,
 * comme une Répartition dessinée de face) ; « gauche » et « droite » sont vus de devant.
 */
import type { Vec3 } from "../document/types";
import { ACROSS, HEIGHTS, joueCut, NO_CEILING, NO_WALL, riseAt, scribe, scribedOutline, widthsText, type Survey } from "./wall-survey";

export type Box = [Vec3, Vec3];

/** A wall of the room as drawn (its box), and how far its face comes in at a height when it is out of plumb (the Pièce's survey). */
export interface FinishWall {
  box: Box;
  lean?: (z: number) => number;
}

export interface FinishOptions {
  /** Adjustable feet under the bottom board (when it is raised above the floor). */
  feet?: { on: boolean };
  front: { axis: 0 | 1; sign: -1 | 1 };
  /** Thickness of the boards (mm). */
  thickness: number;
  ends: { left: boolean; right: boolean; above: number };
  fillers: { on: boolean; max: number };
  cornice: { on: boolean; height: number; max: number };
  plinth: { on: boolean; height: number; recess: number };
  /** What was measured on site: how the walls beside the furniture and the ceiling above it really are. */
  survey?: Survey;
}

export interface FinishPart {
  name: string;
  from: Vec3;
  to: Vec3;
  radius?: number;
  hardware?: boolean;
  /** What a bought part is called in the quote (a foot when missing). */
  item?: string;
  /**
   * A board cut to follow a wall or the ceiling: its outline in the plane of the front, as [across, up] (`axis`: the
   * one across); `plane` "top": in the plane of the floor, as [across, depth] (an end panel cut at its back). `from` and
   * `to` are the box around it.
   */
  outline?: { axis: 0 | 1; points: [number, number][]; plane?: "top" };
}

/** Feet: Ø30, 50 mm in from the edges of the bottom board, at most 800 mm apart. */
const FOOT = { radius: 15, inset: 50, spacing: 800 };

export const FINISH_DEFAULTS: FinishOptions = {
  front: { axis: 1, sign: -1 },
  thickness: 19,
  ends: { left: true, right: true, above: 0 },
  fillers: { on: true, max: 150 },
  cornice: { on: false, height: 80, max: 400 },
  plinth: { on: false, height: 100, recess: 50 },
};

const span = (a: number, b: number): [number, number] => (a <= b ? [a, b] : [b, a]);
const overlaps = (a: [number, number], b: [number, number], tol = 0.5) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > tol;

export function unionBox(boxes: readonly Box[]): Box {
  return [0, 1].map((k) => [0, 1, 2].map((i) => (k === 0 ? Math.min : Math.max)(...boxes.map((b) => b[k as 0 | 1][i]!)))) as Box;
}

/** The finishing boards of this furniture (its bodies' boxes), with what could not be made and why. */
export function finishParts(furniture: readonly Box[], given: readonly (Box | FinishWall)[], o: FinishOptions): { parts: FinishPart[]; notes: string[]; problems: string[] } {
  if (!furniture.length) return { parts: [], notes: ["Aucun meuble à habiller."], problems: [] };
  const rooms = given.map((w): FinishWall => (Array.isArray(w) ? { box: w as Box } : (w as FinishWall)));
  const walls = rooms.map((w) => w.box);
  const dep = o.front.axis;
  const lat = (1 - dep) as 0 | 1;
  const inward = -o.front.sign;
  // Seen from the front, the right hand: the inward direction × up.
  const rightIsMax = dep === 1 ? inward > 0 : inward < 0;
  const m = unionBox(furniture);
  const range = (b: Box, i: number): [number, number] => [b[0][i]!, b[1][i]!];
  const [z0, z1] = range(m, 2);
  const depth = range(m, dep);
  const front = o.front.sign < 0 ? depth[0] : depth[1];
  const t = o.thickness;
  /** A box from its ranges along the side, the depth and the height. */
  const box = (side: [number, number], deep: [number, number], up: [number, number]): Vec3[] => {
    const lo: Vec3 = [0, 0, 0];
    const hi: Vec3 = [0, 0, 0];
    [lo[lat], hi[lat]] = side;
    [lo[dep], hi[dep]] = deep;
    [lo[2], hi[2]] = up;
    return [lo, hi];
  };
  const parts: FinishPart[] = [];
  const notes: string[] = [];
  /** What keeps the furniture from going in: said in the panel and in the check before making. */
  const problems: string[] = [];
  const problem = (text: string) => (notes.push(text), problems.push(text));
  const add = (name: string, [from, to]: Vec3[]) => parts.push({ name, from: from!, to: to! });
  const faceBoard = span(front, front + inward * t);
  const back = o.front.sign < 0 ? depth[1] : depth[0];
  /** The gap from `edge` to the nearest wall on that side, as drawn (null: no wall there), and that wall. */
  const nearWall = (atMax: boolean, edge: number): { gap: number; wall: FinishWall } | null => {
    const near = rooms
      .filter(({ box: w }) => overlaps(range(w, 2), [z0, z1]) && overlaps(range(w, dep), depth, -1))
      .map((wall) => ({ gap: atMax ? wall.box[0][lat]! - edge : edge - wall.box[1][lat]!, wall }))
      .filter((g) => g.gap > -0.5)
      .sort((a, b) => a.gap - b.gap);
    return near[0] ?? null;
  };
  /** What was measured of the wall on a side: by the Finitions, else by the Pièce (a wall drawn out of plumb). */
  const surveyed = (key: "left" | "right", wall: FinishWall | undefined) => {
    const lean = wall?.lean;
    return o.survey?.[key] ?? (lean ? { low: lean(z0), mid: lean((z0 + z1) / 2), high: lean(z1), back: 0 } : undefined);
  };
  const mm = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

  // End panels, against the sides, the whole depth; against a wall out of plumb or out of square, cut to follow it.
  const ends = { min: range(m, lat)[0], max: range(m, lat)[1] };
  /** The sides where an end panel takes the wall: no filler there. */
  const scribedEnds = new Set<boolean>();
  for (const side of ["gauche", "droite"] as const) {
    if (!o.ends[side === "gauche" ? "left" : "right"]) continue;
    const atMax = side === "droite" ? rightIsMax : !rightIsMax;
    const edge = atMax ? ends.max : ends.min;
    const sign = atMax ? 1 : -1;
    const name = `Joue ${side}`;
    const [from, to] = box(span(edge, edge + sign * t), depth, [z0, z1 + o.ends.above]);
    const near = nearWall(atMax, edge);
    const s = surveyed(side === "droite" ? "right" : "left", near?.wall);
    const cut = s && near ? joueCut(scribe(near.gap - t, [s.low, s.mid, s.high], s.back), s.back, t) : null;
    if (cut && "heights" in cut) {
      const thick = cut.heights.map((r) => t - r) as [number, number, number];
      parts.push({ name, from: from!, to: to!, outline: { axis: lat, points: scribedOutline(edge, sign, [z0, (z0 + z1) / 2, z1 + o.ends.above], thick) } });
      notes.push(`${name} à recouper contre le mur : ${widthsText(thick, HEIGHTS)} d'épaisseur.`);
    } else if (cut) {
      const points: [number, number][] = [[edge, front], [edge + sign * t, front], [edge + sign * (t - cut.back), back], [edge, back]];
      parts.push({ name, from: from!, to: to!, outline: { axis: lat, points, plane: "top" } });
      notes.push(`${name} à recouper au fond (mur hors d'équerre) : ${mm(t)} mm devant, ${mm(t - cut.back)} au fond.`);
    } else add(name, [from!, to!]);
    if (cut) scribedEnds.add(atMax);
    if (atMax) ends.max += t;
    else ends.min -= t;
  }

  // Fillers to the nearest wall on each side, then the cornice up to the ceiling.
  if (o.fillers.on) {
    for (const side of ["gauche", "droit"] as const) {
      const atMax = side === "droit" ? rightIsMax : !rightIsMax;
      const edge = atMax ? ends.max : ends.min;
      const near = scribedEnds.has(atMax) ? null : nearWall(atMax, edge);
      if (!near) continue;
      const wall = `Mur ${side === "droit" ? "de droite" : "de gauche"}`;
      // The wall as measured: its gap at the bottom, the middle and the top of the furniture, and at its back.
      const s = surveyed(side === "droit" ? "right" : "left", near.wall) ?? NO_WALL;
      const real = scribe(near.gap, [s.low, s.mid, s.high], s.back);
      if (real.short > 0) {
        problem(`${wall} : il avance trop ${HEIGHTS[real.at]} — le meuble ne rentre pas, il manque ${Math.ceil(real.short)} mm.`);
        continue;
      }
      if (real.shortBack > 0) {
        problem(`${wall} hors d'équerre : au fond du meuble il manque ${Math.ceil(real.shortBack)} mm — le meuble ne rentre pas.`);
        continue;
      }
      const gap = Math.max(...real.gaps);
      if (gap <= 0.5) continue;
      if (gap > o.fillers.max) {
        notes.push(`${wall} à ${Math.round(gap)} mm : plus que l'écart maximal d'un fileur (${o.fillers.max} mm).`);
        continue;
      }
      const [from, to] = box(span(edge, edge + (atMax ? gap : -gap)), faceBoard, [z0, z1]);
      if (real.tapered) {
        parts.push({ name: `Fileur ${side}`, from: from!, to: to!, outline: { axis: lat, points: scribedOutline(edge, atMax ? 1 : -1, [z0, (z0 + z1) / 2, z1], real.gaps) } });
        notes.push(`Fileur ${side} à recouper : ${widthsText(real.gaps, HEIGHTS)}.`);
      } else add(`Fileur ${side}`, [from!, to!]);
    }
  }
  const across: [number, number] = o.ends.above > 0 ? range(m, lat) : [ends.min, ends.max];
  const ceilings = walls.filter((w) => w[0][2]! >= z1 - 0.5 && overlaps(range(w, lat), across) && overlaps(range(w, dep), depth, -1)).map((w) => w[0][2]! - z1);
  const drawn = ceilings.length ? Math.min(...ceilings) : null;
  // The ceiling as measured: how far it is above the furniture on the left, in the middle and on the right.
  const c = o.survey?.ceiling ?? NO_CEILING;
  const above = drawn === null ? null : scribe(drawn, [c.left, c.mid, c.right]);
  if (above && above.short > 0) problem(`Plafond : il descend trop ${ACROSS[above.at]} — le meuble ne passe pas en hauteur, il manque ${Math.ceil(above.short)} mm.`);
  // The back wall as measured: a bulge that comes to the furniture's back.
  const behind = walls
    .filter((w) => overlaps(range(w, 2), [z0, z1]) && overlaps(range(w, lat), range(m, lat)))
    .map((w) => (inward > 0 ? w[0][dep]! - back : back - w[1][dep]!))
    .filter((g) => g > -0.5);
  const bw = o.survey?.back;
  if (bw && behind.length) {
    const real = scribe(Math.min(...behind), rightIsMax ? [bw.left, bw.mid, bw.right] : [bw.right, bw.mid, bw.left]);
    const at = rightIsMax ? real.at : ((2 - real.at) as 0 | 1 | 2);
    if (real.short > 0) problem(`Mur du fond : il avance trop ${ACROSS[at]} — le meuble ne rentre pas en profondeur, il manque ${Math.ceil(real.short)} mm.`);
  }
  const ceiling = above ? (above.short > 0 ? 0 : Math.max(...above.gaps)) : null;
  if (above && above.tapered && above.short === 0 && ceiling! > 0.5 && ceiling! <= o.cornice.max && (o.cornice.on || o.fillers.on)) {
    // Along the top of the furniture, from its left to its right as seen from the front.
    const [a, b] = across;
    const gaps = (rightIsMax ? above.gaps : [...above.gaps].reverse()) as [number, number, number];
    const [from, to] = box(across, faceBoard, [z1, z1 + ceiling!]);
    // Its outline is drawn across the top, then turned: [across, up].
    const points = scribedOutline(z1, 1, [a, (a + b) / 2, b], gaps).map(([up, along]): [number, number] => [along, up]);
    parts.push({ name: "Bandeau haut", from: from!, to: to!, outline: { axis: lat, points } });
    notes.push(`Bandeau haut à recouper : ${widthsText(above.gaps, ACROSS)}.`);
  } else if (ceiling !== null && ceiling > 0.5 && ceiling <= o.cornice.max && (o.cornice.on || o.fillers.on)) add("Bandeau haut", box(across, faceBoard, [z1, z1 + ceiling]));
  else if (o.cornice.on && !(above && above.short > 0)) {
    if (ceiling !== null && ceiling > o.cornice.max) notes.push(`Plafond à ${Math.round(ceiling)} mm au-dessus : bandeau de ${o.cornice.height} mm seulement.`);
    if (ceiling === null || ceiling > 0.5) add("Bandeau haut", box(across, faceBoard, [z1, z1 + Math.min(o.cornice.height, ceiling ?? Infinity)]));
  }

  // The plinth: behind the front by the recess, wherever no body comes down to the floor there.
  if (o.plinth.on) {
    const zone = span(front + inward * o.plinth.recess, front + inward * (o.plinth.recess + t));
    const inZone = furniture.filter((b) => overlaps(range(b, dep), zone, 0));
    const blocked = inZone.filter((b) => b[0][2]! <= z0 + 0.5).map((b) => range(b, lat)).sort((a, b) => a[0] - b[0]);
    const free: [number, number][] = [];
    let at = range(m, lat)[0];
    for (const [a, b] of blocked) {
      if (a > at) free.push([at, a]);
      at = Math.max(at, b);
    }
    if (range(m, lat)[1] > at) free.push([at, range(m, lat)[1]]);
    const pieces = free
      .filter(([a, b]) => b - a > 50)
      .map((interval) => {
        const above = inZone.filter((b) => b[0][2]! > z0 + 0.5 && overlaps(range(b, lat), interval)).map((b) => b[0][2]! - z0);
        return { interval, height: Math.min(o.plinth.height, ...above) };
      })
      .filter((p) => p.height >= 20);
    if (!pieces.length) notes.push("Le meuble descend jusqu'au sol sur toute sa façade : pas de place pour une plinthe (faites un socle dans la Répartition).");
    // The floor as measured: the plinth's bottom follows it, from the left to the right of the furniture.
    const f = o.survey?.floor;
    const [a0, b0] = range(m, lat);
    const rise = (x: number) => (f ? riseAt(f, a0, b0, rightIsMax ? x : a0 + b0 - x) : 0);
    pieces.forEach((p, i) => {
      const name = pieces.length > 1 ? `Plinthe ${i + 1}` : "Plinthe";
      const [a, b] = p.interval;
      const top = z0 + p.height;
      const xs = [a, ...((a0 + b0) / 2 > a && (a0 + b0) / 2 < b ? [(a0 + b0) / 2] : []), b];
      const low = xs.map((x) => z0 + rise(x));
      if (!f || low.every((z) => Math.abs(z - z0) < 0.05)) return add(name, box(p.interval, zone, [z0, top]));
      if (Math.max(...low) > top - 20) return problem(`Sol : il monte trop sous ${name.toLowerCase()} — il ne lui reste pas 20 mm de haut.`);
      const [from, to] = box(p.interval, zone, [Math.min(...low), top]);
      const points: [number, number][] = [...xs.map((x, k): [number, number] => [x, low[k]!]), [b, top], [a, top]];
      parts.push({ name, from: from!, to: to!, outline: { axis: lat, points } });
      const heights = xs.map((_, k) => `${mm(top - low[k]!)} mm`);
      notes.push(`${name} à recouper sur le sol : ${(rightIsMax ? heights : heights.reverse()).join(", ")} de haut, de gauche à droite.`);
    });
  } else if (o.survey?.floor) {
    const f = o.survey.floor;
    const spread = Math.max(f.left, f.mid, f.right) - Math.min(f.left, f.mid, f.right);
    if (spread > 2) notes.push(`Sol pas de niveau (${mm(spread)} mm d'écart) : calez le meuble, ou mettez une plinthe ou des pieds réglables.`);
  }
  // Adjustable feet under the lowest board above the floor (the bottom of a socle), as high as the room under it.
  if (o.feet?.on) {
    const flat = furniture.filter((b) => b[1][2]! - b[0][2]! < Math.min(b[1][0]! - b[0][0]!, b[1][1]! - b[0][1]!) && b[0][2]! > z0 + 0.5);
    const zb = Math.min(...flat.map((b) => b[0][2]!));
    const bottoms = flat.filter((b) => b[0][2]! <= zb + 1);
    if (!bottoms.length || zb - z0 < 20) notes.push("Pas de place sous le meuble pour des pieds : faites un socle (dessous relevé) dans la Répartition.");
    let n = 0;
    for (const b of bottoms) {
      const [x0, x1] = [b[0][0]! + FOOT.inset, b[1][0]! - FOOT.inset];
      const [y0, y1] = [b[0][1]! + FOOT.inset, b[1][1]! - FOOT.inset];
      if (x1 <= x0 || y1 <= y0 || zb - z0 < 20) continue;
      const along = (a: number, c: number) => {
        const count = Math.max(1, Math.ceil((c - a) / FOOT.spacing));
        return Array.from({ length: count + 1 }, (_, k) => a + ((c - a) * k) / count);
      };
      for (const x of along(x0, x1)) for (const y of along(y0, y1)) parts.push({ name: `Pied ${++n}`, from: [x, y, z0], to: [x, y, zb], radius: FOOT.radius, hardware: true });
    }
  }
  if (!parts.length && !notes.length) notes.push("Rien à ajouter avec ces réglages.");
  return { parts, notes, problems };
}
