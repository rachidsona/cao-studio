/**
 * "Dessiner sur le corps" (as Curic DIO's Line, Rectangle and Circle, and Curic's Offset): lines, rectangles and
 * circles drawn directly on a face of a body, from the 3D view, without opening a sketch first, or the face's outline
 * offset inward (a frame, a recess). The measures are not written in the view: they show in the value box at the
 * bottom (as SketchUp's), live as the pointer moves, and numbers typed on the keyboard go there directly — Entrée
 * applies them: two distances to the nearest edges for the first point ("120;45"), then a length and an angle, a
 * width and a height, a radius, or the offset. Over a face, dashed lines (red along X, blue along Y) show where the
 * distances to the edges are measured; the point snaps to the corners and the middles of the edges, else those
 * distances are rounded. The result is a sketch on the face (its projected outline and the drawing), and a closed
 * shape goes on with the push/pull. The maths are in sketcher/face-draw.ts. Before the first point, the face under
 * the pointer is the one drawn on (Curic's "Get Object").
 */
import { keyChar } from "../ui/digit-keys";
import { uniqueId, uniqueName } from "../document/operations";
import type { Feature, SketchFeature } from "../document/types";
import { formatLength, fromDisplay, parseNumber, trim, UNIT_LABELS } from "../measurements/units";
import { addCircle, addLine, addRectangle, type Vec2, type VertexInput } from "../sketcher/edit";
import { markedPoints, offsetPolygon, parseTyped, pointAtLength, pointerOffset, snapDims, snapOnFace, withTypedDistances, type SnapKind } from "../sketcher/face-draw";
import { bandSketch } from "../sketcher/face-strip";
import { rayToSketch, toWorld } from "../sketcher/frame";
import { projectOutline } from "../sketcher/projection";
import { ValueBox } from "../ui/value-box";
import { dragStep, roundTo } from "../viewport/axis-drag";
import { CurvedOffset } from "./curved-offset";
import { Marks } from "./measure";
import { loadFace, type LoadedFace } from "./face-strip-view";
import { PanelTool, type ToolContext } from "./panel-tool";
import type { SketchGeometry } from "../document/sketch";
import type { FacePick } from "../viewport/viewport";

type Shape = "line" | "rectangle" | "circle" | "offset";
const SHAPES: [Shape, string][] = [
  ["line", "Ligne / polyligne"],
  ["rectangle", "Rectangle"],
  ["circle", "Cercle"],
  ["offset", "Décalage du contour"],
];

/** What a snap is called in the value box. */
const SNAP_NAMES: Record<SnapKind, string> = { corner: "Coin de la face", middle: "Milieu du trait", center: "Centre de la face", free: "" };

/** Kept for the session: what was drawn last, and whether a closed shape goes on with the push/pull. */
/** Kept for the session: the last shape, pulling after, and offsetting the whole roof (both slopes) or one face. */
const last = { shape: "line" as Shape, thenPull: true, roof: false };

const RED = 0xdc2626;
const BLUE = 0x2563eb;
const ORANGE = 0xf97316;
/** Crosses marking the centre of the face and the middles of its edges. */
const SKY = 0x0284c7;

type Typed = { x: number | null; y: number | null; length: number | null; angle: number | null };
const NOTHING: Typed = { x: null, y: null, length: null, angle: null };

/** Keys the value box takes while the tool is active: digits, decimal separators, minus, separators. */
const TYPING = /^[0-9.,;\- ]$/;

export class DrawOnFaceTool extends PanelTool {
  private shape: Shape = last.shape;
  private thenPull = last.thenPull;
  /** The face the drawing is on: set with the first point, which locks it. */
  private face: LoadedFace | null = null;
  private points: Vec2[] = [];
  /** Where the pointer lands (snapped, typed values applied). */
  private cursor: Vec2 | null = null;
  private hoverFace: LoadedFace | null = null;
  /** What the pointer is snapped to: a corner, the middle of an edge, the centre of the face, or nothing. */
  private snapped: SnapKind = "free";
  private lastEvent: PointerEvent | null = null;
  /** Values typed and applied: distances to the edges for the first point; then length and angle, width and height, radius, or offset. */
  private typed: Typed = { ...NOTHING };
  /** The text being typed in the value box, or null. */
  private buffer: string | null = null;
  /** The offset the pointer (or a typed value) asks for, and the outline it gives. */
  private offsetDistance = 0;
  private offsetOutline: Vec2[] | null = null;
  private readonly marks: Marks;
  private readonly box: ValueBox;
  private readonly loaded = new Map<string, LoadedFace | null>();
  /** The face under the pointer is curved: one draws on flat faces only, but offsets on a curved face too. */
  private curved = false;
  private readonly curvedOffset: CurvedOffset;
  private readonly loading = new Set<string>();
  private readonly sketchId: string;
  private readonly sketchName: string;

