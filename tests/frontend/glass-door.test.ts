/**
 * Portes vitrées : un cadre en profilé alu qui pivote comme une porte, un verre trempé de 4 mm au milieu de son
 * épaisseur qui pivote avec elle ; ni l'un ni l'autre au débit, le verre au m² et le profilé au mètre au devis (MAD).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { doorSwing, doorWithHandle } from "../../frontend/src/app/drawer-toggle";
import { bodyAppearance } from "../../frontend/src/appearance/assign";
import { doorOf, withDoorStyle } from "../../frontend/src/document/door-edit";
import { glassDoorLook } from "../../frontend/src/document/glass-look";
import { isHardwareBody, modelHardware } from "../../frontend/src/document/hardware";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { DEFAULT_RATES, makeQuote } from "../../frontend/src/document/quote";
import { emptySketchGeometry, type DoorSettings, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { frontsHardware, frontsParts, frontsProblem } from "../../frontend/src/features/fronts-parts";
import { ALU_HINGE, glassItem, profileItem } from "../../frontend/src/features/glass-door";
import { nicheGeometry, nicheHardware, nicheParts, nicheProblem } from "../../frontend/src/features/niche-parts";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
const GLASS: DoorSettings = { gap: 3, thickness: 22, handles: true, style: "glass", frameWidth: 20, glass: "smoked", profile: "black" };

/** A Répartition of two cases with its doors, as the sketch keeps them. */
function partition(settings: DoorSettings): CadDocument {
  const record = partitionRecord("of1", "R", INPUT, [0, 0], 400);
  const step = record.step!.kind === "partition" ? { ...record.step!, doors: settings } : record.step!;
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "E", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base = createReferencePlate();
  return syncPartitionDoors({ ...base, features: [...base.features, sketch] }, "sk9");
}
const doorsIn = (doc: CadDocument) => doc.features.find((f): f is NicheFeature => f.type === "niche")!;
const sketchIn = (doc: CadDocument) => doc.features.find((f): f is SketchFeature => f.id === "sk9")!;
function partsOf(doc: CadDocument) {
  const n = nicheGeometry(doorsIn(doc), sketchIn(doc));
  if (typeof n === "string") throw new Error(n);
  return { n, parts: nicheParts(doorsIn(doc), n) };
}
const size = (p: { from: number[]; to: number[] }) => p.to.map((v, i) => Math.abs(v - p.from[i]!));

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Haut vitré", origin: [0, 0, 0], width: 800, height: 720, depth: 350, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "doors", drawers: 3, mount: "overlay", gap: 3, thickness: 20, hinges: true, handles: false, style: "glass", glass: "frosted", profile: "brushed", ...over });
const kitchen = (f: FrontsFeature): CadDocument => ({ ...createReferencePlate(), features: [cabinet, f] });

