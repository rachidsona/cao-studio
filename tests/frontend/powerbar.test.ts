/** Comme JHS PowerBar : Extrude Along Path (profil posé au début du chemin) et Échanger (Composwapper). */
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { rectangleAt } from "../../frontend/src/document/sketch";
import { elementsOf, sameModel, swapFeatures, swapOffset, type Box } from "../../frontend/src/document/swap";
import type { CadDocument, Feature, SweepFeature } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";
import { profileAxes } from "../../frontend/src/features/sweep";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A profile 20 wide × 40 high drawn flat on the floor, away from a path of lines. */
function along(path: [number, number][], place: SweepFeature["place"]): CadDocument {
  const features: Feature[] = [
    { id: "sp", type: "sketch", name: "Profil", plane: "XY", offset: 0, ...rectangleAt(5010, 5020, 20, 40) },
    {
      id: "sc", type: "sketch", name: "Chemin", plane: "XY", offset: 0,
      points: path.map(([x, y], i) => ({ id: `p${i}`, x, y })),
      curves: path.slice(1).map((_, i) => ({ id: `l${i}`, kind: "line" as const, p1: `p${i}`, p2: `p${i + 1}` })),
      constraints: [],
    },
    { id: "sw", type: "sweep", name: "Moulure", profile: "sp", path: "sc", operation: "new", ...(place ? { place } : {}) },
  ] as Feature[];
  return { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features };
}

function swept(doc: CadDocument) {
  expect(validateDocument(doc)).toEqual([]);
  const r = new Recomputer();
  const status = r.recompute(doc).statuses.find((s) => s.id === "sw");
  const out = r.output("sw");
  const metrics = out?.kind === "solid" ? bodyMetrics(out.shape as Shape3D) : null;
  r.dispose();
  return { state: status?.state, message: status?.message, metrics };
}

describe("extruder le long d'un chemin", () => {
  it("le profil dessiné à plat ailleurs se pose au début du chemin, debout, son coin bas gauche sur le chemin", () => {
    const { state, metrics } = swept(along([[0, 0], [1000, 0]], { anchor: "bottom-left", spin: 0, flip: false }));
    expect(state).toBe("ok");
    expect(metrics!.volume).toBeCloseTo(20 * 40 * 1000, 0);
    // Along +X: the profile's x goes towards +Y (on the left), its y up.
    metrics!.bbox[0].forEach((c, i) => expect(c).toBeCloseTo([0, 0, 0][i]!, 4));
    metrics!.bbox[1].forEach((c, i) => expect(c).toBeCloseTo([1000, 20, 40][i]!, 4));
  });

  it("retourné : de l'autre côté du chemin ; tourné d'un quart : couché", () => {
    const flipped = swept(along([[0, 0], [1000, 0]], { anchor: "bottom-left", spin: 0, flip: true })).metrics!;
    expect(flipped.bbox[0][1]).toBeCloseTo(-20, 4);
    expect(flipped.bbox[1][2]).toBeCloseTo(40, 4);
    const lying = swept(along([[0, 0], [1000, 0]], { anchor: "bottom-left", spin: 90, flip: false })).metrics!;
    expect(lying.bbox[1][2] - lying.bbox[0][2]).toBeCloseTo(20, 4);
  });

  it("le tour d'un dessus de meuble : la moulure suit les quatre côtés, coins d'onglet", () => {
    const { state, metrics } = swept(along([[0, 0], [600, 0], [600, 400], [0, 400], [0, 0]], { anchor: "bottom-left", spin: 0, flip: false }));
    expect(state).toBe("ok");
    expect(metrics!.bbox[1][2]).toBeCloseTo(40, 3);
  });

  it("sans placement, le profil hors du chemin reste refusé comme avant", () => {
    expect(swept(along([[0, 0], [1000, 0]], undefined)).state).not.toBe("ok");
  });

  it("sans profil (comme JHS) : un rectangle largeur × hauteur debout sur le chemin, centré, à gauche ou à droite", () => {
    const section = (align: "center" | "left" | "right", fromEnd?: boolean) => {
      const d = along([[0, 0], [1000, 0]], undefined);
      const features = d.features.map((f) => (f.type === "sweep" ? { ...f, profile: "", section: { width: 30, height: 600, align, ...(fromEnd === undefined ? {} : { fromEnd }) } } : f));
      return swept({ ...d, features: features.filter((f) => f.id !== "sp") });
    };
    const centred = section("center");
    expect(centred.state).toBe("ok");
    expect(centred.metrics!.volume).toBeCloseTo(30 * 600 * 1000, 0);
    centred.metrics!.bbox[0].forEach((c, i) => expect(c).toBeCloseTo([0, -15, 0][i]!, 4));
    centred.metrics!.bbox[1].forEach((c, i) => expect(c).toBeCloseTo([1000, 15, 600][i]!, 4));
    // Walking along +X, the left is +Y; from the other end, the left is −Y.
    expect(section("left").metrics!.bbox[0][1]).toBeCloseTo(0, 4);
    expect(section("left").metrics!.bbox[1][1]).toBeCloseTo(30, 4);
    expect(section("right").metrics!.bbox[1][1]).toBeCloseTo(0, 4);
    expect(section("left", true).metrics!.bbox[1][1]).toBeCloseTo(0, 4);
  });

  it("une section invalide est refusée par la validation", () => {
    const d = along([[0, 0], [1000, 0]], undefined);
    const bad = { ...d, features: d.features.map((f) => (f.type === "sweep" ? { ...f, section: { width: 0, height: 10, align: "middle" } } : f)) } as CadDocument;
    expect(validateDocument(bad).join(" ")).toContain("section rectangulaire invalide");
  });

  it("le repère du profil : y vers le haut, x en travers ; sur un chemin vertical, y vers Y", () => {
    expect(profileAxes([1, 0, 0])).toEqual({ u: [0, 1, 0], v: [0, 0, 1] });
    expect(profileAxes([0, 0, 1]).v).toEqual([0, 1, 0]);
  });
});

