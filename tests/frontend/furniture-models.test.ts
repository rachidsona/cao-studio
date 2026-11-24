/** Assistant meuble : meuble TV, bibliothèque, bureau, banc et tête de lit, aux cotes demandées, posés dans le document. */
import { beforeAll, describe, expect, it } from "vitest";
import { furnitureOf, withFurniture, withFurnitureRemade } from "../../frontend/src/document/furniture-build";
import { FURNITURE, furnitureLayout, furnitureModel, furnitureProblem, furnitureSize, type FurnitureAsk, type FurnitureKind } from "../../frontend/src/document/furniture-models";
import { createReferencePlate, type ApplianceFeature, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { Recomputer } from "../../frontend/src/history/recompute";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const ask = (kind: FurnitureKind, over: Partial<FurnitureAsk> = {}): FurnitureAsk => {
  const m = furnitureModel(kind);
  return { kind, ...m.size, thickness: 18, option: m.options[0]![0], ...over };
};
const empty = (): CadDocument => ({ ...createReferencePlate(), features: [] });

/** Every body the kernel made for these features, with its box. */
function built(doc: CadDocument): { ok: boolean; boxes: [number[], number[]][]; failed: string[] } {
  const r = new Recomputer();
  const { statuses, bodies } = r.recompute(doc);
  const failed = statuses.filter((s) => s.state !== "ok").map((s) => `${s.id} ${s.message ?? ""}`);
  const boxes = bodies.map((id) => {
    const [f, i] = id.split("#");
    const out = r.output(f!);
    const shape = out?.kind === "solids" ? out.shapes[Number(i ?? 0)] : out?.kind === "solid" ? out.shape : null;
    return shape ? (bodyMetrics(shape).bbox as [number[], number[]]) : null;
  }).filter((b) => b !== null);
  return { ok: !failed.length, boxes, failed };
}

describe("les modèles de meubles", () => {
  it("chaque modèle, à ses cotes usuelles et à chacun de ses choix, se construit sans erreur et tient dans sa boîte", () => {
    for (const m of FURNITURE) {
      for (const [option] of m.options) {
        const a = ask(m.kind, { option });
        const made = withFurniture(empty(), a, [100, -50, 0], "melamine-oak");
        if (typeof made === "string") throw new Error(`${m.kind} ${option} : ${made}`);
        expect(() => parseDocument(JSON.parse(JSON.stringify(made.doc))), `${m.kind} ${option}`).not.toThrow();
        const { ok, boxes, failed } = built(made.doc);
        expect(failed, `${m.kind} ${option}`).toEqual([]);
        expect(ok).toBe(true);
        expect(boxes.length, `${m.kind} ${option}`).toBeGreaterThanOrEqual(2);
        const [W, D, H] = furnitureSize(a);
        // In the box from its front left corner, with the handles and the fronts standing out at the front.
        const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[0][k]!)));
        const hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[1][k]!)));
        expect(lo[0], `${m.kind} ${option}`).toBeCloseTo(100, 3);
        expect(hi[0], `${m.kind} ${option}`).toBeCloseTo(100 + W, 3);
        expect(lo[2], `${m.kind} ${option}`).toBeCloseTo(0, 3);
        expect(hi[2], `${m.kind} ${option}`).toBeCloseTo(H, 3);
        expect(hi[1], `${m.kind} ${option}`).toBeCloseTo(-50 + D, 3);
        // An oven's door and handle stand out a little more than a front's.
        expect(lo[1], `${m.kind} ${option}`).toBeGreaterThan(-50 - 70);
      }
    }
  });

  it("l'habillage d'un réfrigérateur de 187 cm : deux côtés toute hauteur, le caisson au-dessus entre eux, 1 cm d'air autour et 3 au-dessus", () => {
    const a = ask("fridge", { width: 910, height: 1870, depth: 650 });
    const layout = furnitureLayout(a);
    if (typeof layout === "string") throw new Error(layout);
    const [left, right] = [layout.boards.find((b) => b.name === "Côté gauche")!, layout.boards.find((b) => b.name === "Côté droit")!];
    // Usual height: the fridge, 3 cm of air, a 40 cm caisson.
    expect(furnitureSize(a)).toEqual([910 + 20 + 36, 650, 1870 + 30 + 400]);
    expect([left.to[2], right.to[2], left.to[1]]).toEqual([2300, 2300, 650]);
    expect(right.from[0] - left.to[0]).toBe(930);
    const cap = layout.pieces[0]!;
    expect([cap.at[0], cap.at[2], cap.width, cap.height]).toEqual([18, 1900, 930, 400]);
    // Its total height set: the caisson follows; too low to hold one, refused.
    const tall = furnitureLayout({ ...a, top: 2500 });
    if (typeof tall === "string") throw new Error(tall);
    expect(tall.pieces[0]!.height).toBe(600);
    expect(furnitureProblem({ ...a, top: 2000 })).toMatch(/hauteur totale/);
    // Kept with its height, made again at a fridge's other sizes.
    const made = withFurniture(empty(), { ...a, top: 2400 }, [0, 0, 0], "melamine-oak");
    if (typeof made === "string") throw new Error(made);
    expect(() => parseDocument(JSON.parse(JSON.stringify(made.doc)))).not.toThrow();
    expect(made.doc.furniture![0]!.ask).toMatchObject({ kind: "fridge", top: 2400 });
  });

  it("l'habillage de réfrigérateur, en option, a sa colonne four et micro-ondes à droite : tiroirs, four, micro-ondes, porte", () => {
    const a = ask("fridge", { width: 910, height: 1870, depth: 650, option: "doors-oven" });
    const layout = furnitureLayout(a);
    if (typeof layout === "string") throw new Error(layout);
    const column = layout.pieces.find((p) => p.name === "Colonne four")!;
    expect([column.at[0], column.width, column.height]).toEqual([910 + 20 + 36, 600, 2300]);
    expect(furnitureSize(a)[0]).toBe(910 + 20 + 36 + 600);
    expect(column.spec.cases[0]!.steps[0]!.input.heights).toEqual([700, 600, 400, null]);
    expect(column.spec.cases[0]!.equipment.map((e) => [e.at, e.feature.fill])).toEqual([[[0], "drawers"], [[3], "door"]]);
    // Without the option, no column; too low for its niches, refused.
    expect((furnitureLayout({ ...a, option: "doors" }) as { pieces: unknown[] }).pieces).toHaveLength(1);
    expect(furnitureProblem({ ...a, height: 1700, top: 2000 })).toMatch(/colonne four/);
    // The oven and the microwave set in their niches: in the column, flush with its front, hors débit.
    const made = withFurniture(empty(), a, [0, 0, 0], "melamine-oak");
    if (typeof made === "string") throw new Error(made);
    const appliances = made.doc.features.filter((f): f is ApplianceFeature => f.type === "appliance");
    expect(appliances.map((f) => [f.model, f.origin[0], f.origin[2]])).toEqual([["oven-pyro", 966 + 2.5, 80 + 18 + 700 + 18], ["microwave-builtin", 966 + 2.5, 80 + 18 + 700 + 18 + 600 + 18]]);
    expect(appliances.every((f) => f.origin[1] === 0 && made.doc.bodyInfo?.[`${f.id}#0`]?.room)).toBe(true);
    expect(made.features).toEqual(expect.arrayContaining(appliances.map((f) => f.id)));
    // Against a wall along +Y: turned with it, a quarter turn.
    const turned = withFurniture(empty(), a, [0, 0, 0], "melamine-oak", { corner: [0, 0, 0], along: [0, 1] });
    if (typeof turned === "string") throw new Error(turned);
    expect(turned.doc.features.filter((f): f is ApplianceFeature => f.type === "appliance").map((f) => f.rotation)).toEqual([90, 90]);
  });

  it("le nombre de cases et d'étagères suit les cotes", () => {
    const cases = (a: FurnitureAsk) => {
      const l = furnitureLayout(a);
      if (typeof l === "string") throw new Error(l);
      return l.pieces[0]!.spec.input.cases;
    };
    expect(cases(ask("tv", { width: 1800 }))).toBe(3);
    expect(cases(ask("tv", { width: 2400 }))).toBe(4);
    expect(cases(ask("bookcase", { width: 1600 }))).toBe(2);
    expect(cases(ask("bench", { width: 1200 }))).toBe(3);
    const shelves = (h: number) => {
      const l = furnitureLayout(ask("bookcase", { height: h }));
      if (typeof l === "string") throw new Error(l);
      return l.pieces[0]!.spec.cases[0]!.steps[0]!.input.count;
    };
    expect(shelves(2000)).toBe(4);
    expect(shelves(1000)).toBe(2);
    expect(shelves(800)).toBe(1);
  });

  it("dit les cotes permises, et une tête de lit trop étroite pour ses deux chevets", () => {
    expect(furnitureProblem(ask("desk", { height: 900 }))).toBe("Bureau : la hauteur va de 65 cm à 80 cm.");
    expect(furnitureProblem(ask("tv", { thickness: 8 }))).toMatch(/épaisseur/);
    expect(furnitureProblem(ask("headboard", { width: 1500 }))).toMatch(/au moins 170 cm/);
    expect(furnitureProblem(ask("headboard", { width: 1500, option: "without" }))).toBeNull();
    expect(furnitureProblem(ask("bench", { option: "nope" }))).toMatch(/choix inconnu/);
    expect(withFurniture(empty(), ask("desk", { height: 900 }), [0, 0, 0], "melamine-white")).toMatch(/hauteur/);
  });

  it("le bureau : plateau, pied, voile et caisson à trois tiroirs, du côté choisi, dans la matière choisie", () => {
    for (const side of ["left", "right"] as const) {
      const made = withFurniture(empty(), ask("desk", { option: side }), [0, 0, 0], "melamine-walnut");
      if (typeof made === "string") throw new Error(made);
      expect(made.name).toBe("Bureau 1");
      const names = made.doc.features.map((f) => f.name);
      expect(names).toEqual(expect.arrayContaining(["Bureau 1 — Plateau", "Bureau 1 — Pied", "Bureau 1 — Voile de fond", "Bureau 1 — Caisson du bureau"]));
      const drawers = made.doc.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "drawers");
      expect(drawers?.drawers).toBe(3);
      const pedestal = made.doc.features.find((f): f is SketchFeature => f.type === "sketch" && f.name === "Bureau 1 — Caisson du bureau");
      const x = pedestal!.frame!.origin[0];
      expect(side === "left" ? x : x + 420).toBeCloseTo(side === "left" ? 0 : 1400);
      const top = made.doc.features.find((f) => f.name === "Bureau 1 — Plateau")!;
      expect(made.doc.bodyInfo?.[top.id]?.material).toBe("melamine-walnut");
    }
    // A second one: its own name.
    const first = withFurniture(empty(), ask("desk"), [0, 0, 0], "melamine-white");
    if (typeof first === "string") throw new Error(first);
    const second = withFurniture(first.doc, ask("desk"), [2000, 0, 0], "melamine-white");
    expect(typeof second !== "string" && second.name).toBe("Bureau 2");
  });

  it("le meuble TV : les extrémités fermées par des portes ou des tiroirs, le milieu ouvert", () => {
    const doors = furnitureLayout(ask("tv", { width: 1800, option: "doors" }));
    if (typeof doors === "string") throw new Error(doors);
    expect(doors.pieces[0]!.spec.doors?.skipped).toEqual([1]);
    const drawers = furnitureLayout(ask("tv", { width: 1800, option: "drawers" }));
    if (typeof drawers === "string") throw new Error(drawers);
    expect(drawers.pieces[0]!.spec.cases.map((c) => c.equipment.length)).toEqual([1, 0, 1]);
    expect(drawers.pieces[0]!.spec.doors).toBeUndefined();
  });
});

