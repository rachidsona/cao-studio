/** Les angles du plan de cuisine, angle par angle : angle mort, meuble d'angle à étagère, LeMans, Magic Corner, meuble en L 90 × 90, carrousel. */
import { describe, expect, it } from "vitest";
import { cabinetBox } from "../../frontend/src/document/kitchen-catalog";
import { CORNER_KINDS, cornerSide, cornerSketch, withCorner } from "../../frontend/src/document/kitchen-corners";
import { kitchenPlanIn, madeDoor, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { CORNER_DOOR, KITCHEN_PLAN, isLCorner, kitchenRuns, kitchenSizes, lArm, runGeometry, type CornerKind } from "../../frontend/src/document/kitchen-plan-shapes";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";
import { createReferencePlate, type CadDocument, type KitchenFloorPlan } from "../../frontend/src/document/types";
import { fillRun, newItem } from "../../frontend/src/features/kitchen-run-items";
import { doorSwing } from "../../frontend/src/app/drawer-toggle";
import { poseOf } from "../../frontend/src/features/motion";

const plan = (patch: Partial<KitchenFloorPlan> = {}): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "U", lengthA: 3600, ...patch });
const run = (p: KitchenFloorPlan, id: string) => kitchenRuns(p).find((r) => r.id === id)!;
type Box = [number[], number[]];
const overlaps = (a: Box, b: Box) => [0, 1, 2].every((i) => a[0][i]! < b[1][i]! - 1e-6 && b[0][i]! < a[1][i]! - 1e-6);
const KINDS = Object.keys(CORNER_KINDS) as CornerKind[];

