/**
 * Geometric constraint solving with planegcs (FreeCAD's 2D solver, WASM).
 *
 * The sketch model is translated into planegcs primitives, solved, and the
 * solved positions are written back into a new SketchGeometry. A second pass
 * on the solved geometry gives reliable diagnostics (degrees of freedom,
 * redundant and conflicting constraints): planegcs evaluates them at the
 * starting point, which is only meaningful once that point satisfies the
 * constraints.
 */
import {
  DebugMode,
  GcsWrapper,
  SolveStatus,
  init_planegcs_module,
  type ModuleStatic,
  type SketchPrimitive,
} from "@salusoft89/planegcs";
import {
  AXIS_X,
  AXIS_Y,
  ORIGIN,
  type SketchConstraint,
  type SketchCurve,
  type SketchGeometry,
} from "../document/sketch";

export type SketchState = "ok" | "redundant" | "conflicting" | "failed";

export interface SolveResult {
  state: SketchState;
  /** Remaining degrees of freedom (0 = fully constrained). */
  dof: number;
  conflicting: string[];
  redundant: string[];
  geometry: SketchGeometry;
}

export interface DragTarget {
  point: string;
  x: number;
  y: number;
}

export interface SolveOptions {
  /** Pulls a point toward a position without overriding real constraints (mouse drag). */
  drag?: DragTarget;
  /** Skip the diagnostic pass (interactive dragging). */
  diagnose?: boolean;
}

export class SketchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SketchError";
  }
}

let solverModule: ModuleStatic | null = null;

export async function initSolver(options: Record<string, unknown> = {}): Promise<void> {
  if (solverModule) return;
  solverModule = await init_planegcs_module({ print: () => {}, printErr: () => {}, ...options });
}

export function isSolverReady(): boolean {
  return solverModule !== null;
}

const AXIS_X_END = "axisX:end";
const AXIS_Y_END = "axisY:end";
/** Suffix separating the planegcs ids generated from one sketch constraint. */
const PART = "#";

type Prim = SketchPrimitive;

function referencePrimitives(): Prim[] {
  return [
    { id: ORIGIN, type: "point", x: 0, y: 0, fixed: true },
    { id: AXIS_X_END, type: "point", x: 1, y: 0, fixed: true },
    { id: AXIS_Y_END, type: "point", x: 0, y: 1, fixed: true },
    { id: AXIS_X, type: "line", p1_id: ORIGIN, p2_id: AXIS_X_END },
    { id: AXIS_Y, type: "line", p1_id: ORIGIN, p2_id: AXIS_Y_END },
  ] as Prim[];
}

function curvePrimitives(curve: SketchCurve): Prim[] {
  switch (curve.kind) {
    case "line":
      return [{ id: curve.id, type: "line", p1_id: curve.p1, p2_id: curve.p2 }] as Prim[];
    case "circle":
      return [{ id: curve.id, type: "circle", c_id: curve.center, radius: curve.radius }] as Prim[];
    case "arc":
      return [
        {
          id: curve.id,
          type: "arc",
          c_id: curve.center,
          radius: curve.radius,
          start_angle: curve.startAngle,
          end_angle: curve.endAngle,
          start_id: curve.start,
          end_id: curve.end,
        },
        { id: `${curve.id}${PART}rules`, type: "arc_rules", a_id: curve.id },
      ] as Prim[];
  }
}

type CurveKind = "line" | "circle" | "arc" | "point";

function kindOf(geometry: SketchGeometry, id: string): CurveKind {
  if (id === AXIS_X || id === AXIS_Y) return "line";
  const curve = geometry.curves.find((c) => c.id === id);
  if (curve) return curve.kind;
  return "point";
}

function centerOf(geometry: SketchGeometry, id: string): string {
  const curve = geometry.curves.find((c) => c.id === id);
  if (!curve || curve.kind === "line") throw new SketchError(`« ${id} » n'est pas un cercle ou un arc.`);
  return curve.center;
}

function lineEnds(geometry: SketchGeometry, id: string): [string, string] {
  const curve = geometry.curves.find((c) => c.id === id);
  if (!curve || curve.kind !== "line") throw new SketchError(`« ${id} » n'est pas une ligne.`);
  return [curve.p1, curve.p2];
}

