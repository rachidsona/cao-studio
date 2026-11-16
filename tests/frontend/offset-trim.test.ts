/** « Décaler l'arête » : le nouveau trait s'arrête au premier trait existant qu'il croise, de chaque côté de son milieu. */
import { describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { trimToExisting } from "../../frontend/src/sketcher/offset-edge";

/** A rectangle 2230 × 850 from the origin, and a line across it 20 under its top. */
const g = {
  points: [{ id: "a", x: 2230, y: 0 }, { id: "b", x: 2230, y: 850 }, { id: "c", x: 0, y: 850 }, { id: "d", x: 0, y: 830 }, { id: "e", x: 2230, y: 830 }],
  curves: [
    { id: "bottom", kind: "line", p1: "origin", p2: "a" }, { id: "right", kind: "line", p1: "a", p2: "b" },
    { id: "top", kind: "line", p1: "b", p2: "c" }, { id: "left", kind: "line", p1: "c", p2: "origin" },
    { id: "across", kind: "line", p1: "d", p2: "e" }, { id: "guide", kind: "line", p1: "origin", p2: "b", construction: true },
  ],
  constraints: [],
} as unknown as SketchGeometry;

describe("le trait décalé ne dépasse pas les traits existants", () => {
  it("le côté droit décalé de 50 s'arrête au trait en travers, pas au-delà jusqu'au dessus", () => {
    const [line] = trimToExisting([{ kind: "line", a: [2180, 0], b: [2180, 850] }], g, new Set(["right"]));
    expect(line).toEqual({ kind: "line", a: [2180, 0], b: [2180, 830] });
  });

  it("un trait qui ne croise rien reste tel quel ; une ligne de construction ou la source ne l'arrêtent pas", () => {
    const free = { kind: "line" as const, a: [100, 100] as [number, number], b: [100, 700] as [number, number] };
    expect(trimToExisting([free], g, new Set())).toEqual([free]);
    // The construction diagonal crosses it, and does not stop it.
    expect(trimToExisting([{ kind: "line", a: [1000, 10], b: [1000, 800] }], g, new Set())).toEqual([{ kind: "line", a: [1000, 10], b: [1000, 800] }]);
  });

  it("croisé des deux côtés de son milieu : il tient entre les deux", () => {
    const [line] = trimToExisting([{ kind: "line", a: [-100, 400], b: [2400, 400] }], g, new Set());
    expect(line).toEqual({ kind: "line", a: [0, 400], b: [2230, 400] });
  });
});
