/** « Isoler la sélection » : ce qu'est un élément (le meuble entier d'une pièce choisie) et le texte de sa barre. */
import { describe, expect, it } from "vitest";
import { hiddenGroups } from "../../frontend/src/app/hide-selection";
import { isolatedText } from "../../frontend/src/app/isolate-selection";
import { setHidden } from "../../frontend/src/document/operations";
import { elementOf } from "../../frontend/src/app/zone-view";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, PART_SEPARATOR, type KitchenRunItem } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

describe("isoler la sélection", () => {
  it("prend le caisson entier d'une porte ou d'un côté, la Répartition d'un panneau, sinon le corps lui-même", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    let items: KitchenRunItem[] = [];
    for (const width of [800, 600]) items = [...items, newItem(items, "base-bas-2-portes", width)];
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const doc = built.doc;
    const cabinets = doc.features.filter((f) => f.type === "cabinet");
    const fronts = doc.features.find((f) => f.type === "fronts" && f.cabinet === cabinets[0]!.id)!;
    const side = `${cabinets[0]!.id}${PART_SEPARATOR}0`;
    // A side and a door of the same unit: one element; the other unit, the worktop, the plinth: each its own.
    expect(elementOf(doc, side)).toBe(`cabinet:${cabinets[0]!.id}`);
    expect(elementOf(doc, `${fronts.id}${PART_SEPARATOR}1`)).toBe(elementOf(doc, side));
    const worktop = doc.features.find((f) => f.name.startsWith("Plan de travail"))!;
    const plinth = doc.features.find((f) => f.name.startsWith("Plinthe"))!;
    const keys = new Set([side, `${cabinets[1]!.id}${PART_SEPARATOR}0`, worktop.id, plinth.id].map((id) => elementOf(doc, id)));
    expect(keys.size).toBe(4);

    // A zone of a dressing: all its panels one element, by its sketch.
    const plan = { ...PLAN, model: "I" as const, lengthA: 2400 };
    const dressing = withPlan({ ...createReferencePlate(), features: [] }, plan);
    const zone = withZonePartition(dressing.doc, dressing.id, planZones(plan)[0]!);
    if (typeof zone === "string") throw new Error(zone);
    const panels = zone.doc.features.filter((f) => f.type === "extrude" && f.sketch === zone.sketch);
    expect(new Set(panels.map((f) => elementOf(zone.doc, f.id)))).toEqual(new Set([`sketch:${zone.sketch}`]));
  });

  it("la liste des éléments cachés détaille les pièces de chaque meuble, chacune nommée sans le nom du meuble", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [newItem([], "base-bas-2-portes", 800)] } });
    if (typeof built === "string") throw new Error(built);
    const cabinet = built.doc.features.find((f) => f.type === "cabinet")!;
    const fronts = built.doc.features.find((f) => f.type === "fronts" && f.cabinet === cabinet.id)!;
    const hidden = [`${cabinet.id}${PART_SEPARATOR}0`, `${cabinet.id}${PART_SEPARATOR}1`, `${fronts.id}${PART_SEPARATOR}0`];
    const doc = setHidden(built.doc, hidden, true);
    const groups = hiddenGroups(doc, hidden);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.ids).toEqual(hidden);
    expect(groups[0]!.pieces.map((p) => p.id)).toEqual(hidden);
    // Each piece by its own name: no « Bas 2 portes 800 — » before it.
    expect(groups[0]!.pieces.every((p) => p.name.length > 0 && !p.name.startsWith(groups[0]!.name))).toBe(true);
    expect(groups[0]!.pieces.map((p) => p.name)).toContain("Côté gauche");
  });

  it("nomme l'élément seul, compte les autres", () => {
    expect(isolatedText(["Bas 2 portes 800 (A1)"])).toBe("« Bas 2 portes 800 (A1) » isolé");
    expect(isolatedText(["a", "b", "c"])).toBe("3 éléments isolés");
  });
});
