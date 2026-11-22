/** Extrusion de faces, « Direction » : un axe qui longe la face est refusé ; « Comme une autre face » prend la face cliquée. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("Extrusion de faces : direction selon un axe, ou comme une autre face cliquée", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-direction-faces");
  await expect(page.locator('[data-ref="status-recompute"]')).toContainText("Recalcul", { timeout: 60_000 });
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  const middle = [box.x + box.width * 0.5, box.y + box.height * 0.5] as const;
  // The top of the plate (its normal +Z).
  await click(page, '[data-select-filter="face"]');
  await page.mouse.click(...middle);
  await click(page, '[data-action="extrude"]');
  const pull = page.getByRole("dialog", { name: "Extrusion de faces" });
  const way = pull.getByRole("combobox", { name: "Direction" });
  // Along X: it runs along the top, refused.
  await way.selectOption("x");
  await expect(pull).toContainText("longe la face");
  // As another face: the next click gives it (the top itself here: straight up).
  await way.selectOption("face");
  await expect(pull).toContainText("Cliquez la face qui donne la direction");
  await page.mouse.click(...middle);
  await expect(pull).not.toContainText("Cliquez la face qui donne la direction");
  await pull.getByRole("textbox", { name: "Distance" }).fill("5");
  await page.waitForTimeout(1500);
  await pull.getByRole("button", { name: "OK", exact: true }).click();
  await pull.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
  const made = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; faces?: unknown[]; direction?: number[] }[] } }).document.features.filter((f) => f.type === "extrude" && f.faces), api);
  expect(made.at(-1)?.direction).toEqual([0, 0, 1]);
  expect(errors).toEqual([]);
});
