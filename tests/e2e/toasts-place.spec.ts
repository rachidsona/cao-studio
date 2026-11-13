/** Les messages de l'éditeur s'affichent en bas de la colonne de gauche, en petit, jamais par-dessus la vue. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("un message s'affiche en bas à gauche, en petit, hors de la vue", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-messages");
  // Saved by hand: « Aucune modification à enregistrer. » or the version saved.
  await page.keyboard.press("Control+s");
  const message = page.locator("[data-toast]").first();
  await expect(message).toBeVisible();
  await expect(message).toHaveCSS("font-size", "11px");
  const box = (await message.boundingBox())!;
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const tree = (await page.locator('[data-ref="panel-tree"]').boundingBox())!;
  // Low on the page, at the left, in the left column, not over the view.
  expect(box.y).toBeGreaterThan(900 * 0.75);
  expect(box.x).toBeLessThan(40);
  expect(box.x + box.width).toBeLessThanOrEqual(tree.x + tree.width + 1);
  expect(box.x + box.width <= view.x || box.y >= view.y + view.height).toBe(true);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/messages-en-bas.png` });
});
