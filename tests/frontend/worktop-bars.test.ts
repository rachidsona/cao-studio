/** Le plan de travail en longueurs du commerce : morceaux d'au plus une barre, joints portés et loin des découpes, angle, barres à acheter, devis. */
import { describe, expect, it } from "vitest";
import { kitchenPlan } from "../../frontend/src/document/kitchen-plan";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { withWorktopBars, worktopBars } from "../../frontend/src/document/worktop-bars";
import { KITCHEN } from "../../frontend/src/features/kitchen-layout";

function kitchen(lengthA = 5000): CadDocument {
  const base: CadDocument = { ...createReferencePlate(), features: [] };
  const plan = kitchenPlan(base, { ...KITCHEN, layout: "L", lengthA, lengthB: 3000, appliances: true, fridge: false, splashback: false, kick: true, corner: "unit" }, "lacquer-white", "solid-oak");
  return { ...base, features: plan.features, bodyInfo: plan.info };
}

describe("plan de travail en barres", () => {
  it("coupe un plan plus long qu'une barre, le joint sur un côté de meuble et loin des découpes ; l'angle en joint droit", () => {
    const { tops, bars, fittings, problems } = worktopBars(kitchen(), { bar: 3050, corner: "butt" });
    expect(problems).toEqual([]);
    expect(tops.length).toBeGreaterThanOrEqual(2);
    for (const t of tops) {
      // The pieces end to end, the whole length, each within a bar.
      expect(t.pieces[0]!.from).toBe(0);
      expect(t.pieces.at(-1)!.to).toBeCloseTo(t.length, 3);
      for (const p of t.pieces) expect(p.buy).toBeLessThanOrEqual(3050);
      for (const j of t.joints) for (const [a, b] of t.cutouts) expect(j < a - 100 || j > b + 100).toBe(true);
    }
    const long = tops.find((t) => t.length > 3050)!;
    expect(long.joints.length).toBeGreaterThanOrEqual(1);
    // One corner, the worktop that butts: one joint there.
    expect(tops.reduce((n, t) => n + t.corners.length, 0)).toBe(1);
    expect(fittings).toBe(2 * (tops.reduce((n, t) => n + t.joints.length, 0) + 1));
    expect(bars.reduce((n, b) => n + b.count, 0)).toBeGreaterThanOrEqual(tops.reduce((n, t) => n + t.pieces.length, 0) > 2 ? 2 : 1);
  });

  it("en onglet, le plan qui vient contre prend la profondeur de l'autre ; une barre longue en évite un joint", () => {
    const butt = worktopBars(kitchen(), { bar: 4100, corner: "butt" });
    const mitre = worktopBars(kitchen(), { bar: 4100, corner: "mitre" });
    const corner = butt.tops.find((t) => t.corners.length)!;
    const mitred = mitre.tops.find((t) => t.name === corner.name)!;
    const end = corner.corners[0]!.end;
    const piece = (t: typeof corner) => (end === "start" ? t.pieces[0]! : t.pieces.at(-1)!);
    const other = butt.tops.find((t) => t.name === corner.corners[0]!.with)!;
    expect(piece(mitred).buy - piece(corner).buy).toBeCloseTo(other.depth, 3);
    expect(worktopBars(kitchen(4000), { bar: 4100, corner: "butt" }).tops.every((t) => t.joints.length === 0)).toBe(true);
  });

  it("le devis compte les barres achetées au lieu de la surface du plan de travail", () => {
    const rows = [{ names: ["Plan de travail A"], quantity: 1, length: 3000, width: 650, thickness: 38, material: "Chêne massif" }, { names: ["Côté"], quantity: 2, length: 720, width: 560, thickness: 19, material: "Chêne massif" }] as never;
    const totals = [{ material: "Chêne massif", thickness: 38, area: 1.95, bandLength: 0, parts: 1 }, { material: "Chêne massif", thickness: 19, area: 0.806, bandLength: 0, parts: 2 }];
    const { totals: left, items } = withWorktopBars(rows, totals, [{ material: "Chêne massif", thickness: 38, depth: 650, length: 4100, count: 1 }], () => 100);
    expect(left).toEqual([{ material: "Chêne massif", thickness: 19, area: 0.806, bandLength: 0, parts: 2 }]);
    expect(items).toEqual([{ name: "Plan de travail Chêne massif 38 mm — barre 4,1 m × 65 cm", quantity: 1, unit: "barre", price: 266.5 }]);
  });
});
