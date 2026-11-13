/**
 * Relevé de chantier, en calcul pur : un mur n'est jamais tout à fait d'aplomb ni d'équerre, un plafond jamais tout à
 * fait de niveau. On relève de combien le mur avance vers le meuble, par rapport au mur dessiné, en trois points — en
 * bas, à mi-hauteur et en haut du meuble (le faux aplomb, un ventre) — et de combien il se resserre au fond du meuble
 * (le hors d'équerre) ; pour le plafond, de combien il descend à gauche, au milieu et à droite. Une valeur négative :
 * le mur s'écarte, le plafond remonte. De là, le jour réel entre le meuble et le mur à chaque hauteur : le fileur se
 * recoupe à ces largeurs (son contour suit le mur), et un jour négatif dit que le meuble ne rentre pas, et de combien.
 */

/** How far a wall comes towards the furniture (mm), from where it is drawn: at the bottom, mid-height and top of the
 * furniture, at its front; and how much closer it is at the back of the furniture than at its front. */
export interface WallSurvey {
  low: number;
  mid: number;
  high: number;
  back: number;
}

/** How far the ceiling comes down (mm), from where it is drawn: on the left, in the middle and on the right. */
export interface CeilingSurvey {
  left: number;
  mid: number;
  right: number;
}

export interface Survey {
  left?: WallSurvey;
  right?: WallSurvey;
  ceiling?: CeilingSurvey;
}

export const NO_WALL: WallSurvey = { low: 0, mid: 0, high: 0, back: 0 };
export const NO_CEILING: CeilingSurvey = { left: 0, mid: 0, right: 0 };

/** Within this, the furniture touches (mm). */
const TIGHT = 0.5;

export interface Scribe {
  /** The real gap at each of the three points (mm); negative: the wall is in the way there. */
  gaps: [number, number, number];
  /** How much is missing for the furniture to fit (mm, 0: it fits), and at which of the three points. */
  short: number;
  at: 0 | 1 | 2;
  /** The same at the back of the furniture, out of square (0: it fits). */
  shortBack: number;
  /** The gaps differ: the board is cut to follow the wall. */
  tapered: boolean;
}

/** The real gaps from the gap to the wall as drawn and what the wall does at the three points (and at the back). */
export function scribe(gap: number, lean: readonly [number, number, number], back = 0): Scribe {
  const gaps = lean.map((l) => gap - l) as [number, number, number];
  const least = Math.min(...gaps);
  const at = gaps.indexOf(least) as 0 | 1 | 2;
  const short = least < -TIGHT ? -least : 0;
  const shortBack = least - back < -TIGHT ? back - least : 0;
  return { gaps, short, at, shortBack, tapered: Math.max(...gaps) - least > 0.05 };
}

/**
 * The outline of a board that fills these gaps, in the plane of the front: from `edge` (the furniture's) out by each
 * gap (`sign`: the side the wall is on), at `levels` — three coordinates along the edge, growing. A gap of nothing
 * brings the outline back on the edge. Points as [across, along].
 */
export function scribedOutline(edge: number, sign: 1 | -1, levels: readonly [number, number, number], gaps: readonly [number, number, number]): [number, number][] {
  const out = (i: number): [number, number] => [edge + sign * Math.max(0, gaps[i]!), levels[i]!];
  const collinear = Math.abs(gaps[1] - (gaps[0] + ((gaps[2] - gaps[0]) * (levels[1] - levels[0])) / (levels[2] - levels[0]))) < 0.05;
  const points: [number, number][] = [[edge, levels[0]], out(0), ...(collinear ? [] : [out(1)]), out(2), [edge, levels[2]]];
  // No two points at the same place (a gap of nothing).
  return points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1]) > 0.05);
}

/** "38 mm en bas, 31 à mi-hauteur, 25 en haut". */
export function widthsText(gaps: readonly [number, number, number], where: readonly [string, string, string]): string {
  const mm = (v: number) => String(Math.round(Math.max(0, v) * 10) / 10).replace(".", ",");
  return `${mm(gaps[0])} mm ${where[0]}, ${mm(gaps[1])} ${where[1]}, ${mm(gaps[2])} ${where[2]}`;
}

export const HEIGHTS = ["en bas", "à mi-hauteur", "en haut"] as const;
export const ACROSS = ["à gauche", "au milieu", "à droite"] as const;
