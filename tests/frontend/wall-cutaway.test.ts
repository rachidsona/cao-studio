/** Les murs qui cachent la pièce : une dalle mince et haute, effacée quand l'œil passe derrière elle. */
import { describe, expect, it } from "vitest";
import { featureBacks } from "../../frontend/src/document/furniture-facing";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { withPlan, withPlanWalls, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type KitchenRunItem } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
import { againstWall, furnitureOut, pieceOf, piecesInTheWay, piecesOut, slabOf, wallOf, wallsBehind, type Slab } from "../../frontend/src/viewport/wall-cutaway";

/** The 12 triangles of a box between two corners. */
function box([x0, y0, z0]: [number, number, number], [x1, y1, z1]: [number, number, number]): { vertices: number[]; indices: number[] } {
  const vertices = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  return { vertices, indices: quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]) };
}

describe("murs qui cachent la vue", () => {
  it("reconnaît un mur, droit ou de biais, et pas un sol ni un appareil", () => {
    const wall = box([0, -100, 0], [3600, 0, 2500]);
    const slab = slabOf(wall.vertices, wall.indices)!;
    expect(Math.abs(slab.normal[1])).toBeCloseTo(1);
    expect(slab.half).toBeCloseTo(50);
    expect(slab.center[1]).toBeCloseTo(-50);
    expect(slab.center[0]).toBeCloseTo(1800);
    expect(slab.reach).toBeCloseTo(1800);
    // Turned 30°: its normal turned with it.
    const turn = (v: number[]) => v.map((c, i) => (i % 3 === 0 ? c * Math.cos(Math.PI / 6) - v[i + 1]! * Math.sin(Math.PI / 6) : i % 3 === 1 ? v[i - 1]! * Math.sin(Math.PI / 6) + c * Math.cos(Math.PI / 6) : c));
    const skew = slabOf(turn(wall.vertices), wall.indices)!;
    expect(Math.abs(skew.normal[0] * -Math.sin(Math.PI / 6) + skew.normal[1] * Math.cos(Math.PI / 6))).toBeCloseTo(1);
    expect(skew.half).toBeCloseTo(50);
    const floor = box([0, 0, -100], [4000, 3000, 0]);
    expect(slabOf(floor.vertices, floor.indices)).toBeNull();
    const fridge = box([0, 0, 0], [600, 600, 1800]);
    expect(slabOf(fridge.vertices, fridge.indices)).toBeNull();
  });

  it("efface le mur que l'œil a derrière lui, de l'autre côté que la pièce, et lui seul", () => {
    const walls = new Map<string, Slab>([
      ["A", { center: [1800, -50, 1250], normal: [0, 1], half: 50, reach: 1800 }],
      ["B", { center: [-50, 1500, 1250], normal: [1, 0], half: 50, reach: 1500 }],
      ["C", { center: [1800, 3050, 1250], normal: [0, -1], half: 50, reach: 1800 }],
    ]);
    const room: [number, number] = [1800, 1500];
    expect([...wallsBehind(walls, room, [1800, 1500, 1600])]).toEqual([]);
    expect([...wallsBehind(walls, room, [1800, -4000, 1600])]).toEqual(["A"]);
    expect([...wallsBehind(walls, room, [-3000, -3000, 1600])].sort()).toEqual(["A", "B"]);
    // The one the eye is furthest behind, first.
    expect([...wallsBehind(walls, room, [-900, -6000, 1600])]).toEqual(["A", "B"]);
    expect([...wallsBehind(walls, room, [-6000, -900, 1600])]).toEqual(["B", "A"]);
    expect([...wallsBehind(walls, room, [1800, 9000, 1600])]).toEqual(["C"]);
    // In the wall's thickness: still drawn.
    expect([...wallsBehind(walls, room, [1800, -80, 1600])]).toEqual([]);
  });

  it("tient pour adossé au mur ce qui est tout entier devant lui, à moins de 70 cm, sur sa longueur", () => {
    const wall: Slab = { center: [1800, -50, 1250], normal: [0, 1], half: 50, reach: 1800 };
    const room: [number, number] = [1800, 1500];
    // A base unit, its worktop, the splashback in the wall's plane.
    expect(againstWall(wall, room, [[0, 0, 0], [600, 560, 870]])).toBe(true);
    expect(againstWall(wall, room, [[0, 0, 870], [3600, 620, 910]])).toBe(true);
    expect(againstWall(wall, room, [[0, -5, 910], [3600, 13, 1500]])).toBe(true);
    // An island, a unit of the wall across, a peninsula from the wall, a unit past the wall's end, one behind it.
    expect(againstWall(wall, room, [[900, 1200, 0], [2700, 2100, 900]])).toBe(false);
    expect(againstWall(wall, room, [[0, 2440, 0], [600, 3000, 870]])).toBe(false);
    expect(againstWall(wall, room, [[1000, 0, 0], [1600, 1800, 900]])).toBe(false);
    expect(againstWall(wall, room, [[3900, 0, 0], [4500, 560, 870]])).toBe(false);
    expect(againstWall(wall, room, [[0, -900, 0], [600, -340, 870]])).toBe(false);
  });

  it("donne à un mur ses meubles seulement : ceux qui lui tournent le dos, pas ceux du mur voisin dans l'angle", () => {
    const walls = new Map<string, Slab>([
      ["A", { center: [1800, 50, 1250], normal: [0, 1], half: 50, reach: 1800 }],
      ["C", { center: [3650, -900, 1250], normal: [1, 0], half: 50, reach: 900 }],
    ]);
    const room: [number, number] = [1800, -900];
    // The last unit of wall A's run, in the corner with wall C: against both, its back to A (+Y).
    const corner: [[number, number, number], [number, number, number]] = [[3000, -560, 0], [3600, 0, 870]];
    expect(againstWall(walls.get("C")!, room, corner)).toBe(true);
    expect(wallOf(walls, room, corner, [0, 1])).toBe("A");
    // A unit of wall C's run, its back to C (+X); an island turned as A's units; a board in the corner, no back known.
    expect(wallOf(walls, room, [[3040, -1700, 0], [3600, -1100, 870]], [1, 0])).toBe("C");
    expect(wallOf(walls, room, [[900, -1900, 0], [2700, -1300, 900]], [0, 1])).toBeNull();
    expect(wallOf(walls, room, corner, null)).toBeNull();
    expect(wallOf(walls, room, [[0, -20, 900], [2000, 0, 1500]], null)).toBe("A");
  });

  it("sait à quoi un linéaire de cuisine tourne le dos : ses caissons, leurs façades, son plan de travail", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    const items: KitchenRunItem[] = [newItem([], "base-bas-2-portes", 800)];
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const backs = featureBacks(built.doc);
    const named = (start: string) => built.doc.features.find((f) => f.name.startsWith(start))!;
    const { back, group } = backs.get(named("Bas 2 portes").id)!;
    expect(group).toBe(`${made.id}:A`);
    expect(Math.hypot(...back)).toBeCloseTo(1);
    for (const name of ["Façades", "Plan de travail", "Plinthe"]) expect(backs.get(named(name).id), name).toEqual({ back, group });
    // The plate of the project: no furniture, no back.
    expect(featureBacks(createReferencePlate()).size).toBe(0);
  });

  it("efface les meubles des murs masqués, le plus en travers d'abord, sans jamais tout effacer", () => {
    const of = new Map([["A", ["a1", "a2"]], ["B", ["b1"]], ["C", []]]);
    // A U kitchen with an island, from behind A and B: both runs out, the island left.
    expect([...furnitureOut(["A", "B"], of, ["a1", "a2", "b1", "island"])].sort()).toEqual(["a1", "a2", "b1"]);
    // An L kitchen from behind its corner: the run of the wall most in the way only.
    expect([...furnitureOut(["A", "B"], of, ["a1", "a2", "b1"])].sort()).toEqual(["a1", "a2"]);
    expect([...furnitureOut(["B", "A"], of, ["a1", "a2", "b1"])]).toEqual(["b1"]);
    // One wall only: its units stay, their backs seen.
    expect([...furnitureOut(["A"], of, ["a1", "a2"])]).toEqual([]);
    expect([...furnitureOut(["C"], of, ["a1"])]).toEqual([]);
  });

  it("sait à quel mur une zone de dressing tourne le dos, et y rattache ce qui l'équipe", () => {
    const plan = { ...PLAN, model: "L-left" as const, lengthA: 3000, lengthB: 2000 };
    const made = withPlan({ ...createReferencePlate(), features: [] }, plan);
    let doc = withPlanWalls(made.doc, made.id, true);
    const sketches: string[] = [];
    for (const zone of planZones(plan)) {
      const next = withZonePartition(doc, made.id, zone);
      if (typeof next === "string") throw new Error(next);
      doc = next.doc;
      sketches.push(next.sketch);
    }
    const backs = featureBacks(doc);
    const of = (sketch: string) => backs.get(doc.features.find((f) => f.type === "extrude" && f.sketch === sketch)!.id)!;
    // Each zone one piece, its back square to the other's; the walls and the plan's lines have none.
    const [a, b] = [of(sketches[0]!), of(sketches[1]!)];
    expect([a.group, b.group]).toEqual(sketches);
    expect(Math.abs(a.back[0] * b.back[0] + a.back[1] * b.back[1])).toBeCloseTo(0);
    expect(backs.has(doc.features.find((f) => f.name === "Mur A")!.id)).toBe(false);

    // A hinge on a side of zone A, a sliding door just in front of it: with it; a stool in the room: with none.
    const pieces = new Map<string, [[number, number, number], [number, number, number]]>([["A", [[0, -600, 0], [3000, 0, 2500]]], ["B", [[0, -2000, 0], [350, -600, 2500]]]]);
    expect(pieceOf(pieces, [[1500, -590, 1200], [1520, -560, 1250]])).toBe("A");
    expect(pieceOf(pieces, [[0, -680, 80], [1500, -640, 2480]])).toBe("A");
    expect(pieceOf(pieces, [[10, -900, 1200], [30, -870, 1250]])).toBe("B");
    expect(pieceOf(pieces, [[1800, -1700, 0], [2200, -1300, 450]])).toBeNull();
  });
});

