/**
 * Formes de menuiserie prêtes à poser dans l'esquisse, comme des blocs réglables par leurs cotes : découpe d'évier
 * (angles arrondis) et de plaque de cuisson, encoche au bord d'un panneau, queue d'aronde, rangée de trous du système
 * 32, poignée cuvette. Chacune arrive contrainte et cotée (sa place reste libre, à coter depuis un bord) : changer une
 * cote la règle, comme un bloc paramétrique. Une cote que l'esquisse refuserait n'est pas posée. Pur.
 */
import { probeSketch } from "../constraints/solver";
import type { SketchConstraint, SketchGeometry } from "../document/sketch";
import { filletCorner } from "./corner";
import { addCircle, addConstraint, addLine, addRectangle, findCurve, measure, pointPos, type Vec2 } from "./edit";
import { addMouldingProfile, type MouldingProfile } from "./moulding-profiles";
import { addSlot } from "./shapes";
import type { Preview } from "./tools";

export type JoineryShape = "sink" | "hob" | "notch" | "dovetail" | "row32" | "cupHandle" | MouldingProfile;

export interface ShapeField {
  key: string;
  label: string;
  /** Its value at first (mm; a count; the n of a slope 1:n). */
  value: number;
  kind: "length" | "count" | "slope";
}

export const JOINERY_SHAPES: Record<JoineryShape, { label: string; at: string; fields: ShapeField[] }> = {
  sink: {
    label: "Découpe d'évier",
    at: "son centre",
    fields: [
      { key: "w", label: "Largeur", value: 780, kind: "length" },
      { key: "h", label: "Profondeur", value: 480, kind: "length" },
      { key: "r", label: "Rayon des angles", value: 10, kind: "length" },
    ],
  },
  hob: {
    label: "Découpe de plaque de cuisson",
    at: "son centre",
    fields: [
      { key: "w", label: "Largeur", value: 560, kind: "length" },
      { key: "h", label: "Profondeur", value: 490, kind: "length" },
    ],
  },
  notch: {
    label: "Encoche au bord",
    at: "le milieu du bord",
    fields: [
      { key: "w", label: "Largeur", value: 100, kind: "length" },
      { key: "d", label: "Profondeur", value: 50, kind: "length" },
    ],
  },
  dovetail: {
    label: "Queue d'aronde",
    at: "le milieu de sa base étroite",
    fields: [
      { key: "b", label: "Base étroite", value: 30, kind: "length" },
      { key: "d", label: "Longueur", value: 18, kind: "length" },
      { key: "n", label: "Pente 1:n", value: 6, kind: "slope" },
    ],
  },
  row32: {
    label: "Rangée de trous système 32",
    at: "le premier trou",
    fields: [
      { key: "n", label: "Nombre de trous", value: 10, kind: "count" },
      { key: "d", label: "Diamètre", value: 5, kind: "length" },
      { key: "p", label: "Entraxe", value: 32, kind: "length" },
    ],
  },
  quarterRound: { label: "Profil : quart-de-rond", at: "son coin", fields: [{ key: "r", label: "Rayon", value: 15, kind: "length" }] },
  cove: { label: "Profil : congé (creux)", at: "son coin", fields: [{ key: "r", label: "Rayon", value: 15, kind: "length" }] },
  halfRound: { label: "Profil : demi-rond (baguette)", at: "le milieu de sa base", fields: [{ key: "r", label: "Rayon", value: 10, kind: "length" }] },
  chamfer: { label: "Profil : chanfrein", at: "son coin", fields: [{ key: "r", label: "Côté", value: 15, kind: "length" }] },
  ogee: { label: "Profil : doucine", at: "son coin", fields: [{ key: "r", label: "Côté", value: 30, kind: "length" }] },
  cupHandle: {
    label: "Poignée cuvette",
    at: "son centre",
    fields: [
      { key: "l", label: "Longueur hors tout", value: 128, kind: "length" },
      { key: "w", label: "Largeur", value: 40, kind: "length" },
    ],
  },
};

export type ShapeValues = Record<string, number>;

/** The shape the « Formes de menuiserie » tool lays at each click, and its sizes. */
let stamp: { kind: JoineryShape; values: ShapeValues } = { kind: "sink", values: defaults("sink") };