  constructor(ctx: ToolContext) {
    super(ctx, "Dessiner sur le corps", null);
    const doc = ctx.doc();
    this.sketchId = uniqueId(doc, "sk");
    this.sketchName = uniqueName(doc, "Tracé");
    this.marks = new Marks(ctx.viewport.scene);
    this.curvedOffset = new CurvedOffset(ctx);
    this.box = new ValueBox(ctx.container);
    window.addEventListener("keydown", this.onKey, true);
    this.showValues();
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

  /**
   * Where the pointer lands: on a cross (centre of the face, middle of an edge) within 18 pixels, or a corner within 10 —
   * measured on the screen, whatever the depth of the face — else its distances to the edges rounded.
   */
  private snapAt(face: LoadedFace, raw: Vec2, event: PointerEvent): { point: Vec2; kind: SnapKind } {
    const viewport = this.ctx.viewport;
    let best: { point: Vec2; kind: SnapKind; d: number } | null = null;
    const consider = (point: Vec2, kind: SnapKind, reach: number) => {
      const d = viewport.screenDistance(event, this.world(face, point));
      if (d <= reach && (!best || d < best.d)) best = { point, kind, d };
    };
    for (const a of face.polygon) consider(a, "corner", 10);
    for (const m of markedPoints(face.polygon)) consider(m.point, m.kind, 18);
    const found = best as { point: Vec2; kind: SnapKind } | null;
    return found ?? snapOnFace(face.polygon, raw, this.step(), 0);
  }

  /** The point under the pointer on `face`: snapped, then with the typed values applied. */
  private pointOn(face: LoadedFace, event: PointerEvent): Vec2 | null {
    const { origin, direction } = this.ctx.viewport.rayFromEvent(event);
    const raw = rayToSketch(face.frame, origin, direction);
    if (!raw) return null;
    if (this.shape === "offset") {
      // The pointer's distance to the nearest edge (rounded), unless one was typed.
      this.offsetDistance = this.typed.length ?? roundTo(pointerOffset(face.polygon, raw), this.step());
      this.offsetOutline = offsetPolygon(face.polygon, this.offsetDistance);
      return raw;
    }
    const snap = this.points.length === 0 && !this.inside(face, raw) ? { point: raw, kind: "free" as SnapKind } : this.snapAt(face, raw, event);
    this.snapped = snap.kind;
    let p = snap.point;
    const first = this.points.at(-1);
    if (!first) return withTypedDistances(face.polygon, p, this.typed);
    const { length, angle } = this.typed;
    if (this.shape === "rectangle" && length !== null) {
      // Typed width (and height, in the angle slot): from the first corner toward the pointer's quadrant.
      const sx = p[0] >= first[0] ? 1 : -1;
      const sy = p[1] >= first[1] ? 1 : -1;
      p = [first[0] + sx * length, first[1] + sy * (angle ?? Math.abs(p[1] - first[1]))];
    } else if (this.shape === "rectangle" && angle !== null) {
      p = [p[0], first[1] + (p[1] >= first[1] ? 1 : -1) * angle];
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
      // Loaded, but not flat: nothing is drawn on it (a curved roof, a round edge); an offset follows it though.
      this.curved = !!pick && !face && this.loaded.has(`${pick.bodyId}#${pick.faceIndex}`);
      viewport.setHoverHighlight(pick ? { face: pick } : null);
      if (this.shape === "offset" && (this.curvedOffset.locked || this.curved || (last.roof && face?.slanted)) && this.curvedOffset.move(pick, this.step(), () => this.lastEvent && this.move(this.lastEvent), last.roof)) {
        this.marks.clear();
        this.curvedOffset.draw(this.marks);
        const v = formatLength(this.curvedOffset.distance, this.ctx.unit());
        return this.box.show(this.curvedOffset.label, `${v} ${this.curvedOffset.text}`, this.curvedOffset.locked ? "Réglez la profondeur dans le panneau : elle est enregistrée aussitôt." : "Cliquez pour le poser, puis réglez la profondeur.");
      }
    }
    this.snapped = "free";
    this.cursor = face ? this.pointOn(face, event) : null;
    this.draw();
  }

  // ---- what is shown: dashed lines and the shape in the view, the measures in the box -------------

  private draw(): void {
    this.marks.clear();
    const face = this.face ?? this.hoverFace;
    if (face && this.cursor) {
      const p = this.cursor;
      const at = (q: Vec2) => this.world(face, q);
      if (this.shape === "offset") {
        const outline = this.offsetOutline;
        if (outline) outline.forEach((q, i) => this.marks.line(at(q), at(outline[(i + 1) % outline.length] as Vec2), ORANGE, false));
      } else {
        // Where the distances to the nearest edges are measured: red along X, blue along Y (their values are in the box).
        if (this.points.length === 0 && this.inside(face, p)) {
          for (const dim of snapDims(face.polygon, p)) if (dim.distance > 1e-6) this.marks.line(at(dim.from), at(dim.to), dim.axis === 0 ? RED : BLUE, true);
        }
        // The centre of the face and the middles of its edges, marked with a cross: the pointer snaps to them.
        for (const m of markedPoints(face.polygon)) {
          const here = Math.hypot(m.point[0] - p[0], m.point[1] - p[1]) < 1e-6;
          this.marks.cross(at(m.point), here ? ORANGE : SKY, here ? 20 : 14);
        }
        this.marks.dot(at(p), ORANGE);
        const chain = [...this.points, p];
        const lastPoint = this.points.at(-1);
        if (this.shape === "line") chain.slice(1).forEach((q, i) => this.marks.line(at(chain[i] as Vec2), at(q), ORANGE, false));
        else if (lastPoint && this.shape === "rectangle") {
          const corners: Vec2[] = [lastPoint, [p[0], lastPoint[1]], p, [lastPoint[0], p[1]]];
          corners.forEach((c, i) => this.marks.line(at(c), at(corners[(i + 1) % 4] as Vec2), ORANGE, false));
        } else if (lastPoint && this.shape === "circle") {
          const r = Math.hypot(p[0] - lastPoint[0], p[1] - lastPoint[1]);
          const ring = Array.from({ length: 49 }, (_, i): Vec2 => [lastPoint[0] + r * Math.cos((i / 48) * 2 * Math.PI), lastPoint[1] + r * Math.sin((i / 48) * 2 * Math.PI)]);
          ring.slice(1).forEach((q, i) => this.marks.line(at(ring[i] as Vec2), at(q), ORANGE, false));
          this.marks.line(at(lastPoint), at(p), ORANGE, true);
        }
        for (const q of this.points) this.marks.dot(at(q), ORANGE);
      }
    }
    this.showValues();
  }

  /** The value box: what the values are, their live reading, and how to type them. */
  private showValues(): void {
    const unit = this.ctx.unit();
    const fmt = (mm: number) => formatLength(mm, unit);
    const face = this.face ?? this.hoverFace;
    const p = this.cursor;
    if (!face && this.curved) {
      this.box.show("Face courbe", "—", "On trace sur une face plane ; le Décalage, lui, suit aussi une face courbe. Pour évider tout le volume, outil Coque (Modifier).");
    } else if (!face || !p) {
      this.box.show("Mesures", "—", "Survolez une face du corps.");
    } else if (this.shape === "offset") {
      this.box.show("Décalage", this.offsetOutline ? fmt(this.offsetDistance) : `${fmt(this.offsetDistance)} — trop grand`, "Tapez la distance puis Entrée (− : vers l'extérieur), ou cliquez.");
    } else if (this.points.length === 0) {
      const dims = this.inside(face, p) ? snapDims(face.polygon, p) : [];
      const dx = dims.find((d) => d.axis === 0);
      const dy = dims.find((d) => d.axis === 1);
      const where = SNAP_NAMES[this.snapped];
      this.box.show("Bords ↔ ; ↕", dx && dy ? `${fmt(dx.distance)} ; ${fmt(dy.distance)}` : "—", `${where ? `${where} — ` : ""}Tapez deux distances aux bords (120;45) puis Entrée, ou cliquez.`);
    } else {
      const a = this.points.at(-1) as Vec2;
      const length = Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (this.shape === "line") {
        const angle = (((Math.atan2(p[1] - a[1], p[0] - a[0]) * 180) / Math.PI) + 360) % 360;
        this.box.show("Longueur ; angle", `${fmt(length)} ; ${trim(angle, 1)}°`, "Tapez la longueur (et l'angle : 500;90) puis Entrée.");
      } else if (this.shape === "rectangle") this.box.show("Largeur ; hauteur", `${fmt(Math.abs(p[0] - a[0]))} ; ${fmt(Math.abs(p[1] - a[1]))}`, "Tapez largeur;hauteur puis Entrée.");
      else this.box.show("Rayon", fmt(length), "Tapez le rayon puis Entrée.");
    }
    this.box.setTyped(this.buffer);
  }

  // ---- typing on the keyboard --------------------------------------------------------------------

  /** Numbers go to the value box without a field; Entrée applies them, Retour arrière erases, Échap empties. */
  private readonly onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.closest("input, textarea, select, [contenteditable=true]") || event.ctrlKey || event.metaKey || event.altKey)) return;
    const consume = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.showValues();
    };
    // The digit row without Maj (AZERTY) types its digits too.
    const key = keyChar(event);
    if (TYPING.test(key)) {
      if (key === " " && this.buffer === null) return;
      this.buffer = (this.buffer ?? "") + key;
      return consume();
    }
    if (this.buffer === null) return;
    if (event.key === "Backspace") {
      this.buffer = this.buffer.slice(0, -1) || null;
      return consume();
    }
    if (event.key === "Escape") {
      this.buffer = null;
      return consume();
    }
    if (event.key === "Enter") {
      this.applyTyped();
      return consume();
    }
  };

  /** Applies what was typed: in the display unit (degrees for an angle), then places the point or the shape. */
  private applyTyped(): void {
    const text = this.buffer ?? "";
    this.buffer = null;
    const unit = this.ctx.unit();
    const values = parseTyped(text, parseNumber);
    if (values.length === 0) return;
    if (values.some((v, i) => v === null && text.split(/\s*;\s*|\s+/)[i] !== "")) return this.ctx.notify(`« ${text} » n'est pas une mesure.`, "error");
    const length = (v: number | null | undefined) => (v === null || v === undefined ? null : fromDisplay(v, unit));
    const [a, b] = values;
    if (this.shape === "offset") this.typed = { ...NOTHING, length: length(a) };
    else if (this.points.length === 0) this.typed = { ...NOTHING, x: length(a), y: length(b) };
    else if (this.shape === "line") this.typed = { ...NOTHING, length: length(a), angle: b ?? null };
    else if (this.shape === "rectangle") this.typed = { ...NOTHING, length: length(a), angle: length(b) };
    else this.typed = { ...NOTHING, length: length(a) };
    if (this.lastEvent) this.move(this.lastEvent);
    if (!this.cursor) return this.ctx.notify("Survolez d'abord une face du corps.", "info");
    this.place();
  }

  // ---- clicks ------------------------------------------------------------------------------------

  private get closedShape(): boolean {
    return this.shape !== "line";
  }

  private ready(): boolean {
    if (this.shape === "offset") return this.face !== null && this.offsetOutline !== null;
    return this.shape === "line" ? this.points.length >= 2 : this.points.length === 2;
  }

  protected override click(): void {
    this.place();
  }

  /** Places the point under the pointer (the first one locks the face); the last one ends a rectangle or a circle; an offset is placed at once. */
  private place(): void {
    if (this.shape === "offset" && this.curvedOffset.place()) {
      this.render();
      return this.schedulePreview();
    }
    const face = this.face ?? this.hoverFace;
    const p = this.cursor;
    if (!face || !p) return;
    if (this.shape === "offset") {
      if (!this.offsetOutline) return this.ctx.notify("Ce décalage est trop grand pour la face.", "error");
      this.face = face;
      this.typed = { ...NOTHING };
      return this.confirm();
    }
    if (!this.face) this.face = face;
    const lastPoint = this.points.at(-1);
    // A line ends where it is clicked again.
    if (this.shape === "line" && lastPoint && Math.hypot(p[0] - lastPoint[0], p[1] - lastPoint[1]) < 1e-6) return this.confirm();
    if (this.shape !== "line" && lastPoint && Math.hypot(p[0] - lastPoint[0], p[1] - lastPoint[1]) < 1e-6) return;
    this.points.push(p);
    this.typed = { ...NOTHING };
    this.ctx.viewport.setHoverHighlight(null);
    if (this.shape !== "line" && this.points.length === 2) return this.confirm();
    this.render();
    this.draw();
  }

  /** Échap starts the drawing over (or leaves); Entrée ends a line. Typed values are handled by the value box first. */
  override handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Escape") {
      if (this.points.length) {
        this.points = [];
        this.face = null;
        this.typed = { ...NOTHING };
        this.render();
        this.draw();
      } else this.cancel();
      return true;
    }
    if (event.key === "Enter") {
      this.confirm();
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
    if (this.shape === "offset") return this.offsetOutline ? bandSketch(face.outline, face.frame, this.offsetOutline) : null;
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
    const curved = this.curvedOffset.locked ? this.curvedOffset.features(this.sketchId, this.sketchName) : null;
    if (curved) return typeof curved === "string" ? curved : curved[0]!;
    if (!this.face) return this.shape === "offset" ? "Survolez une face : le contour décalé suit le pointeur ; cliquez pour le poser." : "Cliquez sur une face du corps pour poser le premier point.";
    if (!this.ready()) return this.shape === "line" ? "Cliquez le point suivant ; Entrée (ou un clic sur le dernier point) termine." : this.shape === "rectangle" ? "Cliquez le coin opposé." : this.shape === "circle" ? "Cliquez un point du cercle." : "Ce décalage est trop grand pour la face.";
    const g = this.geometry(this.face);
    if (!g) return "Ce dessin est impossible (longueur ou rayon nul).";
    const sketch: SketchFeature = { id: this.sketchId, type: "sketch", name: this.sketchName, plane: this.face.plane, offset: Number(this.face.offset.toFixed(6)), ...(this.face.slanted ? { frame: this.face.slanted } : {}), ...g, support: this.face.pick.bodyId };
    return sketch;
  }

  protected override companions(): Feature[] {
    const curved = this.curvedOffset.locked ? this.curvedOffset.features(this.sketchId, this.sketchName) : null;
    return curved && typeof curved !== "string" ? curved.slice(1) : [];
  }

  override confirm(): void {
    if (this.curvedOffset.locked) return super.confirm();
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

  protected rows(): (HTMLElement | null)[] {
    const unit = UNIT_LABELS[this.ctx.unit()];
    const c = this.curvedOffset;
    if (c.locked) {
      const set = (key: "distance" | "depth", v: number) => ((c[key] = v), this.render(), this.schedulePreview());
      return [
        this.numberRow("Décalage", c.distance, this.ctx.unit(), (v) => set("distance", v)),
        this.numberRow("Profondeur", c.depth, this.ctx.unit(), (v) => set("depth", v), true),
        this.info("Un panneau creusé dans la face courbe ou sous les deux pans du toit (un trou s'il traverse) ; profondeur négative : en relief."),
      ];
    }
    const step =
      this.shape === "offset"
        ? "Survolez une face : le contour décalé suit le pointeur (sa distance au bord) ; cliquez pour le poser."
        : this.points.length === 0
          ? "Cliquez sur une face du corps : les distances aux bords les plus proches s'affichent en bas."
          : this.shape === "line"
            ? "Point suivant : cliquez ; Entrée termine."
            : this.shape === "rectangle"
              ? "Cliquez le coin opposé."
              : "Cliquez un point du cercle.";
    return [
      this.selectRow("Tracé", this.shape, SHAPES, (v) => {
        this.shape = v as Shape;
        this.points = [];
        this.face = null;
        this.typed = { ...NOTHING };
        this.buffer = null;
        this.render();
        if (this.lastEvent) this.move(this.lastEvent);
        else this.draw();
      }),
      this.shape === "offset" ? this.selectRow("Décalage sur", last.roof ? "roof" : "face", [["face", "La face survolée"], ["roof", "Tout le toit (les deux pans)"]], (v) => ((last.roof = v === "roof"), this.lastEvent && this.move(this.lastEvent))) : null,
      this.info(step),
      this.closedShape
        ? this.checkRow("Puis tirer / pousser", this.thenPull, (v) => {
            this.thenPull = v;
          })
        : null,
      this.info(`Les mesures s'affichent en bas : tapez-les au clavier (en ${unit}, « ; » entre deux valeurs) puis Entrée. Échap reprend le tracé.`),
    ];
  }

  protected override dispose(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.box.dispose();
    this.marks.clear();
    this.ctx.viewport.setHoverHighlight(null);
  }
}
