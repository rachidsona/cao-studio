/** Relevé de chantier : faux aplomb, hors d'équerre et plafond pas de niveau — fileur et bandeau recoupés, ce qui ne rentre pas. */
import { beforeAll, describe, expect, it } from "vitest";
import { createReferencePlate, type CadDocument, type TrimFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { FINISH_DEFAULTS, finishParts, type Box, type FinishOptions } from "../../frontend/src/features/finish-parts";
import { scribe, scribedOutline, widthsText, HEIGHTS } from "../../frontend/src/features/wall-survey";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

// A wardrobe 1000 wide (x 0…1000), 600 deep (its front at y = −600), 2000 high. With its end panels (19 mm), its
// right edge is at x = 1019: the wall on the right, drawn at x = 1079, leaves 60 mm; the ceiling is 300 mm above.
const WARDROBE: Box[] = [[[0, -600, 0], [18, 0, 2000]], [[982, -600, 0], [1000, 0, 2000]], [[18, -600, 100], [982, 0, 118]], [[18, -600, 1982], [982, 0, 2000]]];
const RIGHT_WALL: Box = [[1079, -700, 0], [1179, 100, 2500]];
const CEILING: Box = [[-600, -700, 2300], [1500, 100, 2400]];
const options = (change: (o: FinishOptions) => void = () => {}): FinishOptions => {
  const o = structuredClone(FINISH_DEFAULTS);
  change(o);
  return o;
};
const part = (r: ReturnType<typeof finishParts>, name: string) => r.parts.find((p) => p.name === name);

describe("le jour réel d'après le relevé", () => {
  it("retire à chaque hauteur ce dont le mur avance ; dit ce qui manque, et où", () => {
    expect(scribe(60, [0, 8, 20])).toMatchObject({ gaps: [60, 52, 40], short: 0, shortBack: 0, tapered: true });
    expect(scribe(60, [5, 5, 5])).toMatchObject({ gaps: [55, 55, 55], tapered: false });
    expect(scribe(10, [0, 4, 14])).toMatchObject({ short: 4, at: 2 });
    // Out of square: closer at the back of the furniture than at its front.
    expect(scribe(10, [0, 0, 0], 15)).toMatchObject({ short: 0, shortBack: 5 });
    expect(scribe(10, [0, 0, 0], -15).shortBack).toBe(0);
    expect(widthsText([60, 52.4, 40], HEIGHTS)).toBe("60 mm en bas, 52,4 à mi-hauteur, 40 en haut");
  });

  it("le contour suit le mur : un point par mesure, celui du milieu ôté s'il est aligné, aucun point double", () => {
    expect(scribedOutline(1019, 1, [0, 1000, 2000], [60, 52, 40])).toEqual([[1019, 0], [1079, 0], [1071, 1000], [1059, 2000], [1019, 2000]]);
    expect(scribedOutline(1019, 1, [0, 1000, 2000], [60, 50, 40])).toEqual([[1019, 0], [1079, 0], [1059, 2000], [1019, 2000]]);
    // Nothing at the bottom: a point of the board, not two.
    expect(scribedOutline(1019, 1, [0, 1000, 2000], [0, 5, 20])).toEqual([[1019, 0], [1024, 1000], [1039, 2000], [1019, 2000]]);
    expect(scribedOutline(-19, -1, [0, 1000, 2000], [0, 10, 20])).toEqual([[-19, 0], [-39, 2000], [-19, 2000]]);
  });
});

describe("finitions avec un relevé de chantier", () => {
  it("un mur en faux aplomb : le fileur est recoupé à trois largeurs, dans la boîte de la plus grande", () => {
    const r = finishParts(WARDROBE, [RIGHT_WALL], options((o) => (o.survey = { right: { low: 0, mid: 8, high: 20, back: 0 } })));
    expect(part(r, "Fileur droit")).toMatchObject({ from: [1019, -600, 0], to: [1079, -581, 2000], outline: { axis: 0, points: [[1019, 0], [1079, 0], [1071, 1000], [1059, 2000], [1019, 2000]] } });
    expect(r.notes).toContain("Fileur droit à recouper : 60 mm en bas, 52 à mi-hauteur, 40 en haut.");
    // The same everywhere: a plain board, narrower.
    const even = finishParts(WARDROBE, [RIGHT_WALL], options((o) => (o.survey = { right: { low: 10, mid: 10, high: 10, back: 0 } })));
    expect(part(even, "Fileur droit")).toEqual({ name: "Fileur droit", from: [1019, -600, 0], to: [1069, -581, 2000] });
    // Without a survey: as before.
    expect(part(finishParts(WARDROBE, [RIGHT_WALL], options()), "Fileur droit")).toEqual({ name: "Fileur droit", from: [1019, -600, 0], to: [1079, -581, 2000] });
  });

  it("un mur qui avance trop, ou hors d'équerre au fond : le meuble ne rentre pas, le panneau dit de combien", () => {
    const lean = finishParts(WARDROBE, [RIGHT_WALL], options((o) => (o.survey = { right: { low: 0, mid: 0, high: 75, back: 0 } })));
    expect(part(lean, "Fileur droit")).toBeUndefined();
    expect(lean.notes).toContain("Mur de droite : il avance trop en haut — le meuble ne rentre pas, il manque 15 mm.");
    // More than the end panel can lose (19 mm, 6 left at least): a problem, for the check before making.
    expect(lean.problems).toEqual(["Mur de droite : il avance trop en haut — le meuble ne rentre pas, il manque 15 mm."]);
    const bare = finishParts(WARDROBE, [RIGHT_WALL], options((o) => ((o.ends.right = false), (o.survey = { right: { low: 0, mid: 0, high: 0, back: 89 } }))));
    expect(bare.notes).toContain("Mur de droite hors d'équerre : au fond du meuble il manque 10 mm — le meuble ne rentre pas.");
    expect(bare.problems).toHaveLength(1);
  });

  it("une joue contre un mur qui avance un peu est recoupée : au fond (hors d'équerre) ou en hauteur (faux aplomb)", () => {
    // 60 mm from the end panel to the wall at the front, 70 closer at the back: the panel loses 10 mm at its back.
    const square = finishParts(WARDROBE, [RIGHT_WALL], options((o) => (o.survey = { right: { low: 0, mid: 0, high: 0, back: 70 } })));
    expect(part(square, "Joue droite")).toMatchObject({ from: [1000, -600, 0], to: [1019, 0, 2000], outline: { axis: 0, plane: "top", points: [[1000, -600], [1019, -600], [1009, 0], [1000, 0]] } });
    expect(square.notes).toContain("Joue droite à recouper au fond (mur hors d'équerre) : 19 mm devant, 9 au fond.");
    expect(part(square, "Fileur droit")).toBeUndefined();
    expect(square.problems).toEqual([]);
    // 70 mm closer at the top: the panel loses 10 mm at the top, its outline in the plane of the front.
    const plumb = finishParts(WARDROBE, [RIGHT_WALL], options((o) => (o.survey = { right: { low: 0, mid: 0, high: 70, back: 0 } })));
    expect(part(plumb, "Joue droite")).toMatchObject({ outline: { axis: 0, points: [[1000, 0], [1019, 0], [1019, 1000], [1009, 2000], [1000, 2000]] } });
    expect(plumb.notes).toContain("Joue droite à recouper contre le mur : 19 mm en bas, 19 à mi-hauteur, 9 en haut d'épaisseur.");
    expect(plumb.problems).toEqual([]);
  });

  it("un sol pas de niveau : la plinthe le suit ; un mur du fond bombé qui touche le meuble est signalé", () => {
    const floor = finishParts(WARDROBE, [], options((o) => ((o.plinth = { on: true, height: 100, recess: 50 }), (o.survey = { floor: { left: 0, mid: 10, right: 30 } }))));
    // Measured at the left, the middle and the right of the wardrobe (0…1000); the plinth runs between its sides.
    const plinth = part(floor, "Plinthe")!;
    expect(plinth).toMatchObject({ from: [18, -550, 0.36], to: [982, -531, 100] });
    expect(plinth.outline!.points.map(([x, z]) => [x, Number(z.toFixed(2))])).toEqual([[18, 0.36], [500, 10], [982, 29.28], [982, 100], [18, 100]]);
    expect(floor.notes).toContain("Plinthe à recouper sur le sol : 99,6 mm, 90 mm, 70,7 mm de haut, de gauche à droite.");
    const steep = finishParts(WARDROBE, [], options((o) => ((o.plinth = { on: true, height: 100, recess: 50 }), (o.survey = { floor: { left: 0, mid: 0, right: 200 } }))));
    expect(steep.problems[0]).toMatch(/^Sol : il monte trop sous plinthe/);
    // Behind the wardrobe (its back at y = 0), a wall 50 mm away; it bulges 60 mm in the middle.
    const back: Box = [[-200, 50, 0], [1300, 150, 2500]];
    const bulge = finishParts(WARDROBE, [back], options((o) => (o.survey = { back: { left: 0, mid: 60, right: 0 } })));
    expect(bulge.problems).toEqual(["Mur du fond : il avance trop au milieu — le meuble ne rentre pas en profondeur, il manque 10 mm."]);
    expect(finishParts(WARDROBE, [back], options((o) => (o.survey = { back: { left: 0, mid: 40, right: 0 } }))).problems).toEqual([]);
  });

  it("un mur qui s'écarte d'un meuble posé contre lui : un fileur en pointe, depuis le bas", () => {
    const tight: Box = [[1019, -700, 0], [1119, 100, 2500]];
    expect(part(finishParts(WARDROBE, [tight], options()), "Fileur droit")).toBeUndefined();
    const r = finishParts(WARDROBE, [tight], options((o) => (o.survey = { right: { low: 0, mid: -6, high: -15, back: 0 } })));
    expect(part(r, "Fileur droit")).toMatchObject({ to: [1034, -581, 2000], outline: { points: [[1019, 0], [1025, 1000], [1034, 2000], [1019, 2000]] } });
  });

  it("un plafond pas de niveau : le bandeau est recoupé de gauche à droite ; trop bas, le meuble ne passe pas", () => {
    const r = finishParts(WARDROBE, [CEILING], options((o) => (o.survey = { ceiling: { left: 0, mid: 10, right: 30 } })));
    expect(part(r, "Bandeau haut")).toMatchObject({ from: [-19, -600, 2000], to: [1019, -581, 2300], outline: { axis: 0, points: [[-19, 2000], [-19, 2300], [500, 2290], [1019, 2270], [1019, 2000]] } });
    expect(r.notes).toContain("Bandeau haut à recouper : 300 mm à gauche, 290 au milieu, 270 à droite.");
    const low = finishParts(WARDROBE, [CEILING], options((o) => (o.survey = { ceiling: { left: 320, mid: 0, right: 0 } })));
    expect(part(low, "Bandeau haut")).toBeUndefined();
    expect(low.notes).toContain("Plafond : il descend trop à gauche — le meuble ne passe pas en hauteur, il manque 20 mm.");
  });

  it("le noyau construit le fileur recoupé : son volume est celui de son contour, dans sa boîte, quel que soit le sens du meuble", () => {
    const r = finishParts(WARDROBE, [RIGHT_WALL], options((o) => ((o.ends = { left: false, right: true, above: 0 }), (o.survey = { right: { low: 0, mid: 8, high: 20, back: 0 } }))));
    // The same furniture turned a quarter: its front towards +X, the wall beside it along Y.
    const turned = finishParts([[[0, 0, 0], [600, 1000, 2000]]], [[[-100, 1060, 0], [700, 1160, 2500]]], options((o) => ((o.front = { axis: 0, sign: 1 }), (o.ends = { left: false, right: false, above: 0 }), (o.survey = { left: { low: 0, mid: 8, high: 20, back: 0 }, right: { low: 0, mid: 8, high: 20, back: 0 } }))));
    for (const made of [r, turned]) {
      const trim: TrimFeature = { id: "fi1", type: "trim", name: "Finitions", parts: made.parts };
      const doc: CadDocument = { ...createReferencePlate(), features: [trim] };
      expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
      const recomputer = new Recomputer();
      expect(recomputer.recompute(doc).statuses.find((s) => s.id === "fi1")?.state).toBe("ok");
      const out = recomputer.output("fi1");
      const i = made.parts.findIndex((p) => p.outline);
      expect(i).toBeGreaterThanOrEqual(0);
      const p = made.parts[i]!;
      const metrics = bodyMetrics(out?.kind === "solids" ? out.shapes[i]! : null!);
      const across = Math.abs(p.to[p.outline!.axis] - p.from[p.outline!.axis]);
      const depth = Math.abs(p.to[1 - p.outline!.axis]! - p.from[1 - p.outline!.axis]!);
      // 60, 52 and 40 mm wide over two metres, 19 thick.
      expect(across).toBeCloseTo(60);
      expect(metrics.volume).toBeCloseTo(((60 + 52) / 2 + (52 + 40) / 2) * 1000 * depth, 0);
      for (const k of [0, 1, 2]) {
        expect(metrics.bbox[0][k]!).toBeCloseTo(Math.min(p.from[k]!, p.to[k]!), 3);
        expect(metrics.bbox[1][k]!).toBeCloseTo(Math.max(p.from[k]!, p.to[k]!), 3);
      }
    }
    expect(() => parseDocument({ ...createReferencePlate(), features: [{ id: "fi1", type: "trim", name: "Finitions", parts: [{ name: "Fileur", from: [0, 0, 0], to: [10, 19, 100], outline: { axis: 2, points: [[0, 0], [1, 1]] } }] }] })).toThrow(/contour d'une planche recoupée/);
  });

  it("le noyau construit la joue recoupée au fond et la plinthe sur le sol ; des Finitions sans planche, mais un problème, restent valables", () => {
    const made = finishParts(WARDROBE, [RIGHT_WALL], options((o) => ((o.plinth = { on: true, height: 100, recess: 50 }), (o.survey = { right: { low: 0, mid: 0, high: 0, back: 70 }, floor: { left: 0, mid: 10, right: 30 } }))));
    const trim: TrimFeature = { id: "fi1", type: "trim", name: "Finitions", parts: made.parts };
    const doc: CadDocument = { ...createReferencePlate(), features: [trim] };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    const recomputer = new Recomputer();
    expect(recomputer.recompute(doc).statuses.find((s) => s.id === "fi1")?.state).toBe("ok");
    const out = recomputer.output("fi1");
    const shape = (name: string) => bodyMetrics(out?.kind === "solids" ? out.shapes[made.parts.findIndex((p) => p.name === name)]! : null!);
    // 19 mm at the front, 9 at the back, over 600 deep and 2000 high.
    expect(shape("Joue droite").volume).toBeCloseTo(((19 + 9) / 2) * 600 * 2000, 0);
    expect(shape("Joue droite").bbox[1][0]).toBeCloseTo(1019, 3);
    // 99.64, 90 then 70.72 mm high over 482 mm each, 19 thick.
    expect(shape("Plinthe").volume).toBeCloseTo(((99.64 + 90) / 2 + (90 + 70.72) / 2) * 482 * 19, 0);
    const blocked: TrimFeature = { id: "fi1", type: "trim", name: "Finitions", parts: [], issues: ["Mur de droite : il avance trop en haut — le meuble ne rentre pas, il manque 15 mm."] };
    const empty: CadDocument = { ...createReferencePlate(), features: [blocked] };
    expect(() => parseDocument(JSON.parse(JSON.stringify(empty)))).not.toThrow();
    expect(new Recomputer().recompute(empty).statuses.find((s) => s.id === "fi1")?.state).toBe("ok");
  });
});

describe("faux aplomb relevé dans la Pièce", () => {
  it("le mur penche dans le noyau (son coin ajouté ou ôté), et les Finitions le prennent sans relevé à elles", async () => {
    const { wallLean } = await import("../../frontend/src/features/room-plan");
    const walls = [{ length: 3000, angle: 90, plumb: { mid: 8, high: 20 } }, { length: 2000, angle: 90, plumb: { mid: -5, high: -10 } }];
    const room = { id: "rm1", type: "room" as const, name: "Pièce", walls, height: 2500, thickness: 100, obstacles: [] };
    const doc = { ...createReferencePlate(), features: [room] } as CadDocument;
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    const recomputer = new Recomputer();
    expect(recomputer.recompute(doc).statuses.find((s) => s.id === "rm1")?.state).toBe("ok");
    const out = recomputer.output("rm1");
    const shapes = out?.kind === "solids" ? out.shapes : [];
    const straight = new Recomputer();
    straight.recompute({ ...doc, features: [{ ...room, walls: walls.map(({ plumb: _, ...w }) => w) }] } as CadDocument);
    const flat = straight.output("rm1");
    const before = (i: number) => bodyMetrics(flat?.kind === "solids" ? flat.shapes[i]! : null!).volume;
    // Wall A comes in: 8 at mid-height, 20 at the top — its wedge (4 + 14 mean × 1250 each) added along its 3 m.
    expect(bodyMetrics(shapes[0]!).volume - before(0)).toBeCloseTo(((0 + 8) / 2 + (8 + 20) / 2) * 1250 * 3000, -3);
    // Wall B leans away: its wedge cut.
    expect(before(1) - bodyMetrics(shapes[1]!).volume).toBeCloseTo(((0 + 5) / 2 + (5 + 10) / 2) * 1250 * 2000, -3);
    // A wardrobe beside a wall drawn straight at x = 1079, which the Pièce says comes in 8 mm at 1 m and 20 at 2 m.
    const lean = (z: number) => wallLean({ length: 1, angle: 90, plumb: { mid: 8, high: 20 } }, 4000, z * 2);
    const r = finishParts(WARDROBE, [{ box: RIGHT_WALL, lean }], options());
    expect(r.notes).toContain("Fileur droit à recouper : 60 mm en bas, 52 à mi-hauteur, 40 en haut.");
  });
});
