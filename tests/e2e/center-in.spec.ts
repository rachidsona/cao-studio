/** « Centrer » dans l'esquisse : un petit rectangle au milieu d'un grand, tenu là par ses contraintes. */
import { expect, test, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("deux rectangles choisis : le petit va au milieu du grand", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-centrer");
  // A large rectangle (centred on the origin) and a small one off to a corner, its size held.
  const big = centeredRectangle(1000, 600);
  const small = { points: [[150, 100], [350, 100], [350, 200], [150, 200]].map(([x, y], i) => ({ id: `q${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `m${i}`, kind: "line", p1: `q${i}`, p2: `q${(i + 1) % 4}` })) };
  const sketch = { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XY", offset: 0, points: [...big.points, ...small.points], curves: [...big.curves, ...small.curves], constraints: [...big.constraints, { id: "k1", kind: "horizontal", line: "m0" }, { id: "k2", kind: "vertical", line: "m1" }, { id: "k3", kind: "horizontal", line: "m2" }, { id: "k4", kind: "vertical", line: "m3" }, { id: "k5", kind: "length", line: "m0", value: 200 }, { id: "k6", kind: "length", line: "m1", value: 100 }] };
  await page.evaluate(async ({ url, sketch }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features: [sketch] }, base_version: now.version, message: "Deux rectangles" }) });
  }, { url: api, sketch });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  await page.keyboard.press("Control+a");
  await click(page, '[data-sketch-command="centerin"]');
  await click(page, '[data-sketch-command="finish"]');
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");
  await page.keyboard.press("Control+s");
  type P = { id: string; x: number; y: number };
  const saved = async () => (await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { points: P[]; constraints: { kind: string }[] }[] } }).document.features[0]!, api));
  await expect.poll(async () => (await saved()).constraints.filter((c) => c.kind === "symmetric").length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const s = await saved();
  const at = (id: string) => s.points.find((p) => p.id === id)!;
  // The small one's middle on the large one's (the origin).
  expect(Math.round((at("q0").x + at("q2").x) / 2)).toBe(0);
  expect(Math.round((at("q0").y + at("q2").y) / 2)).toBe(0);
  expect(errors).toEqual([]);
});
