/**
 * Three.js rendering of the sketch being edited: curves, points, preview,
 * constraint glyphs and dimension labels (HTML, clickable). Everything is
 * drawn in sketch coordinates inside a group placed on the sketch plane.
 */
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { CONSTRAINT_GLYPHS, CONSTRAINT_LABELS } from "../constraints/catalog";
import { constraintRefs, isDimension, ORIGIN, type SketchConstraint, type SketchGeometry, type SketchUnderlay } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { findCurve, pointPos, type Vec2 } from "./edit";
import type { SketchFrame } from "./frame";
import { dimensionLayout, outwardNormal, sketchCentre, type Annotation, type AnnotationRole } from "./annotations";
import type { Region } from "./loops";
import type { Preview } from "./tools";

/** Widths (screen pixels) of what is drawn: the drawing's own lines are thick, the helpers thin. */
const WIDTH = { curve: 1.6, active: 2.4, preview: 1.4, helper: 1.2, axis: 1 };

const COLORS = {
  /**
   * A line that can still move (blue), one the constraints hold entirely: near white on the dark blue view (the
   * view is dark in both themes), as Fusion's dark theme draws it.
   */
  line: 0x1d4ed8,
  fixed: 0xf1f5f9,
  construction: 0xf59e0b,
  projected: 0xa855f7,
  /** The chosen lines and points. */
  selected: 0x63df0f,
  /** The line under the pointer (the one a click would choose). */
  hover: 0xffd60a,
  /** The closed areas of the sketch. */
  region: 0x2078cf,
  preview: 0x0ea5e9,
  /** Where "Couper" will cut. */
  cut: 0xef4444,
  point: 0x111827,
  axis: 0x94a3b8,
};

export interface OverlayState {
  geometry: SketchGeometry;
  selection: ReadonlySet<string>;
  hover: string | null;
  preview: Preview | null;
  unit: DisplayUnit;
  /** Constraints reported in conflict/redundant by the solver. */
  flagged: ReadonlySet<string>;
  /** Dimension lines and measurements to draw (see annotations.ts). */
  annotations: Annotation[];
  /** Show the geometric constraint symbols (H, V, ∥…); flagged ones are always shown. */
  showGlyphs: boolean;
  /** Show the free points (black squares at the ends of the lines); else only those pointed at or chosen. */
  showPoints?: boolean;
  /** Closed regions of the sketch, lightly tinted like a profile. */
  regions: Region[];
  /** Where the drawing tool's pointer is snapped: the cross cursor becomes a square there (as in Fusion). */
  snapMark?: SnapMark | null;
  /** Dashed guides of the smart snapping (from the point aligned with to the pointer). */
  guides?: [Vec2, Vec2][];
  /** Size of the view in pixels: the lines are drawn with a width in pixels. */
  resolution?: [number, number];
  /** The closed area under the pointer when no line is, drawn stronger so it can be picked. */
  hoverRegion?: Region | null;
  /** Where "Couper" will cut the curve under the pointer: red crosses, as in Fusion. */
  cutMarks?: Vec2[];
  /** The curves the constraints hold entirely, drawn black (constraints/constraint-state.ts); null: not known. */
  fixed?: ReadonlySet<string> | null;
  /** Outlines of the sketch's texts (the one under the pointer stronger). */
  texts?: { outlines: Vec2[][]; hovered: boolean }[];
}

/** What the pointer is snapped to: a grid point, an existing point or a curve. */
/** The smart snapping: its guides and its mark. */
const SMART_COLOR = 0xd946ef;

export interface SnapMark {
  pos: Vec2;
  kind: "grid" | "point" | "curve" | "middle" | "smart";
}

/** Colours of the dimension roles, from the theme (CSS variables). */
function roleColor(role: AnnotationRole): THREE.Color {
  const styles = getComputedStyle(document.documentElement);
  const name = role === "driving" ? "--sketch-dim" : role === "preview" ? "--sketch-preview" : "--sketch-ref";
  return new THREE.Color(styles.getPropertyValue(name).trim() || "#64748b");
}


function arcPolyline(center: Vec2, radius: number, start: number, end: number, segments = 64): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = start + ((end - start) * i) / segments;
    out.push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
  }
  return out;
}

