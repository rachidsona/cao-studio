/** Une zone ou un trait d'esquisse choisi dans la vue : son esquisse est éclairée dans le Navigateur, et amenée à la vue. */
import { expect, test, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("une zone d'esquisse choisie dans la vue éclaire son esquisse dans le Navigateur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-navigateur-esquisse");
  // One sketch alone, a rectangle 400 × 300, nothing else in the model.
  const features = [{ id: "sk7", type: "sketch", name: "Tracé seul", plane: "XY", offset: 0, ...centeredRectangle(400, 300) }];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Tracé" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  const row = page.locator('[data-ref="tree"] [data-select="sketch:sk7"]');
  await expect(row).toHaveAttribute("aria-pressed", "false");
  // A click inside the rectangle, in the view: its area picked, its sketch lit in the list.
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await expect(page.locator('[data-ref="status-selection"]')).toContainText("esquisse");
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(row).toBeInViewport();
  expect(errors).toEqual([]);
});