export function defaults(kind: JoineryShape): ShapeValues {
  return Object.fromEntries(JOINERY_SHAPES[kind].fields.map((f) => [f.key, f.value]));
}
export const currentStamp = () => stamp;
export function setStamp(kind: JoineryShape, values: ShapeValues): void {
  stamp = { kind, values: { ...values } };
}

/** What is wrong with these sizes (null: nothing). */
export function shapeProblem(kind: JoineryShape, v: ShapeValues): string | null {
  for (const f of JOINERY_SHAPES[kind].fields) {
    const x = v[f.key];
    if (x === undefined || !Number.isFinite(x) || x <= 0) return `${f.label} : une valeur positive.`;
    if (f.kind === "count" && (!Number.isInteger(x) || x > 100)) return `${f.label} : un nombre entier, 100 au plus.`;
  }
  if (kind === "sink" && 2 * v.r! >= Math.min(v.w!, v.h!)) return "Le rayon des angles doit faire moins de la moitié de la largeur et de la profondeur.";
  if (kind === "cupHandle" && v.l! <= v.w!) return "La longueur hors tout doit dépasser la largeur.";
  if (kind === "row32" && v.d! >= v.p!) return "Le diamètre doit être plus petit que l'entraxe.";
  return null;
}

type NewConstraint = Omit<SketchConstraint, "id">;

