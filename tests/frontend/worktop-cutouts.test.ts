/** Découpes du plan de travail : évier, plaque, robinet, placés le long du plan et depuis son bord avant. */
import { describe, expect, it } from "vitest";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type ApplianceFeature, type CabinetFeature, type KitchenRunItem, type MachiningFeature, type Vec3 } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
import { validateDocument } from "../../frontend/src/document/validate";
import { cutoutOps, cutShape, mergedCutouts, placeCutout } from "../../frontend/src/features/worktop-cutouts";

// A worktop 2400 long (x 0…2400), 650 deep (front at y = −650), 38 thick at 870.
const TOP: [Vec3, Vec3] = [[0, -650, 870], [2400, 0, 908]];

describe("découpes du plan de travail", () => {
  it("retire l'évier de part en part, centré dans la profondeur, à sa place le long du plan", () => {
    const { ops, problems } = cutoutOps(TOP, [{ appliance: "sink-1", along: 600, front: null }]);
    expect(problems).toEqual([]);
    // 780 × 480: x 210…990, y −650 + 85 … −650 + 565, through the thickness (1 mm beyond each face); its corners
    // rounded at 10: a cross of two boxes, and a hole Ø20 in each corner.
    expect(ops.slice(0, 2)).toEqual([
      { kind: "box", from: [220, -565, 869], to: [980, -85, 909], mode: "cut" },
      { kind: "box", from: [210, -555, 869], to: [990, -95, 909], mode: "cut" },
    ]);
    expect(ops.slice(2).map((o) => (o.kind === "hole" ? [o.at[0], o.at[1], o.diameter, o.depth] : null))).toEqual([[220, -555, 20, 38], [220, -95, 20, 38], [980, -555, 20, 38], [980, -95, 20, 38]]);
  });

  it("prend les cotes de la notice : largeur, profondeur et rayon des angles à soi, ou un diamètre", () => {
    // A sink of 860 × 500 with corners of 15; the radius 0: one box, sharp.
    const own = cutoutOps(TOP, [{ appliance: "sink-1", along: 1200, front: 70, size: [860, 500], radius: 15, name: "Évier Franke" }]);
    expect(own.problems).toEqual([]);
    expect(own.ops).toHaveLength(6);
    expect(own.ops[0]).toMatchObject({ kind: "box", from: [785, -580, 869], to: [1615, -80, 909] });
    expect(own.ops[5]).toMatchObject({ kind: "hole", diameter: 30 });
    expect(cutoutOps(TOP, [{ appliance: "sink-1", along: 1200, front: 70, size: [860, 500], radius: 0 }]).ops).toEqual([{ kind: "box", from: [770, -580, 869], to: [1630, -80, 909], mode: "cut" }]);
    // The radius never more than half the smaller side: a slot with round ends.
    const slot = cutoutOps(TOP, [{ appliance: "hob-60", along: 1200, front: 100, size: [400, 100], radius: 300 }]);
    expect(slot.ops.filter((o) => o.kind === "box")).toHaveLength(1);
    expect(slot.ops.filter((o) => o.kind === "hole").every((o) => o.kind === "hole" && o.diameter === 100)).toBe(true);
    // A tap hole of 32; its own name in what is refused.
    expect(cutoutOps(TOP, [{ appliance: "tap", along: 600, front: 520, diameter: 32 }]).ops[0]).toMatchObject({ kind: "hole", diameter: 32, at: [600, -650 + 520 + 16, 908] });
    expect(cutoutOps(TOP, [{ appliance: "sink-1", along: 300, front: null, size: [860, 500], name: "Évier Franke" }]).problems[0]).toMatch(/^Évier Franke : sort du plan/);
    expect(cutShape({ appliance: "hob-60", along: 0, front: null })).toMatchObject({ width: 560, depth: 490, radius: 0, round: false });
    expect(cutShape({ appliance: "nothing", along: 0, front: null })).toBeNull();
  });

  it("perce le robinet et place la plaque depuis le bord avant demandé", () => {
    const { ops } = cutoutOps(TOP, [
      { appliance: "tap", along: 600, front: 520 },
      { appliance: "hob-60", along: 1800, front: 60 },
    ]);
    expect(ops[0]).toMatchObject({ kind: "hole", at: [600, -650 + 520 + 17.5, 908], dir: [0, 0, -1], diameter: 35, depth: 38 });
    expect(ops[1]).toMatchObject({ kind: "box", from: [1520, -590, 869], to: [2080, -100, 909] });
  });

  it("suit un plan qui court le long de Y et regarde vers +X", () => {
    const along: [Vec3, Vec3] = [[0, -2000, 870], [650, 0, 908]];
    const { ops } = cutoutOps(along, [{ appliance: "hob-60", along: 1000, front: 80 }], 1);
    // From its front (x = 650) inwards: x 650 − 80 − 490 … 650 − 80.
    expect(ops[0]).toMatchObject({ from: [80, -1280, 869], to: [570, -720, 909] });
  });

  it("refuse une découpe qui sort du plan, frôle son bord ou en chevauche une autre", () => {
    expect(cutoutOps(TOP, [{ appliance: "sink-2", along: 400, front: null }]).problems[0]).toContain("sort du plan");
    expect(cutoutOps(TOP, [{ appliance: "hob-60", along: 1200, front: 150 }]).problems[0]).toContain("50 mm");
    const both = cutoutOps(TOP, [{ appliance: "sink-1", along: 800, front: null }, { appliance: "hob-60", along: 1300, front: null }]);
    expect(both.problems[0]).toContain("chevauche");
  });

  it("place une nouvelle découpe : au milieu, le robinet derrière l'évier, la plaque à la première place libre", () => {
    const sink = placeCutout(TOP, [], "sink-1");
    expect(sink).toEqual({ appliance: "sink-1", along: 1200, front: null });
    // Behind the sink: its back edge (85 + 480) and 15 mm.
    expect(placeCutout(TOP, [sink], "tap")).toEqual({ appliance: "tap", along: 1200, front: 580 });
    const hob = placeCutout(TOP, [sink], "hob-60");
    expect(cutoutOps(TOP, [sink, hob]).problems).toEqual([]);
    expect(hob.along).toBe(330);
  });

  it("est un usinage valide du document, qui garde ses découpes pour être rouvert", () => {
    const { ops } = cutoutOps(TOP, [{ appliance: "sink-1", along: 600, front: null }]);
    const doc = {
      version: 1,
      units: "mm",
      features: [
        { id: "mc1", type: "machining", name: "Découpes", target: "ex1", kind: "cutout", ops, cutouts: [{ appliance: "sink-1", along: 600, front: null }], frontSign: -1 },
      ],
    };
    const errors = validateDocument(doc).filter((e) => !e.includes("ex1"));
    expect(errors.filter((e) => /usinage|découpe/i.test(e))).toEqual([]);
    // Its own sizes are kept with it; nonsense is refused.
    const withSizes = (cut: Record<string, unknown>) => validateDocument({ ...doc, features: [{ ...doc.features[0]!, cutouts: [{ appliance: "sink-1", along: 600, front: null, ...cut }] }] }).filter((e) => /découpes invalides/.test(e));
    expect(withSizes({ size: [860, 500], radius: 15, name: "Évier Franke" })).toEqual([]);
    expect(withSizes({ diameter: 32 })).toEqual([]);
    expect(withSizes({ size: [860] })).toHaveLength(1);
    expect(withSizes({ radius: -5 })).toHaveLength(1);
    expect(withSizes({ size: [0, 500] })).toHaveLength(1);
  });

  it("un « Bas évier » du Plan de cuisine découpe le plan de travail au-dessus de lui, sauf sous un évier posé à la main", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    let items: KitchenRunItem[] = [];
    for (const [model, width] of [["base-bas-1-porte", 600], ["base-bas-evier", 800]] as const) items = [...items, newItem(items, model, width)];
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const cut = built.doc.features.find((f): f is MachiningFeature => f.type === "machining" && f.kind === "cutout")!;
    // Over the middle of the sink base (600 + 400), the sink of a unit of 80: rounded.
    expect(cut.name).toMatch(/^Découpes Plan de travail/);
    expect(cut.cutouts).toEqual([{ appliance: "sink-1", along: 1000, front: null, auto: true }]);
    expect(cut.ops.filter((o) => o.kind === "hole")).toHaveLength(4);
    // A hob added by hand in the plan's cut-outs, the sink given the sizes of its leaflet: the kitchen made again
    // (a unit added at the end) keeps both, and does not cut its own sink over the changed one.
    const byHand: MachiningFeature = { ...cut, cutouts: [{ appliance: "sink-1", along: 1000, front: 70, size: [740, 460], radius: 15, name: "Évier Franke" }, { appliance: "hob-60", along: 1900, front: null }] };
    const edited = { ...built.doc, features: built.doc.features.map((f) => (f.id === cut.id ? byHand : f)) };
    const more = withKitchenBuilt(edited, made.id, { runs: { A: [...items, newItem(items, "base-bas-1-porte", 400)] } });
    if (typeof more === "string") throw new Error(more);
    const kept = more.doc.features.find((f): f is MachiningFeature => f.type === "machining" && f.kind === "cutout")!;
    expect(kept.cutouts).toEqual(byHand.cutouts);
    expect(kept.ops.filter((o) => o.kind === "hole" && o.diameter === 30)).toHaveLength(4);
    expect(mergedCutouts([{ appliance: "sink-1", along: 1000, front: null, auto: true }], [{ appliance: "sink-1", along: 1000, front: null }])).toEqual([{ appliance: "sink-1", along: 1000, front: null, auto: true }]);
    // A plain unit only: no cut.
    const plain = withKitchenBuilt(made.doc, made.id, { runs: { A: items.slice(0, 1) } });
    if (typeof plain === "string") throw new Error(plain);
    expect(plain.doc.features.some((f) => f.type === "machining")).toBe(false);
    // A sink of the library placed by hand over that base: it cuts for itself, the plan leaves its own cut out.
    const base = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas évier"))!;
    const sink: ApplianceFeature = { id: "ap9", type: "appliance", name: "Évier inox", model: "sink-steel", finish: "inox", origin: [base.origin[0] + 20, base.origin[1] + 20, 870], width: 760, depth: 500, height: 180, rotation: base.rotation ?? 0 };
    const again = withKitchenBuilt({ ...built.doc, features: [...built.doc.features, sink] }, made.id);
    if (typeof again === "string") throw new Error(again);
    expect(again.doc.features.some((f) => f.type === "machining" && f.kind === "cutout")).toBe(false);
  });
});
