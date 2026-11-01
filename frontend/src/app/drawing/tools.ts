/**
 * Les outils de l'espace « Mise en plan », chacun une petite suite de clics sur la feuille (millimètres du papier) :
 * vue de base, vue projetée (tirée de sa vue mère : de côté, dessus, dessous ou en biais pour une isométrique), coupe
 * (un trait sur la vue mère, puis la place de la coupe), détail (un cercle, puis la place), cote (deux points accrochés
 * aux bouts d'arêtes, puis la place : horizontale, verticale ou alignée selon où on la tire), diamètre ou rayon, angle
 * (deux traits), texte, note, repère, nomenclature. Le dessin 2D libre est dans sketch-tool.ts.
 */
import { lineDimension } from "../../drawing/auto-dims";
import { SheetLayout, aligned, directionFrom, sectionOf } from "../../drawing/layout";
import {
  ORIENTATIONS, SCALES, freshId, nextLetter, orientationOf, placedSide, sheetIds, sideSpec,
  type Annotation, type DrawingSheet, type DrawingView, type LineStyle, type Orientation, type Vec2,
} from "../../drawing/model";
import type { DrawnLine } from "../../drawing/projection";

export interface ToolHost {
  sheet(): DrawingSheet;
  layout: SheetLayout;
  /** Changes the sheet (one undo step). */
  update(change: (s: DrawingSheet) => DrawingSheet): void;
  select(ids: string[]): void;
  /** Asks for a text (null: cancelled). */
  ask(title: string, value: string): Promise<string | null>;
  notify(message: string): void;
  /** Options of the tools set in the panel. */
  options: { orientation: Orientation; scale: number | null; style: LineStyle };
  /** The tool is done: back to the selection. */
  done(): void;
  /** The preview changed. */
  redraw(): void;
  /** Shows this rectangle of the sheet (paper mm) as large as the screen allows. */
  zoomTo(a: Vec2, b: Vec2): void;
}

export interface DrawingTool {
  readonly name: string;
  hint(): string;
  click(p: Vec2, event: MouseEvent): void;
  move(p: Vec2, event: MouseEvent): void;
  /** Keys while the tool is on (digits of a length, Entrée); true when used. */
  key?(event: KeyboardEvent): boolean;
  /** SVG drawn over the sheet (paper mm). */
  preview(): string;
  /** A drag with the tool on (from where the button went down); `dragEnd` when it is let go. */
  drag?(from: Vec2, to: Vec2): void;
  dragEnd?(from: Vec2, to: Vec2): void;
}