describe("échanger (Composwapper)", () => {
  const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [
    { id: "ex1", type: "extrude", name: "Chaise A", sketch: "s", distance: 1, operation: "new" },
    { id: "ex2", type: "extrude", name: "Chaise B", sketch: "s", distance: 1, operation: "new" },
    { id: "ex3", type: "extrude", name: "Fauteuil", sketch: "s", distance: 1, operation: "new" },
  ] as Feature[] };
  const boxes: Record<string, Box> = { ex1: [[0, 0, 0], [400, 400, 900]], ex2: [[1000, 0, 0], [1400, 400, 900]], ex3: [[3000, 0, 100], [3800, 800, 800]] };

  it("calé centré sur le même sol, centre sur centre ou coin sur coin", () => {
    expect(swapOffset(boxes.ex3!, boxes.ex1!, "floor")).toEqual([-3200, -200, -100]);
    expect(swapOffset(boxes.ex3!, boxes.ex1!, "center")).toEqual([-3200, -200, 0]);
    expect(swapOffset(boxes.ex3!, boxes.ex1!, "corner")).toEqual([-3000, 0, -100]);
  });

  it("une copie liée du remplaçant par élément remplacé, les remplacés retirés ; le remplaçant lui-même laissé", () => {
    const els = elementsOf(doc, ["ex1", "ex2", "ex3"], (id) => boxes[id] ?? null);
    const [replacement] = elementsOf(doc, ["ex3"], (id) => boxes[id] ?? null);
    const { features, removed } = swapFeatures(doc, els, replacement!, "floor", [{ id: "ar1", name: "Échange 1" }, { id: "ar2", name: "Échange 2" }, { id: "ar3", name: "Échange 3" }]);
    expect(features.map((f) => [f.id, f.targets, f.step, f.count])).toEqual([["ar1", ["ex3"], [-3200, -200, -100], 1], ["ar2", ["ex3"], [-2200, -200, -100], 1]]);
    expect(removed).toEqual(["ex1", "ex2"]);
  });

  it("Ctrl + clic : les éléments pareils — même modèle de caisson, ou même taille (tournée ou non)", () => {
    const cab = (id: string, x: number, width = 600) => ({ id, type: "cabinet", name: id, origin: [x, 0, 0], rotation: x ? 90 : 0, width, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" });
    const d = { ...doc, features: [...doc.features, cab("c1", 0), cab("c2", 2000), cab("c3", 4000, 450)] as Feature[] };
    const box: Box = [[0, 0, 0], [1, 1, 1]];
    const e = (key: string, b: Box = box) => ({ key, bodies: [`${key}#0`], box: b });
    expect(sameModel(d, e("c1"), e("c2"))).toBe(true);
    expect(sameModel(d, e("c1"), e("c3"))).toBe(false);
    expect(sameModel(d, e("c1"), e("ex1"))).toBe(false);
    // Two chairs of one size, one turned a quarter: the same; the armchair: not.
    expect(sameModel(d, e("ex1", boxes.ex1!), e("ex2", [[0, 0, 0], [400, 400, 900]]))).toBe(true);
    expect(sameModel(d, e("ex1", [[0, 0, 0], [400, 300, 900]]), e("ex2", [[0, 0, 0], [300, 400, 900]]))).toBe(true);
    expect(sameModel(d, e("ex1", boxes.ex1!), e("ex3", boxes.ex3!))).toBe(false);
  });
});
