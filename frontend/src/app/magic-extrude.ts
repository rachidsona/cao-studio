/**
 * « Magie extrusion » : un seul outil pour tout tracer sur un corps et l'extruder. Son panneau commence par le choix
 * « Tracé » : un trait depuis une arête (parallèle) ou depuis un coin (en travers), puis tiré ou poussé dans sa bande
 * (app/face-strip-tool.ts) ; ou une ligne, un rectangle, un cercle, le décalage du contour, dessinés sur une face avec
 * les distances aux bords, puis tirés ou poussés (app/draw-on-face-tool.ts). Changer de tracé passe d'une manière à
 * l'autre sans fermer l'outil ; le dernier tracé choisi est repris à la prochaine ouverture.
 */
import { solveSketch } from "../constraints/solver";
import type { SketchConstraint, SketchGeometry } from "../document/sketch";
import type { FaceRef } from "../document/types";
import { addConstraint, pointPos } from "../sketcher/edit";
import { sketchFrame } from "../sketcher/frame";
import type { FacePick, Viewport } from "../viewport/viewport";
import { axesVisible, setAxesVisible } from "../viewport/world-axes";
import { el } from "../ui/dom";
import type { LoadedFace } from "./face-strip-view";
import type { ToolContext } from "./panel-tool";
export const MAGIC_EXTRUDE = "Magie extrusion";

/** The traces: the first three draw a line from an edge, a corner or a face (face strip), the others a shape on a face. */
export type Trace = "edge" | "corner" | "face" | "line" | "rectangle" | "circle" | "offset" | "arc" | "polygon" | "slot" | "oval" | "curve" | "rectangle-center" | "rectangle-3pt" | "circle-2pt" | "circle-3pt" | "arc-3pt";

export const TRACES: [Trace, string][] = [
  ["edge", "Trait depuis une arête (parallèle)"],
  ["corner", "Trait depuis un coin (en travers)"],
  ["face", "Trait depuis une face (parallèle)"],
  ["line", "Ligne / polyligne"],
  ["rectangle", "Rectangle"],
  ["circle", "Cercle"],
  ["offset", "Décalage du contour"],
  ["rectangle-center", "Rectangle par le centre"],
  ["rectangle-3pt", "Rectangle par 3 points (de biais)"],
  ["circle-2pt", "Cercle par 2 points"],
  ["circle-3pt", "Cercle par 3 points"],
  ["arc", "Arc (centre, départ, fin)"],
  ["arc-3pt", "Arc par 3 points"],
  ["polygon", "Polygone"],
  ["slot", "Oblong"],
  ["oval", "Ovale"],
  ["curve", "Courbe"],
];
/** The traces drawn by the sketch's own tools (app/face-sketch-tool.ts). */
export const isSketchTrace = (t: Trace): boolean => TRACES.findIndex(([v]) => v === t) > TRACES.findIndex(([v]) => v === "offset");

/** Whether the trace is a line drawn from an edge or a corner, then pulled in its band. */
export const isStripTrace = (t: Trace): t is "edge" | "corner" | "face" => t === "edge" || t === "corner" || t === "face";

/** The trace chosen last, for the session: the tool opens on it. */
let lastTrace: Trace = "edge";
export const lastMagicTrace = (): Trace => lastTrace;
export function rememberTrace(t: Trace): void {
  lastTrace = t;
}

/** « Puis tirer / pousser »: unticked, a trace or a shape is kept as a sketch alone, without extruding it (the session's choice). */
let pull = true;
export const pullAfter = (): boolean => pull;
export function rememberPull(v: boolean): void {
  pull = v;
}

/** A face pulled with « Magie extrusion », the pointer on a flat face of another body: it goes up to it and follows it. */
export class FaceToReach {
  until: { body: string; face: FaceRef } | null = null;
  private key = "";

  /** The face under the pointer (none, or one of `own`, forgets it); `found` when it is read. */
  aim(ctx: Pick<ToolContext, "viewport" | "geometry">, event: PointerEvent, own: string, found: () => void): void {
    const hit = ctx.viewport.pickFace(event);
    const key = hit && hit.bodyId !== own ? `${hit.bodyId}:${hit.faceIndex}` : "";
    if (key === this.key) return;
    [this.key, this.until] = [key, null];
    if (!hit || !key) return;
    void ctx.geometry.describe(hit.bodyId, [], hit.faceIndex).then(({ face }) => {
      if (this.key !== key || face?.type !== "PLANE") return;
      this.until = { body: hit.bodyId, face };
      found();
    }).catch(() => undefined);
  }
}

/**
 * The grid as a face to draw on where no body is under the pointer — the floor (XY), the front (XZ) or the side (YZ)
 * through the origin, as « Nouvelle esquisse » offers them: no edges, no outline, no body under it — the shape drawn is a
 * sketch of its own, pulled into a new body.
 */
export type GroundPlane = "XY" | "XZ" | "YZ";
export const GROUND_PLANES: [GroundPlane, string][] = [["XY", "Dessus (XY)"], ["XZ", "Face (XZ)"], ["YZ", "Côté (YZ)"]];
/** The plane chosen last, for the session. */
let groundPlane: GroundPlane = "XY";
export const GROUND = "ground";
export function groundFace(plane: GroundPlane = groundPlane): LoadedFace {
  const frame = sketchFrame(plane, 0);
  return {
    key: `${GROUND}:${plane}`,
    pick: { bodyId: "", faceIndex: -1 } as FacePick,
    outline: { surface: "PLANE", center: [0, 0, 0], normal: frame.normal, edges: [] },
    frame,
    plane,
    offset: 0,
    polygon: [],
  };
}
export const isGround = (face: { key: string } | null | undefined): boolean => !!face?.key.startsWith(GROUND);
type Select = (label: string, value: string, options: [string, string][], change: (v: string) => void) => HTMLElement;
type Check = (label: string, checked: boolean, change: (v: boolean) => void) => HTMLElement;
/**
 * The panel's rows « Sans corps, sur » (the plane the grid is drawn on; `changed`: the pointer read again) and
 * « Afficher les axes » (the three axes of the view, as in SketchUp).
 */
