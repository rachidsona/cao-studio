/** Façades décor : portes cannelées et à tasseaux (rainures dans la face), et la porte à cadre d'un caisson. */
import { measureVolume } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { withDoorStyle } from "../../frontend/src/document/door-edit";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { emptySketchGeometry, type DoorSettings, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { decorChange, decorClear, decorGrooves, decorProblem, grooveTool, HINGE_CLEAR, SLAT_GAP } from "../../frontend/src/features/door-decor";
import { buildFronts } from "../../frontend/src/features/fronts";
import { frontsParts, frontsProblem } from "../../frontend/src/features/fronts-parts";
import { styleChange } from "../../frontend/src/features/glass-door";
import { buildNiche } from "../../frontend/src/features/niche";
import { nicheGeometry, nicheParts, nicheProblem } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function doorsOf(settings: DoorSettings): { doors: NicheFeature; sketch: SketchFeature } {
  const record = partitionRecord("of1", "R", INPUT, [0, 0], 400);
  const step = record.step!.kind === "partition" ? { ...record.step!, doors: settings } : record.step!;
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "E", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base = createReferencePlate();
  const doc = syncPartitionDoors({ ...base, features: [...base.features, sketch] }, "sk9");
  return { doors: doc.features.find((f): f is NicheFeature => f.type === "niche")!, sketch };
}

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Caisson", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: false, handles: false, ...over });
const volume = (out: ReturnType<typeof buildNiche>, i = 0) => measureVolume(out.shapes[i]!);

describe("les rainures d'une façade décor", () => {
  it("centrées sur la largeur, à l'entraxe, à une crête ou à une lame des chants ; la bordure les raccourcit", () => {
    const f = { style: "fluted", pitch: 30, frameDepth: 3, frameWidth: 0 };
    const g = decorGrooves(f, 0, 300, 0, 700);
    expect(g.map((x) => x.u)).toEqual([15, 45, 75, 105, 135, 165, 195, 225, 255, 285]);
    expect(g[0]).toMatchObject({ width: 28, v0: 0, v1: 700, depth: 3, round: true, through: true });
    expect(decorGrooves({ ...f, frameWidth: 80 }, 0, 300, 0, 700)[0]).toMatchObject({ v0: 80, v1: 620, through: false });
    const slats = decorGrooves({ style: "slats", pitch: 45, frameDepth: 4, frameWidth: 0 }, 0, 300, 0, 700);
    expect(slats.every((x) => x.width === SLAT_GAP && !x.round)).toBe(true);
    expect(Math.min(...slats.map((x) => x.u - x.width / 2))).toBeGreaterThanOrEqual(35 - 1e-9);
    // Clear of the hinge cups: 45 mm from each side edge at least.
    expect(Math.min(...decorGrooves(f, 0, 300, 0, 700, true).map((x) => x.u - x.width / 2))).toBeGreaterThanOrEqual(HINGE_CLEAR - 1e-9);
    expect(decorGrooves({ style: "flat" }, 0, 300, 0, 700)).toEqual([]);
  });

  it("une cannelure est taillée à la fraise hémisphérique : sa largeur à la face, sa profondeur au fond", () => {
    const [g] = decorGrooves({ style: "fluted", pitch: 30, frameDepth: 3 }, 0, 30, 0, 100);
    const t = grooveTool(g!, 19, -1);
    if (!("radius" in t)) throw new Error("une boîte");
    // Its bottom 3 mm in, its width at the face 28.
    expect(t.from[2] - t.radius).toBeCloseTo(16);
    expect(2 * Math.sqrt(t.radius ** 2 - (t.from[2] - 19) ** 2)).toBeCloseTo(28);
    expect(t.from[1]).toBe(-1);
  });

  it("refuse des rainures trop profondes, un entraxe impossible, une bordure trop large", () => {
    const door = [{ width: 400, height: 700 }];
    expect(decorProblem({ style: "fluted", pitch: 30, frameDepth: 17 }, door, 19)).toMatch(/trop profondes/);
    expect(decorProblem({ style: "fluted", pitch: 10, frameDepth: 6 }, door, 19)).toMatch(/moitié de sa largeur/);
    expect(decorProblem({ style: "slats", pitch: 15 }, door, 19)).toMatch(/entraxe des tasseaux/);
    expect(decorProblem({ style: "slats", frameWidth: 340 }, door, 19)).toMatch(/bordure est trop large/);
    expect(decorProblem({ style: "slats" }, [{ width: 60, height: 700 }], 19)).toMatch(/trop étroites/);
    expect(decorProblem({ style: "fluted" }, door, 19)).toBeNull();
    expect(decorClear({ style: "slats", frameDepth: 6 }, 18, 13)).toBe(true);
    expect(decorClear({ style: "fluted", frameDepth: 3 }, 19, 13)).toBe(false);
    expect(styleChange("slats", { style: "frame", frameWidth: 70 })).toEqual(decorChange("slats", {}));
    // A groove's depth is not carried into a frame's set-back.
    expect(styleChange("frame", { style: "slats", frameDepth: 17, frameWidth: 0 })).toEqual({ style: "frame", frameWidth: 70, frameDepth: 6 });
  });
});

describe("portes de Répartition et de caisson", () => {
  it("les portes d'une Répartition se cannèlent : le volume ôté est celui des cannelures", () => {
    const flat = doorsOf({ gap: 3, thickness: 22, handles: false });
    const fluted = doorsOf({ gap: 3, thickness: 22, handles: false, ...styleChange("fluted", {}) });
    expect(fluted.doors).toMatchObject({ style: "fluted", pitch: 30, frameDepth: 3 });
    const [a, b] = [buildNiche(flat.doors, flat.sketch), buildNiche(fluted.doors, fluted.sketch)];
    const n = nicheGeometry(fluted.doors, fluted.sketch);
    if (typeof n === "string") throw new Error(n);
    const [door] = nicheParts(fluted.doors, n);
    const grooves = decorGrooves(fluted.doors, door!.from[0], door!.to[0], door!.from[1], door!.to[1]);
    // A circular segment of chord 28 and height 3, along the door's height.
    const r = 14 ** 2 / 6 + 1.5;
    const segment = r * r * Math.acos((r - 3) / r) - (r - 3) * 14;
    const removed = volume(a) - volume(b);
    expect(removed).toBeCloseTo(grooves.length * segment * (door!.to[1] - door!.from[1]), -2);
    for (const s of [...a.shapes, ...b.shapes]) s.delete();
    // Too deep for the door: refused.
    expect(nicheProblem({ ...fluted.doors, frameDepth: 20 }, n)).toMatch(/trop profondes/);
  });

  it("une porte de caisson se fait à cadre, cannelée ou à tasseaux ; le menu de la porte en change le style", () => {
    const door = frontsParts(fronts(), cabinet)[0]!;
    const plain = door.to.reduce((v, c, i) => v * (c - door.from[i]!), 1);
    const built = (f: FrontsFeature) => {
      const out = buildFronts(f, () => undefined as never, cabinet);
      const v = measureVolume(out.shapes[0]!);
      for (const s of out.shapes) s.delete();
      return v;
    };
    // Frame: a panel 6 deep inside a frame 70 wide.
    expect(plain - built(fronts({ ...styleChange("frame", {}) }))).toBeCloseTo((597 - 140) * (617 - 140) * 6, 0);
    // Slats: rectangular grooves 10 wide, 4 deep, from top to bottom.
    const slats = fronts({ ...styleChange("slats", {}) });
    const grooves = decorGrooves(slats, door.from[0], door.to[0], door.from[2], door.to[2]);
    expect(plain - built(slats)).toBeCloseTo(grooves.length * 10 * 4 * 617, 0);
    expect(frontsProblem(fronts({ style: "slats", frameDepth: 17 }), cabinet)).toMatch(/trop profondes/);
    // Hinge cups behind deep grooves: the grooves keep clear of the side edges.
    expect(frontsProblem(fronts({ style: "slats", frameDepth: 6, hinges: true }), cabinet)).toBeNull();
    // From the menu of the door.
    const doc: CadDocument = { ...createReferencePlate(), features: [cabinet, fronts()] };
    const fluted = withDoorStyle(doc, "fr1#0", "fluted");
    if (typeof fluted === "string") throw new Error(fluted);
    expect(fluted.features.find((f) => f.id === "fr1")).toMatchObject({ style: "fluted", pitch: 30, frameDepth: 3, frameWidth: 0 });
    expect(() => parseDocument(JSON.parse(JSON.stringify(fluted)))).not.toThrow();
    expect(() => parseDocument({ ...fluted, features: [cabinet, { ...fronts(), style: "carved" }] })).toThrow(/style de porte inconnu/);
  });
});
