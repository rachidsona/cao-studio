/** Magie extrusion : un rectangle tracé sur un corps puis poussé dedans (hauteur négative) le creuse ; tiré, il ajoute. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("Magie extrusion : un rectangle sur la plaque, poussé de 0,5 cm, la creuse ; tiré, il ajoute", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-magie-creuser");
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const at = (fx: number, fy: number): [number, number] => [view.x + view.width * fx, view.y + view.height * fy];

  await click(page, '[data-action="face-strip"]');
  const magic = page.getByRole("dialog", { name: "Magie extrusion" });
  await magic.getByRole("combobox", { name: "Tracé" }).selectOption("rectangle");
  await magic.getByRole("checkbox", { name: "Puis tirer / pousser" }).check();
  // On the top of the plate, away from the hole through its centre.
  for (const [fx, fy] of [[0.26, 0.34], [0.34, 0.42]] as const) {
    await page.mouse.move(...at(fx, fy));
    await page.mouse.move(at(fx, fy)[0] + 1, at(fx, fy)[1]);
    await page.mouse.click(at(fx, fy)[0] + 1, at(fx, fy)[1]);
  }
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/magie-creuser-trace.png` });
  const extrude = page.getByRole("dialog", { name: /Extrusion/ }).last();
  const operation = extrude.getByRole("combobox", { name: "Opération" });
  await expect(operation).toHaveValue("join");
  // Pushed in: it digs.
  await extrude.locator("[data-extrude-distance]").fill("-0,5");
  await expect(operation).toHaveValue("cut");
  // Pulled out again: it adds.
  await extrude.locator("[data-extrude-distance]").fill("0,5");
  await expect(operation).toHaveValue("join");
  await extrude.locator("[data-extrude-distance]").fill("-0,5");
  await extrude.locator("[data-extrude-distance]").press("Enter");
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const made = (project.document.features as { type: string; sketch?: string; operation?: string; distance?: number; target?: string }[]).filter((f) => f.type === "extrude").at(-1)!;
  expect(made).toMatchObject({ operation: "cut", distance: -5, target: "h1" });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/magie-creuser.png` });
  expect(errors).toEqual([]);
});
