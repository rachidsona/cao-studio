/** Le Plan de cuisine suit un meuble qu'il a fait, changé dans la 3D : largeur, profondeur, hauteur d'un haut, angle. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { runCabinets } from "../../frontend/src/document/kitchen-plan-add";
import { KITCHEN_PLAN, kitchenSizes } from "../../frontend/src/document/kitchen-plan-shapes";
import { syncKitchenPlans } from "../../frontend/src/document/kitchen-sync";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { findFeature, updateFeature } from "../../frontend/src/document/operations";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type KitchenFloorPlan, type KitchenRunItem } from "../../frontend/src/document/types";
import { fillRun, newItem } from "../../frontend/src/features/kitchen-run-items";
import { withAppliance } from "../../frontend/src/document/appliance-place";
import { handAppliances } from "../../frontend/src/document/kitchen-hand-appliances";
import { kitchenRuns, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";

const kitchen = (patch: Partial<KitchenFloorPlan> = {}) => {
  const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "L-left", lengthA: 3600, runs: {}, made: {}, ...patch });
  const items = [newItem([], "base-bas-1-porte", 600)];
  items.push(newItem(items, "base-bas-1-porte", 600), newItem(items, "wall-haut-1-porte", 600));
  const made = withKitchenBuilt(base.doc, base.id, { runs: { A: items } });
  if (typeof made === "string") throw new Error(made);
  return { doc: made.doc, id: base.id, items };
};
const cabinetOf = (doc: CadDocument, id: string, item: string) => findFeature(doc, runCabinets(doc, id, "A").find((c) => c.item === item)!.cabinet) as CabinetFeature;
const resized = (doc: CadDocument, cabinet: string, patch: Partial<CabinetFeature>) => updateFeature(doc, cabinet, (f) => ({ ...f, ...patch }) as CabinetFeature);

describe("le plan de cuisine suit la 3D", () => {
  it("un meuble élargi dans la 3D : son meuble du linéaire aussi, et la cuisine est refaite (le voisin se décale)", () => {
    const { doc, id, items } = kitchen();
    const first = cabinetOf(doc, id, items[0]!.id);
    const second = cabinetOf(doc, id, items[1]!.id);
    const synced = syncKitchenPlans(doc, resized(doc, first.id, { width: 700 }));
    expect(kitchenPlanIn(synced, id)!.runs!.A!.map((i) => i.width)).toEqual([700, 600, 600]);
    const moved = cabinetOf(synced, id, items[1]!.id);
    expect(Math.hypot(moved.origin[0] - second.origin[0], moved.origin[1] - second.origin[1])).toBeCloseTo(100, 3);
  });

  it("la profondeur, la hauteur d'un haut ; la hauteur d'un bas revient à celle du plan de travail", () => {
    const { doc, id, items } = kitchen();
    const wall = cabinetOf(doc, id, items[2]!.id);
    const synced = syncKitchenPlans(doc, resized(doc, wall.id, { height: 900, depth: 300 }));
    expect(kitchenPlanIn(synced, id)!.runs!.A![2]).toMatchObject({ height: 900, depth: 300 });
    const base = cabinetOf(doc, id, items[0]!.id);
    const back = syncKitchenPlans(doc, resized(doc, base.id, { height: 500 }));
    expect(cabinetOf(back, id, items[0]!.id).height).toBe(kitchenSizes(KITCHEN_PLAN).base);
  });

  it("un meuble d'angle élargi : sa porte suit ; rien d'autre ne bouge sans changement, ni les reconstructions du plan", () => {
    const { doc, id } = kitchen({ corners: { left: "unit" } });
    const corner = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name === "Meuble d'angle A")!;
    const synced = syncKitchenPlans(doc, resized(doc, corner.id, { width: kitchenSizes(KITCHEN_PLAN).corner + 550 }));
    expect(kitchenPlanIn(synced, id)!.cornerSizes?.left?.door).toBe(550);
    expect(syncKitchenPlans(doc, doc)).toBe(doc);
    const rebuilt = withKitchenBuilt(doc, id, { lengthA: 3000 });
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    expect(syncKitchenPlans(doc, rebuilt.doc)).toBe(rebuilt.doc);
  });
});

describe("un meuble poussé le long de son mur dans la 3D", () => {
  /** Along run A, from its start to its end (the way its units follow each other). */
  const alongA = (doc: CadDocument, id: string, items: { id: string }[]): [number, number] => {
    const [a, b] = [cabinetOf(doc, id, items[0]!.id), cabinetOf(doc, id, items[1]!.id)];
    const d = Math.hypot(b.origin[0] - a.origin[0], b.origin[1] - a.origin[1]);
    return [(b.origin[0] - a.origin[0]) / d, (b.origin[1] - a.origin[1]) / d];
  };
  const pushed = (doc: CadDocument, c: CabinetFeature, [dx, dy]: [number, number], mm: number) => resized(doc, c.id, { origin: [c.origin[0] + dx * mm, c.origin[1] + dy * mm, c.origin[2]] });

  it("le linéaire garde la place libre qu'il laisse, et le meuble reste où il a été poussé ; repoussé, l'espace s'en va", () => {
    const { doc, id, items } = kitchen();
    const dir = alongA(doc, id, items);
    const wall = cabinetOf(doc, id, items[2]!.id);
    const synced = syncKitchenPlans(doc, pushed(doc, wall, dir, 281));
    const run = kitchenPlanIn(synced, id)!.runs!.A!;
    expect(run.map((i) => [i.model, i.width])).toEqual([["base-bas-1-porte", 600], ["base-bas-1-porte", 600], ["space-wall", 281], ["wall-haut-1-porte", 600]]);
    const now = cabinetOf(synced, id, items[2]!.id);
    expect(now.origin[0]).toBeCloseTo(wall.origin[0] + dir[0] * 281, 3);
    expect(now.origin[1]).toBeCloseTo(wall.origin[1] + dir[1] * 281, 3);
    // The strip shows it as room left free, up, before the unit.
    const plan = kitchenPlanIn(synced, id)!;
    const s = kitchenSizes(plan);
    const fill = fillRun(runGeometry(plan, kitchenRuns(plan).find((r) => r.id === "A")!), plan.runs!.A!, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop });
    expect(fill.placed.map((p) => p.item.model)).not.toContain("space-wall");
    expect(fill.wallFree.some(([a, b]) => Math.abs(b - a - 281) < 1)).toBe(true);
    // Pushed back where it was: the room kept goes.
    const back = syncKitchenPlans(synced, pushed(synced, now, dir, -281));
    expect(kitchenPlanIn(back, id)!.runs!.A!.map((i) => i.model)).toEqual(["base-bas-1-porte", "base-bas-1-porte", "wall-haut-1-porte"]);
  });

  it("poussé sur la place gardée libre qui le suit (collé contre un autre meuble) : elle rétrécit, il reste là, sa plinthe le suit", async () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: {}, made: {} });
    const items = [newItem([], "base-bas-2-portes", 1000)];
    items.push(newItem(items, "space", 38));
    const made = withKitchenBuilt(base.doc, base.id, { runs: { A: items } });
    if (typeof made === "string") throw new Error(made);
    const cab = cabinetOf(made.doc, base.id, items[0]!.id);
    const { cabinetAxes } = await import("../../frontend/src/document/kitchen-catalog");
    const dir = cabinetAxes(cab.rotation ?? 0).along;
    const synced = syncKitchenPlans(made.doc, pushed(made.doc, cab, dir, 1500));
    expect(kitchenPlanIn(synced, base.id)!.runs!.A!.map((i) => [i.model, i.width])).toEqual([["space", 1500], ["base-bas-2-portes", 1000]]);
    const now = cabinetOf(synced, base.id, items[0]!.id);
    expect(now.origin[0]).toBeCloseTo(cab.origin[0] + dir[0] * 1500, 3);
    // The plinth under it, not where it was.
    const kick = kitchenFromPlan(kitchenPlanIn(synced, base.id)!).boxes.find((b) => b.kind === "kick")!;
    expect(Math.round(Math.min(kick.from[0], kick.to[0]))).toBe(Math.round(Math.min(now.origin[0], now.origin[0] + dir[0] * 1000)));
  });

  it("poussé dans son voisin : le plan ne peut pas le dire, il ne change pas", () => {
    const { doc, id, items } = kitchen();
    const first = cabinetOf(doc, id, items[0]!.id);
    const next = pushed(doc, first, alongA(doc, id, items), 100);
    expect(syncKitchenPlans(doc, next)).toBe(next);
  });
});

