/**
 * Pièces de niche construites plus vite (poignée faite une fois et copiée à sa place, trous de poignée découpés d'un
 * seul coup) : elles restent les mêmes — trous du bon volume, cadre vitré juste, poignée devant ses trous.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { emptySketchGeometry, type DoorSettings, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { buildNiche } from "../../frontend/src/features/niche";
import { nicheGeometry, nicheParts, nicheWorld } from "../../frontend/src/features/niche-parts";
import { bodyMetrics, isShapeValid } from "../../frontend/src/geometry/kernel";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel, 60_000);

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function doors(settings: DoorSettings): { f: NicheFeature; sketch: SketchFeature } {
  const record = partitionRecord("of1", "R", INPUT, [0, 0], 400);
  const step = record.step!.kind === "partition" ? { ...record.step!, doors: settings } : record.step!;
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "E", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base = createReferencePlate();
  const doc: CadDocument = syncPartitionDoors({ ...base, features: [...base.features, sketch] }, "sk9");
  return { f: doc.features.find((x): x is NicheFeature => x.type === "niche")!, sketch };
}

const volumes = (f: NicheFeature, sketch: SketchFeature) => {
  const out = buildNiche(f, sketch);
  try {
    expect(out.shapes.every(isShapeValid)).toBe(true);
    return out.shapes.map((s) => bodyMetrics(s));
  } finally {
    for (const s of out.shapes) s.delete();
  }
};

describe("pièces de niche construites vite, et justes", () => {
  it("une porte : ses deux trous de poignée font le volume de deux perçages Ø5 traversants", () => {
    const plain = doors({ gap: 3, thickness: 18, handles: false });
    const drilled = { ...plain.f, handles: true };
    const parts = nicheParts(drilled, nicheGeometry(drilled, plain.sketch) as never);
    const door = parts.findIndex((p) => p.role === "front");
    const without = volumes(plain.f, plain.sketch)[door]!.volume;
    const withHoles = volumes(drilled, plain.sketch)[door]!.volume;
    expect(without - withHoles).toBeCloseTo(2 * Math.PI * 2.5 ** 2 * 18, 0);
  }, 60_000);

  it("une porte vitrée : le cadre ouvert et rainuré, puis ses trous, reste un solide juste", () => {
    const glass = doors({ gap: 3, thickness: 22, handles: true, style: "glass", frameWidth: 20, glass: "clear", profile: "brushed" });
    const bare = { ...glass.f, handles: false };
    const parts = nicheParts(glass.f, nicheGeometry(glass.f, glass.sketch) as never);
    const frame = parts.findIndex((p) => p.role === "front");
    const a = volumes(bare, glass.sketch)[frame]!.volume;
    const b = volumes(glass.f, glass.sketch)[frame]!.volume;
    expect(a).toBeGreaterThan(0);
    expect(a - b).toBeCloseTo(2 * Math.PI * 2.5 ** 2 * 22, 0);
  }, 60_000);

  it("la poignée, copiée d'un modèle, se tient devant ses trous, à 25 mm de la façade", () => {
    const { f, sketch } = doors({ gap: 3, thickness: 18, handles: true });
    const n = nicheGeometry(f, sketch);
    if (typeof n === "string") throw new Error(n);
    const parts = nicheParts(f, n);
    const metrics = volumes(f, sketch);
    const handles = parts.flatMap((p, i) => (p.kind === "handle" ? [i] : []));
    expect(handles.length).toBeGreaterThan(0);
    for (const i of handles) {
      const p = parts[i]!;
      const [a, b] = [nicheWorld(n, p.from), nicheWorld(n, p.to)];
      const [lo, hi] = metrics[i]!.bbox;
      // Along the door's edge: from a hole less the overhang to the other plus it; out of the front by 25 + the bar.
      for (const k of [0, 1, 2]) {
        const span = Math.abs(b[k]! - a[k]!);
        if (span > 1) {
          expect(lo[k]).toBeCloseTo(Math.min(a[k]!, b[k]!) - 15, 1);
          expect(hi[k]).toBeCloseTo(Math.max(a[k]!, b[k]!) + 15, 1);
        }
      }
      const out = nicheWorld(n, [0, 0, 1]).map((v, k) => v - nicheWorld(n, [0, 0, 0])[k]!);
      const axis = out.findIndex((v) => Math.abs(v) > 0.5);
      const reach = out[axis]! > 0 ? hi[axis]! - a[axis]! : a[axis]! - lo[axis]!;
      expect(reach).toBeCloseTo(25 + 6, 1);
    }
  }, 60_000);
});