/** The shape laid at `at` on `g`: its curves, and its constraints and dimensions (`dims`: false for a preview). */
export function placeJoineryShape(g: SketchGeometry, kind: JoineryShape, v: ShapeValues, at: Vec2, dims = true): { geometry: SketchGeometry; created: string[] } {
  const problem = shapeProblem(kind, v);
  if (problem) throw new Error(problem);
  const [x, y] = at;
  let work = g;
  const created: string[] = [];
  const keep = (added: { geometry: SketchGeometry; created: string[] }) => {
    work = added.geometry;
    created.push(...added.created);
    return added.created;
  };
  const wanted: NewConstraint[] = [];
  const rule = (c: object) => (work = addConstraint(work, c as NewConstraint).geometry);
  const dim = (c: object) => wanted.push(c as NewConstraint);
  if (kind === "quarterRound" || kind === "cove" || kind === "halfRound" || kind === "chamfer" || kind === "ogee") {
    const added = addMouldingProfile(work, kind, v.r!, at);
    keep(added);
    for (const d of added.size) dim(d);
  } else if (kind === "sink" || kind === "hob" || kind === "notch") {
    const [w, h] = [v.w!, kind === "notch" ? v.d! : v.h!];
    const [from, to]: [Vec2, Vec2] = kind === "notch" ? [[x - w / 2, y], [x + w / 2, y - h]] : [[x - w / 2, y - h / 2], [x + w / 2, y + h / 2]];
    const [first, second] = keep(addRectangle(work, { at: from }, { at: to }));
    dim({ kind: "length", line: first, value: w });
    dim({ kind: "length", line: second, value: h });
    if (kind === "sink") {
      // The lengths first: rounding the corners turns them into distances from the corners, kept as points.
      if (dims) for (const d of wanted.splice(0)) rule(d);
      for (const corner of created.map((id) => findCurve(work, id)).flatMap((c) => (c?.kind === "line" ? [c.p1] : []))) {
        const next = filletCorner(work, corner, v.r!);
        if (typeof next === "string") throw new Error(next);
        work = next;
      }
      created.splice(0, created.length, ...work.curves.filter((c) => !g.curves.some((o) => o.id === c.id)).map((c) => c.id));
    }
  } else if (kind === "dovetail") {
    const [b, d] = [v.b!, v.d!];
    const w = b + (2 * d) / v.n!;
    const corners: Vec2[] = [[x - b / 2, y], [x + b / 2, y], [x + w / 2, y + d], [x - w / 2, y + d]];
    let previous = "";
    let firstPoint = "";
    const sides: string[] = [];
    corners.forEach((p, i) => {
      const last = i === corners.length - 1;
      const added = addLine(work, previous ? { pointId: previous } : { at: p }, last ? { pointId: firstPoint } : { at: corners[i + 1]! }, { autoAlign: false });
      keep(added);
      const line = findCurve(added.geometry, added.created[0]!);
      if (line?.kind === "line") {
        if (!previous) firstPoint = line.p1;
        previous = line.p2;
      }
      sides.push(added.created[0]!);
    });
    const [base, right, top, left] = sides as [string, string, string, string];
    rule({ kind: "horizontal", line: base });
    rule({ kind: "horizontal", line: top });
    rule({ kind: "equal", a: right, b: left });
    const start = findCurve(work, base);
    dim({ kind: "length", line: base, value: b });
    if (start?.kind === "line") dim({ kind: "pointLineDistance", point: start.p1, line: top, value: d });
    dim({ kind: "angle", a: base, b: right, value: Number(measure(work, { id: "", kind: "angle", a: base, b: right, value: 0 } as never).toFixed(6)) });
  } else if (kind === "row32") {
    const count = v.n!;
    const centres: string[] = [];
    for (let i = 0; i < count; i++) {
      const [circle] = keep(addCircle(work, { at: [x + i * v.p!, y] }, v.d! / 2));
      const c = findCurve(work, circle!);
      if (c?.kind === "circle") centres.push(c.center);
    }
    const circles = [...created];
    dim({ kind: "diameter", curve: circles[0], value: v.d! });
    if (count > 1) {
      // The centres on one horizontal construction line, a pitch apart.
      const [axis] = keep(addLine(work, { pointId: centres[0]! }, { pointId: centres.at(-1)! }, { construction: true, autoAlign: false }));
      rule({ kind: "horizontal", line: axis });
      for (const c of centres.slice(1, -1)) rule({ kind: "pointOnCurve", point: c, curve: axis });
      for (const c of circles.slice(1)) rule({ kind: "equal", a: circles[0], b: c });
      for (let i = 0; i + 1 < count; i++) dim({ kind: "distanceX", a: centres[i], b: centres[i + 1], value: v.p! });
    }
  } else {
    const half = (v.l! - v.w!) / 2;
    const added = addSlot(work, [x - half, y], [x + half, y], v.w!);
    if (typeof added === "string") throw new Error(added);
    keep(added);
    const arc = added.created.map((id) => findCurve(work, id)).find((c) => c?.kind === "arc");
    const side = added.created.map((id) => findCurve(work, id)).find((c) => c?.kind === "line" && !c.construction);
    if (side) rule({ kind: "horizontal", line: side.id });
    const centres = added.created.map((id) => findCurve(work, id)).flatMap((c) => (c?.kind === "arc" ? [c.center] : []));
    if (arc) dim({ kind: "diameter", curve: arc.id, value: v.w! });
    if (centres.length === 2) dim({ kind: "distance", a: centres[0], b: centres[1], value: v.l! - v.w! });
  }
  if (dims) {
    // A dimension is kept when it takes a degree of freedom off (one that repeats or contradicts the others is not).
    let dof = probeSketch(work).dof;
    for (const d of wanted) {
      const next = addConstraint(work, d).geometry;
      try {
        const r = probeSketch(next);
        if (r.ok && r.dof < dof) [work, dof] = [next, r.dof];
      } catch {
        // Left out.
      }
    }
  }
  return { geometry: work, created };
}

/** The shape at the pointer, dashed, before it is laid. */
export function shapePreview(g: SketchGeometry, at: Vec2): Preview {
  const preview: Preview = { lines: [], circles: [], arcs: [] };
  let placed: { geometry: SketchGeometry; created: string[] };
  try {
    placed = placeJoineryShape(g, stamp.kind, stamp.values, at, false);
  } catch {
    return preview;
  }
  const p = (id: string) => pointPos(placed.geometry, id);
  for (const id of placed.created) {
    const c = findCurve(placed.geometry, id);
    if (!c || c.construction) continue;
    if (c.kind === "line") preview.lines.push([p(c.p1), p(c.p2)]);
    else if (c.kind === "circle") preview.circles.push({ center: p(c.center), radius: c.radius });
    else preview.arcs.push({ center: p(c.center), radius: c.radius, start: c.startAngle, end: c.endAngle });
  }
  return preview;
}
