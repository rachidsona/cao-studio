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
  await tool.locator("[data-run-ok]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/largeur-libre.png` });
  expect(errors).toEqual([]);
});
