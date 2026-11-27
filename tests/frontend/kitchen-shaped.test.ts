/** Les meubles qui ne sont pas des boîtes : le terminal arrondi au bout d'un linéaire, l'angle en biais. */
import { describe, expect, it } from "vitest";
import type { KitchenBox } from "../../frontend/src/features/kitchen-layout";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN, kitchenSizes } from "../../frontend/src/document/kitchen-plan-shapes";
import { quarterRound } from "../../frontend/src/document/kitchen-shaped";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const units = (list: [string, number][]) => list.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);

describe("meubles en forme", () => {
  it("un quart de rond : droit côté voisin, un quart d'ellipse vers le bout", () => {
    const right = quarterRound(1000, 1400, 560, "right");
    expect(right[0]).toEqual([1000, 0]);
    expect(right[1]).toEqual([1400, 0]);
    expect(right.at(-1)![0]).toBeCloseTo(1000);
    expect(right.at(-1)![1]).toBeCloseTo(560);
    const left = quarterRound(0, 400, 560, "left");
    expect(left[1]).toEqual([0, 0]);
    expect(left.at(-1)![0]).toBeCloseTo(400);
  });

  it("terminal arrondi au bout du linéaire : planches arrondies, le plan de travail arrondi au-dessus, pas de plinthe droite sous lui", () => {
    const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" }, runs: { A: units([["base-bas-2-portes", 1000], ["base-bas-terminal-arrondi", 400]]) } };
    const layout = kitchenFromPlan(p);
    const end = layout.boxes.filter((b) => b.name.startsWith("Terminal arrondi A"));
    expect(end.map((b) => b.name.replace(/^Terminal arrondi A\d+ — /, ""))).toEqual(["socle", "dessous", "étagère 1", "dessus", "côté"]);
    // The rounded boards: open at the end, from 1000 to 1400 along the wall.
    const bottom = end.find((b) => b.name.endsWith("dessous"))!;
    expect([Math.round(bottom.from[0]), Math.round(bottom.to[0])]).toEqual([1000, 1400]);
    expect(bottom.outline!.length).toBeGreaterThan(10);
    expect(layout.units.some((u) => u.name.startsWith("Bas terminal arrondi"))).toBe(false);
    const top = layout.boxes.find((b) => b.kind === "worktop")!;
    expect(top.outline).toBeDefined();
    expect(Math.round(top.to[0])).toBe(1400);
    // The plinth stops at the rounded unit, its own rounded socle under it.
    const kick = layout.boxes.filter((b) => b.kind === "kick" && b.name.startsWith("Plinthe"));
    expect(Math.max(...kick.map((b) => Math.round(b.to[0])))).toBe(1000);
  });

  it("angle en biais : un pentagone sur les deux murs, sa porte à 45°, sa plinthe et un triangle de plan de travail", () => {
    const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "U", lengthA: 3600, corners: { left: "diagonal", right: "diagonal" } };
    const layout = kitchenFromPlan(p);
    const pieces = layout.boxes.filter((b) => b.name.startsWith("Meuble d'angle en biais"));
    const names = [...new Set(pieces.map((b) => b.name.replace(/^Meuble d'angle en biais \S+( \(droite\))? — /, "")))];
    expect(names).toEqual(["dessous", "étagère", "dessus", "côté", "côté (2)", "porte en biais", "plinthe", "plan de travail"]);
    const bottom = pieces.find((b) => b.name.endsWith("dessous"))!;
    expect(bottom.outline).toHaveLength(5);
    // 92 × 92 on the walls (58 cm caissons).
    expect(Math.round(bottom.to[0] - bottom.from[0])).toBe(920);
    expect(Math.round(bottom.to[1] - bottom.from[1])).toBe(920);
    const s = kitchenSizes(p);
    expect(pieces.find((b) => b.name.endsWith("plan de travail"))).toMatchObject({ kind: "worktop" });
    expect(bottom.from[2]).toBe(s.plinth);
  });

  it("caisson d'angle en L : un seul caisson, ses planches en L, deux étagères, un fond contre chaque mur, un côté au bout de chaque bras, jusqu'au sol, entaillés pour la plinthe ; sa porte pliante qui s'ouvre et sa plinthe sont celles des linéaires", () => {
    const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "L-left", lengthA: 3000, lengthB: 2500, island: false, corners: { left: "lcase" }, rest: { A: "end", B: "start" }, runs: { A: units([["base-bas-1-porte", 600]]), B: units([["base-bas-1-porte", 600]]) } };
    const layout = kitchenFromPlan(p);
    const pieces = layout.boxes.filter((b) => b.name.startsWith("Caisson d'angle en L"));
    expect(pieces.map((b) => b.name.replace(/^Caisson d'angle en L \S+ — /, ""))).toEqual(["dessous", "étagère 1", "étagère 2", "dessus", "côté", "côté (2)", "fond", "fond (2)"]);
    // In L, 92 × 92 on the walls (its bottom between the sides), 58 deep: no box, no other caisson in the corner.
    const bottom = pieces.find((b) => b.name.endsWith("dessous"))!;
    expect(bottom.outline).toHaveLength(6);
    expect([Math.round(bottom.to[0] - bottom.from[0]), Math.round(bottom.to[1] - bottom.from[1])]).toEqual([902, 902]);
    expect(layout.units.filter((u) => u.corner)).toEqual([]);
    // The backs meet in the corner without overlapping (one through it), as long as the arms less a side; the shelves in front of them.
    const [b1, b2] = ["fond", "fond (2)"].map((n) => pieces.find((b) => b.name.endsWith(`— ${n}`))!) as [KitchenBox, KitchenBox];
    const span = (b: KitchenBox, i: 0 | 1) => Math.round(b.to[i] - b.from[i]);
    expect([span(b1, 0) + span(b2, 0), span(b1, 1) + span(b2, 1)].sort()).toEqual([902, 905]);
    expect([b1.material, b2.material]).toEqual(["hdf", "hdf"]);
    const shelf = pieces.find((b) => b.name.endsWith("étagère 1"))!;
    expect([span(shelf, 0), span(shelf, 1)]).toEqual([899, 899]);
    // Its folding door, a leaf before each arm, as the L's: boards that open, hinged away from the corner.
    const leaves = layout.boxes.filter((b) => b.name.startsWith("Porte pliante"));
    expect(leaves.map((b) => [b.name, !!b.door, b.corner])).toEqual([["Porte pliante A", true, true], ["Porte pliante B (droite)", true, true]]);
    // Its sides down to the floor; where a plinth passes under one, it is in its notch.
    const sides = pieces.filter((b) => b.name.includes("— côté"));
    expect(sides.map((b) => [b.from[2], b.profile?.points.length])).toEqual([[0, 6], [0, 6]]);
    const kicks = layout.boxes.filter((b) => b.kind === "kick");
    expect(kicks.some((k) => k.name.startsWith("Plinthe d'angle"))).toBe(true);
    for (const side of sides) {
      const { along, points } = side.profile!;
      const notch = points.filter(([, z]) => z === kitchenSizes(p).plinth).map(([x]) => x);
      const [n0, n1] = [Math.min(...notch), Math.max(...notch)];
      const meets = (k: KitchenBox) => [0, 1, 2].every((i) => k.from[i]! < side.to[i]! - 1e-6 && k.to[i]! > side.from[i]! + 1e-6);
      for (const k of kicks.filter(meets)) expect([k.from[along]! >= n0 - 1e-6, k.to[along]! <= n1 + 1e-6], `${side.name} ${k.name}`).toEqual([true, true]);
    }
    // The worktops of both runs cover it, as over a corner unit.
    expect(layout.boxes.filter((b) => b.kind === "worktop").map((b) => b.name)).toEqual(["Plan de travail A", "Plan de travail B"]);
    // Even with nothing else on the other wall: its worktop over the caisson's arm, from the run that passes.
    const alone = kitchenFromPlan({ ...p, runs: { A: p.runs!.A! } });
    const top = alone.boxes.find((b) => b.name === "Plan de travail B")!;
    expect(Math.round(top.to[0] - top.from[0]) * Math.round(top.to[1] - top.from[1])).toBeGreaterThan(0);
    expect(Math.max(top.to[0] - top.from[0], top.to[1] - top.from[1])).toBeGreaterThanOrEqual(920 - kitchenSizes(p).cabinet - 1);
  });
});