describe("l'électroménager posé à la main dans une cuisine du plan", () => {
  it("la bande de son linéaire le montre ; la cuisine refaite garde la découpe de son plan de travail, et ce qui est tiré d'une de ses pièces", () => {
    const { doc, id, items } = kitchen();
    const c = cabinetOf(doc, id, items[1]!.id);
    const top = doc.features.find((f) => f.name === "Plan de travail A")!;
    const z = c.origin[2] + c.height;
    const placed = withAppliance(doc, "hob-induction", [590, 55, 520], "black", c, { worktop: { body: top.id, box: [[c.origin[0] - 1000, c.origin[1] - 1000, z], [c.origin[0] + 1000, c.origin[1] + 1000, z + 40]] } });
    if (typeof placed === "string") throw new Error(placed);
    const plan = kitchenPlanIn(placed.doc, id)!;
    const shown = handAppliances(placed.doc, plan, kitchenRuns(plan).find((r) => r.id === "A")!);
    expect(shown.map((a) => a.name)).toEqual(["Plaque induction"]);
    // Over its cabinet, as the strip places it.
    const s = kitchenSizes(plan);
    const run = kitchenRuns(plan).find((r) => r.id === "A")!;
    const at = fillRun(runGeometry(plan, run), plan.runs!.A!, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop }).placed.find((p) => p.item.id === items[1]!.id)!.at;
    expect(shown[0]!.from).toBeCloseTo(at + 5, 0);
    expect(shown[0]!.to).toBeCloseTo(at + 595, 0);
    // Its pieces deleted (the operation left): no longer on the strip, and another hob may go there.
    const parts = placed.doc.bodyInfo ? Object.keys(placed.doc.bodyInfo).filter((k) => k.startsWith(`${placed.id}#`)) : [];
    const deleted = { ...placed.doc, removedBodies: parts };
    expect(handAppliances(deleted, plan, run)).toEqual([]);
    expect(typeof withAppliance(deleted, "hob-induction", [590, 55, 520], "black", c, { worktop: { body: top.id, box: [[c.origin[0] - 1000, c.origin[1] - 1000, z], [c.origin[0] + 1000, c.origin[1] + 1000, z + 40]] } })).not.toBe("string");
    // Made again (another length of wall): the hob's cut is still in the worktop of that name.
    // And a face pulled by hand from a piece the plan made (as from a filler).
    const kick = placed.doc.features.find((f) => f.name === "Plinthe A")!;
    const pulled = { id: "ex99", type: "extrude", name: "Extrusion 1", faces: [{ type: "PLANE", center: [0, 50, 1250], rel: [0, 0.5, 0.5], normal: [-1, 0, 0], area: 0 }], target: kick.id, distance: 100, operation: "new" } as unknown as CadDocument["features"][number];
    const handMade = { ...placed.doc, features: [...placed.doc.features, pulled], bodyNames: { ...placed.doc.bodyNames, ex99: "Ma pièce" } };
    const rebuilt = withKitchenBuilt(handMade, id, { lengthA: 3400 });
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    const cut = rebuilt.doc.features.find((f) => f.type === "machining" && f.name === "Découpe Plaque induction");
    expect(cut?.type === "machining" && findFeature(rebuilt.doc, cut.target)?.name).toBe("Plan de travail A");
    const again = rebuilt.doc.features.find((f) => f.name === "Extrusion 1");
    expect(again?.type === "extrude" && findFeature(rebuilt.doc, again.target!)?.name).toBe("Plinthe A");
    expect(rebuilt.doc.bodyNames?.[again!.id]).toBe("Ma pièce");
  });
});

