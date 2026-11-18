/** Les types de meubles du commerce : tiroirs, coulissants, ouverts, vitrés, relevants — dans la liste, sur un linéaire, suivis de la 3D. */
import { describe, expect, it } from "vitest";
import { CATALOG, addKitchenUnit } from "../../frontend/src/document/kitchen-catalog";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { syncKitchenPlans } from "../../frontend/src/document/kitchen-sync";
import { createReferencePlate, type CadDocument, type FrontsFeature, type KitchenRunItem } from "../../frontend/src/document/types";
import { modelOf, newItem } from "../../frontend/src/features/kitchen-run-items";
import { unitSummary } from "../../frontend/src/app/kitchen/unit-elevation";
import { frontsHardware, frontsParts, frontsProblem } from "../../frontend/src/features/fronts-parts";

const entry = (id: string) => CATALOG.find((e) => e.id === id)!;
const fronts = (doc: CadDocument) => doc.features.filter((f): f is FrontsFeature => f.type === "fronts");

describe("types de meubles de cuisine", () => {
  it("chaque famille a ses types du commerce, à leurs largeurs", () => {
    const names = (kind: string) => [...new Set(CATALOG.filter((e) => e.kind === kind).map((e) => e.name))];
    expect(names("base")).toEqual(expect.arrayContaining(["Bas 4 tiroirs", "Bas 5 tiroirs", "Bas coulissant bouteilles et épices", "Bas poubelle coulissante", "Bas ouvert"]));
    expect(names("wall")).toEqual(expect.arrayContaining(["Haut vitré", "Haut relevant", "Haut relevant bas", "Haut égouttoir", "Haut ouvert"]));
    expect(names("tall")).toEqual(expect.arrayContaining(["Colonne garde-manger", "Colonne coulissante étroite", "Colonne balais", "Colonne vitrine"]));
    expect(entry("base-bas-coulissant-bouteilles-et-epices-150").width).toBe(150);
    // A glazed unit under 60 cm: one door.
    expect(entry("wall-haut-vitre-400").layout).toBe("door");
    expect(unitSummary(entry("wall-haut-relevant-800"))).toBe("1 porte relevante · 1 étagère");
    expect(unitSummary(entry("wall-haut-vitre-800"))).toBe("2 portes · vitré · 2 étagères");
    expect(unitSummary(entry("base-bas-ouvert-400"))).toBe("Ouvert · 2 étagères");
  });

  it("ajouté de la liste : la porte relevante s'ouvre par le haut, le vitré est vitré, l'ouvert n'a pas de façade", () => {
    const lift = addKitchenUnit(createReferencePlate(), entry("wall-haut-relevant-800"));
    expect(lift.fronts).toMatchObject({ layout: "door", side: "top" });
    const glass = addKitchenUnit(createReferencePlate(), entry("tall-colonne-vitrine-500"));
    expect(glass.fronts).toMatchObject({ layout: "door", style: "glass" });
    const open = addKitchenUnit(createReferencePlate(), entry("base-bas-ouvert-400"));
    expect(open.fronts).toBeNull();
    expect(open.cabinet.shelves).toBe(2);
  });

  it("sur un linéaire : bâtis avec leurs façades, et la 3D ne réécrit pas le plan ; changés dans la 3D, le plan les garde", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 3000 });
    let items: KitchenRunItem[] = [];
    for (const id of ["base-bas-4-tiroirs-600", "wall-haut-relevant-800", "wall-haut-vitre-600"]) items = [...items, newItem(items, modelOf(entry(id)), entry(id).width)];
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const doc = built.doc;
    const of = (start: string) => fronts(doc).find((f) => f.name.startsWith(`Façades ${start}`))!;
    expect(of("Bas 4 tiroirs")).toMatchObject({ layout: "drawers", drawers: 4 });
    expect(of("Haut relevant")).toMatchObject({ layout: "door", side: "top" });
    expect(of("Haut vitré")).toMatchObject({ style: "glass" });
    // Nothing changed in the 3D: the same document (the model's door and glass are not written on the items).
    expect(syncKitchenPlans(doc, doc)).toBe(doc);
    // The glazed unit made plain in the 3D: the plan keeps it plain.
    const glazed = of("Haut vitré");
    const plain = { ...doc, features: doc.features.map((f) => (f.id === glazed.id ? { ...glazed, style: "flat" as const } : f)) };
    const synced = syncKitchenPlans(doc, plain);
    const item = kitchenPlanIn(synced, made.id)!.runs!.A!.find((i) => i.model === modelOf(entry("wall-haut-vitre-600")))!;
    expect(item.facade).toEqual({ style: "flat" });
  });
});