describe("bureau d'angle, lit, pose contre un mur, meuble refait", () => {
  it("le bureau d'angle : plateau et retour en L, caisson au bout du retour, du côté choisi", () => {
    for (const side of ["right", "left"] as const) {
      const l = furnitureLayout(ask("corner", { option: side }));
      if (typeof l === "string") throw new Error(l);
      const ret = l.boards.find((b) => b.name === "Retour")!;
      expect(side === "right" ? ret.to[0] : ret.from[0]).toBe(side === "right" ? 1600 : 0);
      expect(ret.to[1]).toBe(1400);
      const pedestal = l.pieces[0]!;
      expect(pedestal.at[0]).toBeGreaterThanOrEqual(side === "right" ? 1000 : 0);
      expect(pedestal.at[1] + 470).toBeCloseTo(1400 - 20);
    }
  });

  it("le lit : un cadre et un fond 6 cm sous son haut ; avec tiroirs, un caisson au pied, sous le fond", () => {
    const plain = furnitureLayout(ask("bed"));
    if (typeof plain === "string") throw new Error(plain);
    expect(plain.pieces).toEqual([]);
    expect(plain.boards.find((b) => b.name === "Fond du sommier")!.to[2]).toBe(400 - 60);
    const drawers = furnitureLayout(ask("bed", { option: "drawers" }));
    if (typeof drawers === "string") throw new Error(drawers);
    expect(drawers.boards.some((b) => b.name === "Traverse de pied")).toBe(false);
    expect(drawers.pieces[0]!.height).toBe(400 - 60 - 18);
    expect(drawers.pieces[0]!.at[1] + 600).toBe(2040);
  });

  it("contre un mur qui court vers −Y : le meuble tourné avec lui, son dos contre le mur, et le noyau le construit", () => {
    // A wall running along −Y at x = 0, the room on −X: the furniture's width along −Y, its front towards −X.
    const made = withFurniture(empty(), ask("desk"), [0, 0, 0], "melamine-oak", { corner: [0, -500, 0], along: [0, -1] });
    if (typeof made === "string") throw new Error(made);
    const { ok, boxes, failed } = built(made.doc);
    expect(failed).toEqual([]);
    expect(ok).toBe(true);
    const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[0][k]!)));
    const hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[1][k]!)));
    expect(hi[0]).toBeCloseTo(0, 3);
    expect(lo[0]).toBeGreaterThan(-600 - 60);
    expect(hi[1]).toBeCloseTo(-500, 3);
    expect(lo[1]).toBeCloseTo(-500 - 1400, 3);
    expect(made.doc.furniture?.[0]).toMatchObject({ name: "Bureau 1", corner: [0, -500, 0], along: [0, -1] });
  });

  it("refait à une autre largeur : ses cases recomptées, à sa place, sous son nom, en remplaçant l'ancien", () => {
    const first = withFurniture(empty(), ask("tv", { width: 1800 }), [100, -400, 0], "melamine-oak");
    if (typeof first === "string") throw new Error(first);
    const record = first.doc.furniture![0]!;
    expect(furnitureOf(first.doc, record.features[0]!)?.name).toBe("Meuble TV 1");
    const again = withFurnitureRemade(first.doc, record, ask("tv", { width: 2400 }), "melamine-oak");
    if (typeof again === "string") throw new Error(again);
    expect(again.name).toBe("Meuble TV 1");
    expect(again.doc.furniture).toHaveLength(1);
    expect(again.doc.features.filter((f) => f.type === "sketch" && f.name === "Meuble TV 1")).toHaveLength(1);
    const sketch = again.doc.features.find((f): f is SketchFeature => f.type === "sketch" && f.name === "Meuble TV 1")!;
    expect(sketch.frame!.origin[0]).toBeCloseTo(100);
    const { ok, boxes } = built(again.doc);
    expect(ok).toBe(true);
    expect(Math.max(...boxes.map((b) => b[1][0]!))).toBeCloseTo(100 + 2400, 3);
    expect(() => parseDocument(JSON.parse(JSON.stringify(again.doc)))).not.toThrow();
  });
});

