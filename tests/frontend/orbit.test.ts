/** « Orbite » comme Fusion : la vue tourne autour du centre d'orbite (viewport/orbit-math.ts). */
import { describe, expect, it } from "vitest";
import { constrainedTurn, freeTurn, ringPart, rollTurn, screenAngle, viewAxes, type View } from "../../frontend/src/viewport/orbit-math";

// From the front: the camera at -Y looks at the origin, Z up.
const FRONT: View = { position: [0, -100, 0], target: [0, 0, 0], up: [0, 0, 1] };
const near = (a: number[], b: number[]) => a.forEach((c, i) => expect(c).toBeCloseTo(b[i]!, 6));
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((c, i) => c - b[i]!));

describe("orbite", () => {
  it("contrainte : glisser à droite fait passer la caméra à gauche, le haut reste Z", () => {
    const turned = constrainedTurn(FRONT, [0, 0, 0], -Math.PI / 2, 0);
    near(turned.position, [-100, 0, 0]);
    near(turned.up, [0, 0, 1]);
  });

  it("contrainte : la caméra monte mais s'arrête juste avant d'être au-dessus", () => {
    const up = constrainedTurn(FRONT, [0, 0, 0], 0, Math.PI / 4);
    expect(up.position[2]).toBeCloseTo(100 * Math.sin(Math.PI / 4), 6);
    const over = constrainedTurn(FRONT, [0, 0, 0], 0, Math.PI);
    expect(viewAxes(over).forward.z).toBeLessThan(-0.99);
    expect(viewAxes(over).forward.z).toBeGreaterThan(-1);
    expect(over.position[1]).toBeLessThan(0);
  });

  it("autour d'un centre ailleurs : la caméra et le point regardé tournent ensemble, les distances au centre restent", () => {
    const pivot: [number, number, number] = [50, 0, 20];
    const turned = constrainedTurn(FRONT, pivot, 0.7, 0.3);
    expect(dist(turned.position, pivot)).toBeCloseTo(dist(FRONT.position, pivot), 6);
    expect(dist(turned.target, pivot)).toBeCloseTo(dist(FRONT.target, pivot), 6);
    expect(dist(turned.position, turned.target)).toBeCloseTo(100, 6);
  });

  it("libre : la boule tourne le haut avec elle, le roulis tourne la vue sur l'écran", () => {
    const over = freeTurn(FRONT, [0, 0, 0], 0, Math.PI / 2);
    near(over.position, [0, 0, 100]);
    near(over.up, [0, 1, 0]);
    // Past the top: no stop, the model goes on turning.
    const beyond = freeTurn(over, [0, 0, 0], 0, Math.PI / 4);
    expect(beyond.position[1]).toBeGreaterThan(0);
    const rolled = rollTurn(FRONT, [0, 0, 0], Math.PI / 2);
    near(rolled.position, FRONT.position);
    near(rolled.up, [1, 0, 0]);
    // The constrained orbit stands the model back up.
    near(constrainedTurn(rolled, [0, 0, 0], 0.1, 0).up, [0, 0, 1]);
  });

  it("l'anneau : les poignées d'abord, puis dedans ou dehors ; l'angle tourné sur l'écran", () => {
    expect(ringPart(10, 100, 100, 100, 90)).toBe("left");
    expect(ringPart(195, 100, 100, 100, 90)).toBe("right");
    expect(ringPart(100, 12, 100, 100, 90)).toBe("top");
    expect(ringPart(100, 188, 100, 100, 90)).toBe("bottom");
    expect(ringPart(120, 110, 100, 100, 90)).toBe("inside");
    expect(ringPart(180, 180, 100, 100, 90)).toBe("outside");
    expect(screenAngle(200, 100, 100, 0, 100, 100)).toBeCloseTo(Math.PI / 2, 9);
    expect(screenAngle(0, 101, 0, 99, 100, 100)).toBeCloseTo(-0.02, 3);
  });
});
