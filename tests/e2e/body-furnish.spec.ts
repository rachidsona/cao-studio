/** « Aménager ce corps » : un cadre fait de ses côtés séparés reçoit des étagères, ses parois en sont les côtés. */
import { expect, test, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("un cadre de 60 × 40 cm, 72 de haut, ouvert dessus et dessous : clic droit, Aménager, puis Étagères dans l'ouverture", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-amenager-corps");
  // 600 × 400, 720 high, its sides 18 thick, open at the top and the bottom; seen from above.
  const features = [
    { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 720, operation: "new" },
    { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "butt", frame: true },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Cadre" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const status = page.locator('[data-ref="status-recompute"]');
  type F = { id: string; type: string; offsets?: { step?: { kind: string; input?: { inside?: boolean } } }[] };
  const doc = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: F[] } }).document.features, api);
  };
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const [cx, cy] = [view.x + view.width / 2, view.y + view.height / 2];

  // A wall of the frame: down from the middle until the body's menu comes.
  const bodyMenu = page.getByRole("menu", { name: "Menu du corps" });
  for (let k = 10; k < 120 && !(await bodyMenu.isVisible()); k++) {
    await page.keyboard.press("Escape");
    await page.mouse.click(cx, cy + k * 4, { button: "right" });
    await page.waitForTimeout(80);
  }
  await expect(bodyMenu).toBeVisible();
  await bodyMenu.getByRole("menuitem", { name: "Aménager ce corps" }).click();
  await expect.poll(async () => (await doc()).some((f) => f.type === "sketch" && f.offsets?.some((r) => r.step?.kind === "partition" && r.step.input?.inside)), { timeout: 30_000 }).toBe(true);
  // Nothing made twice: no panel of the Répartition yet, the walls are the frame's.
  const extrudes = (await doc()).filter((f) => f.type === "extrude").length;

  // In the opening: the niche's menu, then Étagères.
  await page.mouse.click(cx, cy, { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await expect(shelves).toContainText("Niche choisie");
  await shelves.getByRole("combobox").first().selectOption("2");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await expect.poll(async () => (await doc()).filter((f) => f.type === "extrude").length, { timeout: 30_000 }).toBeGreaterThan(extrudes);
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await page.waitForTimeout(1000);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/amenager-corps.png` });
  expect(errors).toEqual([]);
});

test("sans Répartition, Cloisons sur un cadre sélectionné l'aménage d'abord, puis s'ouvre dedans", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-amenager-cloisons");
  const features = [
    { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 720, operation: "new" },
    { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "butt", frame: true },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Cadre" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  // A wall selected, in the Navigator.
  await page.getByLabel(/^Navigateur : corps/).getByText("côté 2", { exact: true }).click();
  await expect(page.locator("body")).toContainText(/1 corps sélectionné/);
  await click(page, '[data-action="cloisons"]');
  const tool = page.getByRole("dialog", { name: "Cloisons" });
  await expect(tool).toBeVisible({ timeout: 30_000 });
  await expect(tool).toContainText("Niche choisie");
  expect(errors).toEqual([]);
});
