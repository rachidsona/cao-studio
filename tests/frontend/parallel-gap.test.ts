/** L'écart entre deux arêtes droites et parallèles (deux faces d'un panneau, la largeur d'une niche). */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { parallelGap } from "../../frontend/src/viewport/parallel-gap";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** An edge as tessellated: pairs of segment end points. */
const edge = (...points: THREE.Vector3[]) => points.slice(1).flatMap((p, i) => [points[i]!, p]);

describe("écart entre deux arêtes parallèles", () => {
  it("les deux arêtes verticales d'un côté de 36 mm : 36 mm, perpendiculaire", () => {
    const gap = parallelGap(edge(v(0, 0, 0), v(0, 0, 500)), edge(v(36, 0, 100), v(36, 0, 700)))!;
    expect(gap.distance).toBeCloseTo(36, 9);
    expect(gap.from.toArray()).toEqual([0, 0, 250]);
    expect(gap.to.toArray().map((n) => Number(n.toFixed(9)))).toEqual([36, 0, 250]);
  });

  it("en biais dans l'espace, et sens opposés", () => {
    const d = v(1, 2, 2).normalize();
    const a = edge(v(0, 0, 0), d.clone().multiplyScalar(300));
    const shift = v(2, -1, 0).normalize().multiplyScalar(50);
    const b = edge(shift.clone().add(d.clone().multiplyScalar(400)), shift.clone());
    expect(parallelGap(a, b)!.distance).toBeCloseTo(50, 6);
  });

  it("une arête faite de plusieurs segments alignés reste droite", () => {
    expect(parallelGap(edge(v(0, 0, 0), v(0, 0, 100), v(0, 0, 200)), edge(v(10, 0, 0), v(10, 0, 200)))!.distance).toBeCloseTo(10, 9);
  });

  it("rien pour des arêtes non parallèles, sur une même ligne, ou courbes", () => {
    expect(parallelGap(edge(v(0, 0, 0), v(0, 0, 100)), edge(v(10, 0, 0), v(10, 100, 0)))).toBeNull();
    expect(parallelGap(edge(v(0, 0, 0), v(0, 0, 100)), edge(v(0, 0, 200), v(0, 0, 300)))).toBeNull();
    const arc = edge(v(10, 0, 0), v(7.07, 7.07, 0), v(0, 10, 0));
    expect(parallelGap(edge(v(0, 0, 0), v(0, 0, 100)), arc)).toBeNull();
  });
});
