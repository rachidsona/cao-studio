/**
 * Le squelette de « Panneaux » relu comme une Répartition (un caisson) : son contour, un rectangle, en est le caisson ;
 * un trait vertical qui va du bas au haut du contour, un côté entre deux cases ; dans chaque case, un trait qui la
 * traverse d'un bord à l'autre, des étagères (ou des cloisons, debout), et ainsi de suite dans les niches qu'ils font.
 * Les traits sont des cotes : du contour selon le côté choisi (vers l'intérieur, centré, vers l'extérieur), et du milieu
 * des panneaux pour les traits intérieurs. Un squelette qui ne s'y prête pas (un trait en biais, une courbe, un contour
 * ouvert, un trait qui s'arrête au milieu d'une niche) ou dessiné à plat (des murs tracés au sol, qu'Extrusion monte en
 * planches) reste en planches : la raison est rendue. Pur.
 */
import type { CaissonSpec } from "./caisson-spec";
import type { NicheRecipe } from "./niche-recipe";
import type { ShelfParams } from "./sketch";
import type { PanelsFeature, PlaneFrame, SketchFeature } from "./types";
import { frameOf, toWorld } from "../sketcher/frame";

/** Lengths closer than this are the same (mm). */
const TOL = 0.5;

/** A straight stroke: across (y) or upright (x), from `a` to `b` along it. */
type Stroke = { at: number; a: number; b: number };
type Box = { x0: number; x1: number; y0: number; y1: number };

export interface SkeletonCaisson {
  spec: CaissonSpec;
  /** Where it stands: its back at its lower left corner, x along its width, its front towards the normal. */
  frame: PlaneFrame;
  width: number;
  height: number;
}

/** Collinear strokes that touch or overlap made one. */
function merged(strokes: Stroke[]): Stroke[] {
  const out: Stroke[] = [];
  for (const s of [...strokes].sort((p, q) => p.at - q.at || p.a - q.a)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.at - s.at) < TOL && s.a <= last.b + TOL) last.b = Math.max(last.b, s.b);
    else out.push({ ...s });
  }
  return out;
}

