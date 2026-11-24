/** Plan de cuisine, « Fileurs » : tous les fileurs du linéaire, ceux du plan compris, leur hauteur, épaisseur et matière réglées. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("le fileur d'angle : sa hauteur, son épaisseur et sa matière changées depuis « Fileurs », gardées par le plan", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-fileurs-donnees");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  // A unit on the wall: the kitchen is built, its corner filler with it.
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await plan.locator('[data-add="base-bas-2-portes-800"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.locator('[data-open-run="A"]').click();
  const fold = plan.locator('[data-fold="fillers"]');
  if ((await fold.getAttribute("aria-expanded")) !== "true") await fold.click();
  const name = "Fileur d'angle A";
  const row = plan.locator(`[data-filler-data="${name}"]`);
  await expect(row).toContainText("ép. 1,9 cm");
  await row.locator(`[data-filler-height="${name}"]`).fill("60");
  await row.locator(`[data-filler-height="${name}"]`).press("Enter");
  await expect(plan.locator(`[data-filler-data="${name}"]`)).toContainText("H 60 cm", { timeout: 30_000 });
  await plan.locator(`[data-filler-thickness="${name}"]`).fill("2,5");
  await plan.locator(`[data-filler-thickness="${name}"]`).press("Enter");
  await expect(plan.locator(`[data-filler-data="${name}"]`)).toContainText("ép. 2,5 cm", { timeout: 30_000 });
  await plan.locator(`[data-filler-material="${name}"]`).selectOption("mdf");
  await expect(plan.locator(`[data-filler-data="${name}"]`).locator(`[data-filler-material="${name}"]`)).toHaveValue("mdf", { timeout: 30_000 });
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  type Doc = { features: { id: string; name: string; kitchenPlan?: { fillerLook?: Record<string, unknown> } }[]; bodyInfo?: Record<string, { material?: string }> };
  const doc = (await page.evaluate(async (url) => (await (await fetch(url, { headers: { Accept: "application/json" } })).json()).document, api)) as Doc;
  expect(doc.features.find((f) => f.kitchenPlan)!.kitchenPlan!.fillerLook?.[name]).toEqual({ height: 600, thickness: 25, material: "mdf" });
  const filler = doc.features.find((f) => f.name === name)!;
  expect(doc.bodyInfo?.[filler.id]?.material).toBe("mdf");
  expect(errors).toEqual([]);
});
