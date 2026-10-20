/** Split Body: a real cut of a solid by a plane or a planar face, with the parts kept as separate bodies. */
import { beforeAll, describe, expect, it } from "vitest";
import { bodyLabel, bodyOrigin, deleteFeature, dependentsOf, isBodyHidden, toggleHidden } from "../../frontend/src/document/operations";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature, SplitFeature, SplitKeep, SplitTool } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeFace } from "../../frontend/src/geometry/references";
import { Recomputer } from "../../frontend/src/history/recompute";
import { UndoStack } from "../../frontend/src/history/undo";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const doc = (...features: Feature[]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features });

/** Plate 40 × 20 × 10 mm (x ∈ [−20, 20], y ∈ [−10, 10], z ∈ [0, 10]): volume 8000. */
const plate = (id = "ex", cx = 0, w = 40, h = 20): Feature[] => [
  { id: `sk${id}`, type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...rectangleAt(cx, 0, w, h) },
  { id, type: "extrude", name: `Plaque ${id}`, sketch: `sk${id}`, distance: 10, operation: "new" },
];

const split = (tool: SplitTool, keep: SplitKeep = "both", target = "ex"): SplitFeature => ({ id: "sp", type: "split", name: "Scission 1", target, tool, keep });
const plane = (name: "XY" | "XZ" | "YZ", offset: number): SplitTool => ({ kind: "plane", plane: name, offset });

/** U-shaped body: 30 × 10 × 10 block with a 10 wide notch from z = 4 up (two arms): volume 2400. */
const uBody = (): Feature[] => [
  ...plate("ex", 0, 30, 10),
  { id: "skn", type: "sketch", name: "Encoche", plane: "XY", offset: 4, ...rectangleAt(0, 0, 10, 20) },
  { id: "ex2", type: "extrude", name: "Encoche", sketch: "skn", distance: 6, operation: "cut", target: "ex" },
];

function run(d: CadDocument) {
  const r = new Recomputer();
  const result = r.recompute(d);
  const metrics = (id: string) => {
    const out = r.output(id);
    if (out?.kind !== "solid") throw new Error(`corps « ${id} » attendu`);
    return bodyMetrics(out.shape);
  };
  return { r, result, metrics, status: (id: string) => result.statuses.find((s) => s.id === id) };
}

describe("coupe réussie", () => {
  it("un plan au milieu donne deux corps distincts, moitiés exactes", () => {
    const { r, result, metrics, status } = run(doc(...plate(), split(plane("YZ", 0))));
    expect(status("sp")).toMatchObject({ state: "ok" });
    expect(result.bodies).toEqual(["sp#0", "sp#1"]); // the original body is consumed
    const [a, b] = [metrics("sp#0"), metrics("sp#1")];
    expect(a.volume).toBeCloseTo(4000, 6);
    expect(b.volume).toBeCloseTo(4000, 6);
    expect(a.bbox).toEqual([[-20, -10, 0], [0, 10, 10]]);
    expect(b.bbox).toEqual([[0, -10, 0], [20, 10, 10]]);
    r.dispose();
  });

  it("un plan décalé coupe où il est, les deux parties conservent le volume total", () => {
    const { r, result, metrics } = run(doc(...plate(), split(plane("XY", 3))));
    expect(result.bodies).toHaveLength(2);
    const volumes = result.bodies.map((id) => metrics(id).volume).sort((x, y) => x - y);
    expect(volumes[0]).toBeCloseTo(40 * 20 * 3, 6);
    expect(volumes[1]).toBeCloseTo(40 * 20 * 7, 6);
    r.dispose();
  });

  it("les plans XZ et YZ suivent la convention des esquisses (normale −Y pour XZ)", () => {
    // XZ offset 4 moves the plane along its normal −Y: it cuts at y = −4.
    const { r, result, metrics } = run(doc(...plate(), split(plane("XZ", 4), "positive")));
    expect(result.bodies).toEqual(["sp"]);
    expect(metrics("sp").bbox).toEqual([[-20, -10, 0], [20, -4, 10]]); // the −Y side is positive
    r.dispose();
  });
});

