/**
 * « Magie extrusion » : un seul outil pour tout tracer sur un corps et l'extruder. Son panneau commence par le choix
 * « Tracé » : un trait depuis une arête (parallèle) ou depuis un coin (en travers), puis tiré ou poussé dans sa bande
 * (app/face-strip-tool.ts) ; ou une ligne, un rectangle, un cercle, le décalage du contour, dessinés sur une face avec
 * les distances aux bords, puis tirés ou poussés (app/draw-on-face-tool.ts). Changer de tracé passe d'une manière à
 * l'autre sans fermer l'outil ; le dernier tracé choisi est repris à la prochaine ouverture.
 */
import type { FaceRef } from "../document/types";
import { sketchFrame } from "../sketcher/frame";
import type { FacePick, Viewport } from "../viewport/viewport";
import { axesVisible, setAxesVisible } from "../viewport/world-axes";
import { el } from "../ui/dom";
import type { LoadedFace } from "./face-strip-view";
import type { ToolContext } from "./panel-tool";
export const MAGIC_EXTRUDE = "Magie extrusion";

/** The traces: the first two draw a line from an edge or a corner (face strip), the others a shape on a face. */
export type Trace = "edge" | "corner" | "line" | "rectangle" | "circle" | "offset";

export const TRACES: [Trace, string][] = [
  ["edge", "Trait depuis une arête (parallèle)"],
  ["corner", "Trait depuis un coin (en travers)"],
  ["line", "Ligne / polyligne"],
  ["rectangle", "Rectangle"],
  ["circle", "Cercle"],
  ["offset", "Décalage du contour"],
];

/** Whether the trace is a line drawn from an edge or a corner, then pulled in its band. */
export const isStripTrace = (t: Trace): t is "edge" | "corner" => t === "edge" || t === "corner";

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
