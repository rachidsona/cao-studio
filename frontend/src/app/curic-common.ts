/**
 * Shared by the Curic tools (Symétrie, Aligner, Étirer): the box around
 * displayed bodies, the plane drawn in the view, and fresh ids and names for
 * several features made at once.
 */
import * as THREE from "three";
import { uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type Axis, type CadDocument, type Vec3 } from "../document/types";
import type { Box } from "../features/curic";
import type { Viewport } from "../viewport/viewport";

export const AXIS_OPTIONS: [string, string][] = [
  ["0", "X — largeur (gauche ↔ droite)"],
  ["1", "Y — profondeur (avant ↔ arrière)"],
  ["2", "Z — hauteur (bas ↔ haut)"],
];

/** Box around these displayed bodies (model coordinates, mm), or null when none is displayed. */
export function boxOfBodies(viewport: Viewport, ids: string[]): Box | null {
  let box: Box | null = null;
  for (const id of ids) {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    if (!b) continue;
    const [min, max] = b;
    box = box
      ? [
          [0, 1, 2].map((i) => Math.min(box![0][i] as number, min[i] as number)) as Vec3,
          [0, 1, 2].map((i) => Math.max(box![1][i] as number, max[i] as number)) as Vec3,
        ]
      : [[min[0], min[1], min[2]], [max[0], max[1], max[2]]];
  }
  return box;
}

/** Box around several boxes (null ones left out), or null when there is none. */
export function unionBox(boxes: (Box | null)[]): Box | null {
  const present = boxes.filter((b): b is Box => b !== null);
  if (present.length === 0) return null;
  return [
    [0, 1, 2].map((i) => Math.min(...present.map((b) => b[0][i] as number))) as Vec3,
    [0, 1, 2].map((i) => Math.max(...present.map((b) => b[1][i] as number))) as Vec3,
  ];
}

/** `n` ids ("al1", "al2"…) and names ("Alignement 1"…) unused in the document and among themselves. */
export function freshFeatureIds(doc: CadDocument, prefix: string, base: string, n: number): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  let probe: CadDocument = doc;
  for (let i = 0; i < n; i++) {
    const entry = { id: uniqueId(probe, prefix), name: uniqueName(probe, base) };
    out.push(entry);
    probe = { ...probe, features: [...probe.features, { id: entry.id, name: entry.name, type: "sketch", plane: "XY", offset: 0, points: [], curves: [], constraints: [] }] };
  }
  return out;
}

/**
 * Several bodies chosen one after the other for one OK: a click on a body not chosen adds it (changing a step: it
 * replaces the one), Maj + clic on a chosen one — or on its preview, the body of a step whose id is in `ids`, in the
 * order of `targets` — takes it off.
 */
export function chooseBody(targets: readonly string[], bodyId: string, ids: readonly string[], remove: boolean, editing: boolean): string[] {
  const own = targets.indexOf(bodyId);
  const at = own >= 0 ? own : ids.indexOf(featureOfBody(bodyId));
  if (at >= 0 && at < targets.length) return remove && !editing ? targets.filter((_, i) => i !== at) : [...targets];
  return editing ? [bodyId] : [...targets, bodyId];
}

/** Maj, Ctrl or Cmd held with a click: a chosen body taken off. */
export const removing = (event: PointerEvent): boolean => event.shiftKey || event.ctrlKey || event.metaKey;

/** A translucent plane perpendicular to an axis, drawn across a box (where a mirror or a stretch happens). */
export class PlaneMarker {
  private mesh: THREE.Mesh | null = null;

  constructor(private readonly viewport: Viewport) {}

  show(axis: Axis, position: number, box: Box | null): void {
    this.hide();
    if (!box) return;
    const [u, v] = ([0, 1, 2] as const).filter((i) => i !== axis) as [number, number];
    const margin = 0.15 * Math.max((box[1][u] as number) - (box[0][u] as number), (box[1][v] as number) - (box[0][v] as number), 20);
    const lo = (i: number) => (box[0][i] as number) - margin;
    const hi = (i: number) => (box[1][i] as number) + margin;
    const corner = (a: number, b: number): THREE.Vector3 => {
      const p: Vec3 = [0, 0, 0];
      p[axis] = position;
      p[u] = a;
      p[v] = b;
      return new THREE.Vector3(...p);
    };
    const geometry = new THREE.BufferGeometry().setFromPoints([corner(lo(u), lo(v)), corner(hi(u), lo(v)), corner(hi(u), hi(v)), corner(lo(u), lo(v)), corner(hi(u), hi(v)), corner(lo(u), hi(v))]);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    this.mesh.renderOrder = 30;
    this.viewport.scene.add(this.mesh);
  }

  hide(): void {
    if (!this.mesh) return;
    this.viewport.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }
}

/** A green dot in the view (the pivot of a rotation). */
export class PointMarker {
  private dot: THREE.Points | null = null;

  constructor(private readonly viewport: Viewport) {}

  show(at: Vec3 | null): void {
    this.hide();
    if (!at) return;
    this.dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...at)]), new THREE.PointsMaterial({ color: 0x16a34a, size: 16, sizeAttenuation: false, depthTest: false }));
    this.dot.renderOrder = 48;
    this.viewport.scene.add(this.dot);
  }

  hide(): void {
    if (!this.dot) return;
    this.viewport.scene.remove(this.dot);
    this.dot.geometry.dispose();
    (this.dot.material as THREE.Material).dispose();
    this.dot = null;
  }
}
