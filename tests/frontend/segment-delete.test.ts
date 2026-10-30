/** Suppr on a crossed line removes only the piece clicked (as in Shapr3D); otherwise the whole element goes. */
import { describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { pointPos, type Vec2 } from "../../frontend/src/sketcher/edit";
import { clickedPiece, deleteWithPieces } from "../../frontend/src/sketcher/segment-delete";

/** A cabinet front: the outline, a top rail line at 2362 and an upright line at 506 running through it. */
function front(): SketchGeometry {
  const pts: [string, number, number][] = [
    ["a", 0, 0], ["b", 1500, 0], ["c", 1500, 2380], ["d", 0, 2380],
    ["e", 0, 2362], ["f", 1500, 2362], ["g", 506, 0], ["h", 506, 2380],
  ];
  return {
    points: pts.map(([id, x, y]) => ({ id, x, y })),
    curves: [
      { id: "l1", kind: "line", p1: "a", p2: "b" },
      { id: "l2", kind: "line", p1: "b", p2: "c" },
      { id: "l3", kind: "line", p1: "c", p2: "d" },
      { id: "l4", kind: "line", p1: "d", p2: "a" },
      { id: "rail", kind: "line", p1: "e", p2: "f" },
      { id: "up", kind: "line", p1: "g", p2: "h" },
    ],
    constraints: [],
  };
}

const ends = (g: SketchGeometry, id: string): number[] => {
  const c = g.curves.find((x) => x.id === id);
  return c?.kind === "line" ? [pointPos(g, c.p1)[1], pointPos(g, c.p2)[1]].sort((x, y) => x - y) : [];
};

describe("supprimer le morceau cliqué d'un trait", () => {
  it("enlève le bout du montant qui dépasse dans la traverse, et garde le reste", () => {
    const g = front();
    const clicked = new Map<string, Vec2>([["up", [506, 2371]]]);
    expect(clickedPiece(g, new Set(["up"]), clicked)?.preview.lines).toEqual([[[506, 2362], [506, 2380]]]);
    const { geometry, pieces } = deleteWithPieces(g, ["up"], clicked);
    expect(pieces).toBe(1);
    const upright = geometry.curves.filter((c) => c.kind === "line" && pointPos(geometry, c.p1)[0] === 506);
    expect(upright).toHaveLength(1);
    expect(ends(geometry, upright[0]!.id)).toEqual([0, 2362]);
    expect(geometry.curves).toHaveLength(6);
  });

  it("un trait choisi sans clic (fenêtre, forme) ou que rien ne croise part entier", () => {
    const g = front();
    expect(deleteWithPieces(g, ["up"], new Map()).geometry.curves.some((c) => c.id === "up")).toBe(false);
    // The upright crosses the rail too: only the clicked part of the rail (506 → 1500) goes.
    const top = deleteWithPieces(g, ["rail"], new Map([["rail", [1000, 2362] as Vec2]]));
    expect(top.pieces).toBe(1);
    const rail = top.geometry.curves.find((c) => c.id === "rail");
    expect(rail?.kind === "line" && [pointPos(top.geometry, rail.p1)[0], pointPos(top.geometry, rail.p2)[0]].sort((x, y) => x - y)).toEqual([0, 506]);
  });

  it("rien n'est montré quand plusieurs éléments sont choisis", () => {
    expect(clickedPiece(front(), new Set(["up", "rail"]), new Map([["up", [506, 2371] as Vec2]]))).toBeNull();
  });
});
