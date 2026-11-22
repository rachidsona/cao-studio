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
  // Which pass at the corners, as in a Répartition: the top and the bottom.
  await tool.getByRole("combobox", { name: "Joints" }).selectOption("butt:boards");
  await expect.poll(async () => (await shell()) as unknown, { timeout: 30_000 }).toMatchObject({ joint: "butt", pass: "boards" });
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  // Each end its own way: the top over the sides, then the bottom mitred.
  await tool.getByRole("combobox", { name: "Joints" }).selectOption("mixed");
  await expect.poll(async () => (await shell()) as unknown, { timeout: 30_000 }).toMatchObject({ joint: "butt", corners: { top: "boards", bottom: "sides" } });
  await tool.getByRole("combobox", { name: "En bas (dessous et côtés)" }).selectOption("miter");
  await expect.poll(async () => (await shell()) as unknown, { timeout: 30_000 }).toMatchObject({ corners: { top: "boards", bottom: "miter" } });
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await expect(tree.getByText("côté 4", { exact: true }).first()).toBeVisible();
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await shot(page, "cotes-separes-bout-a-bout");
  // One side chosen in the navigator and isolated: it alone stays in view, not its three neighbours.
  await tree.getByText("côté 2", { exact: true }).first().click();
  await page.locator("canvas.cad-view").hover();
  await page.keyboard.press("i");
  const bar = page.locator("[data-zone-isolated]");
  await expect(bar).toContainText("côté 2");
  await expect.poll(async () => Number(await bar.getAttribute("data-shown"))).toBe(1);
  await bar.getByRole("button", { name: "Tout montrer" }).click();
  expect(errors).toEqual([]);
});

test("un corps plein ouvert par la face cliquée : devant et derrière au lieu de dessus et dessous", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-separer-face");
  const features = [
    { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 720, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Plein" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const shell = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; open?: number[] }[] } }).document.features.find((f) => f.type === "shell"), api);
  };
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await click(page, '[data-action="split-sides"]');
  const tool = page.getByRole("dialog", { name: "Séparer les côtés" });
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  // The body, then its front face (the middle of the view, seen from the front).
  await page.mouse.click(view.x + view.width / 2, view.y + view.height * 0.3);
  await expect(tool).toContainText("Ouvert dessus et dessous");
  await page.waitForTimeout(1500);
  await page.mouse.click(view.x + view.width / 2, view.y + view.height * 0.3);
  await expect(tool).toContainText("Ouvert par la face cliquée");
  await expect.poll(async () => (await shell())?.open?.map((c) => Math.round(c)), { timeout: 30_000 }).toEqual([0, -1, 0]);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  // Back to the top and the bottom.
  await tool.locator("[data-split-open-reset]").click();
  await expect.poll(async () => (await shell())?.open, { timeout: 30_000 }).toBeUndefined();
  expect(errors).toEqual([]);
});

test("deux cadres cliqués l'un après l'autre sont séparés ensemble, en une seule annulation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-separer-deux-cadres");
  // Two frames 600 × 400 × 720, side by side (the second 900 mm to the right).
  const shifted = (w: number, d: number) => {
    const r = centeredRectangle(w, d);
    r.points.forEach((p) => (p.x += 900));
    r.constraints = [];
    return r;
  };
  const features = [
    { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Cadre", sketch: "sk1", distance: 720, operation: "new" },
    { id: "sk2", type: "sketch", name: "Trou", plane: "XY", offset: 0, ...centeredRectangle(564, 364) },
    { id: "ex2", type: "extrude", name: "Évidement", sketch: "sk2", distance: 720, operation: "cut", target: "ex1" },
    { id: "sk3", type: "sketch", name: "Contour 2", plane: "XY", offset: 0, ...shifted(600, 400) },
    { id: "ex3", type: "extrude", name: "Cadre 2", sketch: "sk3", distance: 720, operation: "new" },
    { id: "sk4", type: "sketch", name: "Trou 2", plane: "XY", offset: 0, ...shifted(564, 364) },
    { id: "ex4", type: "extrude", name: "Évidement 2", sketch: "sk4", distance: 720, operation: "cut", target: "ex3" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Cadres" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const shells = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; target?: string }[] } }).document.features.filter((f) => f.type === "shell").map((f) => f.target).sort(), api);
  };
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await click(page, '[data-action="split-sides"]');
  const tool = page.getByRole("dialog", { name: "Séparer les côtés" });
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  // From the left, across the middle of the view: the first frame, then the second.
  const across = async (from: number, until: RegExp) => {
    for (let k = from; k < 100; k += 2) {
      await page.mouse.click(view.x + (view.width * k) / 100, view.y + view.height / 2);
      await page.waitForTimeout(80);
      if (until.test(await tool.innerText())) return k;
    }
    throw new Error("aucun cadre trouvé");
  };
  const first = await across(2, /Corps : « Évidement/);
  await across(first + 30, /2 corps/);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect.poll(shells, { timeout: 30_000 }).toEqual(["ex2", "ex4"]);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  // One undo takes both back.
  await click(page, '[data-action="undo"]');
  await expect.poll(shells, { timeout: 30_000 }).toEqual([]);
  expect(errors).toEqual([]);
});
