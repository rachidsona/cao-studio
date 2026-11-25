/** Le plan de cuisine vu de dessus : modèles, linéaires, leur remplissage, la cuisine 3D tirée du plan et refaite quand il change. */
import { describe, expect, it } from "vitest";
import { cabinetBox } from "../../frontend/src/document/kitchen-catalog";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_MODELS, KITCHEN_PLAN, kitchenJoints, kitchenPlanProblem, kitchenRuns, kitchenSizes, runGeometry, type KitchenModel } from "../../frontend/src/document/kitchen-plan-shapes";
import { kitchenPlanIn, kitchenRunOf, runsLost, withKitchenBuilt, withKitchenChanged, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { kitchenMarks, kitchenRoomInfo, linkedKitchen } from "../../frontend/src/document/kitchen-plan-room";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";
import { layersOf } from "../../frontend/src/document/layers";
import { createReferencePlate, type CadDocument, type KitchenFloorPlan, type KitchenRunItem, type MachiningFeature, type RoomFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { KITCHEN, kitchenLayout } from "../../frontend/src/features/kitchen-layout";
import { fillRun, itemEntry, newItem, type RunFill } from "../../frontend/src/features/kitchen-run-items";

/** A unit's box over its socle: its sides are notched there for the plinth set back (document/kick-notches.ts). */
const overSocle = (u: Parameters<typeof cabinetBox>[0] & { plinth?: number }): [Box[0], Box[1]] => {
  const [lo, hi] = cabinetBox(u);
  return [[lo[0], lo[1], lo[2] + (u.plinth ?? 0)], hi];
};

const empty = (): CadDocument => ({ ...createReferencePlate(), features: [] });
const plan = (patch: Partial<KitchenFloorPlan> = {}): KitchenFloorPlan => ({ ...KITCHEN_PLAN, ...patch });
const items = (...list: [string, number][]): KitchenRunItem[] => list.reduce<KitchenRunItem[]>((all, [model, width]) => [...all, newItem(all, model, width)], []);
const heights = (p: KitchenFloorPlan) => ({ worktop: p.worktopHeight, wallBottom: kitchenSizes(p).wallBottom, wallTop: kitchenSizes(p).wallTop });
const fillOf = (p: KitchenFloorPlan, id: string, list: KitchenRunItem[]): RunFill => {
  const run = kitchenRuns(p).find((r) => r.id === id)!;
  return fillRun(runGeometry({ ...p, runs: { [id]: list } }, run), list, heights(p));
};
type Box = [number[], number[]];
const overlaps = (a: Box, b: Box) => [0, 1, 2].every((i) => a[0][i]! < b[1][i]! - 1e-6 && b[0][i]! < a[1][i]! - 1e-6);

describe("modèles du plan de cuisine", () => {
  it("donnent chacun un plan possible, avec ou sans îlot", () => {
    for (const model of Object.keys(KITCHEN_MODELS) as KitchenModel[]) {
      expect(kitchenPlanProblem(plan({ model })), model).toBeNull();
      if (!KITCHEN_MODELS[model].noIsland && model !== "U" && model !== "G-left" && model !== "G-right") expect(kitchenPlanProblem(plan({ model, island: true })), model).toBeNull();
    }
  });

  it("un linéaire par mur, un pour la péninsule, un pour l'îlot", () => {
    expect(kitchenRuns(plan({ model: "I" })).map((r) => r.id)).toEqual(["A"]);
    expect(kitchenRuns(plan({ model: "U" })).map((r) => r.id)).toEqual(["A", "B", "C"]);
    expect(kitchenRuns(plan({ model: "facing" })).map((r) => r.id)).toEqual(["A", "D"]);
    const g = kitchenRuns(plan({ model: "G-left", island: true, lengthA: 4200 }));
    expect(g.map((r) => [r.id, r.label, r.wall])).toEqual([["A", "Mur A", true], ["B", "Mur B", true], ["P", "Péninsule", false], ["I", "Îlot", false]]);
    expect(kitchenJoints(plan({ model: "G-left" })).map((j) => j.walls)).toEqual([["Mur A", "Mur B"], ["Mur A", "Péninsule"]]);
  });

  it("à l'angle, le mur qui passe va jusqu'au mur ; l'autre s'arrête contre lui", () => {
    const [a, b] = kitchenRuns(plan({ model: "L-left" }));
    expect([a!.left, b!.right]).toEqual(["pass", "stop"]);
    expect(a!.zone.outline).toEqual([[0, -640], [3600, -640], [3600, 0], [0, 0]]);
    expect(b!.zone.run.length).toBe(1760);
    const [a2, b2] = kitchenRuns(plan({ model: "L-left", through: { left: true } }));
    expect([a2!.left, b2!.right, a2!.zone.run.length, b2!.zone.run.length]).toEqual(["stop", "pass", 2960, 2400]);
  });

  it("l'îlot fait face au mur A, au passage voulu, et ne touche rien", () => {
    const island = kitchenRuns(plan({ model: "I", island: true })).find((r) => r.id === "I")!;
    expect(island.zone.outline).toEqual([[900, -2340], [2700, -2340], [2700, -1740], [900, -1740]]);
    expect(island.zone.run.normal).toEqual([0, 1]);
    // Off the middle of wall A (typed in the plan, or where it was moved in the 3D); no further than the wall is long.
    expect(kitchenRuns(plan({ model: "I", island: true, islandShift: -300 })).find((r) => r.id === "I")!.zone.outline[0]).toEqual([600, -2340]);
    expect(kitchenPlanProblem(plan({ model: "I", island: true, islandShift: 4000 }))).toMatch(/L'îlot se décale/);
    expect(kitchenPlanProblem(plan({ model: "U", island: true, lengthA: 2400 }))).toMatch(/L'îlot touche/);
    expect(kitchenPlanProblem(plan({ model: "I", island: true, passage: 500 }))).toMatch(/passage/);
  });
});

describe("linéaire", () => {
  it("les meubles se suivent depuis l'angle, le reste va au fileur du bout libre", () => {
    const fill = fillOf(plan({ model: "I", lengthA: 2450 }), "A", items(["base-bas-3-tiroirs", 600], ["base-bas-1-porte", 600], ["base-bas-1-porte", 600], ["base-bas-1-porte", 600]));
    expect(fill.placed.map((p) => p.at)).toEqual([0, 600, 1200, 1800]);
    expect(fill.fillers).toEqual([[2400, 2450]]);
  });

  it("à l'angle mort, les meubles partent derrière le passage des façades", () => {
    const fill = fillOf(plan({ model: "L-left" }), "A", items(["base-bas-1-porte", 600]));
    expect(fill.placed[0]!.at).toBe(kitchenSizes(KITCHEN_PLAN).corner);
  });

  it("ce qui ne tient pas est dit, une colonne coupe la rangée haute", () => {
    const fill = fillOf(plan({ model: "I", lengthA: 1800 }), "A", items(["app-fridge", 600], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 600], ["wall-haut-1-porte", 600], ["base-bas-2-portes", 1200]));
    expect(fill.missing.map((m) => m.width)).toEqual([1200]);
    expect(fill.problems[0]).toMatch(/ne tient pas/);
    expect(fill.placed.filter((p) => p.row === "wall").map((p) => p.at)).toEqual([600, 1200]);
  });

  it("l'électroménager a ses contraintes", () => {
    const fill = fillOf(plan({ model: "I", lengthA: 3000 }), "A", items(["app-hob", 600], ["app-dishwasher", 600], ["base-bas-1-porte", 600], ["app-sink", 600], ["wall-haut-1-porte", 600], ["app-hood", 600]));
    expect(fill.problems).toContain("La hotte n'est pas au-dessus d'une plaque.");
    expect(fill.problems).toContain("Le lave-vaisselle n'est pas à côté de l'évier.");
    expect(fill.problems.some((p) => p.startsWith("Gardez au moins 30 cm"))).toBe(true);
    expect(itemEntry(items(["app-sink", 800])[0]!)).toMatchObject({ kind: "base", top: "rails", layout: "doors" });
  });
});

describe("« Proposer une cuisine » reproduit l'Implantation", () => {
  const compare = (layout: "I" | "L" | "U", model: KitchenModel) => {
    const settings = { ...KITCHEN, layout, lengthA: 3400, lengthB: 2600, lengthC: 2200, baseDepth: 580, appliances: true, fridge: true, splashback: true, kick: true, corner: "dead" as const };
    const p = plan({ model, lengthA: 3400, lengthB: 2600, lengthC: 2200, worktopHeight: 908 });
    const proposed = proposeKitchen(p);
    const ours = kitchenFromPlan({ ...p, ...proposed }).units.map((u) => `${Math.round(u.origin[0])},${Math.round(u.origin[1])},${u.width},${u.rotation},${u.layout}`).sort();
    const theirs = kitchenLayout(settings).units.map((u) => `${Math.round(u.origin[0])},${Math.round(u.origin[1])},${u.width},${u.rotation},${u.layout}`).sort();
    expect(ours).toEqual(theirs);
  };
  it("droite", () => compare("I", "I"));
  it("en L", () => compare("L", "L-left"));
  it("en U", () => compare("U", "U"));
});

describe("la cuisine tirée du plan", () => {
  it("rien ne se chevauche, en U avec meubles d'angle, et l'électroménager est sur son calque", () => {
    const p = plan({ model: "U", lengthA: 3600, corner: "unit" });
    const layout = kitchenFromPlan({ ...p, ...proposeKitchen(p) });
    const boxes: Box[] = [...layout.units.map(overSocle), ...layout.boxes.filter((b) => b.kind !== "wall" && b.kind !== "worktop" && b.kind !== "splashback" && b.kind !== "appliance").map((b): Box => [b.from, b.to])];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${i} et ${j}`).toBe(false);
    expect(layout.units.filter((u) => u.name.startsWith("Meuble d'angle")).map((u) => u.run)).toEqual(["A", "A"]);
  });

  it("chaque modèle, proposé, angles d'un côté ou de l'autre : rien ne se chevauche", () => {
    for (const model of Object.keys(KITCHEN_MODELS) as KitchenModel[]) {
      for (const through of [{}, { left: true, right: true }]) {
        const p = plan({ model, lengthA: 4200, island: !KITCHEN_MODELS[model].noIsland && !["U", "G-left", "G-right"].includes(model), through });
        const layout = kitchenFromPlan({ ...p, ...proposeKitchen(p) });
        expect(layout.units.length, model).toBeGreaterThan(3);
        const boxes: Box[] = [...layout.units.map(overSocle), ...layout.boxes.filter((b) => b.kind === "filler" || b.kind === "panel").map((b): Box => [b.from, b.to])];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${model} ${JSON.stringify(through)} : ${i} et ${j}`).toBe(false);
      }
    }
  });

  it("OK bâtit tout en une fois ; refait, il remplace ; le plan changé suit", () => {
    const made = withKitchenPlan(empty(), plan({ model: "L-left" }));
    const proposed = proposeKitchen(plan({ model: "L-left" }));
    const built = withKitchenBuilt(made.doc, made.id, proposed);
    if (typeof built === "string") throw new Error(built);
    expect(() => parseDocument(built.doc)).not.toThrow();
    const stored = kitchenPlanIn(built.doc, made.id)!;
    const count = built.doc.features.length;
    expect(Object.keys(stored.made!)).toEqual(["A", "B"]);
    expect(built.doc.features.some((f) => f.type === "machining" && (f as MachiningFeature).cutouts?.length)).toBe(true);
    expect(layersOf(built.doc).map((l) => l.name)).toEqual(expect.arrayContaining(["Pièce", "Électroménager"]));
    const cabinet = built.doc.features.find((f) => f.type === "cabinet")!;
    expect(kitchenRunOf(built.doc, cabinet.id)).toEqual({ plan: made.id, run: "A" });
    const again = withKitchenBuilt(built.doc, made.id);
    if (typeof again === "string") throw new Error(again);
    expect(again.doc.features.length).toBe(count);
    expect(runsLost(again.doc, made.id, plan({ model: "I" }))).toEqual(["Mur B"]);
    const changed = withKitchenChanged(again.doc, made.id, { ...stored, model: "I", lengthA: 4000 });
    if (typeof changed === "string") throw new Error(changed);
    const after = kitchenPlanIn(changed.doc, made.id)!;
    expect(Object.keys(after.runs!)).toEqual(["A"]);
    expect(changed.doc.features.filter((f) => f.type === "cabinet").every((c) => kitchenRunOf(changed.doc, c.id)?.run === "A")).toBe(true);
  });
});

