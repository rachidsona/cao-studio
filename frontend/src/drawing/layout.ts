/**
 * Les vues d'une feuille posées sur le papier : le dessin de chacune (une coupe ou un détail le tirent de leur vue
 * mère), le passage du repère de la vue (millimètres du modèle, y vers le haut) au papier (millimètres, y vers le
 * bas) à son échelle, et les points d'accroche des cotes, gardés relatifs à la boîte de la vue et recalés sur le
 * bout d'arête le plus proche. Pur ; le dessin des vues est mis en cache par la clé du modèle.
 */
import { cross, type DrawingSheet, type DrawingView, type V3, type Vec2, type ViewAnchor, type ViewSpec } from "./model";
import { cropCircle, projectSpec, type Cut, type MeshInput, type ViewGeometry } from "./projection";

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A point of a view's 2D frame back in the model (on the plane through the origin square to the line of sight). */
const to3 = (spec: ViewSpec, p: Vec2): V3 => [0, 1, 2].map((i) => p[0] * spec.right[i]! + p[1] * spec.up[i]!) as V3;

/** The cutting plane of a section drawn on its parent view, and how the section looks (toward the removed side). */
export function sectionOf(parent: ViewSpec, a: Vec2, b: Vec2, flip = false): { cut: Cut; spec: ViewSpec } {
  const dir = norm([0, 1, 2].map((i) => to3(parent, b)[i]! - to3(parent, a)[i]!) as V3);
  let normal = norm(cross(parent.toViewer, dir));
  if (flip) normal = [-normal[0], -normal[1], -normal[2]];
  // Up: the parent's up made square to the line of sight, or the parent's depth for a cut across it.
  const along = dot(parent.up, normal);
  const up: V3 = Math.abs(along) < 0.7 ? norm([0, 1, 2].map((i) => parent.up[i]! - along * normal[i]!) as V3) : (along > 0 ? [-parent.toViewer[0], -parent.toViewer[1], -parent.toViewer[2]] : parent.toViewer);
  return { cut: { point: to3(parent, a), normal }, spec: { right: cross(up, normal), up, toViewer: normal } };
}

export class SheetLayout {
  private readonly cache = new Map<string, ViewGeometry>();

  /** `modelKey` changes whenever the model does (the drawings are then computed again). */
  constructor(
    private readonly meshes: () => readonly MeshInput[],
    private modelKey = "",
  ) {}

  setModel(key: string): void {
    if (key !== this.modelKey) this.cache.clear();
    this.modelKey = key;
  }

  /** The drawing of a view, in its own 2D frame (model mm). */
  geometry(sheet: DrawingSheet, view: DrawingView): ViewGeometry {
    const parent = view.parent ? sheet.views.find((v) => v.id === view.parent) : undefined;
    // The pieces hidden on the sheet or in this view (a detail shows what its parent shows).
    const hiddenOf = (v: DrawingView) => [...(sheet.hiddenBodies ?? []), ...(v.hiddenBodies ?? [])].sort();
    const hidden = hiddenOf(view.kind === "detail" && parent ? parent : view);
    const key = JSON.stringify([view.kind, view.spec, view.hidden, view.cut, view.detail, parent?.spec, parent?.hidden, hidden]);
    const known = this.cache.get(key);
    if (known) return known;
    let made: ViewGeometry;
    const meshes = () => this.meshes().filter((m) => !hidden.includes(m.id));
    if (view.kind === "detail" && parent && view.detail) made = cropCircle(this.geometry(sheet, parent), view.detail.center, view.detail.radius);
    else if (view.kind === "section" && parent && view.cut) made = projectSpec(meshes(), view.spec, false, sectionOf(parent.spec, view.cut.a, view.cut.b, view.cut.flip).cut);
    else made = projectSpec(meshes(), view.spec, view.hidden);
    this.cache.set(key, made);
    return made;
  }

  /** Centre of a view's drawing (its 2D frame): what sits at `view.at` on the paper. */
  center(sheet: DrawingSheet, view: DrawingView): Vec2 {
    const g = this.geometry(sheet, view);
    return [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2];
  }

  /** From a view's 2D frame to the paper. */
  toPaper(sheet: DrawingSheet, view: DrawingView, p: Vec2): Vec2 {
    const c = this.center(sheet, view);
    return [view.at[0] + (p[0] - c[0]) / view.scale, view.at[1] - (p[1] - c[1]) / view.scale];
  }

