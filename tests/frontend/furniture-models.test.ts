/** Assistant meuble : meuble TV, bibliothèque, bureau, banc et tête de lit, aux cotes demandées, posés dans le document. */
import { beforeAll, describe, expect, it } from "vitest";
import { withFurniture } from "../../frontend/src/document/furniture-build";
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
