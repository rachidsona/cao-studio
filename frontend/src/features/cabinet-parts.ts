/**
 * Parts of a parametric cabinet as boxes (pure geometry, no kernel: also used
 * to name its bodies). See cabinet.ts for the construction rules.
 */
import type { CabinetFeature, Vec3 } from "../document/types";

/** Smallest dimension accepted (mm), as the modeller's. */
const MIN_LENGTH = 1e-3;
/** Width of the rails that replace the top of a sink unit (mm): the front one lying flat, the back one on its edge. */
const RAIL = 100;

/** How high a rail on its edge stands (mm): as wide as a rail, a third of the inner height at most. */
export function railRise(f: Pick<CabinetFeature, "height" | "plinth" | "thickness" | "railWidth">): number {
  const own = typeof f.railWidth === "number" && Number.isFinite(f.railWidth) && f.railWidth > 0 ? f.railWidth : RAIL;
  return Math.min(own, (f.height - f.plinth - f.thickness) / 3);
}

/** One part of the cabinet: its name and its box (two opposite corners, mm). */
export interface CabinetPart {
  name: string;
  from: Vec3;
  to: Vec3;
}

type Dimensions = Pick<CabinetFeature, "width" | "height" | "depth" | "thickness" | "back" | "backThickness" | "shelves" | "plinth"> & Pick<Partial<CabinetFeature>, "dividers">;
/** The least a bay between two upright boards is wide (mm). */
export const MIN_BAY = 80;
export const MAX_DIVIDERS = 6;

/** Why these dimensions cannot make a cabinet, or null. */
export function cabinetProblem(f: Dimensions): string | null {
  const values = [f.width, f.height, f.depth, f.thickness, f.backThickness, f.plinth, f.shelves];
  if (!values.every(Number.isFinite)) return "Une cote du caisson n'est pas un nombre.";
  if (!Number.isInteger(f.shelves) || f.shelves < 0) return "Le nombre d'étagères doit être un entier positif ou nul.";
  if (f.thickness < MIN_LENGTH || f.width <= 2 * f.thickness) return "La largeur doit dépasser deux épaisseurs de panneau.";
  const n = f.dividers ?? 0;
  if (!Number.isInteger(n) || n < 0 || n > MAX_DIVIDERS) return `De 0 à ${MAX_DIVIDERS} cloisons.`;
  if (n > 0 && (f.width - 2 * f.thickness - n * f.thickness) / (n + 1) < MIN_BAY) return `Le caisson est trop étroit pour ${n} cloison${n > 1 ? "s" : ""} (${MIN_BAY / 10} cm au moins entre deux).`;
  if (f.plinth < 0) return "Le socle ne peut pas être négatif.";
  if (f.height - f.plinth - 2 * f.thickness <= f.shelves * f.thickness) return "La hauteur est trop faible pour le socle, le dessus, le dessous et les étagères.";
  if (f.back !== "none" && f.backThickness < MIN_LENGTH) return "L'épaisseur du fond doit être positive.";
  if (f.depth <= (f.back === "none" ? 0 : f.backThickness) + MIN_LENGTH) return "La profondeur doit dépasser l'épaisseur du fond.";
  return null;
}

/** The parts of a cabinet, in a fixed order (their bodies are numbered in this order); none when its dimensions are impossible. */
export function cabinetParts(f: CabinetFeature): CabinetPart[] {
  if (cabinetProblem(f)) return [];
  const [ox, oy, oz] = f.origin;
  const { width: W, height: H, depth: D, thickness: t, plinth: p } = f;
  const bt = f.back === "none" ? 0 : f.backThickness;
  // A screwed-on back makes the whole carcass shallower; an inset one only the boards in front of it.
  const sideDepth = f.back === "applied" ? D - bt : D;
  const boardDepth = D - bt;
  const sidesThrough = f.construction === "sides-through";
  const parts: CabinetPart[] = [];
  const box = (name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    parts.push({ name, from: [ox + x0, oy + y0, oz + z0], to: [ox + x1, oy + y1, oz + z1] });

  const [sz0, sz1] = sidesThrough ? [0, H] : [p + t, H - t];
  box("Côté gauche", 0, t, 0, sideDepth, sz0, sz1);
  box("Côté droit", W - t, W, 0, sideDepth, sz0, sz1);
  const [hx0, hx1] = sidesThrough ? [t, W - t] : [0, W];
  box("Dessous", hx0, hx1, 0, boardDepth, p, p + t);
  // The front rail takes the place of the top, the back rail comes last: the other bodies keep their numbers.
  const rails = f.top === "rails";
  // Its own width (read from the saved document: a number above 0), else 100 mm; a third of the depth at most.
  const own = typeof f.railWidth === "number" && Number.isFinite(f.railWidth) && f.railWidth > 0 ? f.railWidth : RAIL;
  const rail = Math.min(own, boardDepth / 3);
  // Lying flat, or standing on its edge against the front (« Traverse avant » of the Caisson tool).
  if (rails && f.railFront === "edge") box("Traverse avant", hx0, hx1, 0, t, H - railRise(f), H);
  else if (rails) box("Traverse avant", hx0, hx1, 0, rail, H - t, H);
  else box("Dessus", hx0, hx1, 0, boardDepth, H - t, H);
  if (f.back === "applied") box("Fond", 0, W, D - bt, D, p, H);
  else if (f.back === "inset") box("Fond", t, W - t, D - bt, D, p + t, H - t);
  // Shelves evenly spaced in the inner height; behind inset fronts, set back by their thickness.
  const z0 = p + t;
  const front = Math.min(Math.max(0, f.shelfSetback ?? 0), boardDepth / 2);
  const gap = (H - t - z0 - f.shelves * t) / (f.shelves + 1);
  // Upright boards between the bottom and the top, evenly spaced: the shelves are then cut bay by bay.
  const n = f.dividers ?? 0;
  const bay = (W - 2 * t - n * t) / (n + 1);
  for (let i = 0; i < f.shelves; i++) {
    const z = z0 + gap * (i + 1) + t * i;
    for (let j = 0; j <= n; j++) box(`Étagère ${i * (n + 1) + j + 1}`, t + j * (bay + t), t + j * (bay + t) + bay, front, boardDepth, z, z + t);
  }
  // The back rail stands on its edge, as high as a rail is wide, against the back (the wall when there is no back).
  if (rails) box("Traverse arrière", hx0, hx1, boardDepth - t, boardDepth, H - railRise(f), H);
  // The upright boards last: the other bodies keep their numbers.
  for (let j = 1; j <= n; j++) box(`Cloison ${j}`, t + j * bay + (j - 1) * t, t + j * (bay + t), front, boardDepth, z0, H - t);
  return parts;
}

/** Names of the bodies of a cabinet, in body order. */
export function cabinetPartNames(f: CabinetFeature): string[] {
  return cabinetParts(f).map((p) => p.name);
}