/** A round dot (white, the colour given by the points): drawn once, shared by every point. */
let dot: THREE.Texture | null = null;
function dotTexture(): THREE.Texture {
  if (dot) return dot;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
  }
  dot = new THREE.CanvasTexture(canvas);
  return dot;
}

export class SketchOverlay {
  private group = new THREE.Group();
  /** The reference image under the sketch, kept from one drawing to the next (made again when it changes). */
  private underlay: { key: string; mesh: THREE.Mesh } | null = null;
  /** Pointer pressed on a dimension text: the sketch mode decides between a click (keypad) and a drag (move it). */
  onAnnotationPointerDown: (annotation: Annotation, event: PointerEvent) => void = () => {};
  /** Click on the symbol of a constraint: the sketch mode selects it (Suppr then deletes the constraint only). */
  onGlyphClick: (constraintId: string) => void = () => {};

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: SketchFrame,
    private readonly worldPerPixel: () => number,
  ) {
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...frame.u),
      new THREE.Vector3(...frame.v),
      new THREE.Vector3(...frame.normal),
    );
    basis.setPosition(new THREE.Vector3(...frame.origin));
    this.group.matrixAutoUpdate = false;
    this.group.matrix.copy(basis);
    this.group.renderOrder = 10;
    scene.add(this.group);
  }

  /** Size of the view (pixels), for the width of the lines. */
  private resolution: [number, number] = [800, 600];

  private polyline(points: Vec2[], color: number | THREE.Color, dashed = false, width = WIDTH.helper, dash = 2): void {
    const geometry = new LineGeometry();
    geometry.setPositions(points.flatMap(([x, y]) => [x, y, 0]));
    const material = new LineMaterial({ color, linewidth: width, dashed, dashSize: dash, gapSize: dash * 0.75, depthTest: false });
    material.resolution.set(this.resolution[0], this.resolution[1]);
    const line = new Line2(geometry, material);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 10;
    this.group.add(line);
  }

  /** The pointer's snap indicator: a square (a diamond on a curve, a triangle on a line's middle) with short arms, a few pixels wide on screen. */
  private snapMarker({ pos, kind }: SnapMark): void {
    const px = this.worldPerPixel();
    const [x, y] = pos;
    const color = kind === "curve" ? 0x16a34a : kind === "smart" ? SMART_COLOR : 0xf97316;
    if (kind === "middle") {
      for (const h of [7 * px, 8 * px]) this.polyline([[x - h, y - h * 0.8], [x + h, y - h * 0.8], [x, y + h], [x - h, y - h * 0.8]], color);
      return;
    }
    const diamond = kind === "curve";
    // Lines are one pixel wide: two nested outlines make a firmer mark.
    for (const half of [6 * px, 7 * px]) {
      const h = diamond ? half * 1.3 : half;
      this.polyline(diamond ? [[x, y + h], [x + h, y], [x, y - h], [x - h, y], [x, y + h]] : [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]], color);
    }
    // The cross the cursor was, kept as four arms around the square.
    const inner = (diamond ? 7 * 1.3 : 7) * px;
    const reach = inner + 7 * px;
    this.polyline([[x - reach, y], [x - inner, y]], color);
    this.polyline([[x + inner, y], [x + reach, y]], color);
    this.polyline([[x, y - reach], [x, y - inner]], color);
    this.polyline([[x, y + inner], [x, y + reach]], color);
  }

  private label(text: string, at: Vec2, className: string, onClick?: (anchor: { x: number; y: number }) => void, title?: string): void {
    const node = document.createElement(onClick ? "button" : "span");
    node.textContent = text;
    node.className = className;
    if (title) node.title = title;
    if (onClick) {
      node.style.pointerEvents = "auto";
      node.addEventListener("pointerdown", (event) => event.stopPropagation());
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        const r = node.getBoundingClientRect();
        onClick({ x: r.right, y: r.top + r.height / 2 });
      });
    }
    const object = new CSS2DObject(node);
    object.position.set(at[0], at[1], 0);
    this.group.add(object);
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      if (child instanceof Line2 || child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  /** The image laid under the sketch, see-through, behind every line. */
  private drawUnderlay(u: SketchUnderlay | undefined): void {
    if (!u) return this.dropUnderlay();
    const key = `${u.image.length}|${u.image.slice(-40)}|${u.x}|${u.y}|${u.width}|${u.height}|${u.opacity}`;
    if (this.underlay?.key !== key) {
      this.dropUnderlay();
      const map = new THREE.TextureLoader().load(u.image);
      map.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: u.opacity, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(u.width, u.height), material);
      mesh.position.set(u.x + u.width / 2, u.y + u.height / 2, -0.05);
      mesh.renderOrder = 1;
      this.underlay = { key, mesh };
    }
    this.group.add(this.underlay!.mesh);
  }

  private dropUnderlay(): void {
    if (!this.underlay) return;
    const { mesh } = this.underlay;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
    this.underlay = null;
  }

  render(state: OverlayState): void {
    if (state.resolution) this.resolution = state.resolution;
    this.clear();
    const g = state.geometry;
    this.drawUnderlay(g.underlay);
    const extent = 1e4;
    this.polyline([[-extent, 0], [extent, 0]], COLORS.axis, true, WIDTH.axis);
    this.polyline([[0, -extent], [0, extent]], COLORS.axis, true, WIDTH.axis);

    const colorOf = (id: string, construction?: boolean, projected?: boolean) =>
      state.selection.has(id)
        ? COLORS.selected
        : state.hover === id
          ? COLORS.hover
          : projected
            ? COLORS.projected
            : construction
              ? COLORS.construction
              : state.fixed?.has(id)
                ? COLORS.fixed
                : COLORS.line;
    for (const curve of g.curves) {
      const color = colorOf(curve.id, curve.construction, curve.projected);
      // Projected body edges are reference lines: solid, not dashed.
      const dashed = curve.construction && !curve.projected;
      const active = state.selection.has(curve.id) || state.hover === curve.id;
      const width = active ? WIDTH.active : dashed ? WIDTH.preview : WIDTH.curve;
      if (curve.kind === "line") this.polyline([pointPos(g, curve.p1), pointPos(g, curve.p2)], color, dashed, width);
      else if (curve.kind === "circle") this.polyline(arcPolyline(pointPos(g, curve.center), curve.radius, 0, 2 * Math.PI), color, dashed, width);
      else {
        const end = curve.endAngle <= curve.startAngle ? curve.endAngle + 2 * Math.PI : curve.endAngle;
        this.polyline(arcPolyline(pointPos(g, curve.center), curve.radius, curve.startAngle, end), color, dashed, width);
      }
    }

    if (state.preview) {
      for (const [a, b] of state.preview.lines) this.polyline([a, b], COLORS.preview, true, WIDTH.preview);
      for (const c of state.preview.circles) this.polyline(arcPolyline(c.center, c.radius, 0, 2 * Math.PI), COLORS.preview, true, WIDTH.preview);
      for (const a of state.preview.arcs) this.polyline(arcPolyline(a.center, a.radius, a.start, a.end), COLORS.preview, true, WIDTH.preview);
    }

    for (const text of state.texts ?? []) for (const outline of text.outlines) this.polyline(outline, text.hovered ? COLORS.hover : COLORS.line, false, text.hovered ? WIDTH.active : WIDTH.helper);
    // The guides of the smart snapping: dashes of a few pixels, whatever the zoom.
    for (const guide of state.guides ?? []) this.polyline(guide, SMART_COLOR, true, WIDTH.helper, 5 * this.worldPerPixel());
    if (state.snapMark) this.snapMarker(state.snapMark);
    for (const [x, y] of state.cutMarks ?? []) {
      const h = 6 * this.worldPerPixel();
      this.polyline([[x - h, y - h], [x + h, y + h]], COLORS.cut, false, WIDTH.active);
      this.polyline([[x - h, y + h], [x + h, y - h]], COLORS.cut, false, WIDTH.active);
    }

    // The free points are not drawn unless asked: they stay pickable, and show when pointed at or chosen. The origin,
    // the points of the body edges (violet, fixed) and the ones pointed at or chosen always show.
    const shown = (p: { id: string; fixed?: boolean }) => state.showPoints || p.id === ORIGIN || p.fixed || state.selection.has(p.id) || state.hover === p.id;
    const points = [{ id: ORIGIN, x: 0, y: 0 }, ...g.points].filter(shown);
    const positions = points.flatMap((p) => [p.x, p.y, 0]);
    const colors = points.flatMap((p) => {
      const c = new THREE.Color(state.selection.has(p.id) ? COLORS.selected : state.hover === p.id ? COLORS.hover : p.fixed ? COLORS.projected : COLORS.point);
      return [c.r, c.g, c.b];
    });
    // Round dots: the points of the bodies (violet) small, the others (the origin, those pointed at or chosen) larger.
    const small = (p: { id: string; fixed?: boolean }) => !!p.fixed && !state.selection.has(p.id) && state.hover !== p.id;
    for (const [list, size] of [[points.filter((p) => !small(p)), 9], [points.filter(small), 6]] as const) {
      if (!list.length) continue;
      const at = list.map((p) => points.indexOf(p));
      const pointGeometry = new THREE.BufferGeometry();
      pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(at.flatMap((i) => positions.slice(3 * i, 3 * i + 3)), 3));
      pointGeometry.setAttribute("color", new THREE.Float32BufferAttribute(at.flatMap((i) => colors.slice(3 * i, 3 * i + 3)), 3));
      const pointObject = new THREE.Points(
        pointGeometry,
        new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthTest: false, map: dotTexture(), alphaTest: 0.5, transparent: true }),
      );
      pointObject.renderOrder = 11;
      this.group.add(pointObject);
    }

    this.renderRegions(state.regions, state.hoverRegion ?? null);
    this.renderConstraints(state);
    for (const annotation of state.annotations) {
      this.renderAnnotation(annotation, state.flagged, !!annotation.dimensionId && state.selection.has(annotation.dimensionId));
    }
  }

  private segment(a: Vec2, b: Vec2, color: THREE.Color): void {
    this.polyline([a, b], color);
  }

  /** Arrowhead at `tip` pointing along `dir` (unit), sized in screen pixels. */
  private arrowhead(tip: Vec2, dir: Vec2, color: THREE.Color): void {
    const px = this.worldPerPixel();
    const l = 8 * px;
    const w = 2.5 * px;
    const back: Vec2 = [tip[0] - dir[0] * l, tip[1] - dir[1] * l];
    const n: Vec2 = [-dir[1], dir[0]];
    this.polyline([[back[0] + n[0] * w, back[1] + n[1] * w], tip, [back[0] - n[0] * w, back[1] - n[1] * w]], color);
  }

  /** Light tint of the closed regions (the profiles an extrusion would use). */
  private renderRegions(regions: Region[], hovered: Region | null): void {
    // An area nested in a hole is not tinted by default, but is drawn when it is the one under the pointer.
    for (const region of hovered && !regions.includes(hovered) ? [...regions, hovered] : regions) {
      const shape = new THREE.Shape(region.outer.map(([x, y]) => new THREE.Vector2(x, y)));
      shape.holes = region.holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: COLORS.region, transparent: true, opacity: region === hovered ? 0.5 : 0.28, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.renderOrder = 9;
      this.group.add(mesh);
    }
  }

  /**
   * Dimension text, drawing style: no box, coloured by role, rotated along the
   * dimension line, between parentheses when it is only a measurement.
   */
  private dimensionText(a: Annotation, at: Vec2, angleDeg: number, flagged: boolean): void {
    const text = a.role === "measure" || a.role === "reference" ? `(${a.text})` : a.text;
    const node = document.createElement("span");
    node.className = `cad-dim cad-dim-${a.role}${flagged ? " cad-flagged" : ""}`;
    const inner = document.createElement("span");
    inner.textContent = text;
    inner.style.display = "inline-block";
    inner.style.transform = `rotate(${-angleDeg}deg)`;
    if (a.field) {
      // A measurement one types (as Fusion's): a field, upright; the one in blue takes the keys, a kept one has its
      // lock; a click opens the calculator on it.
      node.className = `cad-dim cad-dim-field cad-dim-field-${a.field.state}`;
      node.dataset.dimField = a.field.id;
      node.dataset.state = a.field.state;
      node.title = `${a.field.name} : tapez une valeur (ou cliquez pour la calculatrice), Tab pour la garder et passer à la suivante, Entrée pour poser la forme`;
      inner.style.transform = "";
      node.style.pointerEvents = "auto";
      node.style.cursor = "pointer";
      node.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.onAnnotationPointerDown(a, event);
      });
    }
    node.append(inner);
    if (a.role !== "preview") {
      node.style.pointerEvents = "auto";
      node.title = a.role === "driving" ? "Cliquer : modifier la valeur — glisser : déplacer la cote" : "Cliquer : poser cette cote";
      node.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.onAnnotationPointerDown(a, event);
      });
    }
    const object = new CSS2DObject(node);
    object.position.set(at[0], at[1], 0);
    this.group.add(object);
  }

  private renderAnnotation(a: Annotation, flagged: ReadonlySet<string>, selected: boolean): void {
    const layout = dimensionLayout(a.shape, this.worldPerPixel());
    const color = selected ? new THREE.Color(COLORS.selected) : roleColor(a.role);
    for (const [from, to] of layout.lines) this.segment(from, to, color);
    for (const { tip, dir } of layout.arrows) this.arrowhead(tip, dir, color);
    const isFlagged = !!a.dimensionId && flagged.has(a.dimensionId);
    this.dimensionText(a, layout.text.at, layout.text.angle, isFlagged || selected);
  }

  /** Middle of the entities a constraint refers to, offset slightly so labels do not hide geometry. */
  private anchor(g: SketchGeometry, c: SketchConstraint, slot: number): Vec2 {
    const refPos = (id: string): Vec2 => {
      const curve = findCurve(g, id);
      if (!curve) return id === "axisX" || id === "axisY" ? [0, 0] : pointPos(g, id);
      if (curve.kind === "line") {
        const [a, b] = [pointPos(g, curve.p1), pointPos(g, curve.p2)];
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      }
      const center = pointPos(g, curve.center);
      const angle = curve.kind === "arc" ? (curve.startAngle + curve.endAngle) / 2 : Math.PI / 4;
      return [center[0] + curve.radius * Math.cos(angle), center[1] + curve.radius * Math.sin(angle)];
    };
    const refs = constraintRefs(c).slice(0, 2);
    const positions = refs.map(refPos);
    const x = positions.reduce((s, p) => s + p[0], 0) / positions.length;
    const y = positions.reduce((s, p) => s + p[1], 0) / positions.length;
    const px = this.worldPerPixel();
    if (slot < 0) return [x, y];
    // Glyphs of a single line sit on its inner side (dimension lines are drawn outside),
    // stacked along the line when there are several.
    const line = refs.length === 1 ? findCurve(g, refs[0] as string) : undefined;
    if (line?.kind === "line") {
      const [a, b] = [pointPos(g, line.p1), pointPos(g, line.p2)];
      const out = outwardNormal(a, b, sketchCentre(g));
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const along: Vec2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      const shift = 18 * slot * px;
      return [x - out[0] * 16 * px + along[0] * shift, y - out[1] * 16 * px + along[1] * shift];
    }
    return [x + (12 + 18 * slot) * px, y - 14 * px];
  }

  private renderConstraints(state: OverlayState): void {
    const g = state.geometry;
    const slots = new Map<string, number>();
    for (const c of g.constraints) {
      let at: Vec2;
      try {
        // Glyphs referring to the same entities take successive slots.
        const key = constraintRefs(c).slice(0, 2).join("|");
        const slot = isDimension(c) ? -1 : (slots.get(key) ?? 0);
        if (!isDimension(c)) slots.set(key, slot + 1);
        at = this.anchor(g, c, slot);
      } catch {
        continue;
      }
      const flagged = state.flagged.has(c.id);
      if (isDimension(c)) continue; // drawn as annotations
      const selected = state.selection.has(c.id);
      // Symbols on demand, except a coincidence (it marks a point, it does not clutter), problems and the selected one.
      if (!state.showGlyphs && !flagged && !selected && c.kind !== "coincident") continue;
      const glyph = CONSTRAINT_GLYPHS[c.kind];
      const title = `${CONSTRAINT_LABELS[c.kind] ?? c.kind} — cliquer pour sélectionner, Suppr pour supprimer la contrainte`;
      if (glyph) this.label(glyph, at, `cad-glyph${flagged ? " cad-flagged" : ""}${selected ? " cad-selected" : ""}`, () => this.onGlyphClick(c.id), title);
    }
  }

  dispose(): void {
    this.clear();
    this.dropUnderlay();
    this.scene.remove(this.group);
  }
}
