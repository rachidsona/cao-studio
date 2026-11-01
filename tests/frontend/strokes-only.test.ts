/** Extruder une esquisse faite de lignes seules : elle passe à Panneaux (chaque ligne devient une planche). */
import { describe, expect, it } from "vitest";
import { centeredRectangle, emptySketchGeometry } from "../../frontend/src/document/sketch";
import { strokesOnly } from "../../frontend/src/sketcher/loops";

const line = () => {
  const g = emptySketchGeometry();
  g.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 800, y: 0 });
  g.curves.push({ id: "l1", kind: "line", p1: "a", p2: "b" });
  return g;
};

describe("esquisse de lignes seules", () => {
  it("une ligne, ou deux en L, n'ont aucune aire fermée : ce sont des traits", () => {
    expect(strokesOnly(line())).toBe(true);
    const l = line();
    l.points.push({ id: "c", x: 800, y: 600 });
    l.curves.push({ id: "l2", kind: "line", p1: "b", p2: "c" });
    expect(strokesOnly(l)).toBe(true);
  });

  it("un rectangle se pousse-tire ; une esquisse vide ou de traits de construction n'est pas un trait", () => {
    expect(strokesOnly(centeredRectangle(800, 600))).toBe(false);
    expect(strokesOnly(emptySketchGeometry())).toBe(false);
    const c = line();
    c.curves[0]!.construction = true;
    expect(strokesOnly(c)).toBe(false);
  });
});
