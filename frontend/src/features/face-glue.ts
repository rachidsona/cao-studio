/**
 * « Coller par face », en nombres : une face plane de ce qui bouge, une face plane d'un autre élément, parallèles. Des
 * faces opposées (une face de côté contre la face de côté du voisin) se mettent en contact ; des faces de même sens
 * (deux façades) affleurent. Le déplacement est le seul nécessaire : le long de la normale de la face d'arrivée, rien
 * dans le plan des faces — l'élément garde sa hauteur et son alignement. Un jeu les écarte (en contact) ou met en
 * retrait (affleurant). Pur.
 */
import type { Vec3 } from "../document/types";

export interface GlueFace {
  /** A point of the face's plane, and its outward normal. */
  point: Vec3;
  normal: Vec3;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
/** A normal within ~1° of an axis becomes that axis exactly: no drift sideways. */
const snap = (v: Vec3): Vec3 => {
  const i = [0, 1, 2].reduce((m, k) => (Math.abs(v[k]!) > Math.abs(v[m]!) ? k : m), 0);
  return Math.abs(v[i]!) > 0.9998 ? ([0, 1, 2].map((k) => (k === i ? Math.sign(v[i]!) : 0)) as Vec3) : v;
};

/** How far what moves goes so its face meets the other, and how they meet; a string: why it cannot. */
export function glueShift(moving: GlueFace, fixed: GlueFace, gap = 0): { shift: Vec3; meet: "contact" | "flush" } | string {
  const [m, f] = [snap(unit(moving.normal)), snap(unit(fixed.normal))];
  const cos = dot(m, f);
  if (Math.abs(cos) < 0.9998) return "Ces deux faces ne sont pas parallèles : choisissez une face tournée dans le même axe (ou utilisez Aligner, « Face sur face », qui tourne la pièce).";
  const meet = cos < 0 ? "contact" : "flush";
  // From the moving face's plane to the other's, along the other's normal; the gap outward in contact, inward flush.
  const d = dot(f, [fixed.point[0] - moving.point[0], fixed.point[1] - moving.point[1], fixed.point[2] - moving.point[2]]) + (meet === "contact" ? gap : -gap);
  const shift = f.map((c) => Number((c * d).toFixed(6)) || 0) as Vec3;
  return { shift, meet };
}
