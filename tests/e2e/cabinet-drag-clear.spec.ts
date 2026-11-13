/** Un caisson déplacé par sa poignée « ✥ Déplacer » ne se pose jamais dans un autre : il est remis à côté, au ras. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("un caisson amené dans son voisin est posé à côté de lui ; Alt le laisse où on le pose", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-caisson-a-cote");
  // Two cabinets 600 wide side by side, no doors.
  for (let i = 0; i < 2; i++) {
    await click(page, '[data-action="cabinet"]');
    const tool = page.getByRole("dialog", { name: "Caisson" });
    await tool.getByRole("combobox", { name: "Modèle" }).selectOption("base");
    await tool.getByRole("combobox", { name: "Portes" }).selectOption("none");
    await page.waitForTimeout(800);
    await tool.getByRole("button", { name: "Terminer", exact: true }).click();
    await expect(tool).toHaveCount(0);
  }
  const origins = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as { type: string; origin?: number[] }[]).filter((f) => f.type === "cabinet").map((f) => Math.round(f.origin![0]!));
  };
  const [first, second] = await origins();
  expect(second! - first!).toBe(600);

  // Seen from above, the second one chosen: its bar, and the grip that slides it along its width.
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await page.locator('[data-head^="group:"]').filter({ hasText: "Caisson 2" }).first().click();
  const grip = page.getByRole("toolbar", { name: "Caisson sélectionné" }).getByLabel("Déplacer le caisson");
  await expect(grip).toBeVisible();
  const slide = async (dx: number, alt = false) => {
    const box = (await grip.boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 12 });
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
    await page.waitForTimeout(900);
    return (await origins())[1]!;
  };

  // To the right, the floor is free: it goes where it is brought.
  const away = await slide(160);
  expect(away).toBeGreaterThan(second! + 100);
  const perPixel = (away - second!) / 160;
  // Back to the left, 150 mm into its neighbour: put beside it, flush.
  expect(await slide(-Math.round((away - second! + 150) / perPixel))).toBe(second);
  // Pushed again into it from there: it stays beside it.
  expect(await slide(-Math.round(200 / perPixel))).toBe(second);
  // Alt: no stop — it is left where it is put, in its neighbour.
  const forced = await slide(-Math.round(200 / perPixel), true);
  expect(forced).toBeLessThan(second! - 100);
  expect(errors).toEqual([]);
});