describe("partie conservée", () => {
  it("garder une seule partie : le même corps, coupé", () => {
    for (const [keep, bbox] of [["positive", [[0, -10, 0], [20, 10, 10]]], ["negative", [[-20, -10, 0], [0, 10, 10]]]] as const) {
      const { r, result, metrics } = run(doc(...plate(), split(plane("YZ", 0), keep)));
      expect(result.bodies).toEqual(["sp"]);
      expect(metrics("sp").volume).toBeCloseTo(4000, 6);
      expect(metrics("sp").bbox).toEqual(bbox);
      r.dispose();
    }
  });

  it("le corps coupé garde le nom du corps d'origine, les pièces portent leur numéro", () => {
    const one = doc(...plate(), split(plane("YZ", 0), "positive"));
    expect(bodyOrigin(one, "sp")).toBe("ex");
    expect(bodyLabel(one, "sp")).toBe("Corps 1");
    const both = doc(...plate(), split(plane("YZ", 0)));
    expect(bodyLabel(both, "sp#0")).toBe("Corps 1 — pièce 1");
    expect(bodyLabel(both, "sp#1")).toBe("Corps 1 — pièce 2");
    expect(bodyOrigin(both, "sp#1")).toBe("sp#1"); // a piece is a body of its own
  });
});

describe("intersections multiples", () => {
  it("un corps en U coupé à travers ses bras : les morceaux séparés sont des corps", () => {
    const base = run(doc(...uBody()));
    expect(base.metrics("ex2").volume).toBeCloseTo(2400, 6);
    base.r.dispose();
    const both = run(doc(...uBody(), split(plane("XY", 7), "both", "ex2")));
    expect(both.result.bodies).toHaveLength(3); // two arms above the plane + the base below
    const volumes = both.result.bodies.map((id) => both.metrics(id).volume).sort((a, b) => a - b);
    expect(volumes[0]).toBeCloseTo(300, 6);
    expect(volumes[1]).toBeCloseTo(300, 6);
    expect(volumes[2]).toBeCloseTo(1800, 6);
    both.r.dispose();
    const arms = run(doc(...uBody(), split(plane("XY", 7), "positive", "ex2")));
    expect(arms.result.bodies).toEqual(["sp#0", "sp#1"]);
    arms.r.dispose();
  });
});

describe("outil de coupe qui ne coupe pas", () => {
  it("un plan hors du corps ou qui l'effleure est refusé sans toucher au modèle", () => {
    for (const offset of [50, 10, -3]) {
      const { r, result, status } = run(doc(...plate(), split(plane("XY", offset))));
      expect(status("sp")).toMatchObject({ state: "error", message: expect.stringMatching(/ne traverse pas/) });
      expect(status("ex")).toMatchObject({ state: "ok" });
      expect(result.bodies).toEqual(["ex"]); // the body is still there, intact
      r.dispose();
    }
  });

  it("une opération suivante sur une scission en échec est bloquée, pas calculée sur un faux résultat", () => {
    const hole: Feature = { id: "h", type: "hole", name: "Trou", target: "sp#0", x: 0, y: 0, diameter: 4, depth: "through" };
    const { r, status } = run(doc(...plate(), split(plane("XY", 50)), hole));
    expect(status("sp")).toMatchObject({ state: "error" });
    expect(status("h")?.state).not.toBe("ok");
    r.dispose();
  });
});

describe("face comme outil de coupe", () => {
  /** Body B 20 × 10 at x ∈ [0, 20]: its left face (x = 0, normal −X) is the cutting plane. */
  function faceOfB(): { tool: SplitTool; features: Feature[] } {
    const features = [...plate(), ...plate("exb", 10, 20, 10)];
    const probe = run(doc(...features));
    const out = probe.r.output("exb");
    if (out?.kind !== "solid") throw new Error("solid expected");
    const left = out.shape.faces.find((f) => Math.abs(f.center.x) < 1e-9 && f.geomType === "PLANE")!;
    const face = describeFace(out.shape, left);
    probe.r.dispose();
    return { tool: { kind: "face", body: "exb", face }, features };
  }

  it("le plan d'une face plane d'un autre corps coupe le corps ciblé", () => {
    const { tool, features } = faceOfB();
    const { r, result, metrics, status } = run(doc(...features, split(tool, "positive")));
    expect(status("sp")).toMatchObject({ state: "ok" });
    expect(result.bodies).toEqual(["exb", "sp"]);
    // The face normal is −X: the positive side is x < 0.
    expect(metrics("sp").bbox).toEqual([[-20, -10, 0], [0, 10, 10]]);
    r.dispose();
  });

  it("une face courbe est refusée : le moteur coupe par des plans", () => {
    const hole: Feature = { id: "h", type: "hole", name: "Trou", target: "exb", x: 10, y: 0, diameter: 4, depth: "through" };
    const probe = run(doc(...plate(), ...plate("exb", 10, 20, 10), hole));
    const out = probe.r.output("h");
    if (out?.kind !== "solid") throw new Error("solid expected");
    const wall = describeFace(out.shape, out.shape.faces.find((f) => f.geomType === "CYLINDRE")!);
    probe.r.dispose();
    const { r, status } = run(doc(...plate(), ...plate("exb", 10, 20, 10), hole, split({ kind: "face", body: "h", face: wall })));
    expect(status("sp")).toMatchObject({ state: "error", message: expect.stringMatching(/face plane/) });
    r.dispose();
  });
});

