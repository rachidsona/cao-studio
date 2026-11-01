/**
 * Mise en plan, comme l'espace « Dessin » de Fusion : des feuilles (A4 à A0, cartouche), gardées avec le projet, où
 * l'on pose des vues du modèle (vue de base, vues projetées, isométrique, coupe, détail), des cotes qui suivent le
 * modèle, des textes, des repères, la nomenclature, et un dessin 2D libre à l'échelle de la feuille. Ce module ne
 * fait que décrire et modifier les feuilles (pur) ; projection, rendu SVG et export DXF sont à côté.
 */
export type Vec2 = [number, number];
export type V3 = [number, number, number];

/** How a view looks at the model: screen right and up, and the direction toward the viewer (model axes). */
export interface ViewSpec {
  right: V3;
  up: V3;
  toViewer: V3;
}

export type Orientation = "front" | "back" | "left" | "right" | "top" | "bottom" | "iso" | "iso-left";

export const ORIENTATIONS: Record<Orientation, { label: string; spec: ViewSpec }> = (() => {
  const n = (v: V3): V3 => {
    const l = Math.hypot(...v) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const iso = (toViewer: V3): ViewSpec => {
    const t = n(toViewer);
    // Up: the model's Z made square to the line of sight; right: up × toward the viewer.
    const up = n([-t[2] * t[0], -t[2] * t[1], 1 - t[2] * t[2]]);
    return { right: cross(up, t), up, toViewer: t };
  };
  return {
    front: { label: "Face", spec: { right: [1, 0, 0], up: [0, 0, 1], toViewer: [0, -1, 0] } },
    back: { label: "Arrière", spec: { right: [-1, 0, 0], up: [0, 0, 1], toViewer: [0, 1, 0] } },
    left: { label: "Gauche", spec: { right: [0, -1, 0], up: [0, 0, 1], toViewer: [-1, 0, 0] } },
    right: { label: "Droite", spec: { right: [0, 1, 0], up: [0, 0, 1], toViewer: [1, 0, 0] } },
    top: { label: "Dessus", spec: { right: [1, 0, 0], up: [0, 1, 0], toViewer: [0, 0, 1] } },
    bottom: { label: "Dessous", spec: { right: [1, 0, 0], up: [0, -1, 0], toViewer: [0, 0, -1] } },
    iso: { label: "Isométrique", spec: iso([1, -1, 1]) },
    "iso-left": { label: "Isométrique gauche", spec: iso([-1, -1, 1]) },
  };
})();

export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Paper sizes (mm), landscape. */
export const FORMATS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] } as const;
export type Format = keyof typeof FORMATS;

/** Standard scales: 1:n (and 2:1, 5:1 for details, as n = 0.5, 0.2). */
export const SCALES = [0.2, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];
export const scaleText = (n: number) => (n < 1 ? `${Math.round(1 / n)}:1` : `1:${n}`);

export interface TitleBlock {
  title: string;
  /** Drawing number, author, company, date, material, comment. */
  number: string;
  author: string;
  company: string;
  date: string;
  material: string;
}

/** A view on the sheet; its geometry is computed from the model each time (it follows every change). */
export interface DrawingView {
  id: string;
  kind: "base" | "projected" | "section" | "detail";
  /** What it looks at: an orientation, or for a projected or section view its own direction. */
  spec: ViewSpec;
  orientation?: Orientation;
  /** Scale denominator (1:n). */
  scale: number;
  /** Centre of the view on the sheet (paper mm, y down). */
  at: Vec2;
  label: string;
  hidden: boolean;
  /** Pieces left out of this view (body ids), from the navigator. */
  hiddenBodies?: string[];
  /** The view it comes from (projected, section, detail): projected views stay aligned with it. */
  parent?: string;
  /** Section: the cutting line on the parent view (model mm in the parent's 2D frame) and its letter. */
  cut?: { a: Vec2; b: Vec2; letter: string; flip?: boolean };
  /** Detail: the circle on the parent view (model mm in the parent's 2D frame) and its letter. */
  detail?: { center: Vec2; radius: number; letter: string };
}

/**
 * A point of a view: relative to the box of the view's drawing (0…1 on each axis), so that it stays on the same
 * corner when the model changes size; `snap` keeps it on the nearest drawn end point.
 */
export interface ViewAnchor {
  view: string;
  rel: Vec2;
}

