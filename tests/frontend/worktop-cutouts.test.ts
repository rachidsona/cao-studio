/** Découpes du plan de travail : évier, plaque, robinet, placés le long du plan et depuis son bord avant. */
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";
import { cutoutOps, placeCutout } from "../../frontend/src/features/worktop-cutouts";

// A worktop 2400 long (x 0…2400), 650 deep (front at y = −650), 38 thick at 870.
const TOP: [Vec3, Vec3] = [[0, -650, 870], [2400, 0, 908]];

describe("découpes du plan de travail", () => {
  it("retire l'évier de part en part, centré dans la profondeur, à sa place le long du plan", () => {
    const { ops, problems } = cutoutOps(TOP, [{ appliance: "sink-1", along: 600, front: null }]);
    expect(problems).toEqual([]);
    // 780 × 480: x 210…990, y −650 + 85 … −650 + 565, through the thickness (1 mm beyond each face).
    expect(ops).toEqual([{ kind: "box", from: [210, -565, 869], to: [990, -85, 909], mode: "cut" }]);
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
  });
});
