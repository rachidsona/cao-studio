/**
 * "Dessiner sur le corps" (as Curic DIO's Line, Rectangle and Circle): lines, rectangles and circles drawn directly
 * on a face of a body, from the 3D view, without opening a sketch first. Over a face, the distances from the pointer
 * to the nearest edges (the SnapDims: red along X, blue along Y) are shown and can be typed; the point snaps to the
 * corners and the middles of the edges, else those distances are rounded. Clicking places points (a line goes on
 * until Entrée or a click on its last point, a rectangle and a circle take two); the result is a sketch on the face,
 * made of the face's projected outline and the drawing, and a closed shape goes on with the push/pull (extrusion).
 * The maths are in sketcher/face-draw.ts. A click over another body's face before the first point picks that
 * object (Curic's "Get Object").
 */
import { uniqueId, uniqueName } from "../document/operations";
import type { Feature, SketchFeature } from "../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { addCircle, addLine, addRectangle, type Vec2, type VertexInput } from "../sketcher/edit";
import { pointAtLength, snapDims, snapOnFace, withTypedDistances } from "../sketcher/face-draw";
import { rayToSketch, toWorld } from "../sketcher/frame";
import { projectOutline } from "../sketcher/projection";
import { dragStep } from "../viewport/axis-drag";
import { el } from "../ui/dom";
import { Marks } from "./measure";
import { loadFace, type LoadedFace } from "./face-strip-view";
import { COMPACT_INPUT, PanelTool, type ToolContext } from "./panel-tool";
import type { SketchGeometry } from "../document/sketch";
import type { FacePick } from "../viewport/viewport";

type Shape = "line" | "rectangle" | "circle";
const SHAPES: [Shape, string][] = [
  ["line", "Ligne / polyligne"],
  ["rectangle", "Rectangle"],
  ["circle", "Cercle"],
];

/** Kept for the session: what was drawn last, and whether a closed shape goes on with the push/pull. */
const last = { shape: "line" as Shape, thenPull: true };

const RED = 0xdc2626;
const BLUE = 0x2563eb;
const ORANGE = 0xf97316;

export class DrawOnFaceTool extends PanelTool {
  private shape: Shape = last.shape;
  private thenPull = last.thenPull;
  /** The face the drawing is on: set with the first point, which locks it. */
  private face: LoadedFace | null = null;
  private points: Vec2[] = [];
  /** Where the pointer lands (snapped, typed values applied), with its face. */
  private cursor: Vec2 | null = null;
  private hoverFace: LoadedFace | null = null;
  private lastEvent: PointerEvent | null = null;
  /** Typed values: distances to the edges for the first point; then length and angle, width and height, or radius. */
  private typed: { x: number | null; y: number | null; length: number | null; angle: number | null } = { x: null, y: null, length: null, angle: null };
  private readonly marks: Marks;
  private readonly readout = el("p", { class: "font-mono text-gray-600 dark:text-gray-300" }, "");
  private readonly loaded = new Map<string, LoadedFace | null>();
  private readonly loading = new Set<string>();
  private readonly sketchId: string;
  private readonly sketchName: string;

  constructor(ctx: ToolContext) {
    super(ctx, "Dessiner sur le corps", null);
    const doc = ctx.doc();
    this.sketchId = uniqueId(doc, "sk");
    this.sketchName = uniqueName(doc, "Tracé");
    this.marks = new Marks(ctx.viewport.scene);
  }

  // ---- faces and the pointer ---------------------------------------------------------------

  private faceOf(pick: FacePick): LoadedFace | null {
    const key = `${pick.bodyId}#${pick.faceIndex}`;
    if (this.loaded.has(key)) return this.loaded.get(key) ?? null;
    if (!this.loading.has(key)) {
      this.loading.add(key);
      void loadFace(this.ctx.geometry, key, pick).then((face) => {
        this.loaded.set(key, face);
        if (this.lastEvent) this.move(this.lastEvent);
      });
    }
    return null;
  }

  private world(face: LoadedFace, p: Vec2) {
    return toWorld(face.frame, p[0], p[1]);
  }

  private step(): number {
    return dragStep(this.ctx.viewport.worldPerPixel());
  }