export type Annotation =
  | { id: string; kind: "dimension"; mode: "horizontal" | "vertical" | "aligned"; a: ViewAnchor; b: ViewAnchor; offset: number; text?: string; auto?: boolean; textShift?: number; style?: DimStyle }
  | { id: string; kind: "diameter" | "radius"; view: string; center: Vec2; radius: number; angle: number; text?: string; auto?: boolean; style?: DimStyle }
  | { id: string; kind: "angle"; view: string; vertex: Vec2; a: Vec2; b: Vec2; radius: number; text?: string; style?: DimStyle }
  | { id: string; kind: "text"; at: Vec2; text: string; size: number }
  | { id: string; kind: "note"; at: Vec2; target: ViewAnchor; text: string }
  | { id: string; kind: "balloon"; at: Vec2; target: ViewAnchor; body: string }
  | { id: string; kind: "bom"; at: Vec2 };

/** The lines of a dimension: thin or thick, solid or dashed (as Fusion's dimension styles); unset: the sheet's. */
export interface DimStyle {
  weight?: "thin" | "thick";
  dashed?: boolean;
}

/** The kinds of annotation that are dimensions (measured, styled, removed together). */
export const DIMENSION_KINDS: ReadonlySet<string> = new Set(["dimension", "diameter", "radius", "angle"]);

/** The style a dimension is drawn with: its own, else the sheet's, else thin and solid. */
export function dimStyleOf(sheet: DrawingSheet, a: Annotation): Required<DimStyle> {
  const own = "style" in a ? a.style : undefined;
  return { weight: own?.weight ?? sheet.dimStyle?.weight ?? "thin", dashed: own?.dashed ?? sheet.dimStyle?.dashed ?? false };
}

/** The sheet without the dimensions of these views (all of them when none). */
export function withoutDimensions(sheet: DrawingSheet, viewIds: string[] = []): DrawingSheet {
  const onView = (a: Annotation) => {
    if (!viewIds.length) return true;
    if (a.kind === "dimension") return viewIds.includes(a.a.view) || viewIds.includes(a.b.view);
    return "view" in a && viewIds.includes(a.view);
  };
  return { ...sheet, annotations: sheet.annotations.filter((a) => !(DIMENSION_KINDS.has(a.kind) && onView(a))) };
}

/** Free drawing on the sheet, in real millimetres at the sheet's drawing scale (a 2D plan with no model). */
export type Sketch2D =
  | { id: string; kind: "line"; a: Vec2; b: Vec2; style: LineStyle }
  | { id: string; kind: "rect"; a: Vec2; b: Vec2; style: LineStyle }
  | { id: string; kind: "circle"; center: Vec2; radius: number; style: LineStyle };
export type LineStyle = "solid" | "hidden" | "axis" | "thin";

export interface DrawingSheet {
  id: string;
  name: string;
  format: Format;
  /** European (first angle, French plans) or American (third angle) projection of the projected views. */
  projection: "first" | "third";
  title: TitleBlock;
  views: DrawingView[];
  annotations: Annotation[];
  /** Pieces left out of every view of the sheet, and views, annotations or 2D elements not shown (ids). */
  hiddenBodies?: string[];
  hiddenItems?: string[];
  /** How the dimensions of the sheet are drawn, unless one has its own style. */
  dimStyle?: DimStyle;
  /** Free 2D drawing: its scale (1:n) and origin on the sheet (paper mm), and its elements (real mm, y up). */
  sketch: { scale: number; origin: Vec2; items: Sketch2D[] };
}

export const FRAME_MARGIN = 10;
export const TITLE_SIZE: Vec2 = [180, 32];
/** The frame and the title block: on the sheet as the other items, they can be taken off (hiddenItems) and put back. */
export const FRAME_ID = "frame";
export const TITLE_ID = "title-block";
export const FIXED_ITEMS = [FRAME_ID, TITLE_ID];

/** The title block's corners on the paper (bottom right, inside the frame). */
export function titleBox(sheet: DrawingSheet): [Vec2, Vec2] {
  const [w, h] = FORMATS[sheet.format];
  const [bw, bh] = TITLE_SIZE;
  return [[w - FRAME_MARGIN - bw, h - FRAME_MARGIN - bh], [w - FRAME_MARGIN, h - FRAME_MARGIN]];
}

