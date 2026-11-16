/** « Sélectionner les esquisses » : le bouton de la colonne Vue prend toutes les esquisses montrées, et pas les corps. */
import { expect, test, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("deux esquisses et un corps : le bouton prend les deux esquisses seules", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-selection-esquisses");
  const sketch = (id: string, offset: number) => ({ id, type: "sketch", name: `Esquisse ${id}`, plane: "XY", offset, ...centeredRectangle(600, 400) });
  const features = [sketch("sk1", 0), sketch("sk2", 900), { id: "ex1", type: "extrude", name: "Plaque", sketch: "sk1", distance: 18, operation: "new" }];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Deux esquisses" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator("[data-select-sketches]")).toBeVisible();
  await click(page, "[data-select-sketches]");
  await expect(page.locator('[data-ref="status-selection"]')).toHaveText(/^2 esquisses sélectionné/);
  await expect(page.getByText("2 esquisses sélectionnées. Échap vide la sélection.").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-ref="status-selection"]')).toHaveText("Aucune sélection");
  expect(errors).toEqual([]);
});