  /** Whether the point lies inside the polygon of the face. */
  private inside(face: LoadedFace, p: Vec2): boolean {
    let inside = false;
    const poly = face.polygon;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i] as Vec2;
      const [xj, yj] = poly[j] as Vec2;
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** The point under the pointer on `face`: snapped, then with the typed values applied. */
  private pointOn(face: LoadedFace, event: PointerEvent): Vec2 | null {
    const { origin, direction } = this.ctx.viewport.rayFromEvent(event);
    const raw = rayToSketch(face.frame, origin, direction);
    if (!raw) return null;
    const tolerance = 10 * this.ctx.viewport.worldPerPixel();
    let p = this.points.length === 0 && !this.inside(face, raw) ? raw : snapOnFace(face.polygon, raw, this.step(), tolerance).point;
    const first = this.points.at(-1);
    if (!first) return withTypedDistances(face.polygon, p, this.typed);
    const { length, angle } = this.typed;
    if (this.shape === "rectangle" && length !== null) {
      // Typed width (and height, in the angle field): from the first corner toward the pointer's quadrant.
      const sx = p[0] >= first[0] ? 1 : -1;
      const sy = p[1] >= first[1] ? 1 : -1;
      p = [first[0] + sx * length, first[1] + sy * (angle ?? Math.abs(p[1] - first[1]))];
    } else if (length !== null) p = pointAtLength(first, p, length, this.shape === "line" ? angle : null);
    else if (this.shape === "line" && angle !== null) p = pointAtLength(first, p, Math.hypot(p[0] - first[0], p[1] - first[1]) || 1, angle);
    return p;
  }

  override move(event: PointerEvent): void {
    this.lastEvent = event;
    const viewport = this.ctx.viewport;
    let face = this.face;
    if (!face) {
      const pick = viewport.pickFace(event);
      face = pick ? this.faceOf(pick) : null;
      this.hoverFace = face;
      viewport.setHoverHighlight(pick ? { face: pick } : null);
    }
    if (!face) {
      this.cursor = null;
      this.draw();
      return;
    }
    this.cursor = this.pointOn(face, event);
    this.draw();
  }

  // ---- drawing the marks -------------------------------------------------------------------

  private draw(): void {
    this.marks.clear();
    const face = this.face ?? this.hoverFace;
    const unit = this.ctx.unit();
    const fmt = (mm: number) => formatLength(mm, unit);
    let note = "";
    if (face && this.cursor) {
      const p = this.cursor;
      const at = (q: Vec2) => this.world(face, q);
      // The SnapDims: distances to the nearest edges, red along X and blue along Y.
      if (this.inside(face, p)) {
        for (const dim of snapDims(face.polygon, p)) {
          if (dim.distance < 1e-6) continue;
          const color = dim.axis === 0 ? RED : BLUE;
          this.marks.line(at(dim.from), at(dim.to), color, true);
          const mid: Vec2 = [(dim.from[0] + dim.to[0]) / 2, (dim.from[1] + dim.to[1]) / 2];
          this.marks.label(at(mid), fmt(dim.distance));
        }
        note = snapDims(face.polygon, p).map((d) => `${d.axis === 0 ? "↔" : "↕"} ${fmt(d.distance)}`).join("   ");
      }
      this.marks.dot(at(p), ORANGE);
      // What is drawn so far, and the shape the next point would give.
      const chain = [...this.points, p];
      const last = this.points.at(-1);
      if (this.shape === "line") {
        chain.slice(1).forEach((q, i) => {
          const a = chain[i] as Vec2;
          this.marks.line(at(a), at(q), ORANGE, false);
          if (i === chain.length - 2) this.marks.label(at([(a[0] + q[0]) / 2, (a[1] + q[1]) / 2]), fmt(Math.hypot(q[0] - a[0], q[1] - a[1])));
        });
      } else if (last && this.shape === "rectangle") {
        const corners: Vec2[] = [last, [p[0], last[1]], p, [last[0], p[1]]];
        corners.forEach((c, i) => this.marks.line(at(c), at(corners[(i + 1) % 4] as Vec2), ORANGE, false));
        this.marks.label(at([(last[0] + p[0]) / 2, last[1]]), fmt(Math.abs(p[0] - last[0])));
        this.marks.label(at([p[0], (last[1] + p[1]) / 2]), fmt(Math.abs(p[1] - last[1])));
      } else if (last && this.shape === "circle") {
        const r = Math.hypot(p[0] - last[0], p[1] - last[1]);
        const ring = Array.from({ length: 49 }, (_, i): Vec2 => [last[0] + r * Math.cos((i / 48) * 2 * Math.PI), last[1] + r * Math.sin((i / 48) * 2 * Math.PI)]);
        ring.slice(1).forEach((q, i) => this.marks.line(at(ring[i] as Vec2), at(q), ORANGE, false));
        this.marks.line(at(last), at(p), ORANGE, true);
        this.marks.label(at([(last[0] + p[0]) / 2, (last[1] + p[1]) / 2]), `R ${fmt(r)}`);
      }
      for (const q of this.points) this.marks.dot(at(q), ORANGE);
    }
    this.readout.textContent = note || (face ? "" : "Survolez une face.");
  }