export function newSheet(sheets: readonly DrawingSheet[], title: string, format: Format = "A3"): DrawingSheet {
  const h = FORMATS[format][1];
  return {
    id: freshId(sheets.map((s) => s.id), "sheet"),
    name: `Feuille ${sheets.length + 1}`,
    format,
    projection: "first",
    title: { title, number: `${sheets.length + 1}`, author: "", company: "", date: new Date().toLocaleDateString("fr-FR"), material: "" },
    views: [],
    annotations: [],
    sketch: { scale: 10, origin: [FRAME_MARGIN + 20, h - FRAME_MARGIN - 20], items: [] },
  };
}

export function freshId(ids: readonly string[], prefix: string): string {
  let i = 1;
  while (ids.includes(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** Every id used on a sheet (views, annotations, sketch items). */
export const sheetIds = (s: DrawingSheet) => [...s.views.map((v) => v.id), ...s.annotations.map((a) => a.id), ...s.sketch.items.map((i) => i.id)];

/**
 * The view seen from one side of `parent` (a projected view): from its right, left, top or bottom. Its up and right
 * follow the parent's, as on a drawing (the top view shows the front of the model at its bottom).
 */
export function sideSpec(parent: ViewSpec, side: "right" | "left" | "top" | "bottom"): ViewSpec {
  const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
  const make = (toViewer: V3, up: V3): ViewSpec => ({ right: cross(up, toViewer), up, toViewer });
  if (side === "right") return make(parent.right, parent.up);
  if (side === "left") return make(neg(parent.right), parent.up);
  if (side === "top") return make(parent.up, neg(parent.toViewer));
  return make(neg(parent.up), parent.toViewer);
}

/**
 * Which side a view placed in this direction from its parent shows: in European projection (first angle) the view
 * from the left goes on the right and the view from above below; in American projection (third angle), where it is
 * seen from.
 */
export function placedSide(direction: "right" | "left" | "up" | "down", projection: DrawingSheet["projection"]): "right" | "left" | "top" | "bottom" {
  const third = { right: "right", left: "left", up: "top", down: "bottom" } as const;
  const first = { right: "left", left: "right", up: "bottom", down: "top" } as const;
  return (projection === "first" ? first : third)[direction];
}

/** The name of a spec when it is one of the standard ones. */
export function orientationOf(spec: ViewSpec): Orientation | undefined {
  const same = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;
  return (Object.keys(ORIENTATIONS) as Orientation[]).find((o) => same(ORIENTATIONS[o].spec.toViewer, spec.toViewer) && same(ORIENTATIONS[o].spec.up, spec.up));
}

/** Shows or hides an id in a list of hidden ids. */
export function toggled(list: readonly string[] | undefined, id: string, hide: boolean): string[] | undefined {
  const next = (list ?? []).filter((x) => x !== id);
  if (hide) next.push(id);
  return next.length ? next : undefined;
}

/** Whether a view, an annotation or a 2D element is shown on its sheet. */
export const shown = (sheet: DrawingSheet, id: string) => !sheet.hiddenItems?.includes(id);

/** Replaces one sheet of the list. */
export function updateSheet(sheets: readonly DrawingSheet[], id: string, change: (s: DrawingSheet) => DrawingSheet): DrawingSheet[] {
  return sheets.map((s) => (s.id === id ? change(s) : s));
}

/** Removes a view, with what hangs on it (views made from it, annotations on it). */
export function removeView(sheet: DrawingSheet, id: string): DrawingSheet {
  const gone = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const v of sheet.views) if (v.parent && gone.has(v.parent) && !gone.has(v.id)) (gone.add(v.id), (grew = true));
  }
  const onGone = (a: Annotation) =>
    ("view" in a && gone.has(a.view)) || ("a" in a && typeof a.a === "object" && "view" in a.a && gone.has(a.a.view)) || ("b" in a && typeof a.b === "object" && "view" in a.b && gone.has(a.b.view)) || ("target" in a && gone.has(a.target.view));
  return { ...sheet, views: sheet.views.filter((v) => !gone.has(v.id)), annotations: sheet.annotations.filter((a) => !onGone(a)) };
}

/** The next free letter for a section or a detail on the sheet. */
export function nextLetter(sheet: DrawingSheet): string {
  const used = new Set(sheet.views.flatMap((v) => [v.cut?.letter, v.detail?.letter]).filter(Boolean));
  for (const c of "ABCDEFGHJKLMNPRSTUVWXYZ") if (!used.has(c)) return c;
  return "Z";
}
