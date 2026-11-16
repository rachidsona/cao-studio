/** « Cintrer contre » : un panneau droit s'enroule sur le tour d'un fût. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("un panneau posé contre un fût s'y enroule : panneau, puis la face ronde", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-cintrer-contre");
  const board = { points: [[300, -200], [318, -200], [318, 200], [300, 200]].map(([x, y], i) => ({ id: `b${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `l${i}`, kind: "line", p1: `b${i}`, p2: `b${(i + 1) % 4}` })), constraints: [] };
  const drum = { points: [{ id: "c0", x: 0, y: 0 }], curves: [{ id: "c", kind: "circle", center: "c0", radius: 300 }], constraints: [] };
  const features = [
    { id: "sk1", type: "sketch", name: "Fût", plane: "XY", offset: 0, ...drum },
    { id: "ex1", type: "extrude", name: "Fût", sketch: "sk1", distance: 700, operation: "new" },
    { id: "sk2", type: "sketch", name: "Panneau", plane: "XY", offset: 0, ...board },
    { id: "ex2", type: "extrude", name: "Panneau", sketch: "sk2", distance: 700, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features, bodyNames: { ex1: "Fût", ex2: "Panneau droit" } }, base_version: now.version, message: "Fût" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  // The board, in the Navigator; then the tool.
  await page.getByLabel(/^Navigateur : corps/).getByText("Panneau droit", { exact: true }).click();
  await click(page, '[data-action="bend-onto"]');
  const tool = page.getByRole("dialog", { name: "Cintrer contre" });
  await expect(tool).toContainText("Panneau : « Panneau droit »");
  // The round face of the drum: the middle of the view, seen from the front.
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width * 0.45, view.y + view.height / 2);
  await expect(tool).toContainText("Contre : « Fût »");
  await page.waitForTimeout(1500);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; kind?: string; onto?: { body: string } }[] } }).document.features.find((f) => f.type === "modifier"), api)), { timeout: 30_000 }).toMatchObject({ kind: "bend", target: "ex2", onto: { body: "ex1" } });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});

test("le corps rond choisi d'abord par erreur : une face plate donne le panneau, la face ronde le corps rond", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-cintrer-ordre");
  // The board in front of the drum (along x, 18 thick at y −318…−300), narrower than it.
  const board = { points: [[-200, -318], [200, -318], [200, -300], [-200, -300]].map(([x, y], i) => ({ id: `b${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `l${i}`, kind: "line", p1: `b${i}`, p2: `b${(i + 1) % 4}` })), constraints: [] };
  const drum = { points: [{ id: "c0", x: 0, y: 0 }], curves: [{ id: "c", kind: "circle", center: "c0", radius: 300 }], constraints: [] };
  const features = [
    { id: "sk1", type: "sketch", name: "Fût", plane: "XY", offset: 0, ...drum },
    { id: "ex1", type: "extrude", name: "Fût", sketch: "sk1", distance: 700, operation: "new" },
    { id: "sk2", type: "sketch", name: "Panneau", plane: "XY", offset: 0, ...board },
    { id: "ex2", type: "extrude", name: "Panneau", sketch: "sk2", distance: 700, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features, bodyNames: { ex1: "Fût rond", ex2: "Panneau droit" } }, base_version: now.version, message: "Fût" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  // The drum selected before the tool: taken as the board, wrongly.
  await page.getByLabel(/^Navigateur : corps/).getByText("Fût rond", { exact: true }).click();
  await click(page, '[data-action="bend-onto"]');
  const tool = page.getByRole("dialog", { name: "Cintrer contre" });
  await expect(tool).toContainText("Panneau : « Fût rond »");
  // From the middle (the board) to the right (the drum beyond its end): each click takes what its face is.
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  for (let k = 0; k < 40 && !/Contre : « Fût rond »/.test(await tool.innerText()); k++) {
    await page.mouse.click(view.x + view.width * (0.5 + k * 0.01), view.y + view.height / 2);
    await page.waitForTimeout(250);
  }
  await expect(tool).toContainText("Contre : « Fût rond »");
  await expect(tool).toContainText("Panneau : « Panneau droit »");
  await page.waitForTimeout(1500);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; target?: string; onto?: { body: string } }[] } }).document.features.find((f) => f.type === "modifier"), api)), { timeout: 30_000 }).toMatchObject({ target: "ex2", onto: { body: "ex1" } });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