const f = (n: number) => n.toFixed(2);
export const GHOST = 'stroke="#ea580c" stroke-width="0.35" fill="none" stroke-dasharray="1.5 1"';
export const ghostLine = (a: Vec2, b: Vec2) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" ${GHOST}/>`;
export const ghostRect = (a: Vec2, b: Vec2) => `<rect x="${f(Math.min(a[0], b[0]))}" y="${f(Math.min(a[1], b[1]))}" width="${f(Math.abs(b[0] - a[0]))}" height="${f(Math.abs(b[1] - a[1]))}" ${GHOST}/>`;
export const dot = (p: Vec2) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="1" fill="#ea580c"/>`;

/** The largest standard scale at which a view fits in `room` (paper mm) — at most full size. */
export function fitScale(size: Vec2, room: Vec2): number {
  return SCALES.filter((n) => n >= 1).find((n) => size[0] / n <= room[0] && size[1] / n <= room[1]) ?? SCALES.at(-1)!;
}

/** A new view (its id fresh on the sheet). */
function addView(host: ToolHost, view: Omit<DrawingView, "id">): string {
  const id = freshId(sheetIds(host.sheet()), "view");
  host.update((s) => ({ ...s, views: [...s.views, { ...view, id }] }));
  return id;
}

/** An annotation not yet given its id (each kind of the union keeps its own fields). */
type NewAnnotation = Annotation extends infer A ? (A extends Annotation ? Omit<A, "id"> : never) : never;

function addAnnotation(host: ToolHost, a: NewAnnotation): void {
  const id = freshId(sheetIds(host.sheet()), "note");
  host.update((s) => ({ ...s, annotations: [...s.annotations, { ...a, id } as Annotation] }));
  host.select([id]);
}

/** The view under the point, as asked for by a tool that works on one. */
function viewUnder(host: ToolHost, p: Vec2): DrawingView | undefined {
  return host.layout.viewAt(host.sheet(), p);
}

/** « Vue de base »: the model seen from the chosen side, at the chosen (or fitting) scale, where clicked. */
export class BaseViewTool implements DrawingTool {
  readonly name = "base";
  private at: Vec2 | null = null;
  constructor(private readonly host: ToolHost) {}
  hint() {
    return "Cliquez où poser la vue (orientation et échelle dans le panneau).";
  }
  move(p: Vec2) {
    this.at = p;
    this.host.redraw();
  }
  click(p: Vec2) {
    const { orientation, scale } = this.host.options;
    const spec = ORIENTATIONS[orientation].spec;
    const sheet = this.host.sheet();
    const probe: DrawingView = { id: "probe", kind: "base", spec, orientation, scale: 1, at: p, label: "", hidden: true };
    const g = this.host.layout.geometry(sheet, probe);
    const n = scale ?? fitScale([g.max[0] - g.min[0], g.max[1] - g.min[1]], [120, 100]);
    const id = addView(this.host, { kind: "base", spec, orientation, scale: n, at: p, label: `Vue ${ORIENTATIONS[orientation].label.toLowerCase()}`, hidden: orientation !== "iso" && orientation !== "iso-left" });
    this.host.select([id]);
    this.host.done();
  }
  preview() {
    return this.at ? `${ghostRect([this.at[0] - 20, this.at[1] - 15], [this.at[0] + 20, this.at[1] + 15])}` : "";
  }
}

/** « Vue projetée »: from a view, the views pulled out of it (sideways, up, down; diagonally an isometric one). */
export class ProjectedViewTool implements DrawingTool {
  readonly name = "projected";
  private parent: string | null;
  private at: Vec2 | null = null;
  constructor(private readonly host: ToolHost, selected: string | null) {
    this.parent = selected && host.sheet().views.some((v) => v.id === selected) ? selected : null;
  }
  hint() {
    return this.parent ? "Tirez la vue projetée à côté, dessus, dessous ou en biais (isométrique), puis cliquez. Échap : fini." : "Cliquez la vue mère.";
  }
  move(p: Vec2) {
    this.at = p;
    this.host.redraw();
  }
  click(p: Vec2) {
    const sheet = this.host.sheet();
    if (!this.parent) {
      const v = viewUnder(this.host, p);
      if (!v) return this.host.notify("Cliquez sur une vue.");
      this.parent = v.id;
      return this.host.redraw();
    }
    const parent = sheet.views.find((v) => v.id === this.parent);
    if (!parent) return this.host.done();
    const direction = directionFrom(parent.at, p);
    const spec = direction === "free" ? ORIENTATIONS[p[0] > parent.at[0] ? "iso" : "iso-left"].spec : sideSpec(parent.spec, placedSide(direction, sheet.projection));
    const orientation = orientationOf(spec);
    addView(this.host, {
      kind: "projected", spec, orientation, scale: parent.scale, at: aligned(parent, p, direction), parent: parent.id,
      label: orientation ? `Vue ${ORIENTATIONS[orientation].label.toLowerCase()}` : "Vue projetée", hidden: direction !== "free",
    });
  }
  preview() {
    const parent = this.host.sheet().views.find((v) => v.id === this.parent);
    if (!parent || !this.at) return "";
    const at = aligned(parent, this.at, directionFrom(parent.at, this.at));
    return ghostLine(parent.at, at) + ghostRect([at[0] - 18, at[1] - 14], [at[0] + 18, at[1] + 14]);
  }
}

/** « Coupe »: a line across a view (two clicks), then where the section goes. */
export class SectionTool implements DrawingTool {
  readonly name = "section";
  private view: DrawingView | null = null;
  private points: Vec2[] = [];
  private at: Vec2 | null = null;
  constructor(private readonly host: ToolHost) {}
  hint() {
    return this.points.length < 2 ? "Tracez le trait de coupe sur une vue : deux clics (Maj : d'équerre)." : "Cliquez où poser la coupe.";
  }
  private square(p: Vec2, event: MouseEvent): Vec2 {
    const a = this.points[0];
    if (!a || !event.shiftKey) return p;
    return Math.abs(p[0] - a[0]) > Math.abs(p[1] - a[1]) ? [p[0], a[1]] : [a[0], p[1]];
  }
  move(p: Vec2, event: MouseEvent) {
    this.at = this.points.length === 1 ? this.square(p, event) : p;
    this.host.redraw();
  }
  click(p: Vec2, event: MouseEvent) {
    const sheet = this.host.sheet();
    if (this.points.length < 2) {
      if (!this.view) this.view = viewUnder(this.host, p) ?? null;
      if (!this.view) return this.host.notify("Le trait de coupe se trace sur une vue.");
      this.points.push(this.square(p, event));
      return this.host.redraw();
    }
    const parent = this.view!;
    const [a, b] = this.points.map((q) => this.host.layout.fromPaper(sheet, parent, q)) as [Vec2, Vec2];
    const letter = nextLetter(sheet);
    const { spec } = sectionOf(parent.spec, a, b);
    // The section sits square to its line, the way it looks.
    const along: Vec2 = [this.points[1]![0] - this.points[0]![0], this.points[1]![1] - this.points[0]![1]];
    const direction = Math.abs(along[0]) > Math.abs(along[1]) ? (p[1] > parent.at[1] ? "down" : "up") : p[0] > parent.at[0] ? "right" : "left";
    const id = addView(this.host, { kind: "section", spec, orientation: orientationOf(spec), scale: parent.scale, at: aligned(parent, p, direction), parent: parent.id, label: `Coupe ${letter}-${letter}`, hidden: false, cut: { a, b, letter } });
    this.host.select([id]);
    this.host.done();
  }
  preview() {
    const [a, b] = this.points;
    if (a && !b && this.at) return ghostLine(a, this.at);
    if (a && b) return ghostLine(a, b) + (this.at ? ghostRect([this.at[0] - 18, this.at[1] - 14], [this.at[0] + 18, this.at[1] + 14]) : "");
    return "";
  }
}

/** « Détail »: a circle on a view (its centre, then its edge), then where the enlarged detail goes. */
export class DetailTool implements DrawingTool {
  readonly name = "detail";
  private view: DrawingView | null = null;
  private center: Vec2 | null = null;
  private radius = 0;
  private at: Vec2 | null = null;
  constructor(private readonly host: ToolHost) {}
  hint() {
    return !this.center ? "Cliquez le centre de la zone à agrandir sur une vue." : !this.radius ? "Cliquez le bord du cercle." : "Cliquez où poser le détail (agrandi deux fois et demie).";
  }
  move(p: Vec2) {
    this.at = p;
    this.host.redraw();
  }
  click(p: Vec2) {
    const sheet = this.host.sheet();
    if (!this.center) {
      this.view = viewUnder(this.host, p) ?? null;
      if (!this.view) return this.host.notify("Le détail se prend sur une vue.");
      this.center = p;
      return this.host.redraw();
    }
    if (!this.radius) {
      this.radius = Math.max(2, Math.hypot(p[0] - this.center[0], p[1] - this.center[1]));
      return this.host.redraw();
    }
    const parent = this.view!;
    const center = this.host.layout.fromPaper(sheet, parent, this.center);
    const scale = SCALES.filter((n) => n <= parent.scale / 2).at(-1) ?? SCALES[0]!;
    const letter = nextLetter(sheet);
    const id = addView(this.host, { kind: "detail", spec: parent.spec, scale, at: p, parent: parent.id, label: `Détail ${letter}`, hidden: parent.hidden, detail: { center, radius: this.radius * parent.scale, letter } });
    this.host.select([id]);
    this.host.done();
  }
  preview() {
    if (!this.center) return "";
    const r = this.radius || (this.at ? Math.hypot(this.at[0] - this.center[0], this.at[1] - this.center[1]) : 0);
    const circle = `<circle cx="${f(this.center[0])}" cy="${f(this.center[1])}" r="${f(r)}" ${GHOST}/>`;
    return circle + (this.radius && this.at ? `<circle cx="${f(this.at[0])}" cy="${f(this.at[1])}" r="${f(r * 2.5)}" ${GHOST}/>` : "");
  }
}

/** « Cote »: two points of the views (on the ends of edges), then where the dimension line goes. */
export class DimensionTool implements DrawingTool {
  readonly name = "dimension";
  private points: { view: DrawingView; q: Vec2; paper: Vec2 }[] = [];
  private at: Vec2 | null = null;
  private hover: Vec2 | null = null;
  constructor(private readonly host: ToolHost) {}
  hint() {
    if (!this.points.length) return "Cliquez un trait : sa cote est posée aussitôt. Ou cliquez un premier point (coin, centre), puis un second.";
    return this.points.length < 2 ? "Cliquez le second point (bouts d'arêtes, centres)." : "Tirez la cote : au-dessus ou dessous, horizontale ; à côté, verticale ; Maj, alignée. Cliquez pour la poser.";
  }
  private pick(p: Vec2) {
    const sheet = this.host.sheet();
    const view = viewUnder(this.host, p);
    const q = view ? this.host.layout.snap(sheet, view, p, 4) : null;
    return view && q ? { view, q, paper: this.host.layout.toPaper(sheet, view, q) } : null;
  }
  move(p: Vec2) {
    this.at = p;
    this.hover = this.points.length < 2 ? (this.pick(p)?.paper ?? null) : null;
    this.host.redraw();
  }
  private mode(p: Vec2, event: MouseEvent): "horizontal" | "vertical" | "aligned" {
    if (event.shiftKey) return "aligned";
    const [a, b] = this.points.map((x) => x.paper) as [Vec2, Vec2];
    const [lo, hi] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    // Pulled beside the points: a vertical dimension; above or below them: a horizontal one.
    if (p[0] < lo || p[0] > hi) return Math.abs(a[1] - b[1]) > 0.01 ? "vertical" : "horizontal";
    return Math.abs(a[0] - b[0]) > 0.01 ? "horizontal" : "vertical";
  }
  click(p: Vec2, event: MouseEvent) {
    if (this.points.length < 2) {
      const picked = this.pick(p);
      // Away from the corners, on a trait: its dimension at once.
      const view = !picked && !this.points.length ? viewUnder(this.host, p) : undefined;
      const line = view ? lineNear(this.host, view, p) : null;
      if (view && line) {
        const made = lineDimension(this.host.sheet(), this.host.layout, view, line.a, line.b);
        if (made) addAnnotation(this.host, made);
        return this.host.redraw();
      }
      if (!picked) return this.host.notify("Cliquez un trait, ou près d'un coin ou d'un bout d'arête d'une vue.");
      this.points.push(picked);
      return this.host.redraw();
    }
    const sheet = this.host.sheet();
    const [a, b] = this.points as [(typeof this.points)[0], (typeof this.points)[0]];
    const mode = this.mode(p, event);
    const mid: Vec2 = [(a.paper[0] + b.paper[0]) / 2, (a.paper[1] + b.paper[1]) / 2];
    const dir: Vec2 = mode === "horizontal" ? [1, 0] : mode === "vertical" ? [0, 1] : [(b.paper[0] - a.paper[0]) / (Math.hypot(b.paper[0] - a.paper[0], b.paper[1] - a.paper[1]) || 1), (b.paper[1] - a.paper[1]) / (Math.hypot(b.paper[0] - a.paper[0], b.paper[1] - a.paper[1]) || 1)];
    const offset = (p[0] - mid[0]) * -dir[1] + (p[1] - mid[1]) * dir[0];
    addAnnotation(this.host, { kind: "dimension", mode, a: this.host.layout.anchor(sheet, a.view, a.q), b: this.host.layout.anchor(sheet, b.view, b.q), offset });
    this.points = [];
  }
  preview() {
    const out = this.points.map((x) => dot(x.paper));
    if (this.hover) out.push(`<circle cx="${f(this.hover[0])}" cy="${f(this.hover[1])}" r="1.6" fill="none" stroke="#ea580c" stroke-width="0.3"/>`);
    if (this.points.length === 2 && this.at) out.push(ghostLine(this.points[0]!.paper, this.at), ghostLine(this.points[1]!.paper, this.at));
    return out.join("");
  }
}

/** « Diamètre » / « Rayon »: a circle of a view, then the side its leader goes. */
export class CircleDimensionTool implements DrawingTool {
  readonly name: string;
  private picked: { view: DrawingView; center: Vec2; radius: number } | null = null;
  private at: Vec2 | null = null;
  constructor(private readonly host: ToolHost, private readonly kind: "diameter" | "radius") {
    this.name = kind === "diameter" ? "circle-dimension-d" : "circle-dimension-r";
  }
  hint() {
    return this.picked ? "Cliquez de quel côté poser la cote." : "Cliquez un cercle ou un arc d'une vue.";
  }
  move(p: Vec2) {
    this.at = p;
    this.host.redraw();
  }
  click(p: Vec2) {
    const sheet = this.host.sheet();
    if (!this.picked) {
      const view = viewUnder(this.host, p);
      if (!view) return this.host.notify("Cliquez un cercle d'une vue.");
      const q = this.host.layout.fromPaper(sheet, view, p);
      const near = this.host.layout.geometry(sheet, view).circles.map((c) => ({ c, d: Math.abs(Math.hypot(q[0] - c.center[0], q[1] - c.center[1]) - c.radius) })).sort((x, y) => x.d - y.d)[0];
      if (!near || near.d > 4 * view.scale) return this.host.notify("Aucun cercle vu de face ici (un perçage vu de dessus, un arrondi…).");
      this.picked = { view, center: near.c.center, radius: near.c.radius };
      return this.host.redraw();
    }
    const c = this.host.layout.toPaper(sheet, this.picked.view, this.picked.center);
    const angle = (Math.atan2(-(p[1] - c[1]), p[0] - c[0]) * 180) / Math.PI;
    addAnnotation(this.host, { kind: this.kind, view: this.picked.view.id, center: this.picked.center, radius: this.picked.radius, angle });
    this.picked = null;
  }
  preview() {
    if (!this.picked || !this.at) return "";
    const c = this.host.layout.toPaper(this.host.sheet(), this.picked.view, this.picked.center);
    return ghostLine(c, this.at) + `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(this.picked.radius / this.picked.view.scale)}" ${GHOST}/>`;
  }
}

