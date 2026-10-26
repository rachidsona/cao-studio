/** Follow Me: the path chain of a sketch, and the exact sweep of a profile along it. */
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { pathChain, reverseChain } from "../../frontend/src/features/sweep";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** Lines through the given points, each from point i to point i + 1 (in the given order of curves). */
function lines(points: [number, number][], order: number[] = points.slice(1).map((_, i) => i)): SketchGeometry {
  return {
    points: points.map(([x, y], i) => ({ id: `p${i}`, x, y })),
    curves: order.map((i) => ({ id: `l${i}`, kind: "line" as const, p1: `p${i}`, p2: `p${i + 1}` })),
    constraints: [],
  };
}

describe("chemin", () => {
  it("les lignes sont chaînées de bout en bout, quel que soit l'ordre où elles ont été dessinées", () => {
    const chain = pathChain(lines([[0, 0], [0, 300], [200, 300]], [1, 0]));
    expect(chain.closed).toBe(false);
    // It starts at one of the two free ends and goes to the other.
    const forward = chain.start[0] === 0 && chain.steps.at(-1)?.to[0] === 200;
    const backward = chain.start[0] === 200 && chain.steps.at(-1)?.to[0] === 0;
    expect(forward || backward).toBe(true);
    expect(chain.steps).toHaveLength(2);
    expect(reverseChain(chain).start).toEqual(chain.steps.at(-1)!.to);
    expect(reverseChain(reverseChain(chain))).toEqual(chain);
  });

  it("une ligne dessinée à l'envers part quand même de l'extrémité libre", () => {
    const g = lines([[0, 0], [100, 0]]);
    g.curves = [{ id: "l0", kind: "line", p1: "p1", p2: "p0" }];
    expect(pathChain(g).steps).toHaveLength(1);
    expect(pathChain(g).start).toEqual([100, 0]);
  });

  it("un chemin fermé est accepté ; un arc donne son point milieu", () => {
    expect(pathChain(lines([[0, 0], [100, 0], [100, 100], [0, 0]])).closed).toBe(true);
    const arc: SketchGeometry = {
      points: [{ id: "c", x: 0, y: 0 }, { id: "a", x: 100, y: 0 }, { id: "b", x: 0, y: 100 }],
      curves: [{ id: "arc", kind: "arc", center: "c", start: "a", end: "b", radius: 100, startAngle: 0, endAngle: Math.PI / 2 }],
      constraints: [],
    };
    const step = pathChain(arc).steps[0]!;
    expect(step.kind).toBe("arc");
    expect((step as { mid: number[] }).mid[0]).toBeCloseTo(70.7107, 3);
    expect((step as { mid: number[] }).mid[1]).toBeCloseTo(70.7107, 3);
  });

  it("des erreurs claires : rien, branche, morceaux séparés, cercle", () => {
    expect(() => pathChain({ points: [], curves: [], constraints: [] })).toThrow(/ni ligne ni arc/);
    const branch = lines([[0, 0], [100, 0], [200, 0], [100, 100]], [0, 1]);
    branch.curves.push({ id: "b", kind: "line", p1: "p1", p2: "p3" });
    expect(() => pathChain(branch)).toThrow(/se ramifie/);
    const apart = lines([[0, 0], [10, 0], [50, 50], [60, 50]], [0, 2]);
    expect(() => pathChain(apart)).toThrow(/plusieurs morceaux/);
    const circle: SketchGeometry = { points: [{ id: "c", x: 0, y: 0 }], curves: [{ id: "k", kind: "circle", center: "c", radius: 5 }], constraints: [] };
    expect(() => pathChain(circle)).toThrow(/cercle/);
  });
});

function sweepDoc(path: [number, number][], operation: "new" | "join" = "new"): CadDocument {
  const g = lines(path);
  const features: Feature[] = [
    { id: "sp", type: "sketch", name: "Profil", plane: "XZ", offset: 0, ...rectangleAt(10, 10, 20, 20) },
    { id: "sc", type: "sketch", name: "Chemin", plane: "XY", offset: 0, ...g },
    { id: "sw", type: "sweep", name: "Suivre-moi 1", profile: "sp", path: "sc", operation },
  ] as Feature[];
  return { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features };
}

const volumeOf = (r: Recomputer, id: string) => {
  const out = r.output(id);
  if (out?.kind !== "solid") throw new Error("solid expected");
  return bodyMetrics(out.shape as Shape3D).volume;
};

describe("balayage sur le noyau", () => {
  it("un profil carré de 20 mm balayé sur 500 mm : une barre de 20 × 20 × 500", () => {
    const r = new Recomputer();
    const result = r.recompute(sweepDoc([[0, 0], [0, 500]]));
    expect(result.statuses.find((s) => s.id === "sw")?.state).toBe("ok");
    expect(volumeOf(r, "sw")).toBeCloseTo(20 * 20 * 500, 0);
    r.dispose();
  });

  it("le profil placé à l'autre bout du chemin : le balayage part de là, même volume", () => {
    const d = sweepDoc([[0, 0], [0, 500]]);
    const far: CadDocument = { ...d, features: d.features.map((f) => (f.id === "sp" ? ({ ...f, offset: 500 } as Feature) : f)) };
    const r = new Recomputer();
    expect(r.recompute(far).statuses.find((s) => s.id === "sw")?.state).toBe("ok");
    expect(volumeOf(r, "sw")).toBeCloseTo(20 * 20 * 500, 0);
    r.dispose();
  });

  it("un chemin en L : un seul corps valide, d'un volume de 20 × 20 × (300 + 200) moins le recouvrement du coude", () => {
    const r = new Recomputer();
    const result = r.recompute(sweepDoc([[0, 0], [0, 300], [200, 300]]));
    expect(result.statuses.find((s) => s.id === "sw")?.state).toBe("ok");
    const volume = volumeOf(r, "sw");
    expect(volume).toBeGreaterThanOrEqual(20 * 20 * 480 - 1);
    expect(volume).toBeLessThan(20 * 20 * 540);
    r.dispose();
  });

  it("le document garde le balayage à l'aller-retour ; sans profil il est refusé", () => {
    const d = sweepDoc([[0, 0], [0, 500]]);
    expect(parseDocument(JSON.parse(JSON.stringify(d))).features.at(-1)?.type).toBe("sweep");
    const bad = JSON.parse(JSON.stringify(d));
    delete bad.features[2].profile;
    expect(() => parseDocument(bad)).toThrow();
  });

  it("deux esquisses identiques ou un chemin cassé donnent une erreur lisible, pas un plantage", () => {
    const r = new Recomputer();
    const d = sweepDoc([[0, 0], [0, 500]]);
    const same: CadDocument = { ...d, features: d.features.map((f) => (f.id === "sw" ? ({ ...f, path: "sp" } as Feature) : f)) };
    const status = r.recompute(same).statuses.find((s) => s.id === "sw");
    expect(status?.state).toBe("error");
    r.dispose();
  });
});
