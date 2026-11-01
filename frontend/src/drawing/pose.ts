/**
 * Plan de pose : une feuille par mur, une élévation vue de la pièce de ce qui est posé contre lui — les meubles à
 * moins de 80 cm de sa face, le mur lui-même (ses fenêtres, ses portes) —, à une échelle qui tient sur la feuille.
 * Les murs sont les corps de la pièce nommés « Mur … » (Pièce relevée, murs dessinés par l'Implantation ou le
 * Dressing). Le reste est caché dans la vue ; les cotes viennent ensuite (Cotes auto). Pur.
 */
import { FORMATS, TITLE_SIZE, freshId, newSheet, type DrawingSheet, type DrawingView, type V3, type ViewSpec } from "./model";

export interface PoseBody {
  id: string;
  name: string;
  box: [V3, V3];
  /** A wall of the room (named « Mur … »). */
  wall: boolean;
}

/** Furniture this near a wall's face belongs to it (mm). */
const NEAR = 800;
const SCALES = [5, 10, 20, 25, 50, 100];

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 1;

/** How far a body stands from a wall's face on one side (+1: its high side along its thin axis), or null when not in front. */
function gapTo(wall: PoseBody, b: PoseBody, side: 1 | -1): number | null {
  const [lo, hi] = wall.box;
  const axis: 0 | 1 = hi[0] - lo[0] <= hi[1] - lo[1] ? 0 : 1;
  const along = (1 - axis) as 0 | 1;
  if (!overlap(b.box[0][along], b.box[1][along], lo[along], hi[along])) return null;
  const gap = side > 0 ? b.box[0][axis] - hi[axis] : lo[axis] - b.box[1][axis];
  return gap > -1 && gap < NEAR ? gap : null;
}

/** The bodies standing against a wall (the nearest wall to them), and from which side of it (+1: its high side along `axis`). */
export function againstWall(wall: PoseBody, bodies: readonly PoseBody[]): { axis: 0 | 1; side: 1 | -1; bodies: PoseBody[] } | null {
  const [lo, hi] = wall.box;
  const axis: 0 | 1 = hi[0] - lo[0] <= hi[1] - lo[1] ? 0 : 1;
  const walls = bodies.filter((b) => b.wall);
  const nearest = (b: PoseBody) => Math.min(...walls.flatMap((w) => [gapTo(w, b, 1), gapTo(w, b, -1)].filter((g): g is number => g !== null)));
  const near = (side: 1 | -1) =>
    bodies.filter((b) => {
      const gap = b.wall ? null : gapTo(wall, b, side);
      return gap !== null && gap <= nearest(b) + 1e-6;
    });
  const [high, low] = [near(1), near(-1)];
  const [side, list] = high.length >= low.length ? ([1, high] as const) : ([-1, low] as const);
  return list.length ? { axis, side, bodies: list } : null;
}

/** The elevation of a wall seen from the room: looking at it, the model's Z up. */
function elevation(axis: 0 | 1, side: 1 | -1): ViewSpec {
  const toViewer: V3 = axis === 0 ? [side, 0, 0] : [0, side, 0];
  const up: V3 = [0, 0, 1];
  // right = up × toward the viewer (`+ 0`: no −0).
  return { right: [up[1] * toViewer[2] - up[2] * toViewer[1] + 0, up[2] * toViewer[0] - up[0] * toViewer[2] + 0, up[0] * toViewer[1] - up[1] * toViewer[0] + 0], up, toViewer };
}

/** One new sheet per wall with furniture against it (after `sheets`), titled after the project. */
export function poseSheets(sheets: readonly DrawingSheet[], title: string, bodies: readonly PoseBody[]): DrawingSheet[] {
  const made: DrawingSheet[] = [];
  for (const wall of bodies.filter((b) => b.wall).sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
    const against = againstWall(wall, bodies);
    if (!against) continue;
    const spec = elevation(against.axis, against.side);
    const shown = new Set([wall.id, ...against.bodies.map((b) => b.id)]);
    // The size seen: along the wall (the furniture's extent) and up to the highest piece.
    const along = (1 - against.axis) as 0 | 1;
    const parts = [wall, ...against.bodies];
    const width = Math.max(...parts.map((b) => b.box[1][along])) - Math.min(...parts.map((b) => b.box[0][along]));
    const height = Math.max(...parts.map((b) => b.box[1][2])) - Math.min(...parts.map((b) => b.box[0][2]));
    const [w, h] = FORMATS.A3;
    const scale = SCALES.find((s) => width / s <= w - 110 && height / s <= h - TITLE_SIZE[1] - 90) ?? SCALES.at(-1)!;
    const sheet = newSheet([...sheets, ...made], `${title} — plan de pose`);
    const view: DrawingView = {
      id: freshId([], "view"), kind: "base", spec, scale, at: [w / 2, (h - TITLE_SIZE[1]) / 2], label: `${wall.name} — élévation`, hidden: false,
      hiddenBodies: bodies.filter((b) => !shown.has(b.id)).map((b) => b.id),
    };
    made.push({ ...sheet, name: `Pose — ${wall.name}`, views: [view] });
  }
  return made;
}
