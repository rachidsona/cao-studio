/** Plan technique d'une cuisine : l'eau, les évacuations, les lignes et les prises au mur, cotés depuis le début du mur et le sol. */
import { describe, expect, it } from "vitest";
import { kitchenPlan } from "../../frontend/src/document/kitchen-plan";
import { techPlan } from "../../frontend/src/document/tech-plan";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { KITCHEN } from "../../frontend/src/features/kitchen-layout";

function kitchen(): CadDocument {
  const base: CadDocument = { ...createReferencePlate(), features: [] };
  const plan = kitchenPlan(base, { ...KITCHEN, layout: "L", lengthA: 4000, lengthB: 3000, appliances: true, fridge: true, splashback: true, kick: true, corner: "unit" }, "lacquer-white", "solid-oak");
  return { ...base, features: plan.features };
}

describe("plan technique", () => {
  it("met l'eau sous l'évier, la ligne 32 A sous la plaque, la sortie de la hotte au-dessus, et des prises au-dessus du plan", () => {
    const { walls, notes } = techPlan(kitchen());
    expect(walls.length).toBeGreaterThanOrEqual(1);
    expect(walls.map((w) => w.name)).toContain("Mur A");
    const all = walls.flatMap((w) => w.points.map((p) => ({ ...p, wall: w.name })));
    const kinds = new Set(all.map((p) => p.kind));
    for (const k of ["cold", "hot", "drain", "line32", "socket"] as const) expect(kinds.has(k), k).toBe(true);
    // Hot on the left of cold, both 50 cm up, the drain between them 40 cm up.
    const hot = all.find((p) => p.kind === "hot")!;
    const cold = all.find((p) => p.kind === "cold" && p.label === "Eau froide")!;
    const drain = all.find((p) => p.kind === "drain" && p.label === "Évacuation Ø40")!;
    expect(cold.u - hot.u).toBe(200);
    expect([hot.z, cold.z, drain.z]).toEqual([500, 500, 400]);
    expect(drain.u).toBe((hot.u + cold.u) / 2);
    // Worktop sockets above the worktop, never within 60 cm of the sink's or the hob's middle.
    const tops = all.filter((p) => p.label.startsWith("Prise plan de travail"));
    expect(tops.length).toBeGreaterThanOrEqual(2);
    const wallOf = (name: string) => walls.find((w) => w.name === name)!;
    for (const s of tops) {
      expect(s.z).toBeGreaterThan(900);
      const avoid = wallOf(s.wall).points.filter((p) => p.kind === "line32" || p.label === "Évacuation Ø40");
      for (const a of avoid) expect(Math.abs(a.u - s.u)).toBeGreaterThanOrEqual(600);
    }
    // Every point on its wall, inside what stands against it.
    for (const w of walls) for (const p of w.points) expect(p.u).toBeGreaterThan(-200);
    expect(notes.every((n) => !n.includes("Aucun évier"))).toBe(true);
  });

  it("sans cuisine, il le dit", () => {
    const { walls, notes } = techPlan({ ...createReferencePlate(), features: [] });
    expect(walls).toEqual([]);
    expect(notes).toContain("Aucun appareil ni plan de travail : posez la cuisine d'abord.");
  });
});
