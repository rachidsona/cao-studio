/** Une largeur à soi en ajoutant un meuble au linéaire : tapée (« Autre… »), ou celle de la place qui reste. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: import("@playwright/test").Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("ajouter un meuble à une largeur tapée, puis un autre à la largeur de la place libre", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-largeur-libre");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();

  // « Autre… » on « Bas 1 porte »: a width typed in the unit shown.
  await tool.locator('[data-width-other="base-bas-1-porte-600"]').click();
  const input = tool.locator('[data-width-input="base-bas-1-porte-600"]');
  const unit = await input.getAttribute("placeholder");
  await input.fill("5");
  await input.press("Enter");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill(unit === "cm" ? "28,6" : unit === "m" ? "0,286" : "286");
  await input.press("Enter");
  await expect(tool.locator('[data-fold="chosen"]')).toContainText(/Bas 1 porte · 28,6 cm|286 mm/);

  // « Place libre » on « Bas 2 portes »: as wide as a unit may be (240 cm), then the rest (91,4 cm): the run full, low.
  const room = tool.locator('[data-width-room^="base-bas-2-portes"]');
  await expect(room).toContainText(/240|2400/);
  await room.click();
  await expect(room).toContainText(/91,4|914/);
  await room.click();
  await expect(tool.locator('[data-fold="space"]')).toContainText("le bas est plein");
  await expect(room).toHaveCount(0);
  // Appliances keep their widths only.
  await tool.getByRole("tab", { name: "Électro." }).click();
  await expect(tool.locator("[data-width-other]")).toHaveCount(0);
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/largeur-libre.png` });
  expect(errors).toEqual([]);
});

test("un meuble qui ne tient pas est refusé, avec la place qui reste ; rien ne reste caché dans le linéaire", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-meuble-sans-place");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  // 360 cm: three units of 100, then a fourth that has only 60 left.
  for (let i = 0; i < 3; i++) await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await expect(tool.locator('[data-fold="space"]')).toContainText("60 cm libres en bas");
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await expect(page.getByText(/« Bas 2 portes » de 100 cm ne tient pas sur ce linéaire : il reste 60 cm au plus en bas/).first()).toBeVisible();
  // Not put on the run unseen: the room left is the same, nothing to look at again.
  await expect(tool.locator('[data-fold="space"]')).toContainText("60 cm libres en bas");
  await expect(tool.locator('[data-fold="checks"]')).toHaveCount(0);
  await expect(tool.locator('[data-width-room^="base-bas-2-portes"]')).toContainText("60");

  // A unit made too wide for the room: it no longer stands, « À revoir » says so and takes it off.
  const chosen = tool.locator('[data-fold="chosen"]');
  if ((await chosen.getAttribute("aria-expanded")) !== "true") await chosen.click();
  await tool.locator('[data-size="width"]').fill("200");
  await tool.locator('[data-size="width"]').press("Enter");
  const checks = tool.locator('[data-fold="checks"]');
  await expect(checks).toContainText("À revoir");
  if ((await checks.getAttribute("aria-expanded")) !== "true") await checks.click();
  await expect(tool.getByText(/Bas 2 portes · 200 cm : sans place, pas bâti/)).toBeVisible();
  await tool.locator("[data-missing-remove]").click();
  await expect(tool.locator("[data-missing-remove]")).toHaveCount(0);
  await expect(tool.locator('[data-fold="space"]')).toContainText("160 cm libres en bas");
  expect(errors).toEqual([]);
});
