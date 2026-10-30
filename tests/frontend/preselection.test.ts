/** Pré-sélection : ce qu'un clic choisirait s'éclaire sous la souris (face, arête, point), et s'éteint ailleurs. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BodyObject } from "../../frontend/src/viewport/body-layer";
import { Preselection } from "../../frontend/src/viewport/preselection";
import { THIN_CROSSHAIR } from "../../frontend/src/ui/cursor";

/** A body of two triangles (one face) and one edge. */
function body(): BodyObject {
  const vertices = Float32Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]);
  const indices = Uint32Array.from([0, 1, 2, 0, 2, 3]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const data = {
    bodyId: "b1",
    vertices,
    normals: new Float32Array(12),
    indices,
    faceGroups: [{ start: 0, count: 6, faceId: 0 }],
    edges: Float32Array.from([0, 0, 0, 10, 0, 0]),
    edgeGroups: [{ start: 0, count: 2 }],
    metrics: {} as never,
  };
  return { mesh: new THREE.Mesh(geometry), edges: new THREE.LineSegments(), data, tint: new THREE.MeshBasicMaterial() } as BodyObject;
}

const group = (scene: THREE.Scene) => scene.children[0] as THREE.Group;

describe("pré-sélection sous la souris", () => {
  const bodies = new Map([["b1", body()]]);

  it("une face, une arête ou un point s'éclaire ; rien ailleurs", () => {
    const scene = new THREE.Scene();
    const pre = new Preselection(scene);
    pre.show({ kind: "face", pick: { bodyId: "b1", faceIndex: 0, point: new THREE.Vector3() } }, bodies);
    expect(group(scene).children).toHaveLength(1);
    pre.show({ kind: "edge", pick: { bodyId: "b1", edgeIndex: 0 } }, bodies);
    expect(group(scene).children).toHaveLength(1);
    expect(group(scene).children[0]!.userData.fat).toBe(true);
    pre.show({ kind: "vertex", pick: { bodyId: "b1", point: [0, 0, 0] } }, bodies);
    expect(group(scene).children[0]).toBeInstanceOf(THREE.Points);
    pre.show(null, bodies);
    expect(group(scene).children).toHaveLength(0);
  });

  it("le même élément sous la souris n'est pas redessiné à chaque mouvement", () => {
    const scene = new THREE.Scene();
    const pre = new Preselection(scene);
    const face = { kind: "face" as const, pick: { bodyId: "b1", faceIndex: 0, point: new THREE.Vector3() } };
    pre.show(face, bodies);
    const first = group(scene).children[0];
    pre.show({ ...face, pick: { ...face.pick } }, bodies);
    expect(group(scene).children[0]).toBe(first);
  });

  it("filtre « Corps » : tout le corps s'éclaire", () => {
    const scene = new THREE.Scene();
    const pre = new Preselection(scene);
    pre.show({ kind: "face", pick: { bodyId: "b1", faceIndex: 0, point: new THREE.Vector3() } }, bodies, true);
    expect((group(scene).children[0] as THREE.Mesh).geometry).toBe(bodies.get("b1")!.mesh.geometry);
  });
});

describe("curseur de la vue", () => {
  it("une croix fine en image, centrée, avec la croix du système en secours", () => {
    expect(THIN_CROSSHAIR).toMatch(/^url\("data:image\/svg\+xml,.+"\) 8 8, crosshair$/);
  });
});