/** The caisson the skeleton makes, or why it stays in boards. */
export function skeletonCaisson(sketch: SketchFeature, p: Pick<PanelsFeature, "thickness" | "depth" | "align" | "through">): SkeletonCaisson | string {
  const t = p.thickness;
  if (!(t > 0) || !(Math.abs(p.depth) > 0)) return "Donnez une épaisseur et une profondeur.";
  const f = frameOf(sketch);
  // A caisson stands: its height up the sketch. Strokes drawn flat on the floor are walls, left in boards.
  if (Math.abs(f.normal[2]) > 0.5) return "Le squelette est dessiné à plat : il reste en planches (une Répartition se dessine debout, de face ou de côté).";
  const point = new Map(sketch.points.map((q) => [q.id, q]));
  const drawn = sketch.curves.filter((c) => !c.construction && !c.projected);
  if (drawn.some((c) => c.kind !== "line")) return "Le squelette a des courbes : il reste en planches.";
  const across: Stroke[] = [];
  const upright: Stroke[] = [];
  for (const c of drawn) {
    if (c.kind !== "line") continue;
    const [m, n] = [point.get(c.p1), point.get(c.p2)];
    if (!m || !n) continue;
    if (Math.abs(m.y - n.y) < TOL) across.push({ at: (m.y + n.y) / 2, a: Math.min(m.x, n.x), b: Math.max(m.x, n.x) });
    else if (Math.abs(m.x - n.x) < TOL) upright.push({ at: (m.x + n.x) / 2, a: Math.min(m.y, n.y), b: Math.max(m.y, n.y) });
    else return "Un trait du squelette est en biais : il reste en planches.";
  }
  const [hs, vs] = [merged(across), merged(upright)];
  if (!hs.length || !vs.length) return "Le squelette n'a pas de contour rectangulaire : il reste en planches.";
  const minX = Math.min(...hs.map((s) => s.a), ...vs.map((s) => s.at));
  const maxX = Math.max(...hs.map((s) => s.b), ...vs.map((s) => s.at));
  const minY = Math.min(...vs.map((s) => s.a), ...hs.map((s) => s.at));
  const maxY = Math.max(...vs.map((s) => s.b), ...hs.map((s) => s.at));
  const side = (list: Stroke[], at: number, a: number, b: number) => list.find((s) => Math.abs(s.at - at) < TOL && s.a <= a + TOL && s.b >= b - TOL);
  const outline = [side(hs, minY, minX, maxX), side(hs, maxY, minX, maxX), side(vs, minX, minY, maxY), side(vs, maxX, minY, maxY)];
  if (outline.some((s) => !s)) return "Le contour du squelette n'est pas un rectangle fermé : il reste en planches.";

  // The outside of the caisson, from how the outline's strokes sit on its boards.
  const e = p.align === "inside" ? 0 : p.align === "center" ? t / 2 : t;
  const [X0, Y0] = [minX - e, minY - e];
  const [L, H] = [maxX - minX + 2 * e, maxY - minY + 2 * e];
  // The inner strokes, in the caisson's own coordinates.
  const inner = (list: Stroke[], dx: number, dy: number) => list.filter((s) => !outline.includes(s)).map((s) => ({ at: s.at - dx, a: s.a - dy, b: s.b - dy }));
  const rows = inner(hs, Y0, X0);
  const cols = inner(vs, X0, Y0);
  const [lo, hi] = [minY - Y0, maxY - Y0];
  const dividers = cols.filter((s) => s.a <= lo + TOL && s.b >= hi - TOL).map((s) => s.at).sort((a, b) => a - b);
  const rest = cols.filter((s) => !(s.a <= lo + TOL && s.b >= hi - TOL));
  const edges = [t, ...dividers.flatMap((x) => [x - t / 2, x + t / 2]), L - t];
  const cases: Box[] = [];
  for (let i = 0; i < edges.length; i += 2) cases.push({ x0: edges[i]!, x1: edges[i + 1]!, y0: t, y1: H - t });
  if (cases.some((c) => c.x1 - c.x0 <= TOL)) return "Deux côtés du squelette sont trop proches : il reste en planches.";

  let problem: string | null = null;
  /** The divisions of a niche (`at`: its path in its case), parent before children. */
  const divide = (box: Box, at: number[], steps: NicheRecipe["steps"]): void => {
    if (problem) return;
    const spans = (s: Stroke, from: number, to: number) => s.a <= from + TOL && s.b >= to - TOL;
    const shelves = rows.filter((s) => s.at > box.y0 + TOL && s.at < box.y1 - TOL && spans(s, box.x0, box.x1)).map((s) => s.at);
    const cloisons = shelves.length ? [] : rest.filter((s) => s.at > box.x0 + TOL && s.at < box.x1 - TOL && spans(s, box.y0, box.y1)).map((s) => s.at);
    const cuts = [...new Set((shelves.length ? shelves : cloisons).map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
    if (!cuts.length) {
      // A stroke left inside this niche stops half way: no division makes it.
      const crosses = (s: Stroke, [p0, p1]: [number, number], [q0, q1]: [number, number]) => s.at > p0 + TOL && s.at < p1 - TOL && Math.min(s.b, q1) - Math.max(s.a, q0) > TOL;
      if (rows.some((s) => crosses(s, [box.y0, box.y1], [box.x0, box.x1])) || rest.some((s) => crosses(s, [box.x0, box.x1], [box.y0, box.y1])))
        problem = "Un trait du squelette s'arrête au milieu d'une niche (il doit aller d'un bord à l'autre) : il reste en planches.";
      return;
    }
    const vertical = !shelves.length;
    const [start, end] = vertical ? [box.x0, box.x1] : [box.y0, box.y1];
    const bounds = [start, ...cuts.flatMap((c) => [c - t / 2, c + t / 2]), end];
    const sizes: number[] = [];
    for (let i = 0; i < bounds.length; i += 2) sizes.push(bounds[i + 1]! - bounds[i]!);
    if (sizes.some((h) => h <= TOL)) {
      problem = "Deux traits du squelette sont trop proches : il reste en planches.";
      return;
    }
    const input: ShelfParams = { count: cuts.length, thickness: t, mode: "set", fixed: 0, heights: sizes.map((h, i) => (i === sizes.length - 1 ? null : h)), ...(vertical ? { vertical: true } : {}) };
    steps.push({ at, input });
    sizes.forEach((_, i) => {
      const [a, b] = [bounds[2 * i]!, bounds[2 * i + 1]!];
      divide(vertical ? { ...box, x0: a, x1: b } : { ...box, y0: a, y1: b }, [...at, i], steps);
    });
  };
  const recipes: NicheRecipe[] = cases.map((box) => {
    const steps: NicheRecipe["steps"] = [];
    divide(box, [], steps);
    return { steps, equipment: [] };
  });
  if (problem) return problem;

  const pass = p.through === "vertical" ? "side" : "board";
  const n = cases.length;
  const spec: CaissonSpec = {
    input: {
      length: L, height: H, thickness: t, boards: true, plinth: 0, outer: pass, single: pass, double: "side",
      ...(n > 1 ? { cases: n, dividers: Array.from({ length: n - 1 }, () => "single" as const), widths: cases.map((c) => c.x1 - c.x0) } : { cases: 2, dividers: ["none" as const] }),
    },
    depth: Math.abs(p.depth),
    cases: recipes,
  };
  // Its back where the boards start: the sketch's plane, or `depth` behind it when they go the other way.
  const corner = toWorld(f, X0, Y0);
  const back = p.depth < 0 ? p.depth : 0;
  const frame: PlaneFrame = { origin: [0, 1, 2].map((i) => corner[i]! + f.normal[i]! * back) as [number, number, number], xDir: f.u, normal: f.normal };
  return { spec, frame, width: L, height: H };
}
