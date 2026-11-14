/** Assistant meuble : meuble TV, bibliothèque, bureau, banc et tête de lit, aux cotes demandées, posés dans le document. */
import { beforeAll, describe, expect, it } from "vitest";
import { furnitureOf, withFurniture, withFurnitureRemade } from "../../frontend/src/document/furniture-build";
import { FURNITURE, furnitureLayout, furnitureModel, furnitureProblem, furnitureSize, type FurnitureAsk, type FurnitureKind } from "../../frontend/src/document/furniture-models";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
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
        expect(lo[1], `${m.kind} ${option}`).toBeGreaterThan(-50 - 60);
      }
    }
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
