/** « Finitions » sur une cuisine en L : chaque linéaire habillé de sa propre face avant, sans joue contre l'autre. */
import { describe, expect, it } from "vitest";
import { finishGroups } from "../../frontend/src/document/finish-groups";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument } from "../../frontend/src/document/types";
import { FINISH_DEFAULTS, finishParts, type Box } from "../../frontend/src/features/finish-parts";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const empty = () => ({ ...createReferencePlate(), features: [] }) as unknown as CadDocument;

describe("finitions d'une cuisine en L", () => {
  it("groupe les corps par linéaire, chacun avec sa face avant", () => {
    const made = withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "L-left" });
    const unit = (id: string) => ({ ...newItem([], "base-bas-3-tiroirs", 600), id });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [unit("a1"), unit("a2")], B: [unit("b1"), unit("b2")] } });
    if (typeof built === "string") throw new Error(built);
    const plan = kitchenPlanIn(built.doc, made.id)!;
    const cabinets = (run: string) => (plan.made?.[run] ?? []).map((id) => built.doc.features.find((f) => f.id === id)).filter((f): f is CabinetFeature => f?.type === "cabinet");
    // A box per cabinet, as the view would give it (its size only matters for the worktop's height here).
    const boxOf = (c: CabinetFeature): Box => [[c.origin[0], c.origin[1] - 600, 0], [c.origin[0] + 600, c.origin[1], 870]];
    const bodies = [...cabinets("A"), ...cabinets("B")].map((c) => ({ id: `${c.id}#0`, box: boxOf(c) }));
    const groups = finishGroups(built.doc, bodies)!;
    expect(groups.map((g) => g.label).sort()).toEqual(["mur A", "mur B"]);
    const front = (label: string) => groups.find((g) => g.label === label)!.front;
    const turn = (run: string) => cabinets(run)[0]!.rotation ?? 0;
    expect(front("mur A")).toEqual({ 0: { axis: 1, sign: -1 }, 90: { axis: 0, sign: 1 }, 180: { axis: 1, sign: 1 }, 270: { axis: 0, sign: -1 } }[turn("A")]);
    expect(front("mur A")).not.toEqual(front("mur B"));
    // Every body of one way: one block, as before.
    expect(finishGroups(built.doc, bodies.filter((b) => cabinets("A").some((c) => b.id.startsWith(`${c.id}#`))))).toBeNull();
  });

  it("ne met pas de joue contre le linéaire voisin, et la joue libre ne dépasse pas son linéaire", () => {
    // Run A along the back wall (front −Y), run B along the left wall (front +X) in front of it.
    const runA: Box[] = [[[0, -600, 0], [2400, 0, 870]]];
    const runB: Box[] = [[[0, -2400, 0], [600, -600, 870]]];
    const o = { ...FINISH_DEFAULTS, fillers: { on: false, max: 150 } };
    const a = finishParts(runA, [], o, runB);
    expect(a.parts.map((p) => p.name)).toEqual(["Joue droite"]);
    const right = a.parts[0]!;
    // Only as deep as its own run: it does not cross the room.
    expect([right.from[1], right.to[1]].sort((x, y) => x - y)).toEqual([-600, 0]);
    expect(a.notes.some((n) => /linéaire voisin/.test(n))).toBe(true);
    // Without its neighbour, the same run has both.
    expect(finishParts(runA, [], o).parts.map((p) => p.name)).toEqual(["Joue gauche", "Joue droite"]);
  });
});