describe("un meuble du plan poussé avec sa plaque posée à la main", () => {
  it("la plaque et sa découpe le suivent, et la cuisine refaite les garde là", async () => {
    const { appliancesFollow } = await import("../../frontend/src/document/appliance-follow");
    const { doc, id, items } = kitchen();
    const [a, c] = [cabinetOf(doc, id, items[0]!.id), cabinetOf(doc, id, items[1]!.id)];
    const d = Math.hypot(c.origin[0] - a.origin[0], c.origin[1] - a.origin[1]);
    const dir: [number, number] = [(c.origin[0] - a.origin[0]) / d, (c.origin[1] - a.origin[1]) / d];
    const top = doc.features.find((f) => f.name === "Plan de travail A")!;
    const z = c.origin[2] + c.height;
    const placed = withAppliance(doc, "hob-induction", [590, 55, 520], "black", c, { worktop: { body: top.id, box: [[c.origin[0] - 2000, c.origin[1] - 2000, z], [c.origin[0] + 2000, c.origin[1] + 2000, z + 40]] } });
    if (typeof placed === "string") throw new Error(placed);
    const hob = placed.doc.features.find((f) => f.id === placed.id)!;
    const cutOf = (x: CadDocument) => x.features.find((f) => f.type === "machining" && f.name === "Découpe Plaque induction")!;
    const pushed = updateFeature(placed.doc, c.id, (f) => ({ ...f, origin: [c.origin[0] + dir[0] * 200, c.origin[1] + dir[1] * 200, c.origin[2]] }) as CabinetFeature);
    // As the editor does: appliances, the plan, appliances again (those the plan moved).
    const out = appliancesFollow(placed.doc, syncKitchenPlans(placed.doc, appliancesFollow(placed.doc, pushed)), false);
    const now = out.features.find((f) => f.id === placed.id)!;
    if (now.type !== "appliance" || hob.type !== "appliance") throw new Error("appliance");
    expect(now.origin[0]).toBeCloseTo(hob.origin[0] + dir[0] * 200, 3);
    expect(now.origin[1]).toBeCloseTo(hob.origin[1] + dir[1] * 200, 3);
    expect(kitchenPlanIn(out, id)!.runs!.A!.map((i) => i.model)).toContain("space");
    const [was, is] = [cutOf(placed.doc), cutOf(out)];
    if (was.type !== "machining" || is.type !== "machining" || was.ops[0]!.kind !== "box" || is.ops[0]!.kind !== "box") throw new Error("cut");
    expect(is.ops[0]!.from[0]).toBeCloseTo(was.ops[0]!.from[0] + dir[0] * 200, 3);
    expect(findFeature(out, is.target)?.name).toBe("Plan de travail A");
  });
});

