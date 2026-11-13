/**
 * What the "Truelle" tool draws in the view, right away (before the kernel's
 * preview): the start in orange (an edge, or a dot on a corner), the band's
 * lines in red as in Curic DIO, the distances from the line to the face's
 * boundary on both sides, and the level aimed at in green. Also what it aims
 * at while pulling: a corner or an edge of a body, whose level stops the pull.
 */
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { disposeFat, fatSegments } from "../viewport/fat-lines";
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Vec3 } from "../document/types";
import { axisParameter } from "../viewport/axis-drag";
import type { FacePick, Viewport } from "../viewport/viewport";
import { findFeature } from "../document/operations";
import type { CadDocument, PlaneFrame, SketchFeature } from "../document/types";
import type { GeometryClient } from "../geometry/client";
import type { FaceOutline } from "../geometry/protocol";
import type { Vec2 } from "../sketcher/edit";
import { facePolygon } from "../sketcher/face-strip";
import { frameOf, nearestPlane, planeFrame, sketchFrame, toWorld, type SketchFrame } from "../sketcher/frame";
import { interiorPoint } from "../sketcher/loops";
import { sketchRegions } from "../sketcher/polylines";
import { planeForFace } from "../sketcher/projection";

/** A planar face the Truelle works on (or a closed area of a sketch, seen the same way). */
export interface LoadedFace {
  key: string;
  pick: FacePick;
  outline: FaceOutline;
  frame: SketchFrame;
  plane: SketchFeature["plane"];
  offset: number;
  polygon: Vec2[];
  /** A slanted face (a roof's slope): its own plane, which the sketch drawn on it keeps. */
  slanted?: PlaneFrame;
}

/** The face of a pick, with its outline as a polygon in its own plane (a slanted face in a plane of its own); null when it is curved. */
export async function loadFace(geometry: GeometryClient, key: string, pick: FacePick): Promise<LoadedFace | null> {
  try {
    const outline = await geometry.faceOutline(pick.bodyId, pick.faceIndex);
    if (outline.surface !== "PLANE") return null;
    const placement = planeForFace(outline.normal, outline.center);
    if (placement) {
      const frame = sketchFrame(placement.plane, placement.offset);
      const polygon = facePolygon(outline, frame);
      return polygon ? { key, pick, outline, frame, plane: placement.plane, offset: placement.offset, polygon } : null;
    }
    // Slanted: a plane of its own through its centre, its x along its longest straight edge (the eaves of a roof).
    const edges = outline.edges.flatMap((e) => (e.kind === "line" ? [[0, 1, 2].map((i) => e.b[i]! - e.a[i]!) as Vec3] : []));
    const longest = edges.sort((a, b) => Math.hypot(...b) - Math.hypot(...a))[0];
    const slanted = planeFrame(outline.center, outline.normal, longest);
    const frame = frameOf({ plane: nearestPlane(slanted.normal), offset: 0, frame: slanted });
    const polygon = facePolygon(outline, frame);
    return polygon ? { key, pick, outline, frame, plane: nearestPlane(slanted.normal), offset: 0, polygon, slanted } : null;
  } catch {
    return null;
  }
}

/** A closed area of a sketch under the pointer, which the Truelle pulls into a body (or into the body the sketch lies on). */
export interface SketchArea {
  sketchId: string;
  /** A point inside the area (sketch plane): how the extrusion names it. */
  probe: Vec2;
  /** Body the sketch was drawn on: pulling adds to it, pushing digs it. Absent: a new body. */
  support?: string;
}

/** The area of a sketch under the pointer when nothing nearer (a body face closer than `nearerThan`) hides it. */
export function regionUnder(viewport: Viewport, doc: CadDocument, event: PointerEvent, nearerThan: number | null): { face: LoadedFace; area: SketchArea } | null {
  const pick = viewport.pickSketchItem(event, "region", nearerThan);
  const sketch = pick ? findFeature(doc, pick.sketchId) : undefined;
  if (!pick || sketch?.type !== "sketch") return null;
  const region = sketchRegions(sketch)[Number(pick.id)];
  if (!region) return null;
  const frame = frameOf(sketch);
  const probe = interiorPoint({ ...region, loop: -1 }) as Vec2;
  const center = toWorld(frame, probe[0], probe[1]);
  const face: LoadedFace = {
    key: `sketch:${sketch.id}#${pick.id}`,
    pick: { bodyId: sketch.support ?? "", faceIndex: -1, point: new THREE.Vector3(...center) },
    outline: { surface: "PLANE", center, normal: frame.normal, edges: [] },
    frame,
    plane: sketch.plane,
    offset: sketch.offset,
    polygon: region.outer,
  };
  return { face, area: { sketchId: sketch.id, probe, ...(sketch.support ? { support: sketch.support } : {}) } };
}