describe("tiroir et porte, tiroirs à l'anglaise", () => {
  const unit = (id: string) => addKitchenUnit(createReferencePlate(), entry(id));
  it("bas tiroir et 2 portes : les portes sous la façade du tiroir, son caisson derrière ; coulisses et poignées comptées", () => {
    const { fronts: f, cabinet } = unit("base-bas-tiroir-et-2-portes-800");
    const parts = frontsParts(f!, cabinet);
    const doors = parts.filter((p) => p.role?.kind === "door");
    const front = parts.find((p) => p.name === "Façade tiroir 1")!;
    expect(doors.map((d) => d.name)).toEqual(["Porte gauche", "Porte droite"]);
    // The doors stop a gap under the drawer front, which is 150 mm high at the top.
    expect(Math.round(front.to[2] - front.from[2])).toBe(150);
    expect(Math.round(front.from[2] - doors[0]!.to[2])).toBe(f!.gap);
    expect(parts.filter((p) => p.name.startsWith("Tiroir 1 —"))).toHaveLength(5);
    const hw = frontsHardware(f!, cabinet);
    expect(hw.find((h) => h.name.startsWith("Coulisse"))?.quantity).toBe(1);
    expect(hw.find((h) => h.name.startsWith("Poignée"))?.quantity).toBe(3);
    expect(unitSummary(entry("base-bas-tiroir-et-2-portes-800"))).toBe("1 tiroir · 2 portes · 1 étagère");
  });

  it("tiroirs à l'anglaise : derrière les portes, sans façade, en retrait des charnières ; leurs coulisses comptées", () => {
    const { fronts: f, cabinet } = unit("base-bas-tiroirs-a-l-anglaise-800");
    const parts = frontsParts(f!, cabinet);
    expect(parts.filter((p) => p.role?.kind === "drawer")).toHaveLength(0);
    const sides = parts.filter((p) => /^Tiroir intérieur \d — côté gauche$/.test(p.name));
    expect(sides).toHaveLength(3);
    // Clear of the hinge plates: narrower than an outer drawer, behind the door.
    expect(sides[0]!.from[0] - cabinet.origin[0]).toBeCloseTo(cabinet.thickness + 12.5 + 25);
    expect(frontsHardware(f!, cabinet).find((h) => h.name.startsWith("Coulisse"))?.quantity).toBe(3);
    expect(unitSummary(entry("base-bas-tiroirs-a-l-anglaise-800"))).toBe("2 portes · 3 tiroirs à l'anglaise");
  });

  it("refuse un tiroir trop bas, une porte qui ne reste pas, et un tiroir sur une porte relevante", () => {
    const { fronts: f, cabinet } = unit("base-bas-tiroir-et-porte-600");
    expect(frontsProblem({ ...f!, topDrawer: 50 }, cabinet)).toMatch(/80 mm/);
    expect(frontsProblem({ ...f!, topDrawer: 600 }, cabinet)).toMatch(/200 mm de porte/);
    expect(frontsProblem({ ...f!, side: "top" }, cabinet)).toMatch(/relevable/);
    expect(frontsProblem({ ...f!, innerDrawers: 9 }, cabinet)).toMatch(/1 à 5/);
    expect(frontsProblem(f!, cabinet)).toBeNull();
  });
});
