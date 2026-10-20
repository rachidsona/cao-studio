/**
 * Constraint and dimension commands of the sketcher: which ones apply to the
 * current selection, and the constraints they create.
 */
import { AXIS_X, AXIS_Y, ORIGIN, type DimensionConstraint, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import { findCurve, measure } from "../sketcher/edit";

export type EntityKind = "point" | "line" | "circle" | "arc";

export interface Selection {
  points: string[];
  lines: string[];
  circles: string[];
  arcs: string[];
  /** All selected ids in selection order. */
  order: string[];
}

export function classify(g: SketchGeometry, ids: string[]): Selection {
  const sel: Selection = { points: [], lines: [], circles: [], arcs: [], order: ids };
  for (const id of ids) {
    if (id === ORIGIN || g.points.some((p) => p.id === id)) sel.points.push(id);
    else if (id === AXIS_X || id === AXIS_Y) sel.lines.push(id);
    else {
      const c = findCurve(g, id);
      if (c?.kind === "line") sel.lines.push(id);
      else if (c?.kind === "circle") sel.circles.push(id);
      else if (c?.kind === "arc") sel.arcs.push(id);
    }
  }
  return sel;
}

type NewConstraint = Omit<SketchConstraint, "id">;

export interface Command {
  id: string;
  label: string;
  /** Short glyph shown on the toolbar button. */
  glyph: string;
  dimension?: boolean;
  applies(sel: Selection): boolean;
  build(sel: Selection, g: SketchGeometry): NewConstraint[];
}

const count = (sel: Selection) => sel.order.length;
const roundCurves = (sel: Selection) => [...sel.circles, ...sel.arcs];
const anyCurve = (sel: Selection) => [...sel.lines, ...sel.circles, ...sel.arcs];
const only = (sel: Selection, points: number, lines: number, round: number) =>
  sel.points.length === points && sel.lines.length === lines && roundCurves(sel).length === round;

function dimension(d: Omit<DimensionConstraint, "id" | "value">, g: SketchGeometry): NewConstraint {
  const value = measure(g, { ...d, id: "", value: 0 } as DimensionConstraint);
  return { ...d, value: Number(value.toFixed(6)) } as NewConstraint;
}

export const COMMANDS: Command[] = [
  {
    id: "coincident",
    label: "Coïncidence",
    glyph: "⦿",
    applies: (s) => only(s, 2, 0, 0),
    build: (s) => [{ kind: "coincident", a: s.points[0], b: s.points[1] } as NewConstraint],
  },
  {
    id: "horizontal",
    label: "Horizontale",
    glyph: "H",
    applies: (s) => s.lines.length > 0 && count(s) === s.lines.length && !s.lines.some((l) => l === AXIS_X || l === AXIS_Y),
    build: (s) => s.lines.map((line) => ({ kind: "horizontal", line }) as NewConstraint),
  },
  {
    id: "vertical",
    label: "Verticale",
    glyph: "V",
    applies: (s) => s.lines.length > 0 && count(s) === s.lines.length && !s.lines.some((l) => l === AXIS_X || l === AXIS_Y),
    build: (s) => s.lines.map((line) => ({ kind: "vertical", line }) as NewConstraint),
  },
  {
    id: "parallel",
    label: "Parallèle",
    glyph: "∥",
    applies: (s) => only(s, 0, 2, 0),
    build: (s) => [{ kind: "parallel", a: s.lines[0], b: s.lines[1] } as NewConstraint],
  },
  {
    id: "perpendicular",
    label: "Perpendiculaire",
    glyph: "⟂",
    applies: (s) => only(s, 0, 2, 0),
    build: (s) => [{ kind: "perpendicular", a: s.lines[0], b: s.lines[1] } as NewConstraint],
  },
  {
    id: "tangent",
    label: "Tangence",
    glyph: "◠",
    applies: (s) => s.points.length === 0 && count(s) === 2 && roundCurves(s).length >= 1,
    build: (s) => [{ kind: "tangent", a: s.order[0], b: s.order[1] } as NewConstraint],
  },
  {
    id: "equal",
    label: "Égalité",
    glyph: "=",
    applies: (s) => s.points.length === 0 && count(s) >= 2 && (s.lines.length === count(s) || roundCurves(s).length === count(s)),
    build: (s) => anyCurve(s).slice(1).map((b) => ({ kind: "equal", a: anyCurve(s)[0], b }) as NewConstraint),
  },
  {
    id: "symmetric",
    label: "Symétrie",
    glyph: "⋈",
    applies: (s) => count(s) === 3 && (only(s, 2, 1, 0) || only(s, 3, 0, 0)),
    build: (s) => {
      const axis = s.lines[0] ?? (s.points[2] as string);
      const [a, b] = s.lines.length ? s.points : s.points.slice(0, 2);
      return [{ kind: "symmetric", a, b, axis } as NewConstraint];
    },
  },
  {
    id: "concentric",
    label: "Concentricité",
    glyph: "◎",
    applies: (s) => only(s, 0, 0, 2),
    build: (s) => [{ kind: "concentric", a: roundCurves(s)[0], b: roundCurves(s)[1] } as NewConstraint],
  },
  {
    id: "fix",
    label: "Fixer",
    glyph: "⚓",
    applies: (s) => s.points.length > 0 && count(s) === s.points.length && !s.points.includes(ORIGIN),
    build: (s, g) =>
      s.points.map((point) => {
        const p = g.points.find((q) => q.id === point);
        return { kind: "fix", point, x: p?.x ?? 0, y: p?.y ?? 0 } as NewConstraint;
      }),
  },
  {
    id: "pointOnCurve",
    label: "Point sur courbe",
    glyph: "⊸",
    applies: (s) => s.points.length === 1 && count(s) === 2,
    build: (s) => [{ kind: "pointOnCurve", point: s.points[0], curve: anyCurve(s)[0] } as NewConstraint],
  },
  {
    id: "midpoint",
    label: "Milieu",
    glyph: "◇",
    applies: (s) => only(s, 1, 1, 0) && s.lines[0] !== AXIS_X && s.lines[0] !== AXIS_Y,
    build: (s) => [{ kind: "midpoint", point: s.points[0], line: s.lines[0] } as NewConstraint],
  },
  {
    id: "dimension",
    label: "Cote",
    glyph: "↔",
    dimension: true,
    applies: (s) =>
      only(s, 0, 1, 0) || only(s, 2, 0, 0) || only(s, 1, 1, 0) || only(s, 0, 2, 0) || only(s, 0, 0, 1) || only(s, 1, 0, 0),
    build: (s, g) => {
      if (only(s, 0, 1, 0)) return [dimension({ kind: "length", line: s.lines[0] } as never, g)];
      if (only(s, 2, 0, 0)) return [dimension({ kind: "distance", a: s.points[0], b: s.points[1] } as never, g)];
      if (only(s, 1, 1, 0)) return [dimension({ kind: "pointLineDistance", point: s.points[0], line: s.lines[0] } as never, g)];
      if (only(s, 0, 2, 0)) return [dimension({ kind: "angle", a: s.lines[0], b: s.lines[1] } as never, g)];
      if (s.circles.length) return [dimension({ kind: "diameter", curve: s.circles[0] } as never, g)];
      if (s.arcs.length) return [dimension({ kind: "radius", curve: s.arcs[0] } as never, g)];
      // A single point: position relative to the origin.
      return [
        dimension({ kind: "distanceX", a: ORIGIN, b: s.points[0] } as never, g),
        dimension({ kind: "distanceY", a: ORIGIN, b: s.points[0] } as never, g),
      ];
    },
  },
  {
    id: "dimensionX",
    label: "Cote horizontale",
    glyph: "⇿",
    dimension: true,
    applies: (s) => only(s, 2, 0, 0),
    build: (s, g) => [dimension({ kind: "distanceX", a: s.points[0], b: s.points[1] } as never, g)],
  },
  {
    id: "dimensionY",
    label: "Cote verticale",
    glyph: "↕",
    dimension: true,
    applies: (s) => only(s, 2, 0, 0),
    build: (s, g) => [dimension({ kind: "distanceY", a: s.points[0], b: s.points[1] } as never, g)],
  },
];

export const CONSTRAINT_LABELS: Record<string, string> = {
  coincident: "Coïncidence",
  horizontal: "Horizontale",
  vertical: "Verticale",
  parallel: "Parallèle",
  perpendicular: "Perpendiculaire",
  tangent: "Tangence",
  equal: "Égalité",
  symmetric: "Symétrie",
  concentric: "Concentricité",
  fix: "Fixe",
  pointOnCurve: "Point sur courbe",
  midpoint: "Milieu",
  distance: "Distance",
  distanceX: "Distance horizontale",
  distanceY: "Distance verticale",
  pointLineDistance: "Distance point-ligne",
  length: "Longueur",
  angle: "Angle",
  radius: "Rayon",
  diameter: "Diamètre",
};

export const CONSTRAINT_GLYPHS: Record<string, string> = {
  coincident: "⦿",
  horizontal: "H",
  vertical: "V",
  parallel: "∥",
  perpendicular: "⟂",
  tangent: "◠",
  equal: "=",
  symmetric: "⋈",
  concentric: "◎",
  fix: "⚓",
  pointOnCurve: "⊸",
  midpoint: "◇",
};
