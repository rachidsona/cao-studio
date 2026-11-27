/** Un caisson de cuisine aménagé à la main : une Répartition de mêmes cotes à sa place, le linéaire lui gardant sa place. */
import { describe, expect, it } from "vitest";
import { cabinetOfBody, withCabinetFurnished, withCaissonsPlaced } from "../../frontend/src/document/cabinet-furnish";
import { caissonEntry, caissonSpecOf, withCaissonInCase } from "../../frontend/src/document/caisson-spec";
import { withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { cabinetBox } from "../../frontend/src/document/kitchen-catalog";
import { kitchenPlanIn, kitchenPlanOf, kitchenRunOf, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { withDeletedFreed } from "../../frontend/src/document/kitchen-delete-sync";
import { pieceItemOf } from "../../frontend/src/document/kitchen-plan-add";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { deleteFeatures } from "../../frontend/src/document/operations";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature, type KitchenRunItem, type NicheFeature, type SketchFeature, type TrimFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { FINISH_DEFAULTS } from "../../frontend/src/features/finish-parts";
import { frontsParts } from "../../frontend/src/features/fronts-parts";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
import { nichePartsIn } from "../../frontend/src/features/niche-parts";
import { frameOf } from "../../frontend/src/sketcher/frame";
import { isPartition, isShelves } from "../../frontend/src/sketcher/partition-history";

const items = (...list: [string, number][]): KitchenRunItem[] => list.reduce<KitchenRunItem[]>((all, [model, width]) => [...all, newItem(all, model, width)], []);

function kitchen(): { doc: CadDocument; plan: string } {
  const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
  const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items(["base-bas-2-portes", 800], ["base-bas-3-tiroirs", 600], ["wall-haut-1-porte", 600]) } });
  if (typeof built === "string") throw new Error(built);
  return { doc: built.doc, plan: made.id };
}

/** The world box of a caisson: its sketch's outline on its frame, out to its depth. */
function caissonBox(doc: CadDocument, sketchId: string): [number[], number[]] {
  const sketch = doc.features.find((f) => f.id === sketchId) as SketchFeature;
  const partition = sketch.offsets!.find(isPartition)!;
  const depth = partition.step.kind === "partition" ? partition.step.depth! : 0;
  const { origin, u, v, normal } = frameOf(sketch);
  const xs = sketch.points.map((p) => p.x);
  const ys = sketch.points.map((p) => p.y);
  const corners = [Math.min(...xs), Math.max(...xs)].flatMap((x) => [Math.min(...ys), Math.max(...ys)].flatMap((y) => [0, depth].map((d) => [0, 1, 2].map((i) => origin[i]! + u[i]! * x + v[i]! * y + normal[i]! * d))));
  return [[0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]!))), [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]!)))];
}