/** Corners and edge segments of the bodies, as they were when the pull began (the prism being pulled is not there). */
export interface LevelTargets {
  corners: Vec3[];
  segments: [Vec3, Vec3][];
}

export function captureTargets(viewport: Viewport): LevelTargets {
  const segments: [Vec3, Vec3][] = [];
  for (const id of viewport.displayedBodies) {
    const e = viewport.bodyMesh(id)?.edges;
    if (e) for (let i = 0; i + 5 < e.length; i += 6) segments.push([[e[i]!, e[i + 1]!, e[i + 2]!], [e[i + 3]!, e[i + 4]!, e[i + 5]!]]);
  }
  return { corners: viewport.bodyVertices(), segments };
}

/**
 * A corner near the pointer (within `px`), else the point of an edge nearest to it within `px`: a level to stop a
 * pull at, as Fusion's move to a target — on another body or on the same one.
 */
export function aimAt(viewport: Viewport, event: PointerEvent, px: number, targets: LevelTargets): Vec3 | null {
  let best: { point: Vec3; d: number } | null = null;
  for (const v of targets.corners) {
    const d = viewport.screenDistance(event, v);
    if (d <= px && (!best || d < best.d)) best = { point: v, d };
  }
  if (best) return best.point;
  const { origin, direction } = viewport.rayFromEvent(event);
  for (const [a, b] of targets.segments) {
    const t = axisParameter(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], origin, direction);
    const s = t === null ? 0.5 : Math.max(0, Math.min(1, t));
    const p: Vec3 = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
    const d = viewport.screenDistance(event, p);
    if (d <= px * 0.6 && (!best || d < best.d)) best = { point: p, d };
  }
  return best?.point ?? null;
}

/** The edge the line starts from (hovered, then chosen): the colour of what is chosen, a few pixels wide. */
const EDGE_COLOR = 0x63df0f;
const EDGE_WIDTH = 4;

export class StripMarks {
  private readonly group = new THREE.Group();

  constructor(private readonly scene: THREE.Scene) {
    this.group.renderOrder = 46;
    scene.add(this.group);
  }

  /** Replaces everything drawn: the start, the band outline, and labels at points. */
  draw(marks: { edge?: [Vec3, Vec3]; corner?: Vec3; target?: Vec3; band?: Vec3[]; labels?: { at: Vec3; text: string }[] }): void {
    this.clear();
    if (marks.target) {
      const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...marks.target)]), new THREE.PointsMaterial({ color: 0x16a34a, size: 16, sizeAttenuation: false, depthTest: false }));
      dot.renderOrder = 48;
      this.group.add(dot);
    }
    // The edge hovered or started from: green #63df0f, a few pixels wide, readable on any body.
    if (marks.edge) {
      const edge = fatSegments(marks.edge.map((p) => new THREE.Vector3(...p)), EDGE_COLOR, EDGE_WIDTH);
      edge.renderOrder = 47;
      this.group.add(edge);
    }
    if (marks.corner) {
      const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...marks.corner)]), new THREE.PointsMaterial({ color: 0xf97316, size: 14, sizeAttenuation: false, depthTest: false }));
      dot.renderOrder = 47;
      this.group.add(dot);
    }
    if (marks.band && marks.band.length > 1) this.line(marks.band, 0xdc2626, true);
    for (const { at, text } of marks.labels ?? []) {
      const span = document.createElement("span");
      span.className = "cad-measure";
      span.textContent = text;
      const label = new CSS2DObject(span);
      label.position.set(...at);
      this.group.add(label);
    }
  }

  private line(points: Vec3[], color: number, closed: boolean): void {
    const vectors = points.map((p) => new THREE.Vector3(...p));
    if (closed) vectors.push(vectors[0] as THREE.Vector3);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vectors), new THREE.LineBasicMaterial({ color, depthTest: false }));
    line.renderOrder = 46;
    this.group.add(line);
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      else if (child.userData.fat) disposeFat(child as LineSegments2);
      else if (child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
  }
}
