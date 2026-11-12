/** Le rendu à la demande (audit d'architecture du 11/11/2026) : la vue dessine pendant et juste après un changement. */
import { describe, expect, it } from "vitest";
import { Redraw, wakeOnInput } from "../../frontend/src/viewport/redraw";

describe("rendu à la demande", () => {
  it("dessine à chaque image après un changement, puis seulement quatre fois par seconde au repos", () => {
    let now = 1000;
    const redraw = new Redraw(() => now);
    expect(redraw.due).toBe(true); // the first image
    now = 1010;
    expect(redraw.due).toBe(false);
    redraw.invalidate();
    now = 2999;
    expect(redraw.due).toBe(true);
    now = 3016;
    expect(redraw.due).toBe(false);
    now = 3249;
    expect(redraw.due).toBe(true); // 250 ms after the last image drawn
  });

  it("un délai plus court ne raccourcit pas un délai déjà donné", () => {
    let now = 0;
    const redraw = new Redraw(() => now);
    redraw.invalidate(3000);
    redraw.invalidate(100);
    now = 2500;
    expect(redraw.due).toBe(true);
    now = 2516;
    expect(redraw.due).toBe(true);
  });

  it("un geste sur la page réveille le dessin", () => {
    let now = 0;
    const redraw = new Redraw(() => now);
    const target = new EventTarget();
    wakeOnInput(target, redraw);
    target.dispatchEvent(new Event("pointermove"));
    now = 1000;
    expect(redraw.due).toBe(true);
  });
});
