/**
 * Pre-selection (as in Fusion): what a click would select, lit while the pointer is over it — a face tinted, an edge
 * or a line of a sketch drawn wide, a point marked — in a light blue, apart from the green of the selection. The
 * filter of the selection decides what it is (Auto, Faces, Arêtes, Points, Corps), as for the click.
 */
import * as THREE from "three";
import type { BodyObject } from "./body-layer";
import type { Candidate } from "./click-candidates";
import { edgePoints } from "./edge-geometry";
import { disposeFat, fatSegments, polylineSegments } from "./fat-lines";

/** The colour of what is under the pointer. */
export const PRESELECT = 0x38bdf8;

export class Preselection {
  private readonly group = new THREE.Group();
  private key = "";
  private readonly tint = new THREE.MeshBasicMaterial({ color: PRESELECT, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide });

  constructor(private readonly scene: THREE.Scene) {
    this.group.renderOrder = 38;
    scene.add(this.group);
  }

  /** Shows what a click would select (null: nothing); `body` lights the whole body of a face (filter « Corps »). */
  show(candidate: Candidate | null, bodies: ReadonlyMap<string, BodyObject>, body = false): void {
    const key = candidate ? `${candidate.kind}:${JSON.stringify("pick" in candidate ? candidate.pick : candidate.id)}:${body}` : "";
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!candidate) return;
    if (candidate.kind === "face") {
      const owner = bodies.get(candidate.pick.bodyId);
      if (!owner) return;
      if (body) return void this.add(new THREE.Mesh(owner.mesh.geometry, this.tint));
      const range = owner.data.faceGroups[candidate.pick.faceIndex];
      if (!range) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", owner.mesh.geometry.getAttribute("position"));
      geometry.setIndex(new THREE.BufferAttribute(owner.data.indices.slice(range.start, range.start + range.count), 1));
      const face = new THREE.Mesh(geometry, this.tint);
      face.userData.own = true;
      this.add(face);
    } else if (candidate.kind === "edge") {
      const owner = bodies.get(candidate.pick.bodyId);
      if (owner) this.add(fatSegments(edgePoints(owner.data, candidate.pick.edgeIndex), PRESELECT, 2.5));
    } else if (candidate.kind === "vertex") {
      this.add(point(new THREE.Vector3(...candidate.pick.point)));
    } else if (candidate.kind === "item") {
      const points = candidate.pick.points.map((p) => new THREE.Vector3(...p));
      if (candidate.pick.kind === "curve") this.add(fatSegments(polylineSegments(points), PRESELECT, 2.5));
      else if (candidate.pick.kind === "point" && points[0]) this.add(point(points[0]));
    }
  }

  private add(object: THREE.Object3D): void {
    object.renderOrder = 38;
    this.group.add(object);
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child.userData.fat) disposeFat(child as Parameters<typeof disposeFat>[0]);
      else if (child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      } else if (child.userData.own) (child as THREE.Mesh).geometry.dispose();
    }
  }

  /** Forgets what was shown (the bodies were made again). */
  reset(): void {
    this.key = "";
    this.clear();
  }
}

/** A point of a body or a sketch, marked by a light-blue dot of constant size. */
function point(at: THREE.Vector3): THREE.Points {
  const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([at]), new THREE.PointsMaterial({ color: PRESELECT, size: 12, sizeAttenuation: false, depthTest: false }));
  dot.renderOrder = 39;
  return dot;
}
