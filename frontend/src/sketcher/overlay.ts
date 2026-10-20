/**
 * Three.js rendering of the sketch being edited: curves, points, preview,
 * constraint glyphs and dimension labels (HTML, clickable). Everything is
 * drawn in sketch coordinates inside a group placed on the sketch plane.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { CONSTRAINT_GLYPHS } from "../constraints/catalog";
import { constraintRefs, isDimension, ORIGIN, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { findCurve, pointPos, type Vec2 } from "./edit";
import type { SketchFrame } from "./frame";
import type { Annotation, AnnotationRole } from "./annotations";
import type { Preview } from "./tools";

const COLORS = {
  line: 0x1d4ed8,
  construction: 0xf59e0b,
  selected: 0xe11d48,
  hover: 0x0ea5e9,
  preview: 0x0ea5e9,
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
}

const ROLE_COLORS: Record<AnnotationRole, number> = {
  driving: 0x0284c7,
  reference: 0x64748b,
  measure: 0x64748b,
  preview: 0x0ea5e9,
};

function arcPolyline(center: Vec2, radius: number, start: number, end: number, segments = 64): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = start + ((end - start) * i) / segments;
    out.push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
  }
  return out;
}

function material(color: number, dashed = false): THREE.LineBasicMaterial {
  const m = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, depthTest: false })
    : new THREE.LineBasicMaterial({ color, depthTest: false });
  return m;
}

export class SketchOverlay {
  private group = new THREE.Group();
  onAnnotationClick: (annotation: Annotation, anchor: { x: number; y: number }) => void = () => {};

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

  private polyline(points: Vec2[], color: number, dashed = false): void {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const line = new THREE.Line(geometry, material(color, dashed));
    if (dashed) line.computeLineDistances();
    line.renderOrder = 10;
    this.group.add(line);
  }

  private label(text: string, at: Vec2, className: string, onClick?: (anchor: { x: number; y: number }) => void): void {
    const node = document.createElement(onClick ? "button" : "span");
    node.textContent = text;
    node.className = className;
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
      if (child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  render(state: OverlayState): void {
    this.clear();
    const g = state.geometry;
    const extent = 1e4;
    this.polyline([[-extent, 0], [extent, 0]], COLORS.axis, true);
    this.polyline([[0, -extent], [0, extent]], COLORS.axis, true);

    const colorOf = (id: string, construction?: boolean) =>
      state.selection.has(id) ? COLORS.selected : state.hover === id ? COLORS.hover : construction ? COLORS.construction : COLORS.line;
    for (const curve of g.curves) {
      const color = colorOf(curve.id, curve.construction);
      if (curve.kind === "line") this.polyline([pointPos(g, curve.p1), pointPos(g, curve.p2)], color, curve.construction);
      else if (curve.kind === "circle") this.polyline(arcPolyline(pointPos(g, curve.center), curve.radius, 0, 2 * Math.PI), color, curve.construction);
      else {
        const end = curve.endAngle <= curve.startAngle ? curve.endAngle + 2 * Math.PI : curve.endAngle;
        this.polyline(arcPolyline(pointPos(g, curve.center), curve.radius, curve.startAngle, end), color, curve.construction);
      }
    }

    if (state.preview) {
      for (const [a, b] of state.preview.lines) this.polyline([a, b], COLORS.preview, true);
      for (const c of state.preview.circles) this.polyline(arcPolyline(c.center, c.radius, 0, 2 * Math.PI), COLORS.preview, true);
      for (const a of state.preview.arcs) this.polyline(arcPolyline(a.center, a.radius, a.start, a.end), COLORS.preview, true);
    }

    const points = [{ id: ORIGIN, x: 0, y: 0 }, ...g.points];
    const positions = points.flatMap((p) => [p.x, p.y, 0]);
    const colors = points.flatMap((p) => {
      const c = new THREE.Color(state.selection.has(p.id) ? COLORS.selected : state.hover === p.id ? COLORS.hover : COLORS.point);
      return [c.r, c.g, c.b];
    });
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    pointGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const pointObject = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, depthTest: false }),
    );
    pointObject.renderOrder = 11;
    this.group.add(pointObject);

    this.renderConstraints(state);
    for (const annotation of state.annotations) this.renderAnnotation(annotation, state.flagged);
  }

  private segment(a: Vec2, b: Vec2, color: number): void {
    this.polyline([a, b], color);
  }

  /** Arrowhead at `tip` pointing along `dir` (unit), sized in screen pixels. */
  private arrowhead(tip: Vec2, dir: Vec2, color: number): void {
    const px = this.worldPerPixel();
    const l = 9 * px;
    const w = 3.5 * px;
    const back: Vec2 = [tip[0] - dir[0] * l, tip[1] - dir[1] * l];
    const n: Vec2 = [-dir[1], dir[0]];
    this.polyline([[back[0] + n[0] * w, back[1] + n[1] * w], tip, [back[0] - n[0] * w, back[1] - n[1] * w]], color);
  }

  private renderAnnotation(a: Annotation, flagged: ReadonlySet<string>): void {
    const px = this.worldPerPixel();
    const color = ROLE_COLORS[a.role];
    const shape = a.shape;
    const className = `${a.role === "driving" ? "cad-dimension" : "cad-measure"}${a.dimensionId && flagged.has(a.dimensionId) ? " cad-flagged" : ""}`;
    const click = a.role === "preview" ? undefined : (anchor: { x: number; y: number }) => this.onAnnotationClick(a, anchor);
    if (shape.kind === "label") {
      this.label(a.text, shape.at, className, click);
      return;
    }
    if (shape.kind === "radial") {
      const dir: Vec2 = [Math.cos(shape.angle), Math.sin(shape.angle)];
      const rim: Vec2 = [shape.center[0] + dir[0] * shape.radius, shape.center[1] + dir[1] * shape.radius];
      const start: Vec2 = shape.diameter ? [shape.center[0] - dir[0] * shape.radius, shape.center[1] - dir[1] * shape.radius] : shape.center;
      const outside: Vec2 = [rim[0] + dir[0] * 28 * px, rim[1] + dir[1] * 28 * px];
      this.segment(start, outside, color);
      this.arrowhead(rim, dir, color);
      if (shape.diameter) this.arrowhead(start, [-dir[0], -dir[1]], color);
      this.label(a.text, [outside[0] + dir[0] * 8 * px, outside[1] + dir[1] * 8 * px], className, click);
      return;
    }
    // Linear: extension lines from both points to a common dimension line offset along the normal.
    const { p1, p2, normal } = shape;
    const offset = 26 * px;
    const level = Math.max(p1[0] * normal[0] + p1[1] * normal[1], p2[0] * normal[0] + p2[1] * normal[1]) + offset;
    const lift = (p: Vec2): Vec2 => {
      const k = level - (p[0] * normal[0] + p[1] * normal[1]);
      return [p[0] + normal[0] * k, p[1] + normal[1] * k];
    };
    const d1 = lift(p1);
    const d2 = lift(p2);
    const over = 5 * px;
    const gap = 3 * px;
    this.segment([p1[0] + normal[0] * gap, p1[1] + normal[1] * gap], [d1[0] + normal[0] * over, d1[1] + normal[1] * over], color);
    this.segment([p2[0] + normal[0] * gap, p2[1] + normal[1] * gap], [d2[0] + normal[0] * over, d2[1] + normal[1] * over], color);
    this.segment(d1, d2, color);
    const len = Math.hypot(d2[0] - d1[0], d2[1] - d1[1]);
    if (len > 1e-9) {
      const dir: Vec2 = [(d2[0] - d1[0]) / len, (d2[1] - d1[1]) / len];
      this.arrowhead(d2, dir, color);
      this.arrowhead(d1, [-dir[0], -dir[1]], color);
    }
    this.label(a.text, [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2], className, click);
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
    // Dimensions sit on their entity; glyphs are stacked beside it so labels never overlap.
    const px = this.worldPerPixel();
    if (slot < 0) return [x, y];
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
      const glyph = CONSTRAINT_GLYPHS[c.kind];
      if (glyph) this.label(glyph, at, `cad-glyph${flagged ? " cad-flagged" : ""}`);
    }
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
  }
}