function pair(geometry: SketchGeometry, a: string, b: string): string {
  return [kindOf(geometry, a), kindOf(geometry, b)].join("-");
}

/** Translates one sketch constraint into planegcs constraints. */
function constraintPrimitives(geometry: SketchGeometry, c: SketchConstraint): Prim[] {
  const id = c.id;
  const p = (suffix: string) => `${id}${PART}${suffix}`;
  switch (c.kind) {
    case "coincident":
      return [{ id, type: "p2p_coincident", p1_id: c.a, p2_id: c.b }] as Prim[];
    case "horizontal":
      return [{ id, type: "horizontal_l", l_id: c.line }] as Prim[];
    case "vertical":
      return [{ id, type: "vertical_l", l_id: c.line }] as Prim[];
    case "parallel":
      return [{ id, type: "parallel", l1_id: c.a, l2_id: c.b }] as Prim[];
    case "perpendicular":
      return [{ id, type: "perpendicular_ll", l1_id: c.a, l2_id: c.b }] as Prim[];
    case "tangent": {
      const kinds = pair(geometry, c.a, c.b);
      const [x, y] = [c.a, c.b];
      const map: Record<string, Prim> = {
        "line-circle": { id, type: "tangent_lc", l_id: x, c_id: y },
        "circle-line": { id, type: "tangent_lc", l_id: y, c_id: x },
        "line-arc": { id, type: "tangent_la", l_id: x, a_id: y },
        "arc-line": { id, type: "tangent_la", l_id: y, a_id: x },
        "circle-circle": { id, type: "tangent_cc", c1_id: x, c2_id: y },
        "circle-arc": { id, type: "tangent_ca", c_id: x, a_id: y },
        "arc-circle": { id, type: "tangent_ca", c_id: y, a_id: x },
        "arc-arc": { id, type: "tangent_aa", a1_id: x, a2_id: y },
      } as Record<string, Prim>;
      const prim = map[kinds];
      if (!prim) throw new SketchError("La tangence s'applique entre une ligne, un cercle ou un arc (pas entre deux lignes).");
      return [prim];
    }
    case "equal": {
      const kinds = pair(geometry, c.a, c.b);
      const [x, y] = [c.a, c.b];
      const map: Record<string, Prim> = {
        "line-line": { id, type: "equal_length", l1_id: x, l2_id: y },
        "circle-circle": { id, type: "equal_radius_cc", c1_id: x, c2_id: y },
        "circle-arc": { id, type: "equal_radius_ca", c1_id: x, a2_id: y },
        "arc-circle": { id, type: "equal_radius_ca", c1_id: y, a2_id: x },
        "arc-arc": { id, type: "equal_radius_aa", a1_id: x, a2_id: y },
      } as Record<string, Prim>;
      const prim = map[kinds];
      if (!prim) throw new SketchError("L'égalité s'applique à deux lignes ou à deux cercles/arcs.");
      return [prim];
    }
    case "symmetric":
      return kindOf(geometry, c.axis) === "line"
        ? ([{ id, type: "p2p_symmetric_ppl", p1_id: c.a, p2_id: c.b, l_id: c.axis }] as Prim[])
        : ([{ id, type: "p2p_symmetric_ppp", p1_id: c.a, p2_id: c.b, p_id: c.axis }] as Prim[]);
    case "concentric":
      return [{ id, type: "p2p_coincident", p1_id: centerOf(geometry, c.a), p2_id: centerOf(geometry, c.b) }] as Prim[];
    case "fix":
      return [
        { id: p("x"), type: "coordinate_x", p_id: c.point, x: c.x },
        { id: p("y"), type: "coordinate_y", p_id: c.point, y: c.y },
      ] as Prim[];
    case "pointOnCurve": {
      const kind = kindOf(geometry, c.curve);
      if (kind === "line") return [{ id, type: "point_on_line_pl", p_id: c.point, l_id: c.curve }] as Prim[];
      if (kind === "circle") return [{ id, type: "point_on_circle", p_id: c.point, c_id: c.curve }] as Prim[];
      return [{ id, type: "point_on_arc", p_id: c.point, a_id: c.curve }] as Prim[];
    }
    case "midpoint": {
      const [a, b] = lineEnds(geometry, c.line);
      return [{ id, type: "p2p_symmetric_ppp", p1_id: a, p2_id: b, p_id: c.point }] as Prim[];
    }
    default:
      return dimensionPrimitives(geometry, c);
  }
}

