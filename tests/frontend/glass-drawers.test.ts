/** Tiroirs à façade vitrée dans une niche : cadre alu ouvert sur son verre, verre qui sort avec le tiroir, achetés au devis. */
import { measureVolume } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { glassDoorLook } from "../../frontend/src/document/glass-look";
import { isHardwareBody } from "../../frontend/src/document/hardware";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { drawerNumber } from "../../frontend/src/features/drawer-open";
import { glassFrame, glassItem, profileItem, styleChange } from "../../frontend/src/features/glass-door";
import { buildNiche } from "../../frontend/src/features/niche";
import { nicheGeometry, nicheHardware, nicheParts, nicheProblem } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "R", INPUT, [0, 0], 400)] }, "of1");
if (typeof rebuilt === "string") throw new Error(rebuilt);
const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "E", plane: "XZ", offset: 0, ...rebuilt.geometry };
const drawers = (over: Partial<NicheFeature> = {}): NicheFeature => ({ id: "td1", type: "niche", name: "Tiroirs 1", sketch: "sk1", partition: "of1", niche: [0], fill: "drawers", diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true, ...over });
const glazed = (over: Partial<NicheFeature> = {}) => drawers({ ...styleChange("glass", {}), ...over });
const geometry = () => {
  const n = nicheGeometry(drawers(), sketch);
  if (typeof n === "string") throw new Error(n);
  return n;
};

describe("tiroirs à façade vitrée", () => {
  it("chaque tiroir a sa vitre, nommée pour sortir avec lui, et sa poignée sur le haut du cadre", () => {
    const parts = nicheParts(glazed(), geometry());
    const panes = parts.filter((p) => p.name.startsWith("Vitre tiroir"));
    expect(panes.map((p) => p.name)).toEqual(["Vitre tiroir 1", "Vitre tiroir 2", "Vitre tiroir 3"]);
    expect(panes.map((p) => drawerNumber(p.name))).toEqual([1, 2, 3]);
    // The parts before the glass keep their numbers (the bodies of a project do not change).
    // Behind the glass no box front: the sides run up to the frame.
    const plain = nicheParts(drawers(), geometry()).filter((p) => !p.name.endsWith("— avant"));
    expect(parts.some((p) => p.name.endsWith("— avant"))).toBe(false);
    expect(parts.slice(0, plain.length).map((p) => p.name)).toEqual(plain.map((p) => p.name));
    const side = parts.find((p) => p.name === "Tiroir 1 — côté gauche")!;
    expect(Math.max(side.from[2], side.to[2])).toBeCloseTo(Math.min(parts[0]!.from[2], parts[0]!.to[2]), 6);
    const front = parts.find((p) => p.name === "Façade tiroir 1")!;
    const handle = parts.find((p) => p.name === "Poignée tiroir 1")!;
    expect(handle.from[1]).toBeCloseTo(front.to[1] - glassFrame(glazed()) / 2, 6);
  });

  it("le cadre est ouvert sur le verre ; le verre et le profilé vont au devis, hors du débit, avec leur aspect", () => {
    const plain = buildNiche(drawers(), sketch);
    const glass = buildNiche(glazed(), sketch);
    const parts = nicheParts(glazed(), geometry());
    const i = parts.findIndex((p) => p.name === "Façade tiroir 1");
    expect(measureVolume(plain.shapes[i]!) - measureVolume(glass.shapes[i]!)).toBeGreaterThan(10_000);
    for (const s of [...plain.shapes, ...glass.shapes]) s.delete();
    const hardware = nicheHardware([sketch], glazed());
    expect(hardware.map((h) => h.name)).toEqual(expect.arrayContaining([glassItem("clear"), profileItem("brushed"), "Coulisse de tiroir (paire)"]));
    const doc: CadDocument = { ...createReferencePlate(), features: [sketch, glazed()] };
    const pane = parts.findIndex((p) => p.name === "Vitre tiroir 1");
    expect([isHardwareBody(doc, `td1#${i}`), isHardwareBody(doc, `td1#${pane}`)]).toEqual([true, true]);
    expect(isHardwareBody(doc, `td1#${parts.findIndex((p) => p.name === "Tiroir 1 — fond")}`)).toBe(false);
    expect(glassDoorLook(doc, `td1#${pane}`)).toBe("glass-clear");
    expect(glassDoorLook(doc, `td1#${i}`)).toBe("aluminium-brushed");
  });

  it("refusé à l'anglaise, trop mince, ou avec un cadre trop large", () => {
    expect(nicheProblem(glazed(), geometry())).toBeNull();
    expect(nicheProblem(glazed({ inner: true, mount: "inset" }), geometry())).toMatch(/à l'anglaise/);
    expect(nicheProblem(glazed({ thickness: 6 }), geometry())).toMatch(/^Une façade de tiroir vitrée doit faire au moins 8 mm/);
    expect(nicheProblem(glazed({ frameWidth: 400 }), geometry())).toMatch(/cadre alu est trop large pour ces façades/);
  });
});
