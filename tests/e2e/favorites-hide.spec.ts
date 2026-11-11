/** « Mes outils » se cache par son « – » et réapparaît par l'étoile ★ restée à sa place ; c'est retenu. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("ma barre se cache, réapparaît, et reste comme on l'a laissée", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Barre cachée e2e");
  await page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab").nth(1).click();
  const bar = page.locator('[data-favorites^="model"]');
  await expect(bar.getByRole("button", { name: "Répartition" })).toBeVisible();
  await bar.getByRole("button", { name: "Cacher ma barre" }).click();
  await expect(bar.getByRole("button", { name: "Répartition" })).toBeHidden();
  const show = bar.getByRole("button", { name: "Afficher ma barre" });
  await expect(show).toBeVisible();
  // Still hidden after a reload, and in the other tabs.
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(show).toBeVisible();
  await page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab").nth(2).click();
  await expect(show).toBeVisible();
  await show.click();
  await expect(bar.getByRole("button", { name: "Électroménager" })).toBeVisible();
  await expect(show).toBeHidden();
  expect(errors).toEqual([]);
});
