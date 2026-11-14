/** « Contraindre tout » : un rectangle libre (en bleu) figé d'un coup, sans bouger ; le compteur dit « Entièrement contrainte ». */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("un rectangle tracé, puis « Contraindre tout » : l'esquisse est entièrement contrainte", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-contraindre-tout");
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const canvas = page.locator('[data-ref="viewport"] canvas');
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number): [number, number] => [box.x + box.width * x, box.y + box.height * y];
  const dof = page.locator('[data-ref="sketch-dof"]');

  await click(page, '[data-sketch-tool="rectangle"]');
  await page.mouse.click(...at(0.15, 0.2));
  await page.mouse.click(...at(0.3, 0.35));
  await page.keyboard.press("Escape");
  await expect(dof).toHaveAttribute("data-state", "free");
  await shot(page, "contraindre-avant");
  await click(page, '[data-sketch-command="fullydefine"]');
  await expect(dof).toHaveAttribute("data-state", "full");
  await expect(dof).toHaveText("Entièrement contrainte");
  await shot(page, "contraindre-apres");
  // Asked again: nothing left to fix.
  await click(page, '[data-sketch-command="fullydefine"]');
  await expect(page.getByText("déjà entièrement contrainte")).toBeVisible();
  expect(errors).toEqual([]);
});