function dimensionPrimitives(geometry: SketchGeometry, c: SketchConstraint): Prim[] {
  if (!("value" in c) || c.driving === false) return [];
  const id = c.id;
  switch (c.kind) {
    case "distance":
      return [{ id, type: "p2p_distance", p1_id: c.a, p2_id: c.b, distance: c.value }] as Prim[];
    case "distanceX":
    case "distanceY": {
      const prop = c.kind === "distanceX" ? "x" : "y";
      return [
        { id, type: "difference", param1: { o_id: c.a, prop }, param2: { o_id: c.b, prop }, difference: c.value },
      ] as Prim[];
    }
    case "pointLineDistance":
      return [{ id, type: "p2l_distance", p_id: c.point, l_id: c.line, distance: c.value }] as Prim[];
    case "length": {
      const [a, b] = lineEnds(geometry, c.line);
      return [{ id, type: "p2p_distance", p1_id: a, p2_id: b, distance: c.value }] as Prim[];
    }
    case "angle":
      return [{ id, type: "l2l_angle_ll", l1_id: c.a, l2_id: c.b, angle: (c.value * Math.PI) / 180 }] as Prim[];
    case "radius":
      return kindOf(geometry, c.curve) === "arc"
        ? ([{ id, type: "arc_radius", a_id: c.curve, radius: c.value }] as Prim[])
        : ([{ id, type: "circle_radius", c_id: c.curve, radius: c.value }] as Prim[]);
    case "diameter":
      return kindOf(geometry, c.curve) === "arc"
        ? ([{ id, type: "arc_diameter", a_id: c.curve, diameter: c.value }] as Prim[])
        : ([{ id, type: "circle_diameter", c_id: c.curve, diameter: c.value }] as Prim[]);
    default:
      return [];
  }
}

function toPrimitives(geometry: SketchGeometry, drag?: DragTarget): Prim[] {
  const prims: Prim[] = referencePrimitives();
  for (const point of geometry.points) prims.push({ id: point.id, type: "point", x: point.x, y: point.y, fixed: point.fixed === true } as Prim);
  for (const curve of geometry.curves) {
    prims.push(...curvePrimitives(curve));
    // Projected circles and arcs keep the body's radius (internal constraint, not shown).
    if (curve.projected && curve.kind !== "line") {
      prims.push(
        (curve.kind === "circle"
          ? { id: `${curve.id}${PART}fixr`, type: "circle_radius", c_id: curve.id, radius: curve.radius }
          : { id: `${curve.id}${PART}fixr`, type: "arc_radius", a_id: curve.id, radius: curve.radius }) as Prim,
      );
    }
  }
  for (const constraint of geometry.constraints) prims.push(...constraintPrimitives(geometry, constraint));
  if (drag) {
    prims.push(
      ...([
        { id: `drag${PART}x`, type: "coordinate_x", p_id: drag.point, x: drag.x, temporary: true },
        { id: `drag${PART}y`, type: "coordinate_y", p_id: drag.point, y: drag.y, temporary: true },
      ] as Prim[]),
    );
  }
  return prims;
}

/** Copies solved values from planegcs back into the sketch model. */
function fromPrimitives(geometry: SketchGeometry, prims: Prim[]): SketchGeometry {
  const byId = new Map(prims.map((p) => [p.id, p as unknown as Record<string, number>]));
  return {
    points: geometry.points.map((pt) => {
      const solved = byId.get(pt.id);
      return solved ? { ...pt, x: solved.x as number, y: solved.y as number } : pt;
    }),
    curves: geometry.curves.map((curve) => {
      const solved = byId.get(curve.id);
      if (!solved || curve.kind === "line") return curve;
      if (curve.kind === "circle") return { ...curve, radius: solved.radius as number };
      return { ...curve, radius: solved.radius as number, startAngle: solved.start_angle as number, endAngle: solved.end_angle as number };
    }),
    constraints: geometry.constraints,
    ...(geometry.offsets ? { offsets: geometry.offsets } : {}),
    ...(geometry.texts ? { texts: geometry.texts } : {}),
    ...(geometry.underlay ? { underlay: geometry.underlay } : {}),
  };
}

