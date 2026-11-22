/** Magie extrusion : une face tirée jusqu'à la face d'un autre corps y va et la suit (« jusqu'à », gardé). */
import { expect, test, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("une face tirée sur la face d'un autre corps va jusqu'à elle et la suit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-magie-jusqua");
  // A block on the floor at the left, another higher at the right.
  const at = (x: number) => {
    const r = centeredRectangle(300, 300);
    r.points.forEach((p) => (p.x += x));
    r.constraints = [];
    return r;
  };
  const features = [
    { id: "sk1", type: "sketch", name: "Bas", plane: "XY", offset: 0, ...at(-300) },
    { id: "ex1", type: "extrude", name: "Bloc bas", sketch: "sk1", distance: 200, operation: "new" },
    { id: "sk2", type: "sketch", name: "Haut", plane: "XY", offset: 500, ...at(300) },
    { id: "ex2", type: "extrude", name: "Bloc haut", sketch: "sk2", distance: 200, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features, removedBodies: [], hiddenBodies: [] }, base_version: now.version, message: "Blocs" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await click(page, '[data-action="face-strip"]');
  const tool = page.getByRole("dialog", { name: "Magie extrusion" });
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  // The low block's top: hovered then clicked inside it, until the pull starts.
  const height = tool.getByRole("textbox", { name: "Hauteur" });
  let pulled = false;
  for (let i = 0; i < 40 && !pulled; i++) {
    const [x, y] = [view.x + view.width * (0.25 + (i % 8) * 0.03), view.y + view.height * (0.45 + Math.floor(i / 8) * 0.04)];
    await page.mouse.move(x, y);
    await page.waitForTimeout(250);
    await page.mouse.click(x, y);
    await page.waitForTimeout(250);
    pulled = await height.isVisible();
  }
  expect(pulled).toBe(true);
  // The pointer over the high block: up to its face, followed.
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.mouse.move(view.x + view.width * (0.55 + (i % 8) * 0.03), view.y + view.height * (0.2 + Math.floor(i / 8) * 0.04));
    await page.waitForTimeout(300);
    reached = (await tool.innerText()).includes("Jusqu'à la face de");
  }
  expect(reached).toBe(true);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/magie-jusqua.png` });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const made = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()).document.features as { type: string; faces?: unknown[]; until?: { body: string } }[]).filter((f) => f.type === "extrude" && f.faces).map((f) => f.until?.body ?? null), api);
  expect(made).toEqual(["ex2"]);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
