/** Les esquisses cachées d'un clic sur l'œil de leur titre : une esquisse tracée ensuite arrive cachée aussi. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("esquisses toutes cachées par l'œil : la nouvelle, tracée sur la grille, est cachée aussi", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-esquisses-cachees");
  const sketches = async () => {
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as { type: string; hidden?: boolean }[]).filter((f) => f.type === "sketch");
  };
  await page.locator('[data-hide-sketches="hide"]').click();
  expect((await sketches()).every((s) => s.hidden)).toBe(true);
  const before = (await sketches()).length;
  // A rectangle on the grid, seen from above (Magie extrusion, not pulled).
  await click(page, '[data-action="view"][data-view="top"]');
  await page.waitForTimeout(1200);
  const view = await page.evaluate(() => {
    const r = document.querySelector("canvas.cad-view")!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await click(page, '[data-action="face-strip"]');
  const tool = page.getByRole("dialog", { name: "Magie extrusion" });
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("rectangle");
  await tool.getByRole("checkbox", { name: "Puis tirer / pousser" }).uncheck();
  const [x0, y0] = [view.x + view.w * 0.15, view.y + view.h * 0.2];
  await page.mouse.move(x0, y0);
  await page.mouse.move(x0 + 1, y0);
  await page.mouse.click(x0 + 1, y0);
  await page.mouse.move(x0 + 120, y0 + 80);
  await page.mouse.click(x0 + 120, y0 + 80);
  const after = await sketches();
  expect(after).toHaveLength(before + 1);
  expect(after.every((s) => s.hidden)).toBe(true);
  await expect(page.locator('[data-hide-sketches="show"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
