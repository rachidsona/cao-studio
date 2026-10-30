/**
 * Modificateurs de planche (comme ceux de 3ds Max), exacts et dans l'historique : la planche — une boîte — est
 * reconstruite depuis sa section (largeur × épaisseur, à un bout) :
 * - cintrer : la section tourne autour d'un axe parallèle à la largeur, à `amount` mm du milieu de l'épaisseur,
 *   sur l'angle qui garde la longueur (longueur / rayon) ;
 * - effiler : lissage droit vers la même section réduite à `amount` % à l'autre bout ;
 * - vriller : lissage par des sections tournées peu à peu jusqu'à `amount` degrés à l'autre bout.
 */
import { drawRectangle, Plane, type Shape3D, type Sketch } from "replicad";
import type { ModifierFeature } from "../document/types";
import { bodyMetrics, GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { requireSolid, type OutputLookup } from "./common";
import type { SolidOutput } from "./outputs";

type V = [number, number, number];
const axis = (i: number, s = 1): V => [0, 1, 2].map((k) => (k === i ? s : 0)) as V;

export function buildModifier(feature: ModifierFeature, lookup: OutputLookup): SolidOutput {
  const shape = requireSolid(lookup, feature.target).shape;
  const { bbox, volume } = bodyMetrics(shape);
  const size = [0, 1, 2].map((i) => bbox[1][i]! - bbox[0][i]!);
  if (Math.abs(volume - size[0]! * size[1]! * size[2]!) > 1e-3 * volume) throw new GeometryError(`${feature.name} : un modificateur s'applique à une planche droite (une boîte), pas à une pièce déjà usinée.`);
  const order = [0, 1, 2].sort((a, b) => size[b]! - size[a]!);
  const [L, W, T] = order as [number, number, number];
  const [length, width, thick] = [size[L]!, size[W]!, size[T]!];
  const center = [0, 1, 2].map((i) => (bbox[0][i]! + bbox[1][i]!) / 2) as V;
  // Section plane at the start of the length: x along the width, normal along the length.
  const at = (t: number): V => center.map((c, i) => (i === L ? bbox[0][i]! + t * length : c)) as V;
  const section = (t: number, scale = 1, turn = 0): Sketch => {
    const a = (turn * Math.PI) / 180;
    const xDir = [0, 1, 2].map((i) => axis(W)[i]! * Math.cos(a) + axis(T)[i]! * Math.sin(a)) as V;
    return drawRectangle(width * scale, thick * scale).sketchOnPlane(new Plane(at(t), xDir, axis(L))) as Sketch;
  };
  let result: Shape3D;
  try {
    if (feature.kind === "bend") {
      const radius = feature.amount;
      if (!(Math.abs(radius) > thick / 2)) throw new GeometryError(`${feature.name} : le rayon de cintrage doit dépasser la demi-épaisseur (${thick / 2} mm).`);
      const angle = ((length / Math.abs(radius)) * 180) / Math.PI;
      if (angle > 360) throw new GeometryError(`${feature.name} : rayon trop petit pour cette longueur (plus d'un tour).`);
      // The axis runs along the width, `radius` away across the thickness (negative: bent the other way).
      const origin = at(0).map((c, i) => (i === T ? c + radius : c)) as V;
      result = section(0).revolve(axis(W, radius > 0 ? -1 : 1), { origin, angle }) as Shape3D;
    } else if (feature.kind === "taper") {
      const scale = feature.amount / 100;
      if (!(scale > 0.01)) throw new GeometryError(`${feature.name} : la réduction doit garder plus de 1 % de la section.`);
      result = section(0).loftWith([section(1, scale)], { ruled: true });
    } else {
      const steps = Math.max(2, Math.ceil(Math.abs(feature.amount) / 15));
      const rest = Array.from({ length: steps }, (_, k) => section((k + 1) / steps, 1, (feature.amount * (k + 1)) / steps));
      result = section(0).loftWith(rest, { ruled: false });
    }
  } catch (error) {
    if (error instanceof GeometryError) throw error;
    throw new GeometryError(`${feature.name} : la planche ne se modifie pas ainsi (${error instanceof Error ? error.message : String(error)}).`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(result, feature.name) };
}
