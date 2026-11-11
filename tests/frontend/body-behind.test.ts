/** Un mur de la pièce est dessiné en retrait : un fond ou un meuble collé contre lui, dans son plan, ne le traverse pas par plaques. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BodyMesh } from "../../frontend/src/geometry/protocol";
import { BodyLayer } from "../../frontend/src/viewport/body-layer";

const square = (bodyId: string): BodyMesh => ({
  bodyId,
  vertices: Float32Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
  normals: new Float32Array(12),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  faceGroups: [{ start: 0, count: 6, faceId: 0 }],
  edges: Float32Array.from([0, 0, 0, 10, 0, 0]),
  edgeGroups: [{ start: 0, count: 2 }],
  metrics: { bbox: [[0, 0, 0], [10, 10, 0]], volume: 0 } as never,
});

const first = (layer: BodyLayer, id: string) => (layer.bodies.get(id)!.mesh.material as THREE.Material[])[0]!;

describe("murs dessinés en retrait", () => {
  it("le mur passe derrière ce qui est dans son plan ; le meuble garde son matériau, la coupe les coupe tous deux", () => {
    const layer = new BodyLayer(new THREE.Scene());
    layer.replace([square("wall"), square("back")]);
    const before = first(layer, "wall");
    layer.setBehind(new Set(["wall"]));
    const wall = first(layer, "wall");
    const back = first(layer, "back");
    expect(back).toBe(before);
    expect(wall).not.toBe(back);
    expect(wall.polygonOffsetFactor).toBeGreaterThan(back.polygonOffsetFactor);
    expect(wall.polygonOffsetUnits).toBeGreaterThan(back.polygonOffsetUnits);
    // Every material of the bodies, the wall's too: the section and the sketch mode change it with the others.
    expect(layer.materials()).toContain(wall);
    // Drawn again: still behind; no longer a wall, back to the others' material.
    layer.replace([square("wall"), square("back")]);
    expect(first(layer, "wall")).toBe(wall);
    layer.setBehind(new Set());
    expect(first(layer, "wall")).toBe(back);
  });
});
