/** Règles des fabricants de quincaillerie : cuvette et épaisseur de porte, largeur de porte, entraxe de poignée, charge des coulisses. */
import { describe, expect, it } from "vitest";
import { chosenHardware, HANDLE_MODELS, HINGE_MODELS, SLIDE_MODELS } from "../../frontend/src/document/hardware-catalog";
import { CONTENT_LOAD, drawerLoad, frontFacts, makerProblems, projectMakerProblems, type FrontFacts } from "../../frontend/src/document/maker-rules";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";

const base: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 0, plinth: 100, construction: "sides-through" };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true, ...over });
const docOf = (f: FrontsFeature, cabinet = base, hardware?: CadDocument["hardware"]): CadDocument => ({ ...createReferencePlate(), features: [cabinet, f], ...(hardware ? { hardware } : {}) });
const door = (over: Partial<FrontFacts> = {}): FrontFacts => ({ id: "d#0", name: "Porte", kind: "door", width: 500, height: 700, thickness: 19, cupHinges: true, swingsUp: false, handleRun: 700, ...over });
const choice = (hinge = "generic", slide = "generic", handle = "generic") => chosenHardware({ hardware: { hinge, slide, handle } });

describe("règles des fabricants de quincaillerie", () => {
  it("lit les portes et les tiroirs d'un caisson avec leurs cotes", () => {
    const [d] = frontFacts(docOf(fronts()));
    expect(d).toMatchObject({ kind: "door", thickness: 19, cupHinges: true, swingsUp: false });
    expect(d!.handleRun).toBe(d!.height);
    const drawers = frontFacts(docOf(fronts({ layout: "drawers" })));
    expect(drawers).toHaveLength(3);
    for (const f of drawers) {
      expect(f.kind).toBe("drawer");
      expect(f.handleRun).toBe(f.width);
      expect(f.drawer!.mass).toBeGreaterThan(1);
      // The bottom of a drawer of a 600 × 560 unit: about 0,2 to 0,3 m².
      expect(f.drawer!.bottom).toBeGreaterThan(0.15);
      expect(f.drawer!.bottom).toBeLessThan(0.3);
    }
  });

  it("refuse une porte trop fine pour la cuvette, et propose l'épaisseur qu'il faut", () => {
    const deep = HINGE_MODELS.find((m) => m.cup.depth === 13)!;
    const [p] = makerProblems([door({ thickness: 15 })], { ...choice(), hinge: deep });
    expect(p).toMatchObject({ kind: "maker", severity: "error" });
    expect(p!.message).toContain("16 mm au moins");
    expect(makerProblems([door({ thickness: 16 })], { ...choice(), hinge: deep })).toEqual([]);
    // The small cup: a 15 mm door takes it; a glazed door has its own hinges.
    expect(makerProblems([door({ thickness: 15 })], choice("small-26"))).toEqual([]);
    expect(makerProblems([door({ thickness: 15, cupHinges: false })], choice())).toEqual([]);
  });

  it("signale une porte battante trop large, pas une porte relevable", () => {
    expect(makerProblems([door({ width: 700 })], choice())[0]!.message).toMatch(/700 mm de large.*deux portes/);
    expect(makerProblems([door({ width: 900, swingsUp: true, handleRun: 900 })], choice())).toEqual([]);
  });

  it("signale une poignée trop longue pour sa façade", () => {
    const drawer = door({ kind: "drawer", cupHinges: false, width: 300, height: 140, handleRun: 300 });
    expect(makerProblems([drawer], choice("generic", "generic", "bar-320"))[0]!.message).toMatch(/entraxe 320 mm.*256 mm au plus/);
    expect(makerProblems([drawer], choice("generic", "generic", "bar-192"))).toEqual([]);
    expect(makerProblems([{ ...drawer, handleRun: 100 }], choice("generic", "generic", "knob"))).toEqual([]);
  });

  it("compare le tiroir plein à la charge des coulisses et en propose de plus fortes", () => {
    const heavy = door({ kind: "drawer", cupHinges: false, width: 900, height: 250, handleRun: 900, drawer: { mass: 9, bottom: 0.4 } });
    expect(drawerLoad(heavy.drawer!)).toBe(9 + 0.4 * CONTENT_LOAD);
    const weak = SLIDE_MODELS.find((m) => m.load === 30)!;
    const [p] = makerProblems([heavy], { ...choice(), slide: weak });
    expect(p!.message).toMatch(/environ 33 kg.*coulisses de 30 kg/);
    expect(p!.message).toContain("(40 kg)");
    expect(makerProblems([heavy], choice("generic", "blum-movento"))).toEqual([]);
  });

  it("vérifie le projet avec la quincaillerie qu'il a choisie", () => {
    const thin = docOf(fronts({ thickness: 14 }));
    expect(projectMakerProblems(thin).some((p) => p.severity === "error")).toBe(true);
    expect(projectMakerProblems(docOf(fronts()))).toEqual([]);
    expect(projectMakerProblems(docOf(fronts({ layout: "drawers" }), base, { handle: HANDLE_MODELS.find((m) => m.spacing === 320)!.id })).length).toBe(0);
  });
});