const sourceId = (gcsId: string) => gcsId.split(PART)[0] as string;
const unique = (ids: string[]) => [...new Set(ids.map(sourceId))].filter((id) => id !== "drag");

interface Pass {
  status: number;
  dof: number;
  conflicting: string[];
  redundant: string[];
  prims: Prim[];
}

function runPass(prims: Prim[]): Pass {
  if (!solverModule) throw new SketchError("Le solveur de contraintes n'est pas initialisé.");
  const wrapper = new GcsWrapper(new solverModule.GcsSystem());
  wrapper.debug_mode = DebugMode.NoDebug;
  try {
    let status: ReturnType<typeof wrapper.solve>;
    try {
      wrapper.push_primitives_and_params(prims);
      status = wrapper.solve();
    } catch (error) {
      // The solver's own WebAssembly runs out of memory on a very large sketch (« Aborted(OOM) », about a thousand
      // constraints): said plainly rather than as a raw kernel error (audit of 11/11/2026).
      if (error instanceof SketchError) throw error;
      throw new SketchError(`Esquisse trop grande pour le solveur de contraintes (${prims.length} éléments) : partagez-la en plusieurs esquisses, puis rechargez la page.`);
    }
    wrapper.apply_solution();
    return {
      status,
      dof: wrapper.gcs.dof(),
      conflicting: unique(wrapper.get_gcs_conflicting_constraints()),
      redundant: unique([...wrapper.get_gcs_redundant_constraints(), ...wrapper.get_gcs_partially_redundant_constraints()]),
      prims: structuredClone(wrapper.sketch_index.get_primitives()) as Prim[],
    };
  } finally {
    wrapper.destroy_gcs_module();
  }
}

const POSITIVE_DIMENSIONS = new Set(["distance", "length", "radius", "diameter", "pointLineDistance"]);
/** Smallest positive dimension accepted (mm). */
export const MIN_DIMENSION = 1e-3;

/** Rejects dimension values the solver could only satisfy degenerately. */
export function checkDimensions(geometry: SketchGeometry): void {
  for (const c of geometry.constraints) {
    if (!("value" in c) || !Number.isFinite(c.value)) continue;
    if (POSITIVE_DIMENSIONS.has(c.kind) && c.value < MIN_DIMENSION) {
      throw new SketchError(`La cote « ${c.label ?? c.id} » doit être supérieure à ${MIN_DIMENSION} mm.`);
    }
  }
}

export function solveSketch(geometry: SketchGeometry, options: SolveOptions = {}): SolveResult {
  checkDimensions(geometry);
  const first = runPass(toPrimitives(geometry, options.drag));
  let solved = fromPrimitives(geometry, first.prims);
  let pass = first;
  if (options.diagnose !== false && first.conflicting.length === 0) {
    pass = runPass(toPrimitives(solved));
    solved = fromPrimitives(solved, pass.prims);
  }
  // An arc whose centre and ends are all fixed (a projected edge of a body) is over-determined by its own
  // rules: that is not the user's doing, so it is not reported. Neither are two arcs with the same centre and
  // the same two ends (a circle cut in two by "Couper"): each one's rules repeat the other's.
  const arcs = geometry.curves.filter((c) => c.kind === "arc");
  const ends = (c: (typeof arcs)[number]) => (c.kind === "arc" ? `${c.center}|${[c.start, c.end].sort().join("|")}` : "");
  const fixedArcs = new Set(
    arcs
      .filter((c) => c.kind === "arc" && ([c.center, c.start, c.end].every((id) => geometry.points.find((q) => q.id === id)?.fixed === true) || arcs.some((o) => o.id !== c.id && ends(o) === ends(c))))
      .map((c) => c.id),
  );
  pass = { ...pass, redundant: pass.redundant.filter((id) => !fixedArcs.has(id)) };
  const failed = pass.status === SolveStatus.Failed || pass.status === SolveStatus.SuccessfulSolutionInvalid;
  const conflicting = first.conflicting.length ? first.conflicting : pass.conflicting;
  let state: SketchState = "ok";
  if (conflicting.length) state = "conflicting";
  else if (failed) state = "failed";
  else if (pass.redundant.length) state = "redundant";
  return { state, dof: pass.dof, conflicting, redundant: pass.redundant, geometry: solved };
}
