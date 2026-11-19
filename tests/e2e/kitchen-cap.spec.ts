/** La casquette des meubles hauts du Plan de cuisine dans un vrai navigateur : choisie, bâtie par le noyau, dessinée sur la bande. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("plan de cuisine : une casquette en caisson sur les meubles hauts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-casquette");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.locator("[data-plan-cap]").selectOption("box");
  await expect(tool.getByLabel(/^Hauteur de la casquette/)).toHaveValue(/^8|^80/);
  await expect(tool.getByLabel(/^Débord de la casquette/)).toBeVisible();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  // Its top, the band in front, built by the kernel; drawn on the run's strip as the finishing sides.
  await expect(page.locator('[title="Casquette A — OK"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[title="Bandeau de casquette A — OK"]').first()).toBeAttached();
  await tool.locator('[data-open-run="A"]').click();
  // On the strip: the top and the band in front of each piece, and its ends at the free ends.
  await expect(tool.locator('[data-run-strip="A"] [data-finish="cap"]').first()).toBeAttached();
  expect(errors).toEqual([]);
});