describe("sous-escalier", () => {
  it("des caissons de hauteurs décroissantes sous la pente, chacun coiffé d'un habillage en biais, construits par le noyau", () => {
    const a = ask("stairs", { width: 2400, height: 2200, low: 400, option: "right-doors" });
    const l = furnitureLayout(a);
    if (typeof l === "string") throw new Error(l);
    // Rising to the right: each unit higher than the one on its left, under the slope by 2 cm at least.
    const heights = l.pieces.map((p) => p.height);
    expect(heights).toEqual([...heights].sort((x, y) => x - y));
    for (const p of l.pieces) expect(p.height).toBeLessThanOrEqual(400 + (1800 * p.at[0]) / 2400 - 20 + 1e-6);
    expect(l.boards.every((b) => b.outline && b.outline.length === 4)).toBe(true);
    // Rising to the left: the other way round.
    const left = furnitureLayout(ask("stairs", { low: 400, option: "left-drawers" }));
    if (typeof left === "string") throw new Error(left);
    expect(left.pieces[0]!.height).toBeGreaterThan(left.pieces.at(-1)!.height);
    expect(furnitureProblem(ask("stairs", { height: 1500, low: 1400 }))).toMatch(/hauteur basse/);
    const made = withFurniture(empty(), a, [0, -600, 0], "melamine-oak");
    if (typeof made === "string") throw new Error(made);
    const trim = made.doc.features.find((f) => f.type === "trim");
    expect(trim?.name).toBe("Sous-escalier 1 — habillage");
    const { ok, failed, boxes } = built(made.doc);
    expect(failed).toEqual([]);
    expect(ok).toBe(true);
    expect(Math.max(...boxes.map((b) => b[1][2]!))).toBeCloseTo(2200, 3);
  });
});

