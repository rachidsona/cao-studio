/** « Corps » dans l'esquisse : les corps cachés, les esquisses seules ; ils reviennent en quittant l'esquisse. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("dans l'esquisse, « Corps » cache les corps puis les remet ; le choix est retenu", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-esquisse-seule");
  await expect(page.locator('[data-ref="status-recompute"]')).toContainText("Recalcul", { timeout: 60_000 });
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const canvas = page.locator('[data-ref="viewport"] canvas').first();
  const toggle = page.locator("[data-sketch-bodies]");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  const withBodies = await canvas.screenshot();
  await click(page, "[data-sketch-bodies]");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(600);
  const alone = await canvas.screenshot();
  expect(alone.equals(withBodies)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("cao.sketch-bodies"))).toBe("hidden");
  // Back again.
  await click(page, "[data-sketch-bodies]");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  expect((await canvas.screenshot()).equals(alone)).toBe(false);
  // The points shown: round dots.
  await click(page, '[data-sketch-command="points"]');
  await page.waitForTimeout(400);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/esquisse-points-ronds.png` });
  await click(page, '[data-sketch-command="points"]');
  // Hidden, then the sketch left: the bodies are back in the model.
  await click(page, "[data-sketch-bodies]");
  await page.keyboard.press("Escape");
  await click(page, '[data-sketch-command="finish"]');
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");
  await expect(page.getByLabel(/^Navigateur : corps/).locator("li").first()).toBeVisible();
  expect(await page.evaluate(() => [...document.querySelectorAll("canvas")].length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
