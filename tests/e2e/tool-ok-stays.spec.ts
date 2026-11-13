/** « OK » garde l'opération et l'outil reste pour la suivante ; seul « Terminer » le ferme. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("Caisson : OK garde le caisson, l'outil reste pour le suivant ; Terminer ferme sans rien ajouter", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-ok-reste");
  const cabinets = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as { type: string; width?: number }[]).filter((f) => f.type === "cabinet").map((f) => f.width);
  };
  const tool = page.getByRole("dialog", { name: "Caisson" });
  const ok = tool.getByRole("button", { name: "OK", exact: true });
  const done = tool.getByRole("button", { name: "Terminer", exact: true });

  await click(page, '[data-action="cabinet"]');
  await tool.getByRole("combobox", { name: "Modèle" }).selectOption("base");
  await tool.getByRole("combobox", { name: "Portes" }).selectOption("none");
  await page.waitForTimeout(900);
  // OK: the cabinet is kept and the tool is still there, with the next one proposed — not kept yet.
  await ok.click();
  await expect(tool).toBeVisible();
  await expect(done).toBeVisible();
  await page.waitForTimeout(1200);
  await page.locator("canvas.cad-view").focus().catch(() => {});
  expect(await cabinets()).toEqual([600]);

  // The next one set (800 mm wide; the project counts in cm), then OK again: a second cabinet, its own undo step.
  const width = tool.getByRole("textbox", { name: /^Largeur/ });
  await width.fill("80");
  await width.press("Tab");
  await page.waitForTimeout(900);
  await ok.click();
  await expect(tool).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await cabinets()).toEqual([600, 800]);

  // « Terminer » closes the tool: the cabinet it was proposing is not made.
  await done.click();
  await expect(tool).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await cabinets()).toEqual([600, 800]);
  // One undo takes the second cabinet back, alone.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);
  expect(await cabinets()).toEqual([600]);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