describe("portes vitrées d'une Répartition", () => {
  it("chaque porte est un cadre alu, son verre de 4 mm au milieu de l'épaisseur vient après les poignées", () => {
    const { n, parts } = partsOf(partition(GLASS));
    expect(parts.map((p) => p.name)).toEqual(["Porte 1", "Porte 2", "Poignée porte 1", "Poignée porte 2", "Vitre porte 1", "Vitre porte 2"]);
    const [door, , , , pane] = parts;
    expect(pane).toMatchObject({ kind: "box", role: "hardware", of: 0 });
    const [w, h] = size(door!);
    // In the groove of the profile: 5 mm into a 20 mm frame on every side.
    expect(size(pane!)).toEqual([w! - 30, h! - 30, 4]);
    expect((pane!.from[2] + pane!.to[2]) / 2).toBeCloseTo(n.depth + 11, 6);
    // The handle on the frame, 10 mm from the edge opposite the hinges.
    expect(parts[2]!.from[0]).toBeCloseTo(door!.to[0] - 10, 6);
  });

  it("le verre et le cadre sortent de la liste de débit et vont au devis, au m² et au mètre", () => {
    const doc = partition(GLASS);
    const f = doorsIn(doc);
    expect([0, 1, 2, 3, 4, 5].map((i) => isHardwareBody(doc, `${f.id}#${i}`))).toEqual([true, true, true, true, true, true]);
    expect(isHardwareBody(partition({ ...GLASS, style: "flat" }), `${f.id}#0`)).toBe(false);
    const { parts } = partsOf(doc);
    const doors = parts.filter((p) => p.role === "front").map(size);
    const area = doors.reduce((s, [w, h]) => s + (w! - 30) * (h! - 30), 0) / 1e6;
    const metres = doors.reduce((s, [w, h]) => s + 2 * (w! + h!), 0) / 1000;
    const hardware = nicheHardware(doc.features, f);
    expect(hardware).toContainEqual({ name: glassItem("smoked"), quantity: Math.round(area * 100) / 100, unit: "m²" });
    expect(hardware).toContainEqual({ name: profileItem("black"), quantity: Math.round(metres * 100) / 100, unit: "m" });
    // Two doors 2 m high: four hinges each.
    expect(hardware[0]).toMatchObject({ name: ALU_HINGE, quantity: 8 });
    // Priced in dirhams, by the square metre and by the metre.
    const quote = makeQuote([], DEFAULT_RATES, modelHardware(doc));
    const glass = quote.lines.find((l) => l.label === glassItem("smoked"))!;
    expect(glass).toMatchObject({ unit: "m²", unitPrice: DEFAULT_RATES.hardware[glassItem("smoked")] });
    expect(glass.unitPrice).toBeGreaterThan(100);
    expect(quote.lines.find((l) => l.label === profileItem("black"))).toMatchObject({ unit: "m" });
  });

  it("le verre pivote avec sa porte, et prend l'apparence du verre choisi ; le cadre, l'aluminium", () => {
    const doc = partition(GLASS);
    const id = doorsIn(doc).id;
    expect(doorSwing(doc, `${id}#4`)).toEqual(doorSwing(doc, `${id}#0`));
    expect(doorWithHandle(doc, `${id}#4`)).toEqual([`${id}#0`, `${id}#2`, `${id}#4`]);
    expect(doorOf(doc, `${id}#5`)).toMatchObject({ index: 1 });
    expect(glassDoorLook(doc, `${id}#4`)).toBe("glass-smoked");
    expect(glassDoorLook(doc, `${id}#0`)).toBe("aluminium-black");
    expect(glassDoorLook(doc, `${id}#2`)).toBeUndefined();
    expect(bodyAppearance(doc, `${id}#4`, undefined)?.appearance.id).toBe("glass-smoked");
    // An appearance given by hand wins.
    expect(bodyAppearance({ ...doc, bodyInfo: { [`${id}#4`]: { appearance: "glass-bronze" } } }, `${id}#4`, undefined)?.appearance.id).toBe("glass-bronze");
  });

  it("refuse un cadre trop étroit pour tenir le verre, trop large, ou une porte trop mince", () => {
    const { n } = partsOf(partition(GLASS));
    const f = doorsIn(partition(GLASS));
    expect(nicheProblem(f, n)).toBeNull();
    expect(nicheProblem({ ...f, frameWidth: 6 }, n)).toContain("au moins 10 mm");
    expect(nicheProblem({ ...f, frameWidth: 400 }, n)).toContain("trop large");
    expect(nicheProblem({ ...f, thickness: 6 }, n)).toContain("épaisseur");
  });

  it("passe d'un style à l'autre par le menu : le cadre alu fait 20 mm, le verre clair et l'alu brossé par défaut", () => {
    const doc = partition({ gap: 3, thickness: 22, handles: false });
    const glazed = withDoorStyle(doc, `${doorsIn(doc).id}#0`, "glass");
    if (typeof glazed === "string") throw new Error(glazed);
    expect(doorsIn(glazed)).toMatchObject({ style: "glass", frameWidth: 20, glass: "clear", profile: "brushed" });
    const framed = withDoorStyle(glazed, `${doorsIn(glazed).id}#0`, "frame");
    if (typeof framed === "string") throw new Error(framed);
    expect(doorsIn(framed)).toMatchObject({ style: "frame", frameWidth: 70, frameDepth: 6 });
  });
});

describe("portes vitrées d'un caisson de cuisine", () => {
  it("deux portes vitrées : leurs verres après elles, au milieu de l'épaisseur, hors débit", () => {
    const parts = frontsParts(fronts(), cabinet);
    expect(parts.map((p) => p.name)).toEqual(["Porte gauche", "Porte droite", "Vitre porte gauche", "Vitre porte droite"]);
    const [left, , pane] = parts;
    expect(pane!.of).toBe(0);
    expect(size(pane!)).toEqual([size(left!)[0]! - 30, 4, size(left!)[2]! - 30]);
    expect((pane!.from[1] + pane!.to[1]) / 2).toBeCloseTo(-10, 6);
    const doc = kitchen(fronts());
    expect([0, 1, 2, 3].map((i) => isHardwareBody(doc, `fr1#${i}`))).toEqual([true, true, true, true]);
    expect(isHardwareBody(kitchen(fronts({ style: "flat" })), "fr1#0")).toBe(false);
    expect(doorWithHandle(doc, "fr1#3")).toEqual(["fr1#1", "fr1#3"]);
    expect(doorSwing(doc, "fr1#2")).toEqual(doorSwing(doc, "fr1#0"));
    expect(glassDoorLook(doc, "fr1#2")).toBe("glass-frosted");
    expect(glassDoorLook(doc, "fr1#1")).toBe("aluminium-brushed");
  });

  it("charnières pour cadre alu, verre au m², profilé au mètre ; un cadre trop large refusé", () => {
    const hardware = frontsHardware(fronts(), cabinet);
    expect(hardware[0]).toEqual({ name: ALU_HINGE, quantity: 4 });
    expect(hardware.find((h) => h.name === glassItem("frosted"))?.unit).toBe("m²");
    expect(hardware.find((h) => h.name === profileItem("brushed"))?.unit).toBe("m");
    expect(frontsProblem(fronts({ frameWidth: 190 }), cabinet)).toContain("trop large");
    expect(frontsProblem(fronts({ layout: "drawers", frameWidth: 190 }), cabinet)).toBeNull();
  });

  it("des portes en verre noir : le verre au devis à son prix, son apparence de la bibliothèque", () => {
    const black = fronts({ glass: "black", profile: "black" });
    const doc = kitchen(black);
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    expect(frontsHardware(black, cabinet).find((h) => h.name === glassItem("black"))?.unit).toBe("m²");
    expect(glassItem("black")).toBe("Verre trempé 4 mm noir (m²)");
    expect(DEFAULT_RATES.hardware[glassItem("black")]).toBeGreaterThan(0);
    expect(glassDoorLook(doc, "fr1#2")).toBe("glass-black");
    expect(bodyAppearance(doc, "fr1#2", undefined)?.appearance.name).toBe("Verre noir");
    expect(glassDoorLook(doc, "fr1#0")).toBe("aluminium-black");
  });

  it("une porte pleine devient vitrée, puis pleine, par le menu", () => {
    const glazed = withDoorStyle(kitchen(fronts({ style: undefined, glass: undefined, profile: undefined })), "fr1#0", "glass");
    if (typeof glazed === "string") throw new Error(glazed);
    expect(glazed.features[1]).toMatchObject({ style: "glass", frameWidth: 20, glass: "clear", profile: "brushed" });
    const plain = withDoorStyle(glazed, "fr1#2", "flat");
    if (typeof plain === "string") throw new Error(plain);
    expect((plain.features[1] as FrontsFeature).style).toBe("flat");
    expect(typeof withDoorStyle(glazed, "fr1#0", "frame")).toBe("string");
  });
});

