/** « Prolonger élément » par la mesure tapée : le dessus d'un caisson, « De » puis « Cote finale ». */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("un caisson prolongé par le dessus de 10 cm tapés, puis mis à 90 cm par sa cote finale", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-prolonger-mesure");
  await page.evaluate(async (url) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    const cabinet = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features: [cabinet] }, base_version: now.version, message: "Caisson" }) });
  }, api);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const height = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { id: string; height?: number }[] } }).document.features.find((f) => f.id === "cb1")?.height, api);
  };
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);

  await click(page, '[data-action="extend-element"]');
  const tool = page.getByRole("dialog", { name: "Prolonger élément" });
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await expect(tool).toContainText("À prolonger : « Bas »");
  const measures = tool.locator("[data-extend-measures]");
  await expect(measures).toContainText("Aujourd'hui : 72 cm");
  const by = measures.getByRole("textbox", { name: "De" });
  await by.fill("10");
  await by.press("Enter");
  await expect(tool.locator("[data-extend-result]")).toHaveText("« Bas » prolongé de 10 cm.");
  await expect(tool.locator("[data-extend-ok]")).toBeEnabled({ timeout: 30_000 });
  await tool.locator("[data-extend-ok]").click();
  await expect.poll(height, { timeout: 30_000 }).toBe(820);

  // Again, by its final size: 90 cm.
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await expect(measures).toContainText("Aujourd'hui : 82 cm");
  const final = measures.getByRole("textbox", { name: "Cote finale" });
  await final.fill("90");
  await final.press("Enter");
  await expect(tool.locator("[data-extend-result]")).toHaveText("« Bas » prolongé de 8 cm.");
  await expect(tool.locator("[data-extend-ok]")).toBeEnabled({ timeout: 30_000 });
  await tool.locator("[data-extend-ok]").click();
  await expect.poll(height, { timeout: 30_000 }).toBe(900);
  expect(errors).toEqual([]);
});
