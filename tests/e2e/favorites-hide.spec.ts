/** « Mes outils » se cache tout entière par son « – » (rien ne reste dans la vue) et réapparaît quand on y ajoute un outil ; c'est retenu. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("ma barre se cache sans rien laisser, reste cachée, et réapparaît quand on y ajoute un outil", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Barre cachée e2e");
  await page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab").nth(1).click();
  const bar = page.locator('[data-favorites^="model"]');
  await expect(bar.getByRole("button", { name: "Répartition" })).toBeVisible();
  await bar.getByRole("button", { name: "Cacher ma barre" }).click();
  // Nothing left in the view, no star either.
  await expect(bar).toBeHidden();
  // Still hidden after a reload, and in the other tabs.
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(bar).toBeHidden();
  await page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab").nth(0).click();
  await expect(bar).toBeHidden();
  // A tool starred in a group's menu: the bar is back, with it.
  await page.locator('[data-ribbon="model"] .ribbon-group[aria-label="Modifier"] .ribbon-caption-menu').click();
  await page.locator(".ribbon-menu").getByRole("button", { name: /^Ajouter à Mes outils/ }).first().click();
  await page.keyboard.press("Escape");
  await expect(bar).toBeVisible();
  await expect(bar.locator("[data-favorite-tool]")).toHaveCount(1);
  expect(errors).toEqual([]);
});