describe("validation des portes vitrées", () => {
  const roundTrip = (doc: CadDocument) => parseDocument(JSON.parse(JSON.stringify(doc)));

  it("accepte les portes vitrées et les anciens documents sans style", () => {
    expect(() => roundTrip(partition(GLASS))).not.toThrow();
    expect(() => roundTrip(kitchen(fronts()))).not.toThrow();
    expect(() => roundTrip(partition({ gap: 3, thickness: 19, handles: true }))).not.toThrow();
    expect(() => roundTrip(kitchen(fronts({ style: undefined, glass: undefined, profile: undefined })))).not.toThrow();
  });

  it("refuse un verre, un cadre ou un style inconnus, une largeur de cadre invalide", () => {
    const niche = (over: Record<string, unknown>) => {
      const doc = partition(GLASS);
      return { ...doc, features: doc.features.map((f) => (f.type === "niche" ? { ...f, ...over } : f)) } as CadDocument;
    };
    expect(() => roundTrip(niche({ glass: "rose" }))).toThrow(/verre inconnu/);
    expect(() => roundTrip(niche({ profile: "or" }))).toThrow(/cadre alu inconnue/);
    expect(() => roundTrip(niche({ style: "vitrail" }))).toThrow(/style de porte inconnu/);
    expect(() => roundTrip(niche({ frameWidth: -2 }))).toThrow(/frameWidth/);
    expect(() => roundTrip(kitchen(fronts({ style: "frame" as unknown as "glass" })))).toThrow(/style de porte inconnu/);
    expect(() => roundTrip(kitchen(fronts({ glass: "rose" as unknown as "clear" })))).toThrow(/verre inconnu/);
  });
});

describe("portes vitrées dans le noyau", () => {
  beforeAll(setupKernel, 120_000);

  it("le cadre est ouvert sur le verre et rainuré pour lui ; le verre est un corps à part", () => {
    const doc = kitchen(fronts({ layout: "door" }));
    const r = new Recomputer();
    const { statuses, bodies } = r.recompute(doc);
    expect(statuses.find((s) => s.id === "fr1")?.state).toBe("ok");
    expect(bodies).toEqual(expect.arrayContaining(["fr1#0", "fr1#1"]));
    const out = r.output("fr1");
    if (out?.kind !== "solids") throw new Error("pas de solides");
    const [w, t, h] = size(frontsParts(fronts({ layout: "door" }), cabinet)[0]!);
    const opening = (w! - 40) * (h! - 40);
    const groove = ((w! - 30) * (h! - 30) - opening) * 4;
    expect(bodyMetrics(out.shapes[0]!).volume).toBeCloseTo(w! * t! * h! - opening * t! - groove, -1);
    expect(bodyMetrics(out.shapes[1]!).volume).toBeCloseTo((w! - 30) * (h! - 30) * 4, -1);
  }, 60_000);

  it("une Répartition aux portes vitrées se construit, le verre dans la rainure de chaque cadre", () => {
    const doc = partition({ ...GLASS, handles: false });
    const r = new Recomputer();
    const { statuses } = r.recompute(doc);
    expect(statuses.find((s) => s.id === doorsIn(doc).id)?.state).toBe("ok");
    const out = r.output(doorsIn(doc).id);
    expect(out?.kind === "solids" ? out.shapes.length : 0).toBe(4);
  }, 60_000);
});