describe("murs d'un dressing sans pièce : la Répartition vue de dos s'efface", () => {
  // A U seen from above: wall A along y = 0..600 (back towards −y), B on the left (back −x), C on the right (back +x).
  const pieces = new Map([
    ["A", { box: [[0, 0, 0], [3000, 600, 2500]] as [[number, number, number], [number, number, number]], back: [0, -1] as [number, number] }],
    ["B", { box: [[0, 600, 0], [600, 2400, 2500]] as [[number, number, number], [number, number, number]], back: [-1, 0] as [number, number] }],
    ["C", { box: [[2400, 600, 0], [3000, 2400, 2500]] as [[number, number, number], [number, number, number]], back: [1, 0] as [number, number] }],
  ]);

  it("l'œil devant le dressing : rien ; passé derrière le mur A : lui seul ; en biais derrière A et C : le plus en travers d'abord", () => {
    expect(piecesInTheWay(pieces, [1500, 6000, 1600])).toEqual([]);
    expect(piecesInTheWay(pieces, [1500, -4000, 1600])).toEqual(["A"]);
    expect(piecesInTheWay(pieces, [4000, -6000, 1600])).toEqual(["A", "C"]);
    // Just at its back face: not yet behind it.
    expect(piecesInTheWay(pieces, [1500, 0, 1600])).toEqual([]);
  });

  it("ses corps s'en vont avec lui, jamais tout le dressing, ni ce qui est déjà hors de la vue", () => {
    const of = new Map([["A", ["a1", "a2"]], ["B", ["b1"]], ["C", ["c1"]]]);
    const counts = ["a1", "a2", "b1", "c1"];
    expect([...piecesOut(["A", "C"], of, counts)]).toEqual(["a1", "a2", "c1"]);
    // All three in the way: the last one stays.
    expect([...piecesOut(["A", "C", "B"], of, counts)]).toEqual(["a1", "a2", "c1"]);
    // B already out with a wall of a room: C stays to be looked at.
    expect([...piecesOut(["A", "C"], of, counts, new Set(["b1"]))]).toEqual(["a1", "a2"]);
  });
});