describe("liens de Prolonger élément sur une cuisine refaite", () => {
  it("restent sur le même meuble, pas sur celui qui prend son numéro ; ôtés quand il n'est plus", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 3000 });
    let items: KitchenRunItem[] = [];
    for (const [m, w] of [["base-bas-2-portes", 800], ["base-bas-1-porte", 600], ["base-bas-3-tiroirs", 600]] as const) items = [...items, newItem(items, m, w)];
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const cab = (d: CadDocument, start: string) => d.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith(start))!;
    const face = { type: "PLANE" as const, center: [0, 0, 0] as [number, number, number], rel: [0.5, 0.5, 0.5] as [number, number, number], normal: [1, 0, 0] as [number, number, number], area: 0 };
    const doc: CadDocument = { ...built.doc, extendLinks: [{ id: "pl1", from: { body: `${cab(built.doc, "Bas 3 tiroirs").id}#0`, face }, to: { body: `${cab(built.doc, "Bas 1 porte").id}#1`, face } }] };
    // The first unit taken out: the others are made again, their ids given out anew.
    const again = withKitchenBuilt(doc, made.id, { runs: { A: items.slice(1) } });
    if (typeof again === "string") throw new Error(again);
    const link = again.doc.extendLinks![0]!;
    expect(link.from.body).toBe(`${cab(again.doc, "Bas 3 tiroirs").id}#0`);
    expect(link.to.body).toBe(`${cab(again.doc, "Bas 1 porte").id}#1`);
    // The unit it held on to taken out: the link goes.
    const gone = withKitchenBuilt(again.doc, made.id, { runs: { A: [items[2]!] } });
    if (typeof gone === "string") throw new Error(gone);
    expect(gone.doc.extendLinks).toBeUndefined();
  });

  it("ses tiroirs changés dans Façades : le plan les garde, la cuisine refaite (un OK du linéaire) aussi", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: {}, made: {} });
    const items = [newItem([], "base-bas-2-tiroirs-et-casserolier-traverses", 900)];
    const made = withKitchenBuilt(base.doc, base.id, { runs: { A: items } });
    if (typeof made === "string") throw new Error(made);
    const fronts = (d: CadDocument) => d.features.find((f): f is FrontsFeature => f.type === "fronts")!;
    expect(fronts(made.doc).drawers).toBe(3);
    // Untouched, the plan stays as it is.
    expect(syncKitchenPlans(made.doc, made.doc)).toBe(made.doc);
    const two = updateFeature(made.doc, fronts(made.doc).id, (f) => ({ ...f, drawers: 2 }) as FrontsFeature);
    const synced = syncKitchenPlans(made.doc, two);
    expect(kitchenPlanIn(synced, base.id)!.runs!.A![0]).toMatchObject({ layout: "drawers", drawers: 2 });
    const again = withKitchenBuilt(synced, base.id, {});
    if (typeof again === "string") throw new Error(again);
    expect(fronts(again.doc).drawers).toBe(2);
    // Made doors: the plan keeps them too.
    const doors = syncKitchenPlans(again.doc, updateFeature(again.doc, fronts(again.doc).id, (f) => ({ ...f, layout: "doors" }) as FrontsFeature));
    expect(kitchenPlanIn(doors, base.id)!.runs!.A![0]!.layout).toBe("doors");
  });

  it("sa traverse avant mise debout dans Caisson : le plan la garde, la cuisine refaite aussi", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: {}, made: {} });
    const made = withKitchenBuilt(base.doc, base.id, { runs: { A: [newItem([], "base-bas-2-tiroirs-et-casserolier-traverses", 900)] } });
    if (typeof made === "string") throw new Error(made);
    const cab = (d: CadDocument) => d.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
    const synced = syncKitchenPlans(made.doc, resized(made.doc, cab(made.doc).id, { railFront: "edge" }));
    expect(kitchenPlanIn(synced, base.id)!.runs!.A![0]!.railFront).toBe("edge");
    const again = withKitchenBuilt(synced, base.id, {});
    if (typeof again === "string") throw new Error(again);
    expect(cab(again.doc).railFront).toBe("edge");
    // Lying flat again: forgotten.
    const flat = syncKitchenPlans(again.doc, resized(again.doc, cab(again.doc).id, { railFront: undefined }));
    expect(kitchenPlanIn(flat, base.id)!.runs!.A![0]!.railFront).toBeUndefined();
  });
});