describe("caisson de cuisine aménagé", () => {
  it("aménagé, il garde ce que son meuble avait : l'évier et sa découpe ; une colonne reste sans plan de travail ; ses côtés vont au sol comme ceux du meuble", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items(["app-sink", 1200], ["tall-colonne-garde-manger", 600]) } });
    if (typeof built === "string") throw new Error(built);
    let doc = built.doc;
    for (const name of ["Évier", "Colonne garde-manger"]) {
      const c = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith(name))!;
      const done = withCabinetFurnished(doc, c.id);
      if (typeof done === "string") throw new Error(done);
      doc = done.doc;
    }
    expect(doc.features.some((f) => f.type === "cabinet")).toBe(false);
    expect(doc.features.filter((f) => f.type === "appliance").map((f) => f.name)).toEqual(expect.arrayContaining(["Évier", "Robinet"]));
    expect(doc.features.some((f) => f.type === "machining" && f.name.startsWith("Découpes Plan de travail A"))).toBe(true);
    // The worktop over the sink's caisson, up to the column's side only.
    const top = doc.features.find((f) => f.type === "extrude" && f.name === "Plan de travail A")!;
    const xs = (doc.features.find((x) => top.type === "extrude" && x.id === top.sketch) as SketchFeature).points.map((q) => q.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1200 + 1);
    // Its top: two rails as the sink unit's, no board (its top open), and no back — the sink and its pipes come through.
    const sinkSketch = doc.features.find((f) => f.type === "sketch" && f.name.startsWith("Caisson — Évier")) as SketchFeature;
    const step = sinkSketch.offsets!.find(isPartition)!.step;
    expect(step.kind === "partition" && step.input.openTop).toBe(true);
    expect(step.kind === "partition" && step.back).toBeUndefined();
    const rails = doc.features.find((f): f is NicheFeature => f.type === "niche" && f.sketch === sinkSketch.id && f.fill === "accessory")!;
    // Both on their edge, as the sink unit's: 10 cm high, one board thick, level with the top of the sides.
    expect(rails.accessory).toEqual({ model: "sink-rails-edge", lift: 0 });
    const boards = nichePartsIn(doc.features, rails);
    expect(boards.map((q) => q.name)).toEqual(["Traverse avant", "Traverse arrière"]);
    expect(boards.map((q) => [Math.round(q.to[1] - q.from[1]), Math.round(q.to[2] - q.from[2])])).toEqual([[100, 18], [100, 18]]);
    expect(boards[0]!.to[1]).toBeCloseTo(boards[1]!.to[1], 6);
    expect(doc.features.some((f) => f.type === "extrude" && f.sketch === sinkSketch.id && f.name === "Dessus")).toBe(false);
    expect(doc.features.some((f) => f.type === "niche" && f.sketch === sinkSketch.id && f.fill === "back")).toBe(false);
    // As the cabinet it was: its sides down to the floor (notched for the plinth by the kernel: kick-notches.test.ts).
    const sink = doc.features.find((f) => f.type === "sketch" && f.name.startsWith("Caisson — Évier")) as SketchFeature;
    const record = sink.offsets!.find(isPartition)!;
    expect(record.step.kind === "partition" && record.step.input.outer).toBe("side");
  });

  it("devient une Répartition à sa place, avec son fond, ses étagères et ses portes ; son linéaire lui garde sa place", () => {
    const { doc, plan } = kitchen();
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
    const fronts = doc.features.find((f) => f.type === "fronts" && f.cabinet === cabinet.id)!;
    expect(cabinetOfBody(doc, `${fronts.id}${PART_SEPARATOR}0`)?.id).toBe(cabinet.id);
    const made = withCabinetFurnished(doc, cabinet.id);
    if (typeof made === "string") throw new Error(made);
    expect(() => parseDocument(made.doc)).not.toThrow();
    // The cabinet and its fronts gone; the run keeps its place, free; the other units still made by the plan.
    expect(made.doc.features.some((f) => f.type === "cabinet" && f.name === cabinet.name)).toBe(false);
    const runs = kitchenPlanIn(made.doc, plan)!.runs!.A!;
    expect(runs[0]).toMatchObject({ model: "space", width: 800 });
    expect(runs.slice(1).map((i) => i.model)).toEqual(["base-bas-3-tiroirs", "wall-haut-1-porte"]);
    expect(kitchenRunOf(made.doc, made.sketch)).toBeNull();
    // Its worktop and its plinth still over and under it, as over the unit it was.
    const span = (d: CadDocument, name: string) => {
      const f = d.features.find((x) => x.type === "extrude" && x.name === name)!;
      const xs = (d.features.find((x) => f.type === "extrude" && x.id === f.sketch) as SketchFeature).points.map((q) => q.x);
      return [Math.min(...xs), Math.max(...xs)];
    };
    expect(span(made.doc, "Plan de travail A")).toEqual(span(doc, "Plan de travail A"));
    expect(span(made.doc, "Plinthe A")).toEqual(span(doc, "Plinthe A"));
    // A piece of it clicked in the 3D: the room the plan keeps for it, chosen there.
    const piece = made.doc.features.find((f) => f.type === "extrude" && f.sketch === made.sketch)!;
    expect(pieceItemOf(made.doc, piece.id)).toEqual({ plan, run: "A", item: runs[0]!.id });
    // Its box: the cabinet's, to the tenth of a millimetre (the back included).
    const [lo, hi] = caissonBox(made.doc, made.sketch);
    const back = cabinet.backThickness;
    const [clo, chi] = cabinetBox(cabinet);
    for (const i of [0, 2]) {
      expect(lo[i]).toBeCloseTo(clo[i]!, 1);
      expect(hi[i]).toBeCloseTo(chi[i]!, 1);
    }
    expect(hi[1]! - lo[1]!).toBeCloseTo(cabinet.depth - back, 1);
    expect(lo[1]).toBeCloseTo(clo[1]!, 1);
    // Its shelf, its two doors and its back.
    const sketch = made.doc.features.find((f) => f.id === made.sketch) as SketchFeature;
    expect(sketch.offsets!.filter(isShelves)).toHaveLength(cabinet.shelves > 0 ? 1 : 0);
    const equipment = made.doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === made.sketch).map((f) => f.fill).sort();
    expect(equipment).toEqual(["back", "doors"]);
    // The carcass in its material.
    const boards = made.doc.features.filter((f) => f.type === "extrude" && f.sketch === made.sketch);
    expect(boards.length).toBeGreaterThanOrEqual(4);
    for (const b of boards) expect(made.doc.bodyInfo?.[b.id]?.material).toBe("melamine-white");
  });

  it("garde ses tiroirs, un meuble haut tourné vers la pièce, et refuse ce qui n'est pas un caisson", () => {
    const { doc } = kitchen();
    const drawers = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 3 tiroirs"))!;
    const made = withCabinetFurnished(doc, drawers.id);
    if (typeof made === "string") throw new Error(made);
    const equipment = made.doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === made.sketch);
    expect(equipment.find((f) => f.fill === "drawers")?.drawers).toBe(3);
    // As the cabinet's fronts: in front of the carcass, their handles drilled only, none drawn — the doors' too.
    expect(equipment.find((f) => f.fill === "drawers")).toMatchObject({ mount: "overlay", bareHandles: true, handles: true });
    const fronts = nichePartsIn(made.doc.features, equipment.find((f) => f.fill === "drawers")!);
    expect(fronts.filter((p) => p.role === "front")).toHaveLength(3);
    expect(fronts.some((p) => p.kind === "handle")).toBe(false);
    // Drawers of different heights (two drawers over a pan drawer) keep each its own, to the tenth of a mm.
    const pans = withKitchenBuilt(doc, kitchenPlanOf(doc)!.id, { runs: { A: items(["base-bas-2-tiroirs-et-casserolier", 900]) } });
    if (typeof pans === "string") throw new Error(pans);
    const unit = pans.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 tiroirs"))!;
    const before = frontsParts(pans.doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === unit.id)!, unit).filter((p) => /^Façade tiroir/.test(p.name)).map((p) => Math.round((p.to[2] - p.from[2]) * 10) / 10);
    const turned = withCabinetFurnished(pans.doc, unit.id);
    if (typeof turned === "string") throw new Error(turned);
    const after = nichePartsIn(turned.doc.features, turned.doc.features.find((f): f is NicheFeature => f.type === "niche" && f.sketch === turned.sketch && f.fill === "drawers")!).filter((p) => p.role === "front").map((p) => Math.round((p.to[1] - p.from[1]) * 10) / 10);
    expect(new Set(before).size).toBe(2);
    expect(after).toEqual(before);
    const doors = withCabinetFurnished(doc, doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!.id);
    if (typeof doors === "string") throw new Error(doors);
    const leaves = doors.doc.features.find((f): f is NicheFeature => f.type === "niche" && f.sketch === doors.sketch && f.fill === "doors")!;
    expect(leaves.bareHandles).toBe(true);
    expect(nichePartsIn(doors.doc.features, leaves).some((p) => p.kind === "handle")).toBe(false);
    const wall = made.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Haut"))!;
    const high = withCabinetFurnished(made.doc, wall.id);
    if (typeof high === "string") throw new Error(high);
    expect(kitchenPlanIn(high.doc, made.doc.features.find((f) => f.type === "sketch" && f.kitchenPlan)!.id)!.runs!.A!.map((i) => i.model)).toEqual(["base-bas-2-portes", "space", "space-wall"]);
    const [lo, hi] = caissonBox(high.doc, high.sketch);
    expect(lo[2]).toBeCloseTo(wall.origin[2], 1);
    expect(hi[2]! - lo[2]!).toBeCloseTo(wall.height, 1);
    expect(withCabinetFurnished(doc, "nothing")).toMatch(/n'existe plus/);
  });

  it("se garde dans « Mes caissons », se repose dans un linéaire à une autre largeur et dans la case d'un dressing", () => {
    const { doc, plan } = kitchen();
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
    const made = withCabinetFurnished(doc, cabinet.id);
    if (typeof made === "string") throw new Error(made);
    // Kept: a low unit of its size, its inside with it.
    const entry = caissonEntry(made.doc, made.sketch, "Mon bas 2 portes");
    if (typeof entry === "string") throw new Error(entry);
    expect(entry).toMatchObject({ kind: "base", width: 800, height: cabinet.height, depth: cabinet.depth, custom: true, layout: "none" });
    const spec = caissonSpecOf(made.doc, made.sketch);
    if (typeof spec === "string") throw new Error(spec);
    expect(spec.cases[0]!.steps).toHaveLength(1);
    expect(spec).toMatchObject({ carcass: "melamine-white", doors: { gap: 3 }, back: { thickness: cabinet.backThickness } });
    expect(caissonEntry(made.doc, "nothing", "x")).toMatch(/pas un caisson/);

    // Put on the run at 1000 wide: a space keeps its place, the caisson stands there, its shelf and doors with it.
    const p = kitchenPlanIn(made.doc, plan)!;
    const built = withKitchenBuilt(made.doc, plan, { runs: { A: [...p.runs!.A!, { ...newItem(p.runs!.A!, entry.id, 1000, { ...entry, width: 1000 }) }] } });
    if (typeof built === "string") throw new Error(built);
    const placed = withCaissonsPlaced(built.doc, plan);
    expect(placed.problems).toEqual([]);
    expect(kitchenPlanIn(placed.doc, plan)!.runs!.A!.map((i) => [i.model, i.width])).toEqual([["space", 800], ["base-bas-3-tiroirs", 600], ["wall-haut-1-porte", 600], ["space", 1000]]);
    const caissons = placed.doc.features.filter((f): f is SketchFeature => f.type === "sketch" && (f.offsets ?? []).some(isPartition));
    expect(caissons.map((c) => c.name)).toEqual(["Caisson — Bas 2 portes 800 (A1)", "Caisson — Mon bas 2 portes"]);
    const [lo, hi] = caissonBox(placed.doc, caissons[1]!.id);
    expect(hi[0]! - lo[0]!).toBeCloseTo(1000, 1);
    expect(lo[0]).toBeCloseTo(1400, 1);
    expect(caissons[1]!.offsets!.filter(isShelves)).toHaveLength(1);
    expect(() => parseDocument(placed.doc)).not.toThrow();

    // In the second case of a dressing: its inside and its door there.
    const dressing = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2400 });
    const zone = withZonePartition(dressing.doc, dressing.id, planZones({ ...PLAN, model: "I", lengthA: 2400 })[0]!);
    if (typeof zone === "string") throw new Error(zone);
    const put = withCaissonInCase(zone.doc, zone.sketch, zone.step, 1, spec);
    if (typeof put === "string") throw new Error(put);
    const sketch = put.features.find((f) => f.id === zone.sketch) as SketchFeature;
    expect(sketch.offsets!.filter(isShelves).map((r) => r.step.kind === "shelves" && r.step.niche)).toEqual([[1]]);
    const doors = put.features.find((f): f is NicheFeature => f.type === "niche" && f.sketch === zone.sketch && f.fill === "doors");
    expect(doors).toBeDefined();
    // That case kept alone: a caisson of one case, its sides around it, its shelf and its door.
    const column = caissonSpecOf(put, zone.sketch, 1);
    if (typeof column === "string") throw new Error(column);
    expect(column.cases).toHaveLength(1);
    expect(column.cases[0]!.steps).toHaveLength(1);
    expect(column.input).toMatchObject({ cases: 2, dividers: ["none"] });
    expect(column.input.length).toBeGreaterThan(300);
    expect(column.input.length).toBeLessThan(1200);
    expect(column.doors?.joined).toEqual([0]);
  });

  it("suit sa place quand la cuisine est refaite : décalé par un meuble ajouté avant lui, refait quand sa place change de largeur", () => {
    const { doc, plan } = kitchen();
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
    const made = withCabinetFurnished(doc, cabinet.id);
    if (typeof made === "string") throw new Error(made);
    const room = kitchenPlanIn(made.doc, plan)!.runs!.A![0]!;
    expect(room).toMatchObject({ model: "space", width: 800, depth: cabinet.depth, furnished: made.sketch });
    const [lo0, hi0] = caissonBox(made.doc, made.sketch);
    // Made again as it is: the caisson stays where it is.
    const same = withKitchenBuilt(made.doc, plan);
    if (typeof same === "string") throw new Error(same);
    expect(caissonBox(same.doc, made.sketch)).toEqual([lo0, hi0]);
    // A unit of 400 put before it: it moves 400 along the wall, its shelf and its doors with it.
    const items = kitchenPlanIn(made.doc, plan)!.runs!.A!;
    const moved = withKitchenBuilt(made.doc, plan, { runs: { A: [newItem(items, "base-bas-1-porte", 400), ...items] } });
    if (typeof moved === "string") throw new Error(moved);
    const [lo1, hi1] = caissonBox(moved.doc, made.sketch);
    const shift = [0, 1, 2].map((i) => lo1[i]! - lo0[i]!);
    expect(Math.hypot(...shift)).toBeCloseTo(400, 1);
    expect(hi1[2]! - lo1[2]!).toBeCloseTo(hi0[2]! - lo0[2]!, 1);
    expect(moved.doc.features.filter((f) => f.type === "niche" && f.sketch === made.sketch).length).toBeGreaterThan(0);
    // Its room made 1000 wide: the caisson made again at that width, its shelf kept, the room linked to it.
    const wider = withKitchenBuilt(moved.doc, plan, { runs: { A: kitchenPlanIn(moved.doc, plan)!.runs!.A!.map((i) => (i.id === room.id ? { ...i, width: 1000 } : i)) } });
    if (typeof wider === "string") throw new Error(wider);
    const link = kitchenPlanIn(wider.doc, plan)!.runs!.A!.find((i) => i.id === room.id)!.furnished!;
    expect(wider.doc.features.filter((f) => f.type === "sketch" && f.name === "Caisson — Bas 2 portes 800 (A1)")).toHaveLength(1);
    const sketch = wider.doc.features.find((f) => f.id === link) as SketchFeature;
    expect(sketch.offsets!.filter(isShelves)).toHaveLength(1);
    const [lo2, hi2] = caissonBox(wider.doc, link);
    expect(Math.max(...[0, 1].map((i) => hi2[i]! - lo2[i]!))).toBeCloseTo(1000, 1);
    expect(Math.min(lo2[0]!, lo2[1]!)).toBeCloseTo(Math.min(lo1[0]!, lo1[1]!), 1);
    expect(() => parseDocument(wider.doc)).not.toThrow();
  });

  it("refait à une autre largeur, garde la matière de chaque pièce ; ses finitions le suivent", () => {
    const { doc, plan } = kitchen();
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
    const made = withCabinetFurnished(doc, cabinet.id);
    if (typeof made === "string") throw new Error(made);
    // A side of oak, a door of walnut, and a right end put by Finitions on it alone.
    const side = made.doc.features.find((f) => f.type === "extrude" && f.sketch === made.sketch && f.name.startsWith("Côté"))!;
    const doors = made.doc.features.find((f): f is NicheFeature => f.type === "niche" && f.sketch === made.sketch && f.fill === "doors")!;
    const [lo, hi] = caissonBox(made.doc, made.sketch);
    const own = made.doc.features.filter((f) => (f.type === "extrude" || f.type === "niche") && f.sketch === made.sketch).map((f) => (f.type === "niche" ? `${f.id}${PART_SEPARATOR}0` : f.id));
    const trim: TrimFeature = { id: "fi9", type: "trim", name: "Finitions", source: own, settings: { ...FINISH_DEFAULTS, front: { axis: 1, sign: -1 } }, parts: [{ name: "Joue droite", from: [hi[0]!, lo[1]!, 0], to: [hi[0]! + 18, hi[1]!, hi[2]!] }, { name: "Plinthe", from: [lo[0]!, lo[1]!, 0], to: [hi[0]!, lo[1]! + 16, 100] }] };
    const dressed: CadDocument = { ...made.doc, features: [...made.doc.features, trim], bodyInfo: { ...made.doc.bodyInfo, [side.id]: { material: "solid-oak" }, [`${doors.id}${PART_SEPARATOR}0`]: { material: "walnut" } } };
    const room = kitchenPlanIn(dressed, plan)!.runs!.A![0]!;
    // Its room 1000 wide: the same caisson made 1000 wide, its pieces in their materials, its end at its new right side.
    const wider = withKitchenBuilt(dressed, plan, { runs: { A: kitchenPlanIn(dressed, plan)!.runs!.A!.map((i) => (i.id === room.id ? { ...i, width: 1000 } : i)) } });
    if (typeof wider === "string") throw new Error(wider);
    expect(kitchenPlanIn(wider.doc, plan)!.runs!.A![0]!.furnished).toBe(made.sketch);
    const [lo1, hi1] = caissonBox(wider.doc, made.sketch);
    expect(hi1[0]! - lo1[0]!).toBeCloseTo(1000, 1);
    const sides = wider.doc.features.filter((f) => f.type === "extrude" && f.sketch === made.sketch && f.name === side.name);
    expect(sides.map((f) => wider.doc.bodyInfo?.[f.id]?.material)).toEqual(["solid-oak"]);
    expect(wider.doc.bodyInfo?.[`${doors.id}${PART_SEPARATOR}0`]?.material).toBe("walnut");
    const after = wider.doc.features.find((f): f is TrimFeature => f.id === "fi9")!;
    expect(after.parts[0]!.from[0]).toBeCloseTo(hi1[0]!, 1);
    expect(after.parts[1]!.to[0]! - after.parts[1]!.from[0]!).toBeCloseTo(1000, 1);
    expect(after.source!.every((id) => wider.doc.features.some((f) => f.id === id.split(PART_SEPARATOR)[0]))).toBe(true);
    // A unit put before it: its finishings go along with it.
    const items = kitchenPlanIn(wider.doc, plan)!.runs!.A!;
    const moved = withKitchenBuilt(wider.doc, plan, { runs: { A: [newItem(items, "base-bas-1-porte", 400), ...items] } });
    if (typeof moved === "string") throw new Error(moved);
    const shifted = moved.doc.features.find((f): f is TrimFeature => f.id === "fi9")!;
    expect(shifted.parts[0]!.from[0]! - after.parts[0]!.from[0]!).toBeCloseTo(400, 1);
    expect(shifted.settings!.front).toEqual({ axis: 1, sign: -1 });
  });

  it("un caisson converti quand ses côtés s'arrêtaient au-dessus de la plinthe les retrouve jusqu'au sol dès que la cuisine est refaite", () => {
    const { doc, plan } = kitchen();
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 3 tiroirs"))!;
    const made = withCabinetFurnished(doc, cabinet.id);
    if (typeof made === "string") throw new Error(made);
    // As it was made then: its bottom and top across, its sides between them.
    const dated = { ...made.doc, features: made.doc.features.map((f) => (f.id === made.sketch && f.type === "sketch" ? { ...f, offsets: f.offsets!.map((r) => (isPartition(r) && r.step.kind === "partition" ? { ...r, step: { ...r.step, input: { ...r.step.input, outer: "board" as const } } } : r)) } : f)) } as CadDocument;
    const outer = (d: CadDocument) => {
      const record = (d.features.find((f) => f.id === made.sketch) as SketchFeature).offsets!.find(isPartition)!;
      return record.step.kind === "partition" ? record.step.input.outer : null;
    };
    expect(outer(dated)).toBe("board");
    const built = withKitchenBuilt(dated, plan, {});
    if (typeof built === "string") throw new Error(built);
    expect(built.problems).toEqual([]);
    expect(outer(built.doc)).toBe("side");
    // Its drawers still in it, and its room still its own.
    expect(built.doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === made.sketch && f.fill === "drawers")).toHaveLength(1);
    expect(kitchenPlanIn(built.doc, plan)!.runs!.A!.find((i) => i.furnished === made.sketch)).toBeTruthy();
    // Once: built again, nothing more changes.
    const again = withKitchenBuilt(built.doc, plan, {});
    if (typeof again === "string") throw new Error(again);
    expect(JSON.stringify(again.doc.features.find((f) => f.id === made.sketch))).toBe(JSON.stringify(built.doc.features.find((f) => f.id === made.sketch)));
  });

  it("relie un caisson aménagé avant que sa place le retienne, puis le fait suivre", () => {
    const { doc, plan } = kitchen();
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
    const made = withCabinetFurnished(doc, cabinet.id);
    if (typeof made === "string") throw new Error(made);
    // As it was saved before: a space of its width, nothing more.
    const older: CadDocument = { ...made.doc, features: made.doc.features.map((f) => (f.id === plan && f.type === "sketch" ? { ...f, kitchenPlan: { ...f.kitchenPlan!, runs: { A: f.kitchenPlan!.runs!.A!.map(({ furnished: _f, depth: _d, height: _h, ...i }) => i) } } } : f)) };
    const [lo0] = caissonBox(older, made.sketch);
    const items = kitchenPlanIn(older, plan)!.runs!.A!;
    const moved = withKitchenBuilt(older, plan, { runs: { A: [newItem(items, "base-bas-1-porte", 400), ...items] } });
    if (typeof moved === "string") throw new Error(moved);
    expect(kitchenPlanIn(moved.doc, plan)!.runs!.A![1]).toMatchObject({ model: "space", furnished: made.sketch, depth: cabinet.depth });
    const [lo1] = caissonBox(moved.doc, made.sketch);
    expect(Math.hypot(...[0, 1, 2].map((i) => lo1[i]! - lo0[i]!))).toBeCloseTo(400, 1);
  });

  it("une colonne aménagée (ou un habillage) garde la rangée haute libre au-dessus d'elle : un meuble haut n'y va pas", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400, rest: { A: "end" } });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items(["tall-colonne-garde-manger", 600], ["base-bas-1-porte", 600]) } });
    if (typeof built === "string") throw new Error(built);
    const column = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Colonne"))!;
    const turned = withCabinetFurnished(built.doc, column.id);
    if (typeof turned === "string") throw new Error(turned);
    const plan = kitchenPlanIn(turned.doc, made.id)!;
    // The wall row starts where the column ends: a wall unit added goes over the base unit, not over the column.
    const fill = kitchenFromPlan(plan).fills.A!;
    expect(Math.min(...fill.wallFree.map(([a]) => a))).toBeGreaterThanOrEqual(600 - 1e-6);
    const up = withKitchenBuilt(turned.doc, made.id, { runs: { A: [...plan.runs!.A!, ...items(["wall-haut-1-porte", 600])] } });
    if (typeof up === "string") throw new Error(up);
    const wall = up.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Haut"))!;
    expect(wall.origin[0]).toBeGreaterThanOrEqual(600 - 1e-6);
  });

  it("le caisson aménagé supprimé dans la 3D (ses panneaux, ou lui tout entier) : plus de plan de travail ni de plinthe à sa place", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400, rest: { A: "end" } });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items(["base-bas-2-portes", 800], ["base-bas-3-tiroirs", 600]) } });
    if (typeof built === "string") throw new Error(built);
    const cabinet = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 3 tiroirs"))!;
    const turned = withCabinetFurnished(built.doc, cabinet.id);
    if (typeof turned === "string") throw new Error(turned);
    /** The x-span of a board the plan made, by its name. */
    const span = (doc: CadDocument, name: string) => {
      const board = doc.features.find((f) => f.type === "extrude" && f.name === name);
      const xs = board?.type === "extrude" ? (doc.features.find((f) => f.id === board.sketch) as SketchFeature).points.map((q) => Math.round(q.x)) : [];
      return [Math.min(...xs), Math.max(...xs)];
    };
    // Over and under the two units: the cabinet and the furnished caisson.
    expect(span(turned.doc, "Plan de travail A")).toEqual([0, 1400]);
    expect(span(turned.doc, "Plinthe A")).toEqual([0, 1400]);
    const panels = turned.doc.features.filter((f) => (f.type === "extrude" || f.type === "niche") && f.sketch === turned.sketch).map((f) => f.id);
    for (const ids of [panels, [...panels, turned.sketch]]) {
      const gone = withDeletedFreed(turned.doc, deleteFeatures(turned.doc, ids).next);
      expect(gone.features.some((f) => f.id === turned.sketch)).toBe(false);
      expect(kitchenPlanIn(gone, made.id)!.runs!.A!.map((i) => [i.model, i.width, i.furnished])).toEqual([["base-bas-2-portes", 800, undefined], ["space", 600, undefined]]);
      // The kitchen made again: its worktop and its plinth stop at the unit left.
      expect(span(gone, "Plan de travail A")).toEqual([0, 800]);
      expect(span(gone, "Plinthe A")).toEqual([0, 800]);
    }
  });

  it("le caisson aménagé supprimé, sa place gardée redevient libre : un meuble de sa largeur la prend", () => {
    const { doc, plan } = kitchen();
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
    const made = withCabinetFurnished(doc, cabinet.id);
    if (typeof made === "string") throw new Error(made);
    const room = kitchenPlanIn(made.doc, plan)!.runs!.A![0]!;
    expect(room).toMatchObject({ model: "space", width: 800, furnished: made.sketch });
    // While the caisson holds it, a unit of 1200 more finds no room (2400: 800 held + 600, 1000 left open).
    const items = kitchenPlanIn(made.doc, plan)!.runs!.A!;
    const wide = newItem(items, "base-bas-2-portes", 1200);
    const held = withKitchenBuilt(made.doc, plan, { runs: { A: [...items, wide] } });
    if (typeof held === "string") throw new Error(held);
    expect(held.problems.join(" ")).toMatch(/ne tient pas/);
    expect(kitchenPlanIn(held.doc, plan)!.runs!.A![0]).toMatchObject({ model: "space", furnished: made.sketch });

    // The caisson deleted by hand, another sketch taking its id since: the room is no longer held.
    const sketch = made.doc.features.find((f) => f.id === made.sketch)!;
    const without = { ...made.doc, features: made.doc.features.filter((f) => f.id !== made.sketch && !((f.type === "extrude" || f.type === "niche") && f.sketch === made.sketch)) };
    const reused: CadDocument = { ...without, features: [...without.features, { id: made.sketch, type: "sketch", name: "Esquisse", plane: "XY", offset: 0, points: [], curves: [], constraints: [] } as unknown as SketchFeature] };
    expect(sketch.type).toBe("sketch");
    for (const gone of [without, reused]) {
      expect(kitchenPlanIn(gone, plan)!.runs!.A![0]!.furnished).toBeUndefined();
      // The same unit added at the end of the run: it stands in the room (and the open room beside), first of the run.
      const built = withKitchenBuilt(gone, plan, { runs: { A: [...kitchenPlanIn(gone, plan)!.runs!.A!, wide] } });
      if (typeof built === "string") throw new Error(built);
      expect(built.problems.filter((m) => /ne tient pas/.test(m))).toEqual([]);
      expect(kitchenPlanIn(built.doc, plan)!.runs!.A!.map((i) => [i.model, i.width])).toEqual([["base-bas-2-portes", 1200], ["base-bas-3-tiroirs", 600], ["wall-haut-1-porte", 600]]);
      const put = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
      expect(put.origin).toEqual(cabinet.origin);
    }
  });
});
