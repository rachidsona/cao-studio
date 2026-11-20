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

test("la barre d'une niche : ses outils retirés d'un clic droit et remis par son « + », la niche gardée", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-barre-niche");
  // A wall of a dressing plan, seen from the front (as the joinery tests make it), a niche clicked.
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="dressing-plan"]')?.click());
  const plan = page.getByRole("dialog", { name: "Plan de dressing" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button", { name: /^(Modifier|Répartition)$/ }).click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(800);
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5);
  const bar = page.locator("[data-context-bar]");
  await expect(bar).toContainText("Niche");
  const shelves = bar.locator('[data-context-tool="niche:shelves"]');
  await expect(shelves).toBeVisible();
  await shelves.click({ button: "right" });
  await expect(shelves).toHaveCount(0);
  await bar.locator('[data-context-add="niche"]').click();
  await page.getByRole("dialog", { name: /Barre « Niche »/ }).locator('[data-tool-pick="niche:shelves"]').click();
  await page.keyboard.press("Escape");
  // Back at the end of the bar; it opens Étagères on this niche.
  await expect(bar.locator("[data-context-tool]").last()).toHaveAttribute("data-context-tool", "niche:shelves");
  await bar.locator('[data-context-tool="niche:shelves"]').click();
  await expect(page.getByRole("dialog", { name: "Étagères" })).toBeVisible();
  expect(errors).toEqual([]);
});
