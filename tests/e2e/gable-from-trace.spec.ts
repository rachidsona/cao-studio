/** Toit : la ligne posée sur le dessus d'un bloc par Magie extrusion (sans extruder) suffit à le plier en toit. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("une ligne de Magie extrusion sur le dessus d'un bloc, puis Toit : le toit se fait", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-toit-trace");
  const corners = [[-300, -200], [300, -200], [300, 200], [-300, 200]];
  const features = [
    { id: "sk1", type: "sketch", name: "Bloc", plane: "XY", offset: 0, points: corners.map(([x, y], i) => ({ id: `p${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `l${i}`, kind: "line", p1: `p${i}`, p2: `p${(i + 1) % 4}` })), constraints: [] },
    { id: "ex1", type: "extrude", name: "Bloc", sketch: "sk1", distance: 400, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Bloc" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  const view = await page.evaluate(() => {
    const r = document.querySelector("canvas.cad-view")!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const [cx, cy] = [view.x + view.w / 2, view.y + view.h / 2];

  // A line across the top, kept alone (« Puis tirer / pousser » unticked), from its right edge.
  await click(page, '[data-action="face-strip"]');
  const tool = page.getByRole("dialog", { name: "Magie extrusion" });
  const values = page.getByRole("status", { name: "Mesures" });
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("edge");
  await tool.getByRole("checkbox", { name: "Puis tirer / pousser" }).uncheck();
  let edge = 0;
  for (let x = cx; x < view.x + view.w && !edge; x += 4) {
    await page.mouse.move(x, cy + 20);
    await page.waitForTimeout(80);
    if (((await values.textContent()) ?? "").includes("part de cette arête")) edge = x;
  }
  expect(edge).toBeGreaterThan(0);
  await page.mouse.click(edge, cy + 20);
  await page.mouse.move((cx + edge) / 2, cy + 20);
  await page.mouse.click((cx + edge) / 2, cy + 20);
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");

  // The roof finds that line: no warning, OK makes it.
  await click(page, '[data-action="gable"]');
  const roof = page.getByRole("dialog", { name: "Toit" });
  await expect(roof).toBeVisible();
  await expect(roof).not.toContainText("Tracez une seule ligne", { timeout: 10_000 });
  await roof.getByRole("button", { name: "OK", exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  expect((project.document.features as { type: string; name: string }[]).some((f) => f.type === "extrude" && f.name.startsWith("Toit"))).toBe(true);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
