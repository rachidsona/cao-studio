/** Un appareil posé suit son caisson poussé ou déplacé, avec la découpe de son plan de travail. */
import { describe, expect, it } from "vitest";
import { appliancesFollow } from "../../frontend/src/document/appliance-follow";
import { withAppliance } from "../../frontend/src/document/appliance-place";
import { updateFeature } from "../../frontend/src/document/operations";
import { createReferencePlate, type ApplianceFeature, type CabinetFeature, type CadDocument, type MachiningFeature } from "../../frontend/src/document/types";

const base: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas 600", origin: [1000, 0, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" };
const wall: CabinetFeature = { ...base, id: "cb2", name: "Haut 600", origin: [1000, 210, 1450], height: 700, depth: 350, plinth: 0 };
const worktop = { body: "ex9", box: [[0, -40, 870], [3000, 560, 908]] as [[number, number, number], [number, number, number]] };
const ok = <T>(r: T | string): T => {
  if (typeof r === "string") throw new Error(r);
  return r;
};
const moved = (doc: CadDocument, id: string, by: [number, number, number]) => updateFeature(doc, id, (f) => ({ ...f, origin: (f as CabinetFeature).origin.map((v, i) => v + by[i]!) }) as CabinetFeature);
const of = (doc: CadDocument, id: string) => doc.features.find((f) => f.id === id) as ApplianceFeature;
const cut = (doc: CadDocument) => doc.features.find((f): f is MachiningFeature => f.type === "machining")!;

describe("un appareil suit son caisson", () => {
  const start = (): CadDocument => ({ ...createReferencePlate(), features: [base, wall] });

  it("une plaque et sa découpe suivent le caisson poussé, le long du plan de travail seulement", () => {
    const hob = ok(withAppliance(start(), "hob-induction", [590, 55, 520], "black", base, { worktop }));
    const next = appliancesFollow(hob.doc, moved(hob.doc, "cb1", [250, 0, 0]));
    expect(of(next, hob.id).origin[0]).toBeCloseTo(of(hob.doc, hob.id).origin[0] + 250, 6);
    const [before, after] = [cut(hob.doc).ops[0]!, cut(next).ops[0]!];
    if (before.kind !== "box" || after.kind !== "box") throw new Error("box");
    expect(after.from).toEqual([before.from[0] + 250, before.from[1], before.from[2]]);
  });

  it("un four dedans suit ; un meuble haut poussé n'emporte pas la plaque du bas ; un appareil déplacé lui-même n'est pas poussé deux fois", () => {
    const oven = ok(withAppliance(start(), "oven-pyro", [595, 595, 548], "inox", base));
    expect(of(appliancesFollow(oven.doc, moved(oven.doc, "cb1", [0, 0, 100])), oven.id).origin[2]).toBeCloseTo(of(oven.doc, oven.id).origin[2] + 100, 6);
    const hob = ok(withAppliance(start(), "hob-induction", [590, 55, 520], "black", base, { worktop }));
    expect(appliancesFollow(hob.doc, moved(hob.doc, "cb2", [300, 0, 0]))).toEqual(moved(hob.doc, "cb2", [300, 0, 0]));
    const both = updateFeature(moved(hob.doc, "cb1", [100, 0, 0]), hob.id, (f) => ({ ...f, origin: [5, 5, 5] }) as ApplianceFeature);
    expect(of(appliancesFollow(hob.doc, both), hob.id).origin).toEqual([5, 5, 5]);
  });

  it("une hotte au-dessus du caisson le suit ; un caisson changé de taille n'emporte rien", () => {
    const hood = ok(withAppliance({ ...createReferencePlate(), features: [base] }, "hood-chimney", [598, 900, 500], "inox", base, { worktop }));
    expect(of(appliancesFollow(hood.doc, moved(hood.doc, "cb1", [-200, 0, 0])), hood.id).origin[0]).toBeCloseTo(of(hood.doc, hood.id).origin[0] - 200, 6);
    const wider = updateFeature(moved(hood.doc, "cb1", [-200, 0, 0]), "cb1", (f) => ({ ...f, width: 800 }) as CabinetFeature);
    expect(of(appliancesFollow(hood.doc, wider), hood.id).origin).toEqual(of(hood.doc, hood.id).origin);
  });

  it("une plaque poussée seule emporte sa découpe ; après la cuisine refaite (own: false), pas une seconde fois", () => {
    const hob = ok(withAppliance(start(), "hob-induction", [590, 55, 520], "black", base, { worktop }));
    const slid = updateFeature(hob.doc, hob.id, (f) => ({ ...f, origin: (f as ApplianceFeature).origin.map((v, i) => v + (i === 0 ? -150 : 0)) }) as ApplianceFeature);
    const once = appliancesFollow(hob.doc, slid);
    const [b, a] = [cut(hob.doc).ops[0]!, cut(once).ops[0]!];
    if (b.kind !== "box" || a.kind !== "box") throw new Error("box");
    expect(a.from[0]).toBe(b.from[0] - 150);
    expect(appliancesFollow(hob.doc, once, false)).toBe(once);
  });
});
