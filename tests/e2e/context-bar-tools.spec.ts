/** La barre contextuelle : ses outils se choisissent pour chaque sorte d'élément, son « + », un clic droit, « Par défaut ». */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("la barre d'une pièce : un outil ajouté par son « + », retiré d'un clic droit, gardé, puis remis par défaut", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-barre-contextuelle");
  await page.locator('[data-select^="body:"]').first().click();
  const bar = page.locator("[data-context-bar]");
  await expect(bar).toContainText("Pièce");
  const icons = bar.locator("[data-context-tool]");
  const before = await icons.count();
  expect(before).toBeGreaterThan(0);
  // « + »: the list of every tool; Extrusion added at the end of this bar.
  await bar.locator('[data-context-add="piece"]').click();
  const picker = page.getByRole("dialog", { name: /Barre « Pièce »/ });
  await picker.getByRole("searchbox").fill("extrusion");
  await picker.locator('[data-tool-pick="data-action:extrude"]').click();
  await expect(bar.locator('[data-context-tool="data-action:extrude"]')).toBeVisible();
  await page.keyboard.press("Escape");
  // A right-click takes out the first one; kept after a reload.
  const first = await icons.first().getAttribute("data-context-tool");
  await icons.first().click({ button: "right" });
  await expect(bar.locator(`[data-context-tool="${first}"]`)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.locator('[data-select^="body:"]').first().click();
  await expect(bar.locator('[data-context-tool="data-action:extrude"]')).toBeVisible();
  await expect(bar.locator(`[data-context-tool="${first}"]`)).toHaveCount(0);
  // « Par défaut »: the tools proposed again.
  await bar.locator('[data-context-reset="piece"]').click();
  await expect(icons).toHaveCount(before);
  await expect(bar.locator('[data-context-tool="data-action:extrude"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
