/** Le plan de travail et la crédence d'un linéaire suivent ses meubles : rien au-dessus de la place libre ni à travers une colonne. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN, kitchenSizes } from "../../frontend/src/document/kitchen-plan-shapes";
import { layoutPlan } from "../../frontend/src/document/kitchen-plan";
import { withApplianceRemoved } from "../../frontend/src/document/appliance-remove";
import { createReferencePlate, type ApplianceFeature, type CabinetFeature, type CadDocument, type KitchenFloorPlan, type KitchenRunItem, type MachiningFeature } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const plan = (list: [string, number, Partial<KitchenRunItem>?][], rest: "start" | "end" = "end"): KitchenFloorPlan => {
  let items: KitchenRunItem[] = [];
  for (const [model, width, more] of list) items = [...items, { ...newItem(items, model, width), ...more }];
  return { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: rest }, runs: { A: items } };
};
/** The pieces of a kind, each from where to where along the wall (x). */
const spans = (p: KitchenFloorPlan, kind: string) => kitchenFromPlan(p).boxes.filter((b) => b.kind === kind).map((b) => [b.name, Math.round(b.from[0]), Math.round(b.to[0])]);

describe("plan de travail qui suit les meubles", () => {
  it("s'arrête au dernier meuble : rien au-dessus de la place qui reste, la crédence non plus", () => {
    const p = plan([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600]]);
    expect(spans(p, "worktop")).toEqual([["Plan de travail A", 0, 1600]]);
    expect(spans(p, "splashback")).toEqual([["Crédence A", 0, 1600]]);
    // The rest of the wall at the start: the worktop starts where the units do.
    expect(spans(plan([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600]], "start"), "worktop")).toEqual([["Plan de travail A", 2000, 3600]]);
    // The wall full: one worktop from end to end, as before.
    expect(spans(plan([["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200]]), "worktop")).toEqual([["Plan de travail A", 0, 3600]]);
  });

  it("s'interrompt sur une place gardée libre et à une colonne, pas sur celle d'un caisson aménagé ni d'un lave-vaisselle", () => {
    // A room kept free between two units (a cooker to come): two worktops, the second named after the first.
    const gap = plan([["base-bas-2-portes", 1000], ["space", 600], ["base-bas-1-porte", 600]]);
    expect(spans(gap, "worktop")).toEqual([["Plan de travail A", 0, 1000], ["Plan de travail A2", 1600, 2200]]);
    expect(spans(gap, "splashback")).toEqual([["Crédence A", 0, 1000], ["Crédence A2", 1600, 2200]]);
    // Held by a furnished caisson: the worktop runs over it.
    expect(spans(plan([["base-bas-2-portes", 1000], ["space", 600, { furnished: "sk9" }], ["base-bas-1-porte", 600]]), "worktop")).toEqual([["Plan de travail A", 0, 2200]]);
    // The plinth too runs under a furnished caisson (on the same socle), and under one at the end of the run; not under room kept free.
    expect(spans(plan([["base-bas-2-portes", 1000], ["space", 600, { furnished: "sk9" }], ["base-bas-1-porte", 600]]), "kick")).toEqual([["Plinthe A", 0, 2200]]);
    expect(spans(plan([["base-bas-2-portes", 1000], ["space", 900, { furnished: "sk9" }]]), "kick")).toEqual([["Plinthe A", 0, 1900]]);
    expect(spans(gap, "kick")).toEqual([["Plinthe A", 0, 1000], ["Plinthe A2", 1600, 2200]]);
    // A dishwasher has no cabinet, but the worktop covers it; a column stops it.
    expect(spans(plan([["base-bas-2-portes", 1000], ["app-dishwasher", 600], ["base-bas-1-porte", 600]]), "worktop")).toEqual([["Plan de travail A", 0, 2200]]);
    expect(spans(plan([["base-bas-2-portes", 1000], ["tall-colonne-rangement", 600], ["base-bas-1-porte", 600]]), "worktop")).toEqual([["Plan de travail A", 0, 1000], ["Plan de travail A2", 1600, 2200]]);
  });

  it("s'arrête au flanc du caisson, pas sur le fileur qui le sépare d'une colonne", () => {
    // 3600 = 1000 + 600 + 600 + 1300 - 100 left over: closed by a filler. Against the column, the worktop starts at the caisson.
    const p = { ...plan([["tall-colonne-rangement", 600], ["base-bas-2-portes", 1000], ["base-bas-2-portes", 1000], ["base-bas-2-portes", 900]], "start"), lengthA: 3600 };
    expect(spans(p, "filler")).toEqual([["Fileur A", 600, 700]]);
    expect(spans(p, "worktop")).toEqual([["Plan de travail A", 700, 3600]]);
  });

  it("donne à chaque morceau les découpes des meubles qu'il couvre", () => {
    const p = plan([["base-bas-1-porte", 600], ["app-sink", 800], ["base-bas-1-porte", 400], ["space", 600], ["base-bas-1-porte", 300], ["app-hob", 600], ["base-bas-1-porte", 300]]);
    const tops = kitchenFromPlan(p).boxes.filter((b) => b.kind === "worktop");
    expect(tops.map((b) => [b.name, (b.holes ?? []).map((h) => h.appliance)])).toEqual([["Plan de travail A", ["sink-1"]], ["Plan de travail A2", ["hob-60"]]]);
  });

  it("suit toujours les caissons : ôté d'un linéaire, un caisson posé l'y remet, la plinthe aussi ; sinon il reste ôté", async () => {
    const { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } = await import("../../frontend/src/document/kitchen-floor");
    const items = [newItem([], "base-bas-2-portes", 1000)];
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: { A: items }, noWorktop: { A: true }, noKick: { A: true }, made: {} });
    const off = withKitchenBuilt(base.doc, base.id, {});
    if (typeof off === "string") throw new Error(off);
    const named = (d: CadDocument, start: string) => d.features.some((f) => f.type === "extrude" && f.name.startsWith(start));
    // Rebuilt with nothing new: still none.
    expect([named(off.doc, "Plan de travail"), named(off.doc, "Plinthe")]).toEqual([false, false]);
    // A caisson put on the run: both come back, and stay.
    const more = withKitchenBuilt(off.doc, base.id, { runs: { A: [...items, newItem(items, "base-bas-1-porte", 600)] } });
    if (typeof more === "string") throw new Error(more);
    expect([named(more.doc, "Plan de travail"), named(more.doc, "Plinthe")]).toEqual([true, true]);
    expect(kitchenPlanIn(more.doc, base.id)!.noWorktop?.A).toBeUndefined();
    // Taken away in the same change as a caisson put: it stays away.
    const both = withKitchenBuilt(off.doc, base.id, { runs: { A: [...items, newItem(items, "base-bas-1-porte", 600)] }, noWorktop: { A: true } });
    if (typeof both === "string") throw new Error(both);
    expect(named(both.doc, "Plan de travail")).toBe(false);
  });

  it("ôté d'un linéaire sur sa bande, il n'est plus bâti, ni ses découpes ; la crédence reste", () => {
    const p = { ...plan([["base-bas-1-porte", 600], ["app-sink", 800], ["base-bas-1-porte", 400]]), noWorktop: { A: true } };
    expect(spans(p, "worktop")).toEqual([]);
    expect(spans(p, "splashback")).toEqual([["Crédence A", 0, 1800]]);
    expect(spans({ ...p, noWorktop: { A: false } }, "worktop")).toEqual([["Plan de travail A", 0, 1800]]);
  });

  it("descend jusqu'au sol aux bouts libres où vont les meubles, sur demande, le plan passant par-dessus", () => {
    const p = { ...plan([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600]]), worktopEnds: true };
    const T = p.worktopThickness ?? 38;
    // The units stop short of the right end: a return on the left only, the worktop over it.
    expect(spans(p, "worktop")).toEqual([["Plan de travail A", -T, 1600]]);
    const ret = kitchenFromPlan(p).boxes.filter((b) => b.name.startsWith("Retour de plan"));
    expect(ret.map((b) => [b.name, b.kind, Math.round(b.from[0]), Math.round(b.to[0]), b.from[2], b.to[2]])).toEqual([["Retour de plan A (gauche)", "splashback", -T, 0, 0, p.worktopHeight - T]]);
    // The wall full: both ends; without the option, none.
    const full = { ...plan([["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200]]), worktopEnds: true };
    expect(kitchenFromPlan(full).boxes.filter((b) => b.name.startsWith("Retour")).map((b) => b.name)).toEqual(["Retour de plan A (gauche)", "Retour de plan A (droite)"]);
    expect(kitchenFromPlan({ ...full, worktopEnds: false }).boxes.some((b) => b.name.startsWith("Retour"))).toBe(false);
  });

  it("se raccorde au retour au choix : le retour par-dessus, ou les deux coupés à 45°", () => {
    const p = { ...plan([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600]]), worktopEnds: true };
    const [T, H] = [p.worktopThickness ?? 38, p.worktopHeight];
    const pieces = (q: KitchenFloorPlan) => kitchenFromPlan(q).boxes.filter((b) => b.kind === "worktop" || b.name.startsWith("Retour"));
    // The return up the worktop's end: the worktop stops at the units, the return goes to the top.
    const side = pieces({ ...p, worktopJoint: "side" });
    expect(side.map((b) => [b.name, Math.round(b.from[0]), Math.round(b.to[0]), b.to[2], b.profile])).toEqual([["Plan de travail A", 0, 1600, H, undefined], ["Retour de plan A (gauche)", -T, 0, H, undefined]]);
    // At 45°: both up to the corner, their outlines meeting on the diagonal from the worktop's underside to its top.
    const [top, ret] = pieces({ ...p, worktopJoint: "miter" });
    expect([top!.from[0], ret!.to[2]]).toEqual([-T, H]);
    expect(top!.profile).toEqual({ along: 0, points: [[0, H - T], [1600, H - T], [1600, H], [-T, H]] });
    expect(ret!.profile).toEqual({ along: 0, points: [[0, 0], [-T, 0], [-T, H], [0, H - T]] });
  });

  it("met des joues de finition aux bouts libres : contre la dernière colonne et le dernier meuble haut, pas contre un bas", () => {
    const p = { ...plan([["tall-colonne-rangement", 600], ["base-bas-2-portes", 1000], ["wall-haut-1-porte", 600]]), endPanels: true };
    const joues = kitchenFromPlan(p).boxes.filter((b) => b.name.startsWith("Joue"));
    // The column at the left end; the wall unit beside it, its left side against the column, its right one showing.
    // The base unit's right side is left to the worktop's return.
    expect(joues.map((b) => [b.name, b.kind, Math.round(b.from[0]), Math.round(b.to[0]), Math.round(b.from[2])])).toEqual([
      ["Joue de finition A (gauche)", "panel", -19, 0, 0],
      ["Joue de finition haute A (droite)", "panel", 1200, 1219, 1450],
    ]);
    expect(kitchenFromPlan({ ...p, endPanels: false }).boxes.some((b) => b.name.startsWith("Joue"))).toBe(false);
  });

  it("seul ce qui est posé apparaît : ni fileur, ni plan de travail, ni retour au bout d'une place gardée libre", () => {
    // A unit, a place kept free, 50 mm of rest at the free end: the filler there would stand beside nothing.
    const p = { ...plan([["base-bas-1-porte", 600], ["space", 2950]]), worktopEnds: true };
    expect(spans(p, "worktop")).toEqual([["Plan de travail A", -38, 600]]);
    expect(spans(p, "filler")).toEqual([]);
    expect(kitchenFromPlan(p).boxes.filter((b) => b.name.startsWith("Retour de plan")).map((b) => b.name)).toEqual(["Retour de plan A (gauche)"]);
    // Beside a unit, the filler of the rest stands, with the worktop over it.
    const closed = plan([["base-bas-1-porte", 600], ["space", 2350], ["base-bas-1-porte", 600]]);
    expect(spans(closed, "filler")).toEqual([["Fileur A", 3550, 3600]]);
    // Places kept free only: the run makes nothing but its wall.
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, worktopEnds: true, runs: {}, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, { runs: { A: [newItem([], "space", 600), newItem([{ id: "k1" } as KitchenRunItem], "space", 2950)] } });
    if (typeof built === "string") throw new Error(built);
    expect(built.doc.features.filter((f) => f.type === "extrude").map((f) => f.name)).toEqual(["Mur A"]);
  });

  it("un meuble d'angle seul sur son linéaire (aucun autre meuble) a son plan de travail, sur lui seulement", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "L-left", lengthA: 3600, lengthB: 3600, corners: { left: "unit" }, through: { left: true }, splashback: false, runs: {}, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, {});
    if (typeof built === "string") throw new Error(built);
    const made = (kitchenPlanIn(built.doc, base.id)!.made!.B ?? []).map((id) => built.doc.features.find((f) => f.id === id)!);
    const corner = made.find((f): f is CabinetFeature => f.type === "cabinet")!;
    expect(made.filter((f) => f.type === "extrude").map((f) => f.name)).toContain("Plan de travail B");
    // Over the corner unit, to the corner's wall — not along the empty wall.
    const top = kitchenFromPlan(kitchenPlanIn(built.doc, base.id)!).boxes.find((b) => b.name === "Plan de travail B")!;
    const length = Math.max(Math.abs(top.to[0] - top.from[0]), Math.abs(top.to[1] - top.from[1]));
    expect(length).toBeGreaterThanOrEqual(corner.width);
    expect(length).toBeLessThan(corner.width + 700);
    // A bare run with no corner unit: still nothing but its wall.
    const bare = withKitchenBuilt(withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: {}, made: {} }).doc, base.id, {});
    if (typeof bare === "string") throw new Error(bare);
    expect(bare.doc.features.filter((f) => f.type === "extrude").map((f) => f.name)).toEqual(["Mur A"]);
  });

  it("prend l'aspect choisi (un marbre, un Dekton) sur le plan et la crédence, la matière restant celle du devis", () => {
    const p = plan([["base-bas-2-portes", 1000]]);
    const built = layoutPlan(createReferencePlate(), kitchenFromPlan(p), 19, "lacquer-white", "solid-oak", undefined, undefined, "dekton-aura");
    const info = (name: string) => built.info[Object.keys(built.names).find((id) => built.names[id] === name)!];
    expect(info("Plan de travail A")).toEqual({ material: "solid-oak", appearance: "dekton-aura" });
    expect(info("Crédence A")).toEqual({ material: "solid-oak", appearance: "dekton-aura" });
    // The plinth takes the worktop's look too, until it is given its own; with no look chosen, the fronts' material's.
    expect(info("Plinthe A")).toEqual({ material: "lacquer-white", appearance: "dekton-aura" });
    const own = layoutPlan(createReferencePlate(), kitchenFromPlan(p), 19, "lacquer-white", "solid-oak", undefined, undefined, "dekton-aura", "oak");
    expect(own.info[Object.keys(own.names).find((id) => own.names[id] === "Plinthe A")!]).toEqual({ material: "lacquer-white", appearance: "oak" });
    const none = layoutPlan(createReferencePlate(), kitchenFromPlan(p), 19, "lacquer-white", "solid-oak");
    expect(none.info[Object.keys(none.names).find((id) => none.names[id] === "Plinthe A")!]).toEqual({ material: "lacquer-white" });
  });

  it("la crédence d'un mur qui s'arrête contre l'autre va jusque dans l'angle, contre la crédence du mur qui passe", () => {
    const units = (list: [string, number][]) => list.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);
    const u: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "U", lengthA: 3000, lengthB: 2500, lengthC: 2500, rest: { A: "end", B: "start", C: "end" }, runs: { A: units([["base-bas-2-portes", 1000]]), B: units([["base-bas-1-porte", 600]]), C: units([["base-bas-1-porte", 600]]) } };
    const at = (name: string) => kitchenFromPlan(u).boxes.find((b) => b.name === name)!;
    const [a, b, c] = [at("Crédence A"), at("Crédence B"), at("Crédence C")];
    // Wall A along x at y = 0, its splashback 10 mm off it; walls B (x = 0) and C (x = 3000) along y.
    expect([Math.round(a.from[1]), Math.round(b.to[1]), Math.round(c.to[1])]).toEqual([-10, -10, -10]);
    // The worktops still stop where wall A's starts.
    expect(Math.round(at("Plan de travail B").to[1])).toBe(-640);
  });

  it("sous la hotte, la crédence monte jusqu'à elle, d'un seul morceau ; ou, au choix, seulement là", () => {
    const p = plan([["base-bas-2-portes", 1800], ["wall-haut-1-porte", 600], ["app-hood", 600], ["wall-haut-1-porte", 600]]);
    const [H, hood] = [p.worktopHeight, p.worktopHeight + 650];
    const pieces = kitchenFromPlan(p).boxes.filter((b) => b.kind === "splashback");
    expect(pieces.map((b) => b.name)).toEqual(["Crédence A"]);
    // One piece, its top stepped up under the hood (600 to 1200 along the wall), up to it, 65 cm over the worktop.
    const top = kitchenSizes(p).wallBottom;
    expect(pieces[0]!.profile).toEqual({ along: 0, points: [[0, H], [1800, H], [1800, top], [1200, top], [1200, hood], [600, hood], [600, top], [0, top]] });
    expect([pieces[0]!.from[2], pieces[0]!.to[2]]).toEqual([H, hood]);
    // Only under the hood: one plain piece, as wide as the hood, from the worktop up to it.
    const only = kitchenFromPlan({ ...p, splashbackHoodOnly: true }).boxes.filter((b) => b.kind === "splashback");
    expect(only.map((b) => [b.name, Math.round(b.from[0]), Math.round(b.to[0]), b.from[2], b.to[2], b.profile])).toEqual([["Crédence A", 600, 1200, H, hood, undefined]]);
    expect(kitchenFromPlan({ ...p, splashback: false }).boxes.some((b) => b.name.startsWith("Crédence"))).toBe(false);
  });

  it("un appareil posé à la main s'ôte avec la découpe faite pour lui, et elle seule", () => {
    const sink: ApplianceFeature = { id: "ap1", type: "appliance", name: "Évier inox", model: "sink-steel", finish: "inox", origin: [620, -540, 870], width: 760, depth: 500, height: 180 };
    const cut = (id: string, name: string, x: number): MachiningFeature => ({ id, type: "machining", name, target: "ex1", kind: "cutout", ops: [{ kind: "box", from: [x - 370, -520, 869], to: [x + 370, -60, 909], mode: "cut" }] });
    const doc: CadDocument = { ...createReferencePlate(), features: [...createReferencePlate().features, sink, cut("mc1", "Découpe Évier inox", 1000), cut("mc2", "Découpe Évier inox", 3000), cut("mc3", "Découpe Plaque", 1000)] };
    const without = withApplianceRemoved(doc, "ap1");
    expect(without.features.filter((f) => f.type === "appliance" || f.type === "machining").map((f) => f.id)).toEqual(["mc2", "mc3"]);
    expect(withApplianceRemoved(doc, "mc1")).toBe(doc);
  });
});

