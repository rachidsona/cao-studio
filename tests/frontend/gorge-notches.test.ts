/** Entailles de gorge : les côtés du caisson sont entaillés à l'avant, le profilé court sur toute sa largeur. */
import { beforeAll, describe, expect, it } from "vitest";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { modelHardware } from "../../frontend/src/document/hardware";
import { buildCabinet } from "../../frontend/src/features/cabinet";
import { frontsParts, GORGE, GORGE_PROFILE, gorgeNotches, stampGorges } from "../../frontend/src/features/fronts-parts";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas", origin: [100, 50, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 0, plinth: 100, construction: "sides-through" };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "drawers", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: false, grip: "gorge", ...over });
const docOf = (...features: (CabinetFeature | FrontsFeature)[]): CadDocument => ({ ...createReferencePlate(), features });

describe("entailles de gorge", () => {
  it("une entaille par profilé, à sa hauteur, de sa profondeur ; le profilé couvre toute la largeur", () => {
    const f = fronts();
    const notches = gorgeNotches(f, cabinet);
    const profiles = frontsParts(f, cabinet).filter((p) => p.gorge);
    expect(notches).toHaveLength(3);
    notches.forEach((n, i) => {
      expect(n.z1 - n.z0).toBeCloseTo(GORGE.height);
      expect(n.depth).toBeCloseTo(GORGE.depth);
      expect(n.z1).toBeCloseTo(profiles[i]!.to[2]);
      expect(profiles[i]!.from[0]).toBe(100);
      expect(profiles[i]!.to[0]).toBe(700);
    });
    // The top one under the top board.
    expect(notches[0]!.z1).toBeCloseTo(720 - 18);
    // By the metre: the whole width of the cabinet.
    expect(modelHardware(docOf(cabinet, f))).toEqual(expect.arrayContaining([{ name: GORGE_PROFILE, quantity: 1.8, unit: "m" }]));
    expect(gorgeNotches(fronts({ grip: undefined }), cabinet)).toEqual([]);
    expect(gorgeNotches(fronts({ suppressed: true }), cabinet)).toEqual([]);
  });

  it("le caisson les reçoit pour le noyau seulement ; sans gorge, il revient tel quel", () => {
    const doc = docOf(cabinet, fronts());
    const stamped = stampGorges(doc);
    expect((stamped.features[0] as CabinetFeature).notches).toHaveLength(3);
    expect(doc.features[0]).toBe(cabinet);
    const plain = docOf(cabinet, fronts({ grip: undefined }));
    expect(stampGorges(plain)).toBe(plain);
    // Handles back: the notches go.
    expect((stampGorges(docOf({ ...cabinet, notches: [{ z0: 0, z1: 10, depth: 5 }] }, fronts({ grip: undefined }))).features[0] as CabinetFeature).notches).toBeUndefined();
  });

  it("le noyau entaille l'avant des côtés, pas le reste ; les profilés ne touchent plus les côtés", () => {
    const notches = gorgeNotches(fronts(), cabinet);
    const plain = buildCabinet(cabinet);
    const cut = buildCabinet({ ...cabinet, notches });
    const volume = (out: typeof plain, i: number) => bodyMetrics(out.shapes[i]!).volume;
    // The sides (0, 1) lose 18 × 26 × 57 per notch; the bottom and the top keep theirs.
    for (const i of [0, 1]) expect(volume(plain, i) - volume(cut, i)).toBeCloseTo(3 * 18 * GORGE.depth * GORGE.height, 0);
    for (const i of [2, 3, 4]) expect(volume(cut, i)).toBeCloseTo(volume(plain, i), 3);
    for (const s of [...plain.shapes, ...cut.shapes]) s.delete();
    // The whole cabinet and its fronts built, stamped as the editor sends them.
    const r = new Recomputer();
    const { statuses } = r.recompute(stampGorges(docOf(cabinet, fronts())));
    expect(statuses.every((s) => s.state === "ok")).toBe(true);
  });

  it("tourné d'un quart, le caisson garde ses entailles à l'avant", () => {
    const turned = { ...cabinet, rotation: 90 as const };
    const notches = gorgeNotches(fronts(), turned);
    const out = buildCabinet({ ...turned, notches });
    const plain = buildCabinet(turned);
    expect(bodyMetrics(plain.shapes[0]!).volume - bodyMetrics(out.shapes[0]!).volume).toBeCloseTo(3 * 18 * GORGE.depth * GORGE.height, 0);
    for (const s of [...plain.shapes, ...out.shapes]) s.delete();
  });
});
