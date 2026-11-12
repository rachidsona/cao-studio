/**
 * Ce qu'un outil a choisi reste marqué : la face (ou le corps) de départ en orange, celle d'arrivée en bleu ; une marque
 * déjà dessinée reste telle quelle quand l'aperçu refait les corps, et s'en va quand elle n'est plus choisie.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BodyMesh } from "../../frontend/src/geometry/protocol";
import { BodyLayer } from "../../frontend/src/viewport/body-layer";
import { ChosenMarks } from "../../frontend/src/viewport/chosen-marks";

/** A square of two triangles (face 0) and one more triangle (face 1). */
const body = (bodyId: string): BodyMesh => ({
  bodyId,
  vertices: Float32Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 5]),
  normals: new Float32Array(15),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3, 0, 1, 4]),
  faceGroups: [{ start: 0, count: 6, faceId: 0 }, { start: 6, count: 3, faceId: 1 }],
  edges: Float32Array.from([0, 0, 0, 10, 0, 0]),
  edgeGroups: [{ start: 0, count: 2 }],
  metrics: { bbox: [[0, 0, 0], [10, 10, 5]], volume: 0 } as never,
});

const pick = (bodyId: string, faceIndex: number) => ({ bodyId, faceIndex, point: new THREE.Vector3() });

describe("faces choisies marquées", () => {
  it("la face de départ en orange, celle d'arrivée en bleu, chacune avec son contour", () => {
    const scene = new THREE.Scene();
    const layer = new BodyLayer(scene);
    layer.replace([body("a"), body("b")]);
    const marks = new ChosenMarks(scene);
    marks.set([{ face: pick("a", 0), role: "first" }, { face: pick("b", 1), role: "second" }], layer.bodies);
    const drawn: THREE.Object3D[] = [];
    scene.traverse((o) => o.userData.chosen && drawn.push(o));
    expect(drawn.map((o) => o.userData.chosen)).toEqual(["first", "first", "second", "second"]);
    const [tint, outline] = drawn as [THREE.Mesh, THREE.LineSegments];
    expect((tint.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xf97316);
    expect(((drawn[2] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x0ea5e9);
    // The square's outline: its four sides, not its diagonal.
    expect(outline.geometry.getAttribute("position").count).toBe(8);
    expect(tint.geometry.getIndex()!.count).toBe(6);
  });

  it("des triangles qui ne partagent pas leurs sommets : le contour reste les quatre côtés, sans la diagonale", () => {
    const scene = new THREE.Scene();
    const layer = new BodyLayer(scene);
    const loose: BodyMesh = { ...body("c"), vertices: Float32Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 0, 10, 10, 0, 0, 10, 0]), normals: new Float32Array(18), indices: Uint32Array.from([0, 1, 2, 3, 4, 5]), faceGroups: [{ start: 0, count: 6, faceId: 0 }] };
    layer.replace([loose]);
    new ChosenMarks(scene).set([{ face: pick("c", 0), role: "first" }], layer.bodies);
    const lines: THREE.LineSegments[] = [];
    scene.traverse((o) => o.userData.chosen && o instanceof THREE.LineSegments && lines.push(o));
    expect(lines[0]!.geometry.getAttribute("position").count).toBe(8);
  });

  it("les corps outils passés de Joindre à Couper : les mêmes marques, en rouge, même si leurs corps ne sont plus montrés", () => {
    const scene = new THREE.Scene();
    const layer = new BodyLayer(scene);
    layer.replace([body("a"), body("b")]);
    const marks = new ChosenMarks(scene);
    marks.set([{ body: "a", role: "first" }, { body: "b", role: "second" }], layer.bodies);
    layer.replace([]);
    marks.set([{ body: "a", role: "first" }, { body: "b", role: "remove" }], layer.bodies);
    const roles: string[] = [];
    scene.traverse((o) => o.userData.chosen && roles.push(o.userData.chosen));
    expect(roles).toEqual(["first", "first", "remove", "remove"]);
  });

  it("une marque gardée reste telle quelle quand le corps disparaît (l'aperçu), les autres s'en vont", () => {
    const scene = new THREE.Scene();
    const layer = new BodyLayer(scene);
    layer.replace([body("a"), body("b")]);
    const marks = new ChosenMarks(scene);
    marks.set([{ body: "a", role: "first" }], layer.bodies);
    const count = () => {
      let n = 0;
      scene.traverse((o) => o.userData.chosen && n++);
      return n;
    };
    expect(count()).toBe(2);
    // The preview replaces body « a »: its mark stays; a mark of a body not shown is not drawn.
    layer.replace([body("b")]);
    marks.set([{ body: "a", role: "first" }, { body: "gone", role: "second" }], layer.bodies);
    expect(count()).toBe(2);
    marks.set([{ face: pick("b", 0), role: "second" }], layer.bodies);
    expect(count()).toBe(2);
    marks.set([], layer.bodies);
    expect(count()).toBe(0);
  });
});
