/** Les flèches aux deux bouts d'une arête choisie : elles montrent où elle commence et où elle s'arrête. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ARROW_PX, edgeArrows, fitArrows, straightEnds } from "../../frontend/src/viewport/edge-arrows";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe("flèches d'une arête droite", () => {
  it("les deux bouts d'une arête, quel que soit l'ordre des segments", () => {
    const ends = straightEnds([v(0, 0, 100), v(0, 0, 200), v(0, 0, 0), v(0, 0, 100)])!;
    expect([ends.start.z, ends.end.z].sort((a, b) => a - b)).toEqual([0, 200]);
    expect(ends.length).toBe(200);
  });

  it("une courbe n'a pas de flèches", () => {
    expect(straightEnds([v(10, 0, 0), v(7.07, 7.07, 0), v(7.07, 7.07, 0), v(0, 10, 0)])).toBeNull();
    expect(edgeArrows([v(10, 0, 0), v(7.07, 7.07, 0), v(7.07, 7.07, 0), v(0, 10, 0)], 0x63df0f)).toBeNull();
  });

  it("deux cônes, la pointe sur chaque bout, tournée vers l'extérieur", () => {
    const group = edgeArrows([v(0, 0, 0), v(0, 0, 2464)], 0x63df0f)!;
    expect(group.children).toHaveLength(2);
    for (const cone of group.children as THREE.Mesh[]) {
      cone.updateMatrixWorld(true);
      // The apex of the unit cone is at y = 0.5 on its own axis.
      const apex = v(0, 0.5, 0).applyMatrix4(cone.matrixWorld);
      expect([0, 2464].some((z) => Math.abs(apex.z - z) < 1e-6)).toBe(true);
      // Pointing outwards: the apex is farther from the middle of the edge than the cone's centre.
      expect(Math.abs(apex.z - 1232)).toBeGreaterThan(Math.abs(cone.position.z - 1232));
    }
  });

  it("une taille constante à l'écran : plus la caméra est loin, plus la flèche est longue en mm", () => {
    const group = edgeArrows([v(0, 0, 0), v(0, 0, 2464)], 0x63df0f)!;
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 100000);
    const length = () => (group.children[0] as THREE.Mesh).scale.y;
    camera.position.set(0, -3000, 1232);
    fitArrows([group], camera, 800);
    const near = length();
    camera.position.set(0, -6000, 1232);
    fitArrows([group], camera, 800);
    expect(length() / near).toBeCloseTo(Math.hypot(6000, 1232) / Math.hypot(3000, 1232), 6);
    // ARROW_PX pixels at the distance of the tip (about 3 m: a pixel of 4,1 mm at 40° over 800 px).
    const perPixel = (2 * Math.tan(THREE.MathUtils.degToRad(20))) / 800;
    expect(near).toBeCloseTo(ARROW_PX * perPixel * Math.hypot(3000, 1232), 3);
  });

  it("jamais plus d'un quart d'une petite arête", () => {
    const group = edgeArrows([v(0, 0, 0), v(0, 0, 18)], 0x63df0f)!;
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 100000);
    camera.position.set(0, -20000, 9);
    fitArrows([group], camera, 800);
    expect((group.children[0] as THREE.Mesh).scale.y).toBe(4.5);
  });
});
