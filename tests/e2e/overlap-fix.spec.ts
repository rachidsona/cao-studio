/** « À vérifier » : un chevauchement corrigé d'un clic dans le Contrôle — une pièce coupée par l'autre. */
import { expect, test } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

test("une assise traversée par le dossier : « Couper » la corrige, il n'y a plus rien à vérifier", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-chevauchement");
  const back = centeredRectangle(1000, 50);
  back.points.forEach((p) => (p.y += 275));
  back.constraints = [];
  const features = [
    { id: "sk1", type: "sketch", name: "Assise", plane: "XY", offset: 0, ...centeredRectangle(1000, 600) },
    { id: "ex1", type: "extrude", name: "Assise", sketch: "sk1", distance: 50, startOffset: 250, operation: "new" },
    { id: "sk2", type: "sketch", name: "Dossier", plane: "XY", offset: 0, ...back },
    { id: "ex2", type: "extrude", name: "Dossier", sketch: "sk2", distance: 750, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Canapé" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const status = page.locator("[data-live-problems]");
  await expect(status).toHaveText("⚠ 1 à vérifier", { timeout: 30_000 });
  await status.click();
  const fix = page.locator("[data-fix-overlap]").first();
  await expect(fix).toBeVisible({ timeout: 30_000 });
  await fix.click();
  await expect(status).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
