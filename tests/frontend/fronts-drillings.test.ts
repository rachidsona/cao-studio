/**
 * Les perçages des façades comptés pour le devis (audit d'architecture du 11/11/2026) : boîtiers de charnière et trous
 * de poignée, par le même calcul que celui qui les perce dans le noyau.
 */
import { describe, expect, it } from "vitest";
import { frontsHoleCount } from "../../frontend/src/features/fronts-drillings";
import type { CabinetFeature, FrontsFeature } from "../../frontend/src/document/types";

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Caisson", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true, ...over });

describe("perçages des façades", () => {
  it("une porte : ses boîtiers de charnière et sa paire de trous de poignée", () => {
    const n = frontsHoleCount(fronts(), cabinet);
    // Two hinges on a door of this height, two handle holes.
    expect(n).toBe(4);
  });

  it("sans charnières ni poignées : aucun perçage", () => {
    expect(frontsHoleCount(fronts({ hinges: false, handles: false }), cabinet)).toBe(0);
  });

  it("trois façades de tiroir : une paire de trous de poignée chacune, pas de charnière", () => {
    expect(frontsHoleCount(fronts({ layout: "drawers", drawers: 3 }), cabinet)).toBe(6);
  });
});
