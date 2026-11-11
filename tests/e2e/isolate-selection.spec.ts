/** « Isoler la sélection » : plusieurs éléments choisis restent seuls dans la vue, pour y travailler. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("deux caissons choisis, isolés par le bouton, puis tout montré ; la touche I et le clic droit aussi", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-isoler-selection");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (let i = 0; i < 3; i++) await plan.locator('[data-add="base-bas-2-portes-1000"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "isoler-avant");

  // Nothing selected: the button says what to do.
  const bar = page.locator("[data-zone-isolated]");
  await click(page, "[data-isolate-selection]");
  await expect(page.getByText(/Sélectionnez d'abord les éléments à isoler/).first()).toBeVisible();
  await expect(bar).toHaveCount(0);

  // The first unit, then the second with Maj: the two alone in the view.
  await page.mouse.click(430, 660);
  await page.keyboard.down("Shift");
  await page.mouse.click(600, 660);
  await page.keyboard.up("Shift");
  await click(page, "[data-isolate-selection]");
  await expect(bar).toContainText("2 éléments isolés");
  await expect(page.locator("[data-isolate-selection]")).toHaveAttribute("aria-pressed", "true");
  const shown = Number(await bar.getAttribute("data-shown"));
  expect(shown).toBeGreaterThan(8);
  if (process.env.SHOTS) await page.waitForTimeout(7000);
  await shot(page, "isoler-deux");

  // The key I with nothing selected: all back.
  await page.keyboard.press("Escape");
  await page.keyboard.press("i");
  await expect(bar).toHaveCount(0);
  await expect(page.locator("[data-isolate-selection]")).toHaveAttribute("aria-pressed", "false");

  // One unit, by the right click: it alone, fewer bodies than the two.
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await page.mouse.click(430, 660);
  await page.mouse.click(430, 660, { button: "right" });
  await page.getByRole("menuitem", { name: "Isoler la sélection" }).click();
  await expect(bar).toContainText(/« Bas 2 portes 1000 \(A1\) » isolé/);
  expect(Number(await bar.getAttribute("data-shown"))).toBeLessThan(shown);
  await bar.getByRole("button", { name: "Tout montrer" }).click();
  await expect(bar).toHaveCount(0);
  expect(errors).toEqual([]);
});
