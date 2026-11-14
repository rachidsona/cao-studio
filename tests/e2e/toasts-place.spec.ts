/** Les messages de l'éditeur s'affichent en bas à droite, en petit, jamais par-dessus la vue, sans gêner les clics. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("un message s'affiche en bas à droite, en petit, hors de la vue, et laisse passer les clics", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-messages");
  // Saved by hand: « Aucune modification à enregistrer. » or the version saved.
  await page.keyboard.press("Control+s");
  const message = page.locator("[data-toast]").first();
  await expect(message).toBeVisible();
  await expect(message).toHaveCSS("font-size", "11px");
  await expect(message).toHaveCSS("pointer-events", "none");
  const box = (await message.boundingBox())!;
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  // Low on the page, at the right, not over the view.
  expect(box.y).toBeGreaterThan(900 * 0.75);
  expect(box.x + box.width).toBeGreaterThan(1400 - 40);
  expect(box.x >= view.x + view.width || box.y >= view.y + view.height).toBe(true);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/messages-en-bas.png` });
});
