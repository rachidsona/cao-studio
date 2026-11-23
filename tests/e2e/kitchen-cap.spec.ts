/** La casquette des meubles hauts du Plan de cuisine dans un vrai navigateur : choisie, bâtie par le noyau, dessinée sur la bande. */
import { expect, test } from "@playwright/test";
import { newProject, openCard } from "./helpers";

test("plan de cuisine : une casquette en caisson sur les meubles hauts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-casquette");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await openCard(tool, "Matières et finitions");
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

test("plan de cuisine : la casquette en caissons à porte relevante, un caisson sur chaque meuble haut", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-casquette-caissons");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await openCard(tool, "Matières et finitions");
  await tool.locator("[data-plan-cap]").selectOption("units");
  // Their height only: each as wide and deep as the unit under it.
  await expect(tool.getByLabel(/^Hauteur des caissons/)).toHaveValue(/^35/);
  await expect(tool.getByLabel(/^Débord de la casquette/)).toHaveCount(0);
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  await expect(page.locator('[title^="Casquette"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[title^="Bandeau de casquette"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Meubles de cuisine, avec un Plan de cuisine : la casquette se pose sur le meuble haut, pas à côté dans le linéaire", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-test-casquette-catalogue");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-units"]')?.click());
  await page.getByRole("tablist", { name: "Familles de meubles" }).getByRole("tab", { name: "Hauts" }).click();
  await page.locator('[data-unit="wall-haut-1-porte-600"]').click();
  await expect(page.getByText("Haut 1 porte 600 (A1)").first()).toBeVisible({ timeout: 60_000 });
  // The casquettes in their own tab, beside « Hauts » (no longer among them).
  await expect(page.locator('[data-unit="wall-casquette-relevante-600"]')).toHaveCount(0);
  await page.getByRole("tablist", { name: "Familles de meubles" }).getByRole("tab", { name: "Casquettes" }).click();
  await page.locator('[data-unit="wall-casquette-relevante-600"]').click();
  await expect(page.getByText(/Casquette relevante 600 ajouté/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  type Cab = { type: string; name: string; origin: number[]; height: number };
  const cabinets = (project.document.features as Cab[]).filter((f) => f.type === "cabinet");
  const unit = cabinets.find((c) => c.name === "Haut 1 porte 600 (A1)")!;
  const cap = cabinets.find((c) => c.name.startsWith("Casquette relevante 600"))!;
  expect(cap.origin).toEqual([unit.origin[0], unit.origin[1], unit.origin[2]! + unit.height]);
  expect(errors).toEqual([]);
});

test("dans un linéaire du Plan de cuisine, choisir une casquette met la casquette du plan en caissons", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-casquette-lineaire");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.getByRole("tab", { name: "Casquettes" }).click();
  await tool.locator('[data-add="wall-casquette-sur-colonne-400"]').click();
  await expect(page.getByText(/Casquette en caissons à porte relevante/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/ne tient pas sur ce linéaire/)).toHaveCount(0);
  await expect(page.locator('[title^="Casquette"]').first()).toBeAttached({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
