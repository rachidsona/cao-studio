/** Flèche des étagères : formule de la poutre sur deux appuis, fluage, épaisseur qui suffit, portée maximale. */
import { describe, expect, it } from "vitest";
import { isHorizontalBoard, sag, shelfCheck } from "../../frontend/src/features/shelf-sag";

describe("flèche des étagères", () => {
  it("suit 5·q·L⁴ / (384·E·I), et le fluage l'agrandit", () => {
    // 800 × 300 × 18 particleboard, 25 kg per metre: about 3.6 mm at once, ×3.25 in the long run.
    const s = sag(800, 300, 18, "melamine-white", 25);
    expect(s.instant).toBeCloseTo(3.585, 2);
    expect(s.longTerm).toBeCloseTo(s.instant * 3.25, 6);
    // Twice the span: 16 times the sag; twice the thickness: an eighth.
    expect(sag(1600, 300, 18, "melamine-white", 25).instant / s.instant).toBeCloseTo(16, 6);
    expect(sag(800, 300, 36, "melamine-white", 25).instant / s.instant).toBeCloseTo(1 / 8, 6);
    // Solid oak is stiffer and creeps less.
    expect(sag(800, 300, 18, "solid-oak", 25).longTerm).toBeLessThan(s.longTerm / 5);
  });

  it("juge une étagère, propose l'épaisseur qui suffit et la portée la plus longue", () => {
    const shelf: [[number, number, number], [number, number, number]] = [[0, 0, 400], [800, 300, 418]];
    expect(isHorizontalBoard(shelf)).toBe(true);
    expect(isHorizontalBoard([[0, 0, 0], [18, 300, 800]])).toBe(false);
    const books = shelfCheck(shelf, "melamine-white", 25, 200);
    expect(books.ok).toBe(false);
    expect(books.span).toBe(800);
    expect(books.thicknessNeeded).toBe(30);
    // At the longest span that holds, the sag is just the limit.
    const at = sag(books.maxSpan, 300, 18, "melamine-white", 25).longTerm;
    expect(at).toBeCloseTo(books.maxSpan / 200, 6);
    // Light objects on a short oak shelf: fine.
    expect(shelfCheck([[0, 0, 0], [500, 250, 22]], "solid-oak", 5).ok).toBe(true);
  });
});
