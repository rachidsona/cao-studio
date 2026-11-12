/** « Ma bibliothèque » : un module inséré se colle contre la face d'un meuble choisie avant, en une seule annulation. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const canvas = (page: Page) => page.locator("canvas.cad-view");

test("un caisson de la bibliothèque se colle contre la face choisie, et une annulation le reprend", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-bibliotheque-collage");
  // A cabinet in the middle of the view.
  await click(page, '[data-action="cabinet"]');
  await page.waitForTimeout(600);
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const close = page.getByRole("button", { name: "Fermer", exact: true }).first();
  if (await close.isVisible()) await close.click();
  await page.waitForTimeout(1200);
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(800);
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // Kept in the library, from a face of it.
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('[data-ref="status-selection"]')).not.toContainText("Aucune");
  await click(page, "[data-library]");
  const library = page.getByRole("dialog", { name: /bibliothèque/i });
  const name = `Caisson collé ${Date.now()}`;
  await library.getByLabel("Nom du module").fill(name);
  await library.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(library).toContainText(`« ${name} » est dans la bibliothèque`);

  // Its front face still chosen, then « Insérer »: glued against it, in front, one undo step with the insertion.
  await expect(page.locator('[data-ref="status-selection"]')).not.toContainText("Aucune");
  const price = page.locator("[data-live-price]");
  await expect(price).toContainText("MAD");
  const before = await price.textContent();
  const row = library.locator("li, div").filter({ hasText: name }).last();
  await row.getByRole("button", { name: "Insérer" }).click();
  await expect(page.getByText(`« ${name} » inséré contre la face choisie`)).toBeVisible({ timeout: 30_000 });
  await expect(price).not.toHaveText(before!, { timeout: 15_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bibliotheque-collage.png` });
  await click(page, '[data-action="undo"]');
  await expect(price).toHaveText(before!, { timeout: 15_000 });
  expect(errors).toEqual([]);
});
