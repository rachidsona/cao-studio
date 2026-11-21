/** Tiroirs de caisson à façade vitrée : cadre alu ouvert sur son verre, verre qui sort avec le tiroir, achetés au devis. */
import { measureVolume } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { glassDoorLook } from "../../frontend/src/document/glass-look";
import { isHardwareBody } from "../../frontend/src/document/hardware";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { drawerNumber } from "../../frontend/src/features/drawer-open";
import { buildFronts } from "../../frontend/src/features/fronts";
import { drillings } from "../../frontend/src/features/fronts-drillings";
import { frontsHardware, frontsParts, frontsProblem } from "../../frontend/src/features/fronts-parts";
import { glassFrame, glassItem, profileItem, styleChange } from "../../frontend/src/features/glass-door";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Caisson", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 0, plinth: 100, construction: "sides-through" };
const drawers = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "drawers", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true, ...over });
const glazed = (over: Partial<FrontsFeature> = {}) => drawers({ ...styleChange("glass", {}), ...over });

describe("tiroirs de caisson vitrés", () => {
  it("chaque tiroir a sa vitre, à la fin (les autres pièces gardent leur numéro), qui sort avec lui", () => {
    // Behind the glass no box front: the sides run up to the frame.
    const plain = frontsParts(drawers(), cabinet).filter((p) => !p.name.endsWith("— avant"));
    const parts = frontsParts(glazed(), cabinet);
    expect(parts.some((p) => p.name.endsWith("— avant"))).toBe(false);
    expect(parts.slice(0, plain.length).map((p) => p.name)).toEqual(plain.map((p) => p.name));
    const [front, side] = ["Façade tiroir 1", "Tiroir 1 — côté gauche"].map((n) => parts.find((p) => p.name === n)!);
    expect(Math.min(side!.from[1], side!.to[1])).toBeCloseTo(Math.max(front!.from[1], front!.to[1]), 6);
    const panes = parts.slice(plain.length);
    expect(panes.map((p) => p.name)).toEqual(["Vitre tiroir 1", "Vitre tiroir 2", "Vitre tiroir 3"]);
    expect(panes.map((p) => drawerNumber(p.name))).toEqual([1, 2, 3]);
  });

  it("le cadre est ouvert sur le verre, la poignée percée sur sa traverse du haut", () => {
    const parts = frontsParts(glazed(), cabinet);
    const i = parts.findIndex((p) => p.name === "Façade tiroir 1");
    const a = buildFronts(drawers(), () => undefined as never, cabinet);
    const b = buildFronts(glazed(), () => undefined as never, cabinet);
    expect(measureVolume(a.shapes[i]!) - measureVolume(b.shapes[i]!)).toBeGreaterThan(10_000);
    for (const s of [...a.shapes, ...b.shapes]) s.delete();
    const front = parts[i]!;
    const handle = drillings(front, glazed(), []).filter((h) => h.radius < 10);
    expect(handle).toHaveLength(2);
    for (const h of handle) expect(h.at[2]).toBeCloseTo(front.to[2] - glassFrame(glazed()) / 2, 6);
  });

  it("verre et profilé au devis, hors du débit, avec leur aspect ; refusé sans poignée ou trop mince", () => {
    const names = frontsHardware(glazed(), cabinet).map((h) => h.name);
    expect(names).toEqual(expect.arrayContaining([glassItem("clear"), profileItem("brushed"), "Coulisse de tiroir (paire)"]));
    const doc: CadDocument = { ...createReferencePlate(), features: [cabinet, glazed()] };
    const parts = frontsParts(glazed(), cabinet);
    const [front, pane, bottom] = ["Façade tiroir 1", "Vitre tiroir 1", "Tiroir 1 — fond"].map((n) => `fr1#${parts.findIndex((p) => p.name === n)}`);
    expect([isHardwareBody(doc, front!), isHardwareBody(doc, pane!), isHardwareBody(doc, bottom!)]).toEqual([true, true, false]);
    expect([glassDoorLook(doc, front!), glassDoorLook(doc, pane!)]).toEqual(["aluminium-brushed", "glass-clear"]);
    expect(frontsProblem(glazed(), cabinet)).toBeNull();
    expect(frontsProblem(glazed({ grip: "gorge" }), cabinet)).toMatch(/tiroir vitré garde sa poignée/);
    expect(frontsProblem(glazed({ thickness: 6 }), cabinet)).toMatch(/^Une façade de tiroir vitrée doit faire au moins 8 mm/);
  });
});
