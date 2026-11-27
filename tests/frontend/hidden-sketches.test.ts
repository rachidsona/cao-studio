/** Esquisses toutes cachées par l'œil de leur titre : une nouvelle arrive cachée aussi ; une remontrée, plus. */
import { describe, expect, it } from "vitest";
import { withNewSketchesHidden } from "../../frontend/src/document/hidden-sketches";
import { createReferencePlate, type CadDocument, type Feature } from "../../frontend/src/document/types";

const sketch = (id: string, hidden?: boolean): Feature => ({ id, type: "sketch", name: id, plane: "XY", offset: 0, points: [], curves: [], constraints: [], ...(hidden ? { hidden } : {}) }) as Feature;
const doc = (...features: Feature[]): CadDocument => ({ ...createReferencePlate(), features });
const hidden = (d: CadDocument) => d.features.map((f) => [f.id, !!(f as { hidden?: boolean }).hidden]);

describe("esquisses cachées d'un coup", () => {
  it("toutes cachées : la nouvelle l'est aussi, les autres ne changent pas", () => {
    const before = doc(sketch("a", true), sketch("b", true));
    expect(hidden(withNewSketchesHidden(before, doc(sketch("a", true), sketch("b", true), sketch("c"))))).toEqual([["a", true], ["b", true], ["c", true]]);
  });

  it("une seule montrée, ou aucune esquisse avant : la nouvelle se montre", () => {
    const next = doc(sketch("a"), sketch("b", true), sketch("c"));
    expect(withNewSketchesHidden(doc(sketch("a"), sketch("b", true)), next)).toBe(next);
    const first = doc(sketch("c"));
    expect(withNewSketchesHidden(doc(), first)).toBe(first);
  });

  it("une esquisse déjà là, remontrée à la main, reste montrée", () => {
    const next = doc(sketch("a"), sketch("b", true));
    expect(withNewSketchesHidden(doc(sketch("a", true), sketch("b", true)), next)).toBe(next);
  });
});
