/**
 * Le passage autour d'un meuble posé au milieu (un îlot de dressing), en calcul pur : de chacun de ses quatre côtés
 * vus de dessus, la distance au plus proche de ce qui l'entoure (meubles, murs) en face de lui. Moins de 60 cm : on ne
 * passe pas bien. Pur.
 */
import type { Vec3 } from "./types";

type Box = [Vec3, Vec3];

export const PASSAGE = 600;
const SIDES = ["à gauche (−X)", "à droite (+X)", "devant (−Y)", "derrière (+Y)"] as const;

/** For each side (−X, +X, −Y, +Y), the room to the nearest box in front of it (null: nothing there). */
export function passages(box: Box, others: readonly Box[]): { side: string; gap: number | null }[] {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 1;
  return SIDES.map((side, i) => {
    const axis = i < 2 ? 0 : 1;
    const other = 1 - axis;
    const low = i % 2 === 0;
    const gaps = others
      .filter((o) => overlap(o[0][other]!, o[1][other]!, box[0][other]!, box[1][other]!) && overlap(o[0][2], o[1][2], box[0][2], box[1][2]))
      .map((o) => (low ? box[0][axis]! - o[1][axis]! : o[0][axis]! - box[1][axis]!))
      .filter((g) => g > -1);
    return { side, gap: gaps.length ? Math.max(0, Math.min(...gaps)) : null };
  });
}

/** The sides with less than 60 cm of room, as a sentence (null: room enough everywhere). */
export function passageProblem(box: Box, others: readonly Box[], length: (mm: number) => string): string | null {
  const tight = passages(box, others).filter((p) => p.gap !== null && p.gap < PASSAGE);
  return tight.length ? `Passage trop étroit autour : ${tight.map((p) => `${length(p.gap!)} ${p.side}`).join(", ")} (60 cm au moins).` : null;
}