describe("îlot de dressing", () => {
  it("deux caissons dos à dos, l'un vers l'avant, l'autre vers l'arrière, sous le dessus ; le passage autour se mesure", async () => {
    const { passageProblem, passages } = await import("../../frontend/src/document/passage");
    const l = furnitureLayout(ask("island", { option: "drawers-shelves" }));
    if (typeof l === "string") throw new Error(l);
    expect(l.pieces.map((p) => !!p.backward)).toEqual([false, true]);
    const made = withFurniture(empty(), ask("island"), [0, -900, 0], "melamine-oak");
    if (typeof made === "string") throw new Error(made);
    const { ok, failed, boxes } = built(made.doc);
    expect(failed).toEqual([]);
    expect(ok).toBe(true);
    // Its fronts and handles under the top, on both sides.
    expect(Math.min(...boxes.map((b) => b[0][1]!))).toBeGreaterThanOrEqual(-900 - 1e-6);
    expect(Math.max(...boxes.map((b) => b[1][1]!))).toBeLessThanOrEqual(0 + 1e-6);
    const island: [number[], number[]] = [[0, -900, 0], [1200, 0, 900]];
    const wall: [number[], number[]] = [[-2000, 450, 0], [3000, 550, 2500]];
    const cabinet: [number[], number[]] = [[1600, -900, 0], [2200, 0, 2000]];
    expect(passages(island as never, [wall, cabinet] as never)).toEqual([
      { side: "à gauche (−X)", gap: null },
      { side: "à droite (+X)", gap: 400 },
      { side: "devant (−Y)", gap: null },
      { side: "derrière (+Y)", gap: 450 },
    ]);
    expect(passageProblem(island as never, [wall, cabinet] as never, (mm) => `${mm / 10} cm`)).toBe("Passage trop étroit autour : 40 cm à droite (+X), 45 cm derrière (+Y) (60 cm au moins).");
  });
});