describe("angles de cuisine", () => {
  it("chaque angle a son choix : la place prise sur les deux linéaires en suit", () => {
    const p = plan({ corners: { left: "lemans", right: "l" } });
    const s = kitchenSizes(p);
    // Wall A goes to the walls at both corners (B and C stop against it), unless set otherwise.
    expect(runGeometry(p, run(p, "A")).base).toEqual([s.corner + CORNER_DOOR, 3600 - lArm(p)]);
    expect(runGeometry(p, run(p, "B")).base[1]).toBe(run(p, "B").length - s.corner);
    expect(runGeometry(p, run(p, "C")).base[0]).toBe(lArm(p));
    expect(lArm(plan())).toBe(900);
    // B going through, its corner unit is on it.
    const through = plan({ corners: { left: "unit" }, through: { left: true } });
    expect(runGeometry(through, run(through, "B")).base[1]).toBe(run(through, "B").length - s.corner - CORNER_DOOR);
    expect(runGeometry(through, run(through, "A")).base[0]).toBe(s.corner);
    // The old setting still holds for the corners not chosen.
    expect(runGeometry(plan({ corner: "unit", corners: { right: "dead" } }), run(plan(), "A")).base).toEqual([s.corner + CORNER_DOOR, 3600 - s.corner]);
  });

  it("chaque sorte bâtit son caisson et ses façades, sans que rien ne se chevauche", () => {
    for (const kind of KINDS) {
      const p = plan({ corners: { left: kind, right: kind } });
      const layout = kitchenFromPlan({ ...p, ...proposeKitchen(p) });
      const corner = layout.units.filter((u) => u.name.startsWith("Meuble d'angle"));
      expect(corner.length, kind).toBe(kind === "dead" ? 0 : isLCorner(kind) ? 4 : 2);
      const boxes: Box[] = [...layout.units.map((u) => cabinetBox(u)), ...layout.boxes.filter((b) => b.kind === "filler" || b.kind === "panel").map((b): Box => [b.from, b.to])];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${kind} : ${i} et ${j}`).toBe(false);
      if (isLCorner(kind)) expect(layout.boxes.filter((b) => b.name.startsWith("Porte pliante")).length).toBe(4);
      if (kind === "dead") expect(layout.boxes.filter((b) => b.name.startsWith("Fileur d'angle")).length).toBe(4);
    }
  });

  it("le carrousel a ses deux plateaux tournants dans l'angle, le Magic Corner ses quatre paniers ; tous dans leur caisson", () => {
    const p = plan({ corners: { left: "magic", right: "carousel" } });
    const layout = kitchenFromPlan({ ...p, ...proposeKitchen(p) });
    const fittings = layout.boxes.filter((b) => b.kind === "fitting");
    expect(fittings.filter((b) => b.name.startsWith("Panier Magic Corner")).length).toBe(4);
    expect(fittings.filter((b) => b.name.startsWith("Plateau tournant")).length).toBe(2);
    const units = layout.units.map((u) => cabinetBox(u));
    const within = (b: Box, u: Box) => [0, 1, 2].every((i) => b[0][i]! >= u[0][i]! - 1e-6 && b[1][i]! <= u[1][i]! + 1e-6);
    for (const f of fittings) expect(units.some((u) => within([f.from, f.to], u)), f.name).toBe(true);
    // Baskets low and half way up; the Magic Corner's door as a blind unit's.
    expect(new Set(fittings.filter((b) => b.name.startsWith("Panier")).map((b) => b.from[2])).size).toBe(2);
    expect(layout.boxes.some((b) => b.name.startsWith("Porte d'angle"))).toBe(true);
    expect(cornerSketch("carousel")).toContain("<path");
  });

  it("le LeMans a ses deux plateaux, achetés : hors débit et devis, sur le calque Quincaillerie", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, plan({ corners: { left: "lemans" }, runs: {}, made: {} }));
    const made = withKitchenBuilt(base.doc, base.id, proposeKitchen(kitchenPlanIn(base.doc, base.id)!));
    if (typeof made === "string") throw new Error(made);
    const trays = made.doc.features.filter((f) => f.name.startsWith("Plateau LeMans"));
    expect(trays.length).toBe(2);
    for (const t of trays) expect(made.doc.bodyInfo?.[t.id]?.room).toBe(true);
    const layer = made.doc.bodyInfo?.[trays[0]!.id]?.layer;
    expect((made.doc.layers ?? []).find((l) => l.id === layer)?.name).toBe("Quincaillerie");
    expect(made.doc.features.some((f) => f.type === "cabinet" && f.name === "Meuble d'angle LeMans A" && f.shelves === 0)).toBe(true);
  });

  it("le côté qui s'arrête a un fileur, sauf en L où il a sa moitié de caisson", () => {
    const p = plan({ corners: { left: "unit" } });
    expect(cornerSide(p, run(p, "B"), "right")!.fronts.map((f) => f.kind)).toEqual(["filler"]);
    expect(cornerSide(p, run(p, "A"), "left")!.fronts.map((f) => f.kind)).toEqual(["blind", "door"]);
    const l = plan({ corners: { left: "l" } });
    const D = kitchenSizes(l).cabinet;
    expect(cornerSide(l, run(l, "A"), "left")!.cabinet).toEqual([0, 900]);
    expect(cornerSide(l, run(l, "B"), "right")!.cabinet).toEqual([run(l, "B").length - 900, run(l, "B").length - D]);
    expect(cornerSide(l, run(l, "A"), "right")!.kind).toBe("dead");
    expect(cornerSide(l, run(l, "A"), "right")).not.toBeNull();
    for (const kind of KINDS) expect(cornerSketch(kind)).toMatch(/^<svg/);
  });

  it("le reste contre les murs : chaque meuble d'angle s'écarte du mur, un fileur mural entre les deux", () => {
    const items = [newItem([], "base-bas-2-portes", 1200)];
    const p = plan({ corners: { left: "unit", right: "lemans" }, runs: { A: items }, rest: { A: "walls" } });
    const s = kitchenSizes(p);
    const g = runGeometry(p, run(p, "A"));
    expect(g.movable).toEqual([true, true]);
    const fill = fillRun(g, items, { worktop: p.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop });
    const left = (g.base[1] - g.base[0] - 1200) / 2;
    expect(fill.walls.map((w) => Math.round(w * 10) / 10)).toEqual([left, left].map((w) => Math.round(w * 10) / 10));
    expect([fill.fillers, fill.free]).toEqual([[], []]);
    expect(fill.placed[0]!.at).toBeCloseTo(g.base[0] + left);
    const layout = kitchenFromPlan(p);
    const walls = layout.boxes.filter((b) => b.name.startsWith("Fileur mural"));
    expect(walls.length).toBe(2);
    const corner = layout.units.find((u) => u.name === "Meuble d'angle A")!;
    const unitBox = cabinetBox(corner);
    const first = cabinetBox(layout.units.find((u) => u.item === items[0]!.id)!);
    // The corner unit now ends where the first unit starts.
    expect(Math.max(...[unitBox[0][0], unitBox[1][0]]) === Math.min(...[first[0][0], first[1][0]]) || Math.max(...[unitBox[0][1], unitBox[1][1]]) === Math.min(...[first[0][1], first[1][1]])).toBe(true);
    const boxes: Box[] = [...layout.units.map((u) => cabinetBox(u)), ...layout.boxes.filter((b) => b.kind === "filler" || b.kind === "panel").map((b): Box => [b.from, b.to])];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${i} et ${j}`).toBe(false);
    // With no corner unit going to the wall, nothing moves: the rest goes to the corner ends.
    const dead = plan({ runs: { A: items }, rest: { A: "walls" } });
    expect(runGeometry(dead, run(dead, "A")).movable).toEqual([false, false]);
  });

  it("le meuble d'angle se règle : sa porte, ou le côté de son L ; la rangée suit", () => {
    const p = plan({ corners: { left: "unit", right: "l" }, cornerSizes: { left: { door: 600 }, right: { arm: 1000 } } });
    const s = kitchenSizes(p);
    expect(runGeometry(p, run(p, "A")).base).toEqual([s.corner + 600, 3600 - 1000]);
    expect(runGeometry(p, run(p, "C")).base[0]).toBe(1000);
    const layout = kitchenFromPlan({ ...p, ...proposeKitchen(p) });
    expect(layout.units.find((u) => u.name === "Meuble d'angle A")!.width).toBe(s.corner + 600);
    const door = layout.boxes.find((b) => b.name === "Porte d'angle A")!;
    expect(Math.round(Math.max(door.to[0] - door.from[0], door.to[1] - door.from[1]))).toBe(597);
    const boxes: Box[] = [...layout.units.map((u) => cabinetBox(u)), ...layout.boxes.filter((b) => b.kind === "filler" || b.kind === "panel").map((b): Box => [b.from, b.to])];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${i} et ${j}`).toBe(false);
  });

  it("en haut : un haut d'angle à porte ou en L, réglables ; les hauts des deux murs s'arrêtent contre lui", () => {
    for (const wall of ["unit", "l"] as const) {
      const p = plan({ wallCorners: { left: wall, right: wall }, cornerSizes: { left: { wallDoor: 400, wallArm: 700 } } });
      const g = runGeometry(p, run(p, "A"));
      const W = p.wallDepth;
      expect(g.wall![0]).toBe(wall === "l" ? 700 : W + 19 + 50 + 400);
      expect(runGeometry(p, run(p, "B")).wall![1]).toBe(run(p, "B").length - (wall === "l" ? 700 : W + 19 + 50));
      const layout = kitchenFromPlan({ ...p, ...proposeKitchen(p) });
      const high = layout.units.filter((u) => u.name.startsWith("Haut d'angle"));
      expect(high.length).toBe(wall === "l" ? 4 : 2);
      const s = kitchenSizes(p);
      for (const h of high) expect([h.origin[2], h.height, h.depth]).toEqual([s.wallBottom, s.wallTop - s.wallBottom, W]);
      const boxes: Box[] = [...layout.units.map((u) => cabinetBox(u)), ...layout.boxes.filter((b) => b.kind === "filler" || b.kind === "panel").map((b): Box => [b.from, b.to])];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${wall} : ${i} et ${j}`).toBe(false);
    }
    // Nothing chosen: the wall row as before.
    expect(runGeometry(plan(), run(plan(), "A")).wall![0]).toBe(kitchenSizes(plan()).corner);
  });

  it("un changement d'angle garde les autres réglages de l'angle", () => {
    const a = withCorner({}, "left", { kind: "unit", door: 500 });
    const b = withCorner(a, "left", { wall: "l", wallArm: 650 });
    expect(b).toEqual({ corners: { left: "unit" }, wallCorners: { left: "l" }, cornerSizes: { left: { door: 500, wallArm: 650 } } });
  });

  it("la porte d'un meuble d'angle s'ouvre : sur son bord loin de l'angle, vers l'avant ; en haut aussi", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, plan({ corners: { left: "unit" }, wallCorners: { left: "unit" }, runs: {}, made: {} }));
    const made = withKitchenBuilt(base.doc, base.id, proposeKitchen(kitchenPlanIn(base.doc, base.id)!));
    if (typeof made === "string") throw new Error(made);
    const doors = made.doc.features.filter((f) => f.type === "extrude" && f.door);
    expect(doors.length).toBeGreaterThanOrEqual(2);
    const layout = kitchenFromPlan(kitchenPlanIn(made.doc, base.id)!);
    for (const f of doors) {
      const b = layout.boxes.find((x) => x.name === f.name)!;
      const swing = doorSwing(made.doc, `${f.id}`, [b.from, b.to])!;
      expect(swing, f.name).not.toBeNull();
      expect(swing.axis).toBe(2);
      // Its free edge comes out in front of the door's face.
      const { rotation: r, translation: t } = poseOf({ kind: "hinge", ...swing });
      const free: number[] = [...swing.pivot];
      const h = [0, 1].find((i) => Math.abs((f.type === "extrude" && f.door!.hinge[i]) || 0) > 0.5)!;
      free[h] = free[h] === b.from[h] ? b.to[h]! : b.from[h]!;
      const moved = [0, 1, 2].map((i) => r[i * 3]! * free[0]! + r[i * 3 + 1]! * free[1]! + r[i * 3 + 2]! * free[2]! + t[i]!);
      const out = f.type === "extrude" ? f.door!.out : [0, 0, 0];
      expect((moved[0]! - swing.pivot[0]) * out[0]! + (moved[1]! - swing.pivot[1]) * out[1]!, f.name).toBeGreaterThan(200);
    }
    // A board that is no door does not open.
    const panel = made.doc.features.find((f) => f.type === "extrude" && f.name.startsWith("Panneau d'angle"))!;
    expect(doorSwing(made.doc, panel.id, [[0, 0, 0], [10, 10, 10]])).toBeNull();
  });

  it("une porte d'angle bâtie avant que les portes connaissent leur charnière s'ouvre aussi : le plan la donne", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, plan({ corners: { left: "unit" }, runs: {}, made: {} }));
    const made = withKitchenBuilt(base.doc, base.id, proposeKitchen(kitchenPlanIn(base.doc, base.id)!));
    if (typeof made === "string") throw new Error(made);
    // As an older kitchen has it: the board, no hinge on it.
    const old: CadDocument = { ...made.doc, features: made.doc.features.map((f) => (f.type === "extrude" && f.door ? { ...f, door: undefined } : f)) };
    const door = old.features.find((f) => f.type === "extrude" && f.name.startsWith("Porte d'angle"))!;
    const b = kitchenFromPlan(kitchenPlanIn(old, base.id)!).boxes.find((x) => x.name === door.name)!;
    const now = made.doc.features.find((f) => f.id === door.id)!;
    expect(madeDoor(old, door.id)).toEqual(now.type === "extrude" ? now.door : null);
    expect(doorSwing(old, door.id, [b.from, b.to])).toEqual(doorSwing(made.doc, door.id, [b.from, b.to]));
    expect(madeDoor(old, old.features.find((f) => f.name.startsWith("Panneau d'angle"))!.id)).toBeNull();
  });

  it("la plinthe passe aussi sous l'angle, sans chevaucher l'autre linéaire ni les meubles", () => {
    for (const kind of KINDS) {
      for (const through of [false, true]) {
        const p = plan({ corners: { left: kind, right: kind }, through: { left: through } });
        const layout = kitchenFromPlan({ ...p, ...proposeKitchen(p) });
        const kicks = layout.boxes.filter((b) => b.kind === "kick");
        expect(kicks.filter((b) => b.name.startsWith("Plinthe d'angle")).length, `${kind} ${through}`).toBeGreaterThanOrEqual(2);
        const others: Box[] = [...layout.units.map((u) => cabinetBox(u)), ...layout.boxes.filter((b) => b.kind === "filler" || b.kind === "panel").map((b): Box => [b.from, b.to])];
        for (let i = 0; i < kicks.length; i++) {
          for (let j = i + 1; j < kicks.length; j++) expect(overlaps([kicks[i]!.from, kicks[i]!.to], [kicks[j]!.from, kicks[j]!.to]), `${kind} ${kicks[i]!.name} et ${kicks[j]!.name}`).toBe(false);
          for (const o of others) expect(overlaps([kicks[i]!.from, kicks[i]!.to], o), `${kind} ${kicks[i]!.name}`).toBe(false);
        }
      }
    }
    // No plinth asked: none under the corner either.
    const none = plan({ corners: { left: "unit" }, kick: false });
    expect(kitchenFromPlan({ ...none, ...proposeKitchen(none) }).boxes.some((b) => b.kind === "kick")).toBe(false);
  });
});