describe("le plan sur la Pièce relevée", () => {
  // A 4 × 3 m room: a window on wall A (1,2 m at 1,4 m), a door on wall B (0,9 m at 1,5 m), a drop of the ceiling along C.
  const room: RoomFeature = {
    id: "rm1", type: "room", name: "Cuisine", height: 2500, thickness: 200,
    walls: [{ length: 4000, angle: 90 }, { length: 3000, angle: 90 }, { length: 4000, angle: 90 }, { length: 3000, angle: 90 }],
    obstacles: [{ kind: "window", wall: 0, at: 1400, width: 1200, height: 1100, sill: 1000 }, { kind: "door", wall: 3, at: 1000, width: 900, height: 2100 }, { kind: "beam", wall: 1, depth: 400, drop: 300 }],
  };
  const doc = (): CadDocument => ({ ...empty(), features: [room] });

  it("prend les cotes de la pièce, marque porte, fenêtre et retombée", () => {
    const linked = linkedKitchen(plan({ model: "U" }), room, 0);
    if (typeof linked === "string") throw new Error(linked);
    expect([linked.lengthA, linked.lengthB, linked.lengthC, linked.height]).toEqual([4000, 3000, 3000, 2500]);
    expect(kitchenMarks(doc(), linked).map((m) => m.kind).sort()).toEqual(["beam", "door", "window"]);
  });

  it("les meubles laissent la porte libre, et la fenêtre en haut", () => {
    const linked = linkedKitchen(plan({ model: "L-left" }), room, 0) as KitchenFloorPlan;
    const info = kitchenRoomInfo(doc(), linked)!;
    // Wall B is the room's wall 3, measured here from its far end, as the room measures it: the door from 1000 to 1900.
    expect(info.B!.spans[0]).toMatchObject({ from: 1000, to: 1900 });
    const proposed = kitchenFromPlan({ ...linked, ...proposeKitchen(linked, info) }, info);
    const b = proposed.fills.B!.placed.filter((p) => p.row === "base");
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((p) => p.at + p.item.width <= 950 || p.at >= 1950)).toBe(true);
    const highs = proposed.fills.A!.placed.filter((p) => p.row === "wall");
    expect(highs.every((p) => p.at + p.item.width <= 1350 || p.at >= 2650)).toBe(true);
  });
});