  /** From the paper to a view's 2D frame. */
  fromPaper(sheet: DrawingSheet, view: DrawingView, p: Vec2): Vec2 {
    const c = this.center(sheet, view);
    return [c[0] + (p[0] - view.at[0]) * view.scale, c[1] - (p[1] - view.at[1]) * view.scale];
  }

  /** The paper box of a view (its drawing, or its circle for a detail). */
  box(sheet: DrawingSheet, view: DrawingView): [Vec2, Vec2] {
    const g = this.geometry(sheet, view);
    const a = this.toPaper(sheet, view, [g.min[0], g.max[1]]);
    const b = this.toPaper(sheet, view, [g.max[0], g.min[1]]);
    return [a, b];
  }

  /** The view under a point of the paper (the last drawn first), within a margin, or under its name (an empty view too). */
  viewAt(sheet: DrawingSheet, p: Vec2, margin = 3): DrawingView | undefined {
    return [...sheet.views].reverse().filter((v) => !sheet.hiddenItems?.includes(v.id)).find((v) => {
      const [a, b] = this.box(sheet, v);
      if (p[0] >= a[0] - margin && p[0] <= b[0] + margin && p[1] >= a[1] - margin && p[1] <= b[1] + margin) return true;
      // The name, centred 7 mm under the box in 3.5 mm letters (with its scale, « (1:10) »).
      const half = Math.max(10, (v.label.length + 7) * 1.1);
      return Math.abs(p[0] - v.at[0]) <= half && p[1] >= b[1] + 3 && p[1] <= b[1] + 9;
    });
  }

  /** An anchor for a point of a view's frame: relative to the view's box. */
  anchor(sheet: DrawingSheet, view: DrawingView, p: Vec2): ViewAnchor {
    const g = this.geometry(sheet, view);
    const rel = (i: 0 | 1) => (g.max[i] - g.min[i] < 1e-9 ? 0.5 : Number(((p[i] - g.min[i]) / (g.max[i] - g.min[i])).toFixed(6)));
    return { view: view.id, rel: [rel(0), rel(1)] };
  }

  /** Where an anchor is now in its view's frame, on the nearest end point of an edge (null: its view is gone). */
  resolve(sheet: DrawingSheet, anchor: ViewAnchor): Vec2 | null {
    const view = sheet.views.find((v) => v.id === anchor.view);
    if (!view) return null;
    const g = this.geometry(sheet, view);
    const p: Vec2 = [g.min[0] + anchor.rel[0] * (g.max[0] - g.min[0]), g.min[1] + anchor.rel[1] * (g.max[1] - g.min[1])];
    const tolerance = Math.max(g.max[0] - g.min[0], g.max[1] - g.min[1]) * 0.02;
    let best: Vec2 = p;
    let distance = tolerance;
    for (const q of g.points) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < distance) [best, distance] = [q, d];
    }
    return best;
  }

  /** The end point of an edge (or centre of a circle) of a view nearest to a paper point, within `reach` (paper mm). */
  snap(sheet: DrawingSheet, view: DrawingView, paper: Vec2, reach = 3): Vec2 | null {
    let best: Vec2 | null = null;
    let distance = reach;
    for (const q of this.geometry(sheet, view).points) {
      const at = this.toPaper(sheet, view, q);
      const d = Math.hypot(at[0] - paper[0], at[1] - paper[1]);
      if (d < distance) [best, distance] = [q, d];
    }
    return best;
  }
}

/** Where a view placed from its parent goes: aligned with it, horizontally or vertically (or freely, for an iso). */
export function aligned(parent: DrawingView, at: Vec2, direction: "right" | "left" | "up" | "down" | "free"): Vec2 {
  if (direction === "right" || direction === "left") return [at[0], parent.at[1]];
  if (direction === "up" || direction === "down") return [parent.at[0], at[1]];
  return at;
}

/** The direction of a point from a view's centre: mostly sideways, mostly up or down, or diagonal. */
export function directionFrom(from: Vec2, to: Vec2): "right" | "left" | "up" | "down" | "free" {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  if (Math.abs(dx) > 2 * Math.abs(dy)) return dx > 0 ? "right" : "left";
  if (Math.abs(dy) > 2 * Math.abs(dx)) return dy > 0 ? "down" : "up";
  return "free";
}
