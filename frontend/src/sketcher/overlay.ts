/**
 * Three.js rendering of the sketch being edited: curves, points, preview,
 * constraint glyphs and dimension labels (HTML, clickable). Everything is
 * drawn in sketch coordinates inside a group placed on the sketch plane.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { CONSTRAINT_GLYPHS, CONSTRAINT_LABELS } from "../constraints/catalog";
import { constraintRefs, isDimension, ORIGIN, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { findCurve, pointPos, type Vec2 } from "./edit";
import type { SketchFrame } from "./frame";
import { dimensionLayout, outwardNormal, sketchCentre, type Annotation, type AnnotationRole } from "./annotations";
import type { Region } from "./loops";
import type { Preview } from "./tools";

const COLORS = {
  line: 0x1d4ed8,
  construction: 0xf59e0b,
  projected: 0xa855f7,
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
  /** Show the geometric constraint symbols (H, V, ∥…); flagged ones are always shown. */
  showGlyphs: boolean;
  /** Closed regions of the sketch, lightly tinted like a profile. */
  regions: Region[];
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

function material(color: number | THREE.Color, dashed = false): THREE.LineBasicMaterial {
  const m = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, depthTest: false })
    : new THREE.LineBasicMaterial({ color, depthTest: false });
  return m;
}

export class SketchOverlay {
  private group = new THREE.Group();
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

  private polyline(points: Vec2[], color: number | THREE.Color, dashed = false): void {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const line = new THREE.Line(geometry, material(color, dashed));
    if (dashed) line.computeLineDistances();
    line.renderOrder = 10;
    this.group.add(line);
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

    const colorOf = (id: string, construction?: boolean, projected?: boolean) =>
      state.selection.has(id)
        ? COLORS.selected
        : state.hover === id
          ? COLORS.hover
          : projected
            ? COLORS.projected
            : construction
              ? COLORS.construction
              : COLORS.line;
    for (const curve of g.curves) {
      const color = colorOf(curve.id, curve.construction, curve.projected);
      // Projected body edges are reference lines: solid, not dashed.
      const dashed = curve.construction && !curve.projected;
      if (curve.kind === "line") this.polyline([pointPos(g, curve.p1), pointPos(g, curve.p2)], color, dashed);
      else if (curve.kind === "circle") this.polyline(arcPolyline(pointPos(g, curve.center), curve.radius, 0, 2 * Math.PI), color, dashed);
      else {
        const end = curve.endAngle <= curve.startAngle ? curve.endAngle + 2 * Math.PI : curve.endAngle;
        this.polyline(arcPolyline(pointPos(g, curve.center), curve.radius, curve.startAngle, end), color, dashed);
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

    this.renderRegions(state.regions);
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
  private renderRegions(regions: Region[]): void {
    for (const region of regions) {
      const shape = new THREE.Shape(region.outer.map(([x, y]) => new THREE.Vector2(x, y)));
      shape.holes = region.holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.12, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
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
    this.scene.remove(this.group);
  }
}
