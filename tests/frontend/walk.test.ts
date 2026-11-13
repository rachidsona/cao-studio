/** Visite à pied : le regard, la marche, les murs et les meubles qui arrêtent, le départ. */
import { describe, expect, it } from "vitest";
import { atHeight, BODY, EYE, eyePoint, lookDirection, obstacles, placedAt, SPEED, startWalker, turned, walked, type Box, type Walker } from "../../frontend/src/viewport/walk";

const at = (x: number, y: number, yaw = 0): Walker => ({ x, y, eye: EYE.usual, floor: 0, yaw, pitch: 0 });
const still = { forward: 0, side: 0, run: false };
const forward = { ...still, forward: 1 };
// A wall along X at y = 3000 (100 thick), 2.5 m high.
const WALL: Box = [[-5000, 3000, 0], [5000, 3100, 2500]];

describe("visite à pied", () => {
  it("regarde vers +Y au départ ; tourner à gauche vers −X ; l'inclinaison reste en deçà de la verticale", () => {
    expect(lookDirection(at(0, 0)).map((v) => Math.round(v * 1000) / 1000 + 0)).toEqual([0, 1, 0]);
    const left = turned(at(0, 0), -Math.PI / 2 / 0.004, 0);
    expect(lookDirection(left)[0]).toBeCloseTo(-1);
    const up = turned(at(0, 0), 0, -10000);
    expect(up.pitch).toBeCloseTo((85 * Math.PI) / 180);
    expect(eyePoint({ ...at(10, 20), floor: 100 })).toEqual([10, 20, 1700]);
    expect(atHeight(at(0, 0), 300).eye).toBe(EYE.low);
    expect(atHeight(at(0, 0), 3000).eye).toBe(EYE.high);
  });

  it("marche à la vitesse de la marche, plus vite avec Maj, vers l'avant de son cap, de côté vers la droite", () => {
    expect(walked(at(0, 0), forward, 0.05, []).y).toBeCloseTo(SPEED.walk * 0.05);
    expect(walked(at(0, 0), { ...forward, run: true }, 0.05, []).y).toBeCloseTo(SPEED.run * 0.05);
    expect(walked(at(0, 0), { ...still, side: 1 }, 0.1, []).x).toBeCloseTo(SPEED.walk * 0.1);
    // Turned a quarter to the left (towards −X), forward is −X.
    expect(walked(at(0, 0, Math.PI / 2), forward, 0.1, []).x).toBeCloseTo(-SPEED.walk * 0.1);
    // Diagonal: not faster.
    const d = walked(at(0, 0), { ...still, forward: 1, side: 1 }, 0.1, []);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(SPEED.walk * 0.1);
    // A long pause (a hidden tab) does not throw the visitor far.
    expect(walked(at(0, 0), forward, 5, []).y).toBeCloseTo(SPEED.walk * 0.1);
    expect(walked(at(0, 0), still, 1, [])).toEqual(at(0, 0));
  });

  it("un mur l'arrête à la largeur de son corps, et il glisse le long d'un mur abordé de biais", () => {
    let w = at(0, 2000);
    for (let i = 0; i < 100; i++) w = walked(w, forward, 0.05, [WALL]);
    expect(w.y).toBeLessThanOrEqual(3000 - BODY);
    expect(w.y).toBeGreaterThan(3000 - BODY - SPEED.walk * 0.05);
    // At 45° towards the wall: it keeps going along it.
    let slant = at(0, 2700, -Math.PI / 4);
    for (let i = 0; i < 20; i++) slant = walked(slant, forward, 0.05, [WALL]);
    expect(slant.x).toBeGreaterThan(500);
    expect(slant.y).toBeLessThanOrEqual(3000 - BODY);
  });

  it("une plinthe basse et un plafond au-dessus de la tête ne gênent pas ; un meuble, si", () => {
    const plinth: Box = [[-500, 500, 0], [500, 600, 100]];
    const ceiling: Box = [[-5000, -5000, 2500], [5000, 5000, 2600]];
    const cabinet: Box = [[-500, 500, 0], [500, 1100, 900]];
    expect(obstacles([plinth, ceiling, cabinet, WALL], 0, EYE.usual)).toEqual([cabinet, WALL]);
    // Lower eyes: a high wall unit (from 1.45 m) is above the head.
    const high: Box = [[-500, 500, 1450], [500, 850, 2150]];
    expect(obstacles([high], 0, EYE.low)).toEqual([]);
    expect(obstacles([high], 0, EYE.usual)).toEqual([high]);
  });

  it("part du milieu de la pièce, ou devant le meuble ; un clic au sol l'y emmène, sauf dans un meuble", () => {
    expect(startWalker(null, [[0, 0, 0], [4000, 3000, 2500]])).toMatchObject({ x: 2000, y: 1500, eye: EYE.usual, floor: 0 });
    expect(startWalker([[0, -600, 0], [3000, 0, 2400]], null)).toMatchObject({ x: 1500, y: -3100, yaw: 0 });
    const cabinet: Box = [[-500, 500, 0], [500, 1100, 900]];
    expect(placedAt(at(0, 0), 0, 800, [cabinet])).toBeNull();
    expect(placedAt(at(0, 0), 2000, 2000, [cabinet])).toMatchObject({ x: 2000, y: 2000 });
    // Put inside, it may walk out.
    expect(walked(at(0, 800), { ...still, forward: -1 }, 0.1, [cabinet]).y).toBeLessThan(800);
  });
});