  // ---- clicks and typed values --------------------------------------------------------------

  private get closedShape(): boolean {
    return this.shape !== "line";
  }

  private ready(): boolean {
    return this.shape === "line" ? this.points.length >= 2 : this.points.length === 2;
  }

  protected override click(): void {
    this.place();
  }

  /** Places the point under the pointer (the first one locks the face); the last one ends a rectangle or a circle. */
  private place(): void {
    const face = this.face ?? this.hoverFace;
    const p = this.cursor;
    if (!face || !p) return;
    if (!this.face) this.face = face;
    const lastPoint = this.points.at(-1);
    // A line ends where it is clicked again.
    if (this.shape === "line" && lastPoint && Math.hypot(p[0] - lastPoint[0], p[1] - lastPoint[1]) < 1e-6) return this.confirm();
    if (this.shape !== "line" && lastPoint && Math.hypot(p[0] - lastPoint[0], p[1] - lastPoint[1]) < 1e-6) return;
    this.points.push(p);
    this.typed = { x: null, y: null, length: null, angle: null };
    this.ctx.viewport.setHoverHighlight(null);
    if (this.shape !== "line" && this.points.length === 2) return this.confirm();
    this.render();
    this.draw();
  }

  /** Lengths and angles are typed in the fields: the point is placed with Entrée. */
  override handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Escape") {
      if (this.points.length) {
        this.points = [];
        this.face = null;
        this.typed = { x: null, y: null, length: null, angle: null };
        this.render();
        this.draw();
      } else this.cancel();
      return true;
    }
    if (event.key === "Enter") {
      const pending = Object.values(this.typed).some((v) => v !== null);
      if (pending && this.cursor) this.place();
      else this.confirm();
      return true;
    }
    return false;
  }

  // ---- the sketch ----------------------------------------------------------------------------

  /** A vertex at `p`: the projected outline's own point when there is one there (the drawing is tied to the corner). */
  private vertexAt(g: SketchGeometry, p: Vec2): VertexInput {
    const near = g.points.find((q) => Math.hypot(q.x - p[0], q.y - p[1]) < 1e-6);
    return near ? { pointId: near.id } : { at: p };
  }

  private geometry(face: LoadedFace): SketchGeometry | null {
    let g = projectOutline(face.outline, face.frame);
    try {
      if (this.shape === "line") {
        for (let i = 1; i < this.points.length; i++) g = addLine(g, this.vertexAt(g, this.points[i - 1] as Vec2), this.vertexAt(g, this.points[i] as Vec2)).geometry;
      } else if (this.shape === "rectangle" && this.points.length === 2) {
        g = addRectangle(g, this.vertexAt(g, this.points[0] as Vec2), this.vertexAt(g, this.points[1] as Vec2)).geometry;
      } else if (this.shape === "circle" && this.points.length === 2) {
        const [c, e] = this.points as [Vec2, Vec2];
        g = addCircle(g, this.vertexAt(g, c), Math.hypot(e[0] - c[0], e[1] - c[1])).geometry;
      } else return null;
    } catch {
      return null;
    }
    return g;
  }

  protected feature(): Feature | string {
    if (!this.face) return "Cliquez sur une face du corps pour poser le premier point.";
    if (!this.ready()) return this.shape === "line" ? "Cliquez le point suivant ; Entrée (ou un clic sur le dernier point) termine." : this.shape === "rectangle" ? "Cliquez le coin opposé." : "Cliquez un point du cercle.";
    const g = this.geometry(this.face);
    if (!g) return "Ce dessin est impossible (longueur ou rayon nul).";
    const sketch: SketchFeature = { id: this.sketchId, type: "sketch", name: this.sketchName, plane: this.face.plane, offset: Number(this.face.offset.toFixed(6)), ...g, support: this.face.pick.bodyId };
    return sketch;
  }

  override confirm(): void {
    const built = this.feature();
    if (typeof built === "string") {
      this.ctx.notify(built, "info");
      return;
    }
    Object.assign(last, { shape: this.shape, thenPull: this.thenPull });
    const doc = { ...this.ctx.doc(), features: [...this.ctx.doc().features, built] };
    const goOn = this.closedShape && this.thenPull && !!this.ctx.extrude;
    this.close();
    this.ctx.commit(doc, built.id, goOn ? () => this.ctx.extrude?.() : undefined);
  }

  // ---- panel ---------------------------------------------------------------------------------

  /** A number the user may type, or leave empty to let the pointer decide. */
  private optional(label: string, key: "x" | "y" | "length" | "angle", angle = false): HTMLElement {
    const unit = this.ctx.unit();
    const value = this.typed[key];
    const input = el("input", { type: "text", inputmode: "decimal", class: `${COMPACT_INPUT} text-right font-mono`, placeholder: "pointeur", value: value === null ? "" : trim(angle ? value : toDisplay(value, unit), 4), "aria-label": label });
    input.addEventListener("keydown", (event) => event.stopPropagation());
    const apply = () => {
      const text = input.value.trim();
      const parsed = text === "" ? null : parseNumber(text);
      input.setAttribute("aria-invalid", String(text !== "" && parsed === null));
      if (text !== "" && parsed === null) return;
      this.typed[key] = parsed === null ? null : angle ? parsed : fromDisplay(parsed, unit);
      if (this.lastEvent) this.move(this.lastEvent);
    };
    input.addEventListener("input", apply);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        apply();
        if (this.cursor) this.place();
      }
    });
    return el("label", { class: "grid grid-cols-[6.5rem_1fr] items-center gap-1.5" }, `${label}${angle ? " (°)" : ` (${UNIT_LABELS[unit]})`}`, input);
  }

  protected rows(): (HTMLElement | null)[] {
    const rows: (HTMLElement | null)[] = [
      this.selectRow("Tracé", this.shape, SHAPES, (v) => {
        this.shape = v as Shape;
        this.points = [];
        this.face = null;
        this.typed = { x: null, y: null, length: null, angle: null };
        this.render();
        this.draw();
      }),
      this.info(this.points.length === 0 ? "Cliquez sur une face du corps : les distances aux bords s'affichent." : this.shape === "line" ? "Point suivant : cliquez ; Entrée termine." : this.shape === "rectangle" ? "Cliquez le coin opposé." : "Cliquez un point du cercle."),
      this.readout,
    ];
    if (this.points.length === 0) rows.push(this.optional("Bord ↔", "x"), this.optional("Bord ↕", "y"));
    else if (this.shape === "line") rows.push(this.optional("Longueur", "length"), this.optional("Angle", "angle", true));
    else if (this.shape === "rectangle") rows.push(this.optional("Largeur", "length"), this.optional("Hauteur", "angle"));
    else rows.push(this.optional("Rayon", "length"));
    if (this.closedShape) {
      rows.push(
        this.checkRow("Puis tirer / pousser", this.thenPull, (v) => {
          this.thenPull = v;
        }),
      );
    }
    rows.push(this.info("Une pression sur Échap reprend le tracé ; survoler une autre face avant le premier point change d'objet."));
    return rows;
  }

  protected override dispose(): void {
    this.marks.clear();
    this.ctx.viewport.setHoverHighlight(null);
  }
}
