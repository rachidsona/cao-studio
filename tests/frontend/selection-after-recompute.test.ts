/**
 * Après un recalcul, une face choisie n'est gardée que si son corps est resté le même (audit d'architecture du
 * 11/11/2026) : le noyau renumérote les faces d'un corps qui change, le même numéro serait une autre face.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SelectionLayer, topologyKey } from "../../frontend/src/viewport/selection-layer";
import type { BodyMesh } from "../../frontend/src/geometry/protocol";

const body = (id: string, height: number, faces = 6): { data: BodyMesh } => ({
  data: {
    bodyId: id,
    vertices: new Float32Array(),
    normals: new Float32Array(),
    indices: new Uint32Array(),
    edges: new Float32Array(),
    faceGroups: Array.from({ length: faces }, (_, i) => ({ start: i * 6, count: 6 })),
    edgeGroups: Array.from({ length: 12 }, (_, i) => ({ start: i * 2, count: 2 })),
    metrics: { bbox: [[0, 0, 0], [600, 18, height]], volume: 600 * 18 * height, area: 0 },
  } as unknown as BodyMesh,
});

const views = (...list: { data: BodyMesh }[]) => new Map(list.map((b) => [b.data.bodyId, b])) as never;

describe("sélection gardée après un recalcul", () => {
  it("un corps inchangé garde sa face et son arête choisies", () => {
    const layer = new SelectionLayer(new THREE.Scene());
    layer.prune(views(body("a", 720)));
    layer.faces = [{ bodyId: "a", faceIndex: 2, point: new THREE.Vector3() }];
    layer.edges = [{ bodyId: "a", edgeIndex: 3 }];
    layer.prune(views(body("a", 720)));
    expect(layer.faces).toHaveLength(1);
    expect(layer.edges).toHaveLength(1);
  });

  it("un corps qui a changé de taille ou de faces perd ses faces et arêtes choisies, pas les autres corps", () => {
    const layer = new SelectionLayer(new THREE.Scene());
    layer.prune(views(body("a", 720), body("b", 720)));
    layer.faces = [{ bodyId: "a", faceIndex: 2, point: new THREE.Vector3() }, { bodyId: "b", faceIndex: 1, point: new THREE.Vector3() }];
    layer.edges = [{ bodyId: "a", edgeIndex: 3 }];
    layer.prune(views(body("a", 800), body("b", 720)));
    expect(layer.faces.map((f) => f.bodyId)).toEqual(["b"]);
    expect(layer.edges).toEqual([]);
    expect(topologyKey(body("a", 720, 7).data)).not.toBe(topologyKey(body("a", 720).data));
  });
});
