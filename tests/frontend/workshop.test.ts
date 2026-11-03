/** Workshop: materials and edge bands, cut list, sheet layout. */
import { describe, expect, it } from "vitest";
import { cutList, cutListCsv, type PartInput } from "../../frontend/src/document/cut-list";
import { bodyInfo, setBodyInfo } from "../../frontend/src/document/materials";
import { layoutSheets } from "../../frontend/src/document/nesting";
import { cabinetParts } from "../../frontend/src/features/cabinet-parts";
import type { CabinetFeature, CadDocument } from "../../frontend/src/document/types";

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Caisson 1", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 2, plinth: 0, construction: "sides-through" };
const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [cabinet] };
const parts: PartInput[] = cabinetParts(cabinet).map((p, i) => ({ id: `cb1#${i}`, bbox: [p.from, p.to], volume: (p.to[0] - p.from[0]) * (p.to[1] - p.from[1]) * (p.to[2] - p.from[2]) }));

describe("matière et chants", () => {
  it("se règlent par corps et restent avec l'opération qui l'a créé", () => {
    const next = setBodyInfo(doc, ["cb1#0", "cb1#1"], { material: "melamine-white", edges: { length1: true, length2: false, width1: false, width2: false }, band: 1 });
    expect(bodyInfo(next, "cb1#0").material).toBe("melamine-white");
    expect(bodyInfo(next, "cb1#2")).toEqual({});
  });
});

describe("liste de débit", () => {
  it("pièces identiques groupées, longueur ≥ largeur, cotes de coupe moins les chants", () => {
    const withBands = setBodyInfo(doc, ["cb1#0", "cb1#1"], { material: "melamine-white", edges: { length1: true, length2: false, width1: true, width2: false }, band: 1 });
    const { rows, totals } = cutList(withBands, parts);
    const sides = rows.find((r) => r.names[0] === "Caisson 1 — Côté gauche")!;
    expect(sides.quantity).toBe(2);
    expect([sides.length, sides.width, sides.thickness]).toEqual([720, 557, 18]);
    expect([sides.cutLength, sides.cutWidth]).toEqual([719, 556]);
    // Top, bottom and shelves are the same board: one row of 4.
    const shelves = rows.find((r) => r.names.includes("Caisson 1 — Étagère 1"))!;
    expect(shelves.quantity).toBe(4);
    expect([shelves.cutLength, shelves.cutWidth]).toEqual([564, 557]);
    expect(totals.find((t) => t.material === "Mélaminé blanc")?.parts).toBe(2);
    const csv = cutListCsv(rows);
    expect(csv.split("\r\n")[0]).toContain('"Repère";"Pièce";"Qté";"Longueur (mm)"');
    expect(csv).toContain('"Caisson 1 — Côté gauche, Caisson 1 — Côté droit";2;720;557;18');
    // In centimetres, as chosen in the settings.
    const cm = cutListCsv(rows, "cm");
    expect(cm.split("\r\n")[0]).toContain('"Longueur (cm)"');
    expect(cm).toContain('"Caisson 1 — Côté gauche, Caisson 1 — Côté droit";2;72;55,7;1,8');
  });
});

describe("optimisation de découpe", () => {
  it("toutes les pièces sur des panneaux, sans chevauchement, dans les marges, le fil respecté", () => {
    const { rows } = cutList(doc, parts);
    const { sheets, tooBig } = layoutSheets(rows);
    expect(tooBig).toEqual([]);
    const placed = sheets.flatMap((s) => s.placements);
    expect(placed).toHaveLength(parts.length);
    for (const sheet of sheets) {
      for (const p of sheet.placements) {
        expect(p.x).toBeGreaterThanOrEqual(10);
        expect(p.y).toBeGreaterThanOrEqual(10);
        expect(p.x + p.w).toBeLessThanOrEqual(sheet.size[0] - 10 + 1e-9);
        expect(p.y + p.h).toBeLessThanOrEqual(sheet.size[1] - 10 + 1e-9);
        expect(p.rotated).toBe(false); // grain along the length by default
      }
      for (const a of sheet.placements) for (const b of sheet.placements) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe("rapporteur", () => {
  it("donne l'angle au sommet entre deux côtés", async () => {
    const { angleText } = await import("../../frontend/src/app/measure");
    expect(angleText([0, 0, 0], [10, 0, 0], [0, 5, 0])).toBe("90°");
    expect(angleText([0, 0, 0], [10, 0, 0], [10, 10, 0])).toBe("45°");
    expect(angleText([1, 1, 1], [2, 1, 1], [1 + Math.cos(0.5), 1 + Math.sin(0.5), 1])).toBe("28,6°");
  });
});
