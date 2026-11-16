/**
 * « Magie extrusion » : un seul outil pour tout tracer sur un corps et l'extruder. Son panneau commence par le choix
 * « Tracé » : un trait depuis une arête (parallèle) ou depuis un coin (en travers), puis tiré ou poussé dans sa bande
 * (app/face-strip-tool.ts) ; ou une ligne, un rectangle, un cercle, le décalage du contour, dessinés sur une face avec
 * les distances aux bords, puis tirés ou poussés (app/draw-on-face-tool.ts). Changer de tracé passe d'une manière à
 * l'autre sans fermer l'outil ; le dernier tracé choisi est repris à la prochaine ouverture.
 */
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
