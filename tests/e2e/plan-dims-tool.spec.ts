/** Les cotes d'une Répartition se changent d'un clic, avec un calcul, même pendant qu'un outil y travaille (Étagères). */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("pendant Étagères : un clic sur la cote totale, « 180 + 20 », et la Répartition passe à 200 cm, l'outil restant ouvert", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-cotes-outil");
  // A Répartition of 3 cases, 180 × 250, placed by a click in the view.
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="partition"]')?.click());
  const view = page.locator("canvas.cad-view");
  const box = (await view.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(800);
  // Étagères opened on it, from the bar of a niche.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator("[data-context-bar]").getByRole("button", { name: "Étagères" }).click();
  const tool = page.getByRole("dialog", { name: "Étagères" });
  await expect(tool).toBeVisible();
  const total = page.locator('.cad-plan-dim[data-level="total"][data-editable]').filter({ hasText: /^180$/ }).first();
  await total.click();
  await page.locator("[data-dim-editor]").fill("180 + 20");
  await page.keyboard.press("Enter");
  await expect(page.locator('.cad-plan-dim[data-level="total"]').filter({ hasText: /^200$/ }).first()).toBeVisible({ timeout: 15_000 });
  await expect(tool).toBeVisible();
  expect(errors).toEqual([]);
});
