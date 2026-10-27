/** What a click would select, shown in green: whole bodies (edges over everything, faces tinted), or one face. */
import * as THREE from "three";
import type { BodyObject } from "./body-layer";
import type { FacePick } from "./selection-layer";

export class HoverHighlight {
  private outline: THREE.Group | null = null;
  private line = new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false, transparent: true, opacity: 0.95 });
  private tint = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide });

  constructor(private readonly scene: THREE.Scene) {}

  materials(): THREE.Material[] {
    return [this.tint, this.line];
  }

  /** Shows this target (null removes it). */
  set(target: { bodies: string[] } | { face: FacePick } | null, bodies: ReadonlyMap<string, BodyObject>): void {
    if (this.outline) {
      this.scene.remove(this.outline);
      // Geometries made for a face are released; those of whole bodies belong to the bodies.
      this.outline.traverse((o) => o.userData.own && (o as THREE.Mesh).geometry.dispose());
      this.outline = null;
    }
    if (!target) return;
    const group = new THREE.Group();
    if ("face" in target) {
      const body = bodies.get(target.face.bodyId);
      const range = body?.data.faceGroups[target.face.faceIndex];
      if (!body || !range) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", body.mesh.geometry.getAttribute("position"));
      geometry.setIndex(new THREE.BufferAttribute(body.data.indices.slice(range.start, range.start + range.count), 1));
      const tint = new THREE.Mesh(geometry, this.tint);
      tint.userData.own = true;
      tint.renderOrder = 44;
      group.add(tint);
    } else {
      for (const id of target.bodies) {
        const body = bodies.get(id);
        if (!body) continue;
        const edges = new THREE.LineSegments(body.edges.geometry, this.line);
        edges.renderOrder = 45;
        const tint = new THREE.Mesh(body.mesh.geometry, this.tint);
        tint.renderOrder = 44;
        group.add(tint, edges);
      }
    }
    this.outline = group;
    this.scene.add(group);
  }
}
