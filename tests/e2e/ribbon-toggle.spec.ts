/** Le ruban et la barre des étapes, cachés d'office, remis par la case du menu ⋯ ; le haut du panneau Répartition reste en vue. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("ruban et étapes cachés d'office, remis par le menu ⋯ ; le choix est gardé", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Ruban e2e");
  // As a person who never chose: the columns of tools there, nothing chosen for the ribbon.
  await page.evaluate(() => {
    localStorage.removeItem("cao.ribbon-shown");
    localStorage.removeItem("cao.tool-columns-off");
  });
  await page.reload();
  const ribbon = page.locator('[data-ribbon="model"]');
  await expect(page.locator("#editor")).toHaveAttribute("data-ribbon", "off");
  await expect(ribbon).toBeHidden();
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await expect(page.locator("[data-steps]")).toBeHidden();
  // Back from the menu ⋯ : both shown, and kept.
  await page.getByLabel("Fichier et réglages").click();
  await page.locator('[data-ref="ribbon-shown"]').check();
  await expect(ribbon).toBeVisible();
  await page.reload();
  await expect(page.locator("#editor")).toHaveAttribute("data-ribbon", "on");
  await expect(page.locator('[data-ribbon="model"]')).toBeVisible();
  expect(errors).toEqual([]);
});
