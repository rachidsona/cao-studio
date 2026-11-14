/** Snack et comptoir : le plan au dos d'un îlot ou au bout, à hauteur de plan ou en bar, ses consoles, les tabourets. */
import { beforeAll, describe, expect, it } from "vitest";
import { modelHardware } from "../../frontend/src/document/hardware";
import { createReferencePlate, type CadDocument, type TrimFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { SNACK_CONSOLE, snackParts, type Box } from "../../frontend/src/features/snack-parts";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

// An island's worktop: 2 m along X, 90 cm deep, its fronts at its low side (y = 0), its top at 90 cm, 38 thick.
const TOP: Box = [[0, 0, 862], [2000, 900, 900]];

describe("snack et comptoir", () => {
  it("au dos, à hauteur du plan : 30 cm de débord sur toute la longueur, 3 tabourets, des consoles dessous", () => {
    const r = snackParts(TOP, -1, { worktop: "w", side: "back", height: "counter", overhang: 300, length: 0 }, 38);
    const plan = r.parts.find((p) => p.name === "Plan de snack")!;
    expect(plan).toMatchObject({ from: [0, 900, 862], to: [2000, 1200, 900] });
    expect(r.stools).toBe(3);
    expect(r.notes[0]).toBe("3 tabourets de 65 cm d'assise (60 cm chacun), plan à 90 cm.");
    const consoles = r.parts.filter((p) => p.name === SNACK_CONSOLE);
    expect(consoles.length).toBeGreaterThanOrEqual(3);
    expect(consoles.every((c) => c.hardware && c.item === SNACK_CONSOLE && c.to[2] === 862 && c.from[1] >= 900)).toBe(true);
    expect(r.problems).toEqual([]);
  });

  it("en bar : le plan à 105 cm sur une rehausse posée sur le plan ; trop peu de débord, il le dit", () => {
    const r = snackParts(TOP, -1, { worktop: "w", side: "back", height: "bar", overhang: 200, length: 1200 }, 38);
    expect(r.parts.find((p) => p.name === "Plan de bar")).toMatchObject({ from: [400, 862, 1012], to: [1600, 1100, 1050] });
    expect(r.parts.find((p) => p.name === "Rehausse du bar")).toMatchObject({ from: [400, 862, 900], to: [1600, 900, 1012] });
    expect(r.problems).toContain("Moins de 25 cm de débord : pas de place pour les genoux.");
    expect(r.seat).toBe(750);
  });

  it("au bout du plan, et le noyau construit le tout ; les consoles vont au devis", () => {
    const r = snackParts(TOP, -1, { worktop: "w", side: "end", height: "counter", overhang: 300, length: 0 }, 38);
    expect(r.parts.find((p) => p.name === "Plan de snack")).toMatchObject({ from: [2000, 0, 862], to: [2300, 900, 900] });
    expect(r.stools).toBe(1);
    const trim: TrimFeature = { id: "sn1", type: "trim", name: "Snack 1", parts: r.parts, snack: { worktop: "w", side: "end", height: "counter", overhang: 300, length: 0 } };
    const doc: CadDocument = { ...createReferencePlate(), features: [trim] };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    expect(new Recomputer().recompute(doc).statuses.find((s) => s.id === "sn1")?.state).toBe("ok");
    expect(modelHardware(doc).find((h) => h.name === SNACK_CONSOLE)?.quantity).toBe(r.parts.filter((p) => p.hardware).length);
  });
});
