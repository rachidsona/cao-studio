/** Les tarifs gardés par le navigateur en euros passent en dirhams (MAD) une seule fois. */
import { afterEach, describe, expect, it } from "vitest";
import { savedRates } from "../../frontend/src/app/workshop/workshop-documents";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

afterEach(() => store.clear());

describe("tarifs du navigateur en dirhams", () => {
  it("convertit une fois ceux gardés en euros, à 10,8 MAD l'euro, sans toucher aux pourcentages", () => {
    store.set("cao.quote-rates", JSON.stringify({ hourly: 45, band: 1.5, waste: 15, margin: 30, boards: { "Mélaminé blanc": 18 }, hardware: { Poignée: 6 }, tiers: [[1000, 5]] }));
    const once = savedRates();
    expect(once).toMatchObject({ hourly: 486, band: 16.2, waste: 15, margin: 30, boards: { "Mélaminé blanc": 194.4 }, hardware: { Poignée: 64.8 }, tiers: [[10800, 5]] });
    // Kept converted: read again, not converted twice.
    expect(savedRates()).toEqual(once);
    expect(JSON.parse(store.get("cao.quote-rates")!).currency).toBe("MAD");
  });

  it("rien de gardé : rien à convertir", () => {
    expect(savedRates()).toBeNull();
  });
});