/** The straight line of a view nearest to a paper point. */
function lineNear(host: ToolHost, view: DrawingView, p: Vec2): DrawnLine | null {
  const sheet = host.sheet();
  const q = host.layout.fromPaper(sheet, view, p);
  let best: DrawnLine | null = null;
  let distance = 3 * view.scale;
  for (const l of host.layout.geometry(sheet, view).lines) {
    const [dx, dy] = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
    const t = Math.max(0, Math.min(1, ((q[0] - l.a[0]) * dx + (q[1] - l.a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(q[0] - l.a[0] - t * dx, q[1] - l.a[1] - t * dy);
    if (d < distance) [best, distance] = [l, d];
  }
  return best;
}

/** « Angle »: two straight edges of a view, then the radius of its arc. */
export class AngleTool implements DrawingTool {
  readonly name = "angle";
  private view: DrawingView | null = null;
  private lines: { line: DrawnLine; click: Vec2 }[] = [];
  private at: Vec2 | null = null;
  constructor(private readonly host: ToolHost) {}
  hint() {
    return this.lines.length < 2 ? `Cliquez le ${this.lines.length ? "second" : "premier"} trait.` : "Cliquez où poser l'arc de la cote.";
  }
  move(p: Vec2) {
    this.at = p;
    this.host.redraw();
  }
  click(p: Vec2) {
    const sheet = this.host.sheet();
    if (this.lines.length < 2) {
      const view = this.view ?? viewUnder(this.host, p);
      const line = view ? lineNear(this.host, view, p) : null;
      if (!view || !line) return this.host.notify("Cliquez un trait d'une vue.");
      this.view = view;
      this.lines.push({ line, click: this.host.layout.fromPaper(sheet, view, p) });
      return this.host.redraw();
    }
    const [l1, l2] = this.lines.map((x) => x.line) as [DrawnLine, DrawnLine];
    const d1: Vec2 = [l1.b[0] - l1.a[0], l1.b[1] - l1.a[1]];
    const d2: Vec2 = [l2.b[0] - l2.a[0], l2.b[1] - l2.a[1]];
    const det = d1[0] * -d2[1] - d1[1] * -d2[0];
    if (Math.abs(det) < 1e-9) {
      this.lines = [];
      return this.host.notify("Ces deux traits sont parallèles : pas d'angle.");
    }
    const t = ((l2.a[0] - l1.a[0]) * -d2[1] - (l2.a[1] - l1.a[1]) * -d2[0]) / det;
    const vertex: Vec2 = [l1.a[0] + d1[0] * t, l1.a[1] + d1[1] * t];
    const view = this.view!;
    const v = this.host.layout.toPaper(sheet, view, vertex);
    addAnnotation(this.host, { kind: "angle", view: view.id, vertex, a: this.lines[0]!.click, b: this.lines[1]!.click, radius: Math.max(4, Math.hypot(p[0] - v[0], p[1] - v[1])) });
    this.lines = [];
    this.view = null;
  }
  preview() {
    const view = this.view;
    if (!view) return "";
    const sheet = this.host.sheet();
    return this.lines.map(({ line }) => ghostLine(this.host.layout.toPaper(sheet, view, line.a), this.host.layout.toPaper(sheet, view, line.b))).join("");
  }
}

/** « Texte », « Note », « Repère », « Nomenclature »: what is clicked, then (for a note or a balloon) where its text goes. */
export class LabelTool implements DrawingTool {
  readonly name: string;
  private target: { view: DrawingView; q: Vec2; body?: string } | null = null;
  private at: Vec2 | null = null;
  constructor(private readonly host: ToolHost, private readonly kind: "text" | "note" | "balloon" | "bom") {
    this.name = kind;
  }
  hint() {
    if (this.kind === "text") return "Cliquez où écrire.";
    if (this.kind === "bom") return "Cliquez où poser le coin haut gauche de la nomenclature.";
    return this.target ? "Cliquez où poser le texte." : this.kind === "balloon" ? "Cliquez une pièce dans une vue." : "Cliquez le point visé dans une vue.";
  }
  move(p: Vec2) {
    this.at = p;
    this.host.redraw();
  }
  click(p: Vec2) {
    const sheet = this.host.sheet();
    if (this.kind === "text") {
      void this.host.ask("Texte", "").then((text) => text && addAnnotation(this.host, { kind: "text", at: p, text, size: 3.5 }));
      return this.host.done();
    }
    if (this.kind === "bom") {
      if (sheet.annotations.some((a) => a.kind === "bom")) this.host.notify("La feuille a déjà sa nomenclature : elle est déplacée ici.");
      this.host.update((s) => ({ ...s, annotations: s.annotations.filter((a) => a.kind !== "bom") }));
      addAnnotation(this.host, { kind: "bom", at: p });
      return this.host.done();
    }
    if (!this.target) {
      const view = viewUnder(this.host, p);
      if (!view) return this.host.notify("Cliquez dans une vue.");
      const line = this.kind === "balloon" ? lineNear(this.host, view, p) : null;
      if (this.kind === "balloon" && !line?.body) return this.host.notify("Cliquez sur un trait de la pièce.");
      this.target = { view, q: this.host.layout.fromPaper(sheet, view, p), body: line?.body };
      return this.host.redraw();
    }
    const target = this.host.layout.anchor(sheet, this.target.view, this.target.q);
    if (this.kind === "balloon") addAnnotation(this.host, { kind: "balloon", at: p, target, body: this.target.body! });
    else void this.host.ask("Note", "").then((text) => text && addAnnotation(this.host, { kind: "note", at: p, target, text }));
    this.target = null;
  }
  preview() {
    if (!this.target || !this.at) return "";
    return ghostLine(this.host.layout.toPaper(this.host.sheet(), this.target.view, this.target.q), this.at);
  }
}

/** « Zoom fenêtre »: a rectangle drawn on the sheet (dragged, or two corners clicked) fills the screen. */
export class ZoomWindowTool implements DrawingTool {
  readonly name = "zoom-window";
  private from: Vec2 | null = null;
  private to: Vec2 | null = null;
  constructor(private readonly host: ToolHost) {}
  hint() {
    return this.from ? "Cliquez le coin opposé de la zone à agrandir." : "Tracez la zone à agrandir : glissez, ou cliquez deux coins. Échap : fini.";
  }
  move(p: Vec2) {
    if (!this.from) return;
    this.to = p;
    this.host.redraw();
  }
  click(p: Vec2) {
    if (!this.from) {
      this.from = p;
      return this.host.redraw();
    }
    this.zoom(this.from, p);
  }
  drag(from: Vec2, to: Vec2) {
    [this.from, this.to] = [from, to];
    this.host.redraw();
  }
  dragEnd(from: Vec2, to: Vec2) {
    this.zoom(from, to);
  }
  private zoom(a: Vec2, b: Vec2) {
    [this.from, this.to] = [null, null];
    // Too small (a slip of the hand): nothing.
    if (Math.abs(b[0] - a[0]) < 2 && Math.abs(b[1] - a[1]) < 2) return this.host.redraw();
    this.host.zoomTo(a, b);
    this.host.done();
  }
  preview() {
    return this.from && this.to ? ghostRect(this.from, this.to) : "";
  }
}