describe("historique paramétrique", () => {
  it("on peut continuer sur une pièce, et la scission est mise en cache", () => {
    const hole: Feature = { id: "h", type: "hole", name: "Trou", target: "sp#1", x: 10, y: 0, diameter: 4, depth: "through" };
    const d = doc(...plate(), split(plane("YZ", 0)), hole);
    const first = run(d);
    expect(first.result.bodies).toEqual(["sp#0", "h"]);
    expect(first.metrics("h").volume).toBeCloseTo(4000 - Math.PI * 4 * 10, 3);
    const again = first.r.recompute(d);
    expect(again.statuses.map((s) => s.reused)).toEqual([true, true, true, true]);
    first.r.dispose();
  });

  it("supprimer la scission rétablit le corps d'origine et retire ce qui dépend de ses pièces", () => {
    const hole: Feature = { id: "h", type: "hole", name: "Trou", target: "sp#1", x: 10, y: 0, diameter: 4, depth: "through" };
    const d = doc(...plate(), split(plane("YZ", 0)), hole);
    expect(dependentsOf(d, "sp")).toEqual(["h"]);
    const without = deleteFeature(d, "sp");
    expect(without.features.map((f) => f.id)).toEqual(["skex", "ex"]);
    const { r, result } = run(without);
    expect(result.bodies).toEqual(["ex"]);
    r.dispose();
  });

  it("masquer ou nommer une pièce reste attaché à elle, et disparaît avec la scission", () => {
    const d = toggleHidden(doc(...plate(), split(plane("YZ", 0))), "sp#1");
    expect(isBodyHidden(d, "sp#1")).toBe(true);
    expect(isBodyHidden(d, "sp#0")).toBe(false);
    expect(toggleHidden(d, "sp#1").hiddenBodies).toEqual([]);
    expect(deleteFeature(d, "sp").hiddenBodies).toEqual([]);
  });
});

describe("sauvegarde et annulation", () => {
  it("le document avec une scission survit à un enregistrement et se relit à l'identique", () => {
    const tool: SplitTool = { kind: "plane", plane: "XY", offset: 3.5 };
    const d = doc(...plate(), split(tool, "negative"));
    const reloaded = parseDocument(JSON.parse(JSON.stringify(d)));
    expect(reloaded.features.at(-1)).toEqual(d.features.at(-1));
    const { r, result } = run(reloaded);
    expect(result.bodies).toEqual(["sp"]);
    r.dispose();
  });

  it("refuse une scission mal formée à l'ouverture", () => {
    const bad = (patch: Record<string, unknown>) => ({ ...doc(...plate(), split(plane("XY", 3))), features: [...plate(), { ...split(plane("XY", 3)), ...patch }] });
    expect(() => parseDocument(bad({ keep: "tout" }))).toThrow(/partie à conserver/);
    expect(() => parseDocument(bad({ tool: { kind: "plane", plane: "AB", offset: 1 } }))).toThrow(/plan de coupe/);
    expect(() => parseDocument(bad({ tool: { kind: "plane", plane: "XY", offset: "3" } }))).toThrow(/décalage/);
    expect(() => parseDocument(bad({ tool: { kind: "face", face: {} } }))).toThrow(/corps de la face/);
    expect(() => parseDocument(bad({ tool: { kind: "courbe" } }))).toThrow(/outil de coupe inconnu/);
    expect(() => parseDocument(bad({ tool: undefined }))).toThrow(/outil de coupe manquant/);
  });

  it("annuler retire la scission, rétablir la remet", () => {
    const before = doc(...plate());
    const after = doc(...plate(), split(plane("YZ", 0)));
    const stack = new UndoStack();
    stack.push(before);
    expect(stack.undo(after)).toEqual(before);
    expect(stack.redo(before)).toEqual(after);
    const { r, result } = run(stack.undo(after) as CadDocument);
    expect(result.bodies).toEqual(["ex"]);
    r.dispose();
  });
});
