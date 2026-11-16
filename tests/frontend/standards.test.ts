/** Standards de construction, Minifix, contrôles de quincaillerie, recouvrement, perçages sur chant, remplacer partout. */
import { beforeAll, describe, expect, it } from "vitest";
import { cutList, type PartInput } from "../../frontend/src/document/cut-list";
import { edgeHoles, edgeHolesText } from "../../frontend/src/document/face-ops";
import { modelHardware } from "../../frontend/src/document/hardware";
import { doorProblems, hingesNeeded, jointProblems } from "../../frontend/src/document/hardware-rules";
import { bodyInfo } from "../../frontend/src/document/materials";
import { replaceEverywhere } from "../../frontend/src/document/replace";
import { STANDARDS, applyStandards, cabinetStandard, drift, setProjectStandard, standardProblem } from "../../frontend/src/document/standards";
import type { CabinetFeature, CadDocument, FrontsFeature, MachiningFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { applyRule } from "../../frontend/src/features/assembly-rules";
import { cabinetParts } from "../../frontend/src/features/cabinet-parts";
import { hingeHeights } from "../../frontend/src/features/fronts-parts";
import { camDepth, contactOf, minifix, type Box } from "../../frontend/src/features/joinery";
import { stretchOf, swapOverlap } from "../../frontend/src/features/overlap-swap";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const cabinet = (patch: Partial<CabinetFeature> = {}): CabinetFeature => ({ id: "cb1", type: "cabinet", name: "Caisson 1", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through", ...patch });
const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades 1", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: false };
const docOf = (...features: CadDocument["features"]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features });

describe("standards de construction", () => {
  it("le standard du projet reconstruit les caissons, leurs façades, matières et chants, en disant ce qui change", () => {
    const doc = setProjectStandard(docOf(cabinet(), fronts), STANDARDS.find((s) => s.id === "melamine-19")!);
    expect(doc.standard).toBe("melamine-19");
    expect(doc.standards).toBeUndefined();
    expect(drift(doc)).toEqual(["cb1"]);
    const { doc: next, impact } = applyStandards(doc);
    expect(impact.cabinets).toEqual(["Caisson 1"]);
    expect(impact.fronts).toEqual([]);
    const made = next.features.find((f) => f.id === "cb1") as CabinetFeature;
    expect([made.thickness, made.back, made.backThickness]).toEqual([19, "applied", 3]);
    // The sides: carcass material, the front edge banded; the back in HDF; the door in its material, four edges.
    expect(bodyInfo(next, "cb1#0")).toMatchObject({ material: "melamine-white", band: 1, edges: { length1: true, length2: false } });
    expect(bodyInfo(next, "cb1#4").material).toBe("hdf");
    expect(bodyInfo(next, "fr1#0")).toMatchObject({ material: "melamine-white", edges: { length1: true, length2: true, width1: true, width2: true } });
    expect(drift(next)).toEqual([]);
    expect(applyStandards(next).impact).toEqual({ cabinets: [], fronts: [], parts: 0 });
    expect(() => parseDocument(JSON.parse(JSON.stringify(next)))).not.toThrow();
  });

  it("un caisson suit son propre standard, ou aucun ; un standard modifié est gardé dans le projet", () => {
    const own = { ...STANDARDS[0]!, id: "std-x", name: "Le mien", thickness: 22 };
    const doc = setProjectStandard(docOf(cabinet(), cabinet({ id: "cb2", name: "Caisson 2", standard: "none" }), cabinet({ id: "cb3", name: "Caisson 3", standard: "plywood-18" })), own);
    expect(doc.standards?.map((s) => s.id)).toEqual(["std-x"]);
    expect(cabinetStandard(doc, doc.features[1] as CabinetFeature)).toBeUndefined();
    const { doc: next } = applyStandards(doc);
    expect(next.features.map((f) => (f as CabinetFeature).thickness)).toEqual([22, 18, 18]);
    expect((next.features[2] as CabinetFeature).construction).toBe("top-bottom-through");
    expect(standardProblem({ ...own, thickness: 0 })).toMatch(/positives/);
    expect(() => parseDocument(JSON.parse(JSON.stringify(next)))).not.toThrow();
  });

  it("les chants plus fins que le seuil du standard ne sont pas déduits de la cote de coupe", () => {
    const thin = setProjectStandard(docOf(cabinet()), STANDARDS.find((s) => s.id === "melamine-16")!);
    const { doc } = applyStandards(thin);
    const c = doc.features[0] as CabinetFeature;
    const parts: PartInput[] = cabinetParts(c).map((p, i) => ({ id: `cb1#${i}`, bbox: [p.from, p.to], volume: Math.abs((p.to[0] - p.from[0]) * (p.to[1] - p.from[1]) * (p.to[2] - p.from[2])) }));
    const side = cutList(doc, parts).rows.find((r) => r.names.includes("Caisson 1 — Côté gauche"))!;
    expect(side.band).toBe(0.4);
    expect([side.cutLength, side.cutWidth]).toEqual([side.length, side.width]);
  });
});

describe("Minifix et contrôles", () => {
  const side: Box = [[0, 0, 0], [18, 560, 720]];
  const top: Box = [[18, 0, 702], [582, 560, 720]];

  it("Minifix : la tige dans le côté, le perçage Ø8 et l'excentrique Ø15 dans le dessus, par en dessous", () => {
    const c = contactOf(side, top)!;
    const joint = minifix(side, top, c);
    expect(joint.a.every((op) => op.kind === "hole" && op.diameter === 5 && op.dir[0] === -1)).toBe(true);
    const cams = joint.b.filter((op) => op.kind === "hole" && op.diameter === 15);
    expect(cams.length).toBeGreaterThanOrEqual(2);
    // The top's inside is below it: the cam comes from its underside (z = 702), 24 mm from the side.
    expect(cams.every((op) => op.kind === "hole" && op.at[2] === 702 && op.dir[2] === 1 && op.at[0] === 42)).toBe(true);
    expect(camDepth(18)).toBe(13.5);
    const rule = applyRule([{ id: "a", box: side }, { id: "b", box: top }], { joint: "minifix", spacing: 256, margin: 50, minThickness: 8 });
    expect(rule.fasteners).toBe(cams.length);
    const doc = docOf({ id: "mc1", type: "machining", name: "Minifix 1", target: "b", kind: "minifix", ops: rule.ops.get("b")! } as MachiningFeature);
    expect(modelHardware(doc)).toContainEqual({ name: "Excentrique Minifix 15 + tige", quantity: cams.length });
  });

  it("jonctions sans assemblage signalées ; une fois percées, plus rien", () => {
    const boards = [{ id: "a", box: side }, { id: "b", box: top }];
    expect(jointProblems(docOf(), boards)).toHaveLength(1);
    const { ops } = applyRule(boards, { joint: "dowel", spacing: 96, margin: 50, minThickness: 8 });
    const doc = docOf({ id: "mc1", type: "machining", name: "T", target: "b", kind: "dowel", ops: ops.get("b")! } as MachiningFeature);
    expect(jointProblems(doc, [{ id: "a", box: side }, { id: "mc1", box: top }])).toEqual([]);
  });

  it("charnières : nombre selon la hauteur et le poids, décalées de 32 mm hors des étagères", () => {
    expect(hingesNeeded(700, 3)).toBe(2);
    expect(hingesNeeded(700, 12)).toBe(3);
    const { heights, blocked } = hingeHeights(0, 720, 2, [[90, 108]]);
    // The plate (±25 mm) clears the shelf two steps up.
    expect(heights[0]).toBe(100 + 64);
    expect(blocked).toEqual([]);
    expect(hingeHeights(0, 720, 2, [[0, 720]]).blocked).toEqual([0, 1]);
    // A tall heavy door: it gets the hinges its weight asks for, and is said to be too heavy past five.
    const tall = docOf(cabinet({ height: 2200, depth: 600, shelves: 0 }), { ...fronts, thickness: 40 });
    expect(doorProblems({ ...tall, bodyInfo: { "fr1#0": { material: "solid-oak" } } }).map((p) => p.message).join(" ")).toMatch(/très lourde : 9 charnières/);
  });
});

describe("recouvrement, perçages sur chant, remplacer partout", () => {
  it("le dessus posé entre les côtés devient un dessus qui les couvre", () => {
    const side: Box = [[0, 0, 0], [18, 560, 720]];
    const top: Box = [[18, 0, 702], [582, 560, 720]];
    const changes = swapOverlap(side, top);
    expect(changes).toEqual([
      { board: "a", axis: 2, end: "high", distance: -18 },
      { board: "b", axis: 0, end: "low", distance: 18 },
    ]);
    expect(stretchOf(top, (changes as Exclude<typeof changes, string>)[1]!)).toEqual({ position: 300, distance: 18, translate: [-18, 0, 0] });
    expect(swapOverlap(side, [[18, 0, 300], [582, 560, 318]])).toMatch(/angle/);
  });

  it("les perçages des chants sont rangés par chant, à leur place actuelle", () => {
    const box: [[number, number, number], [number, number, number]] = [[18, 0, 702], [582, 560, 720]];
    const doc = docOf({ id: "mc1", type: "machining", name: "T", target: "b", kind: "dowel", ops: [{ kind: "hole", at: [18, 50, 711], dir: [1, 0, 0], diameter: 8, depth: 15 }, { kind: "hole", at: [100, 50, 720], dir: [0, 0, -1], diameter: 5, depth: 12 }] } as MachiningFeature);
    const holes = edgeHoles(doc, "mc1", box);
    expect(holes).toEqual([{ edge: "chant court côté X−", along: 50, height: 9, diameter: 8, depth: 15 }]);
    expect(edgeHolesText(holes)[0]).toBe("chant court côté X− : 1 × Ø8 prof. 15 à 50 (à 9 de la face basse)");
  });

  it("une matière et un chant remplacés partout, standards du projet compris", () => {
    const own = { ...STANDARDS[0]!, id: "std-x", name: "Le mien" };
    const doc: CadDocument = { ...setProjectStandard(docOf(cabinet()), own), bodyInfo: { "cb1#0": { material: "melamine-white", edges: { length1: true, length2: false, width1: false, width2: false }, band: 1 }, "cb1#1": { material: "mdf" } } };
    const { doc: next, bodies } = replaceEverywhere(doc, { material: ["melamine-white", "melamine-oak"] });
    expect(bodies).toBe(1);
    expect(next.bodyInfo?.["cb1#0"]?.material).toBe("melamine-oak");
    expect(next.standards?.[0]?.carcass).toBe("melamine-oak");
    expect(replaceEverywhere(next, { band: [1, 2] }).doc.bodyInfo?.["cb1#0"]?.band).toBe(2);
  });

  it("le noyau construit un caisson Minifix et des façades aux charnières décalées", () => {
    const side: Box = [[0, 0, 0], [18, 560, 720]];
    const top: Box = [[18, 0, 702], [582, 560, 720]];
    const { ops } = applyRule([{ id: "cb1#0", box: side }, { id: "cb1#3", box: top }], { joint: "minifix", spacing: 256, margin: 50, minThickness: 8 });
    const doc = docOf(cabinet({ shelves: 2 }), fronts, ...[...ops].map(([target, list], i) => ({ id: `mc${i}`, type: "machining", name: `Minifix ${i}`, target, kind: "minifix", ops: list }) as MachiningFeature));
    const { statuses } = new Recomputer().recompute(doc);
    expect(statuses.filter((s) => s.state !== "ok").map((s) => `${s.id} ${s.message}`)).toEqual([]);
  });
});
