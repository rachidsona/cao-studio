/** « Séparer les côtés » : un cadre creux (un caisson sans fond, extrudé) devient un panneau par côté. */
import { expect, test, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("un cadre de 60 × 40 cm, ses côtés de 1,8 cm, devient quatre panneaux, en onglet puis bout à bout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-separer-cotes");
  // A box 600 × 400 × 720, its middle 564 × 364 taken through: a frame.
  const features = [
    { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Cadre", sketch: "sk1", distance: 720, operation: "new" },
    { id: "sk2", type: "sketch", name: "Trou", plane: "XY", offset: 0, ...centeredRectangle(564, 364) },
    { id: "ex2", type: "extrude", name: "Évidement", sketch: "sk2", distance: 720, operation: "cut", target: "ex1" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Cadre" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const status = page.locator('[data-ref="status-recompute"]');
  const shell = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string }[] } }).document.features.find((f) => f.type === "shell"), api);
  };
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);

  await click(page, '[data-action="split-sides"]');
  const tool = page.getByRole("dialog", { name: "Séparer les côtés" });
  await expect(tool).toContainText("Cliquez le corps à séparer");
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  // The frame fills the view: a click on it.
  await page.mouse.click(view.x + view.width / 2, view.y + view.height * 0.3);
  await expect(tool).toContainText("Corps : « Évidement »");
  await expect.poll(shell, { timeout: 30_000 }).toMatchObject({ target: "ex2", faces: [], sides: "separate", joint: "miter", frame: true });
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  const tree = page.getByLabel(/^Navigateur : corps/);
  await expect(tree.getByText("côté 4", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("côté 5", { exact: true })).toHaveCount(0);
  await shot(page, "cotes-separes-onglet");

  await tool.getByRole("combobox", { name: "Joints" }).selectOption("butt");
  await expect.poll(async () => (await shell()) as unknown, { timeout: 30_000 }).toMatchObject({ joint: "butt" });
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await shot(page, "cotes-separes-bout-a-bout");
  expect(errors).toEqual([]);
});
