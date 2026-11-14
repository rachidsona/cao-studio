/** « Plan fixe » : le plan en haut du panneau de la Répartition et du linéaire de cuisine reste fixe, ou défile ; le choix vaut pour les deux. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const position = (locator: Locator) => locator.evaluate((e) => getComputedStyle(e).position);
const unfold = async (scope: Locator, key: string) => {
  const head = scope.locator(`[data-fold="${key}"]`);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
};

test("le plan de la Répartition puis celui du linéaire : fixe au départ, libre une fois décoché, et le choix suit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-plan-fixe");
  await click(page, '[data-action="partition"]');
  const partition = page.getByRole("dialog", { name: "Répartition" });
  const top = partition.locator('[data-ref="partition-top"]');
  await expect(top).toBeVisible();
  // Fixed as it comes: it stays at the top while the settings scroll.
  await expect(partition.getByRole("checkbox", { name: "Plan fixe" })).toBeChecked();
  expect(await position(top)).toBe("sticky");
  await partition.getByRole("checkbox", { name: "Plan fixe" }).uncheck();
  await expect(partition.getByRole("checkbox", { name: "Plan fixe" })).not.toBeChecked();
  expect(await position(partition.locator('[data-ref="partition-top"]'))).toBe("relative");
  await page.keyboard.press("Escape");

  // The kitchen's run: the same choice, kept.
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  const fixed = tool.locator("[data-run-fixed]");
  await expect(fixed.getByRole("checkbox", { name: "Plan fixe" })).not.toBeChecked();
  expect(await position(fixed)).toBe("relative");
  await fixed.getByRole("checkbox", { name: "Plan fixe" }).check();
  await expect(tool.locator("[data-run-fixed]").getByRole("checkbox", { name: "Plan fixe" })).toBeChecked();
  expect(await position(tool.locator("[data-run-fixed]"))).toBe("sticky");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/plan-fixe-cuisine.png` });
  expect(errors).toEqual([]);
});