export const groundRow = (select: Select, changed: () => void, check: Check, viewport: Viewport): HTMLElement =>
  el(
    "div",
    { class: "space-y-1.5" },
    select("Sans corps, sur", groundPlane, GROUND_PLANES, (v) => ((groundPlane = v as GroundPlane), changed())),
    axesRow(check, viewport),
  );
/** The row « Afficher les axes » alone (every trace of Magie extrusion: a shape, an offset, a line from an edge or a corner). */
export const axesRow = (check: Check, viewport: Viewport): HTMLElement => check("Afficher les axes", axesVisible(viewport), (v) => setAxesVisible(viewport, v));

/**
 * On the grid, where the pointer lands when nothing else holds it (`snap` free): on the axes of its plane (its two
 * zero lines) within `reach`, else on the grid's step. A point held by a magnet (a corner of a body) is kept.
 */
export function groundSnap<K extends string>(snap: { point: [number, number]; kind: K | "free" }, step: number, reach: number): { point: [number, number]; kind: K | "free" | "corner" } {
  if (snap.kind !== "free") return snap;
  const on = (v: number) => Math.abs(v) <= reach;
  const round = (v: number) => (step > 0 ? Math.round(v / step) * step + 0 : v);
  const [x, y] = snap.point;
  const point: [number, number] = [on(x) ? 0 : round(x), on(y) ? 0 : round(y)];
  return { point, kind: on(x) || on(y) ? "corner" : "free" };
}

/** What was typed for the point `at` of a line, a rectangle or a circle drawn on a face (mm; a line's angle in degrees). */
type TypedAt = { at: number; length: number | null; angle: number | null };
const typedBy = new WeakMap<object, TypedAt[]>();

/** The values typed for a point of the shape a tool draws: kept to become its fixed dimensions. */
export function recordTyped(tool: object, at: number, typed: { length: number | null; angle: number | null }): void {
  if (typed.length === null && typed.angle === null) return;
  typedBy.set(tool, [...(typedBy.get(tool) ?? []).filter((t) => t.at !== at), { at, length: typed.length, angle: typed.angle }]);
}

/** The drawing started over: nothing typed kept. */
export function forgetTyped(tool: object): void {
  typedBy.delete(tool);
}

/**
 * The line, rectangle or circle drawn on a face with a fixed dimension for each value typed, as the sketch's tools
 * give: the length of a segment of a line (its angle orients it without a dimension), the width and the height of a
 * rectangle, the diameter of a circle (twice the radius typed). A dimension the sketch cannot take is left out.
 */
export function withFixed(tool: object, g: SketchGeometry, shape: string, points: readonly [number, number][]): SketchGeometry {
  let out = g;
  const keep = (constraint: object) => {
    const added = addConstraint(out, constraint as Omit<SketchConstraint, "id">).geometry;
    try {
      if (solveSketch(added).state === "ok") out = added;
    } catch {
      // Left out.
    }
  };
  const near = (id: string, p: [number, number] | undefined) => !!p && Math.hypot(pointPos(out, id)[0] - p[0], pointPos(out, id)[1] - p[1]) < 1e-6;
  const lines = () => out.curves.filter((c): c is Extract<typeof c, { kind: "line" }> => c.kind === "line" && !c.construction && !c.projected);
  for (const { at, length, angle } of typedBy.get(tool) ?? []) {
    if (at < 1 || at >= points.length + (shape === "line" ? 0 : 1)) continue;
    if (shape === "line" && length !== null) {
      const [a, b] = [points[at - 1], points[at]];
      const line = lines().find((l) => (near(l.p1, a) && near(l.p2, b)) || (near(l.p1, b) && near(l.p2, a)));
      if (line) keep({ kind: "length", line: line.id, value: length });
    } else if (shape === "rectangle") {
      const corner = points[0];
      const [x0, y0] = corner ?? [0, 0];
      const [x1, y1] = points[1] ?? corner ?? [0, 0];
      const on = (l: { p1: string; p2: string }) => [l.p1, l.p2].every((id) => {
        const [x, y] = pointPos(out, id);
        return (Math.abs(x - x0) < 1e-6 || Math.abs(x - x1) < 1e-6) && (Math.abs(y - y0) < 1e-6 || Math.abs(y - y1) < 1e-6);
      });
      const across = lines().find((l) => on(l) && Math.abs(pointPos(out, l.p1)[1] - pointPos(out, l.p2)[1]) < 1e-6);
      const up = lines().find((l) => on(l) && Math.abs(pointPos(out, l.p1)[0] - pointPos(out, l.p2)[0]) < 1e-6);
      if (length !== null && across) keep({ kind: "length", line: across.id, value: length });
      if (angle !== null && up) keep({ kind: "length", line: up.id, value: angle });
    } else if (shape === "circle" && length !== null) {
      const circle = out.curves.find((c) => c.kind === "circle" && !c.construction && near(c.center, points[0]));
      if (circle) keep({ kind: "diameter", curve: circle.id, value: 2 * length });
    }
  }
  return out;
}

