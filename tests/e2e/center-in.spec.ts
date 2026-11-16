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

test("« Centrer » d'abord, puis un clic dans chaque carré : le petit va au milieu du grand", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-centrer-clics");
  // A square of 70 from the origin, a square of 20 off to the bottom left (as drawn by hand).
  const P = [["p1", 70, 70], ["p2", 70, 0], ["p3", 0, 70], ["p4", -20, -50], ["p5", -40, -70], ["p6", -40, -50], ["p7", -20, -70]] as const;
  const C = [["l1", "origin", "p2"], ["l2", "p2", "p1"], ["l3", "p1", "p3"], ["l4", "p3", "origin"], ["l5", "p4", "p6"], ["l6", "p6", "p5"], ["l7", "p5", "p7"], ["l8", "p7", "p4"]] as const;
  const sketch = { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XY", offset: 0, points: P.map(([id, x, y]) => ({ id, x, y })), curves: C.map(([id, p1, p2]) => ({ id, kind: "line", p1, p2 })), constraints: [["horizontal", "l1"], ["vertical", "l2"], ["horizontal", "l3"], ["vertical", "l4"], ["horizontal", "l5"], ["vertical", "l6"], ["horizontal", "l7"], ["vertical", "l8"]].map(([kind, line], i) => ({ id: `c${i}`, kind, line })) };
  await page.evaluate(async ({ url, sketch }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features: [sketch] }, base_version: now.version, message: "Deux carrés" }) });
  }, { url: api, sketch });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  await click(page, '[data-sketch-command="fit"]');
  await page.waitForTimeout(500);
  await click(page, '[data-sketch-command="centerin"]');
  await expect(page.locator('[data-ref="status-hint"]')).toContainText("Contrainte de centrage");
  const dof = page.locator('[data-ref="sketch-dof"]');
  const before = await dof.textContent();
  // Where the two squares are on screen: their blue fill, read on a picture of the view.
  const canvas = page.locator('[data-ref="viewport"] canvas').first();
  const box = (await canvas.boundingBox())!;
  const shot = (await canvas.screenshot()).toString("base64");
  const blobs = await page.evaluate(async (png) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement("canvas");
    [c.width, c.height] = [img.width, img.height];
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const step = 3;
    const [w, h] = [Math.floor(c.width / step), Math.floor(c.height / step)];
    const blue = (x: number, y: number) => {
      const i = 4 * (y * step * c.width + x * step);
      return data[i + 2]! - data[i]! > 55;
    };
    const seen = new Uint8Array(w * h);
    const found: { x: number; y: number; n: number }[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !blue(x, y)) continue;
      const stack = [[x, y]];
      seen[y * w + x] = 1;
      let [sx, sy, n] = [0, 0, 0];
      while (stack.length) {
        const [px, py] = stack.pop()!;
        sx += px!; sy += py!; n++;
        for (const [qx, qy] of [[px! + 1, py!], [px! - 1, py!], [px!, py! + 1], [px!, py! - 1]]) {
          if (qx! < 0 || qy! < 0 || qx! >= w || qy! >= h || seen[qy! * w + qx!] || !blue(qx!, qy!)) continue;
          seen[qy! * w + qx!] = 1;
          stack.push([qx!, qy!]);
        }
      }
      found.push({ x: (sx / n) * step, y: (sy / n) * step, n });
    }
    return found.sort((a, b) => b.n - a.n).slice(0, 2).map((b) => [b.x / c.width, b.y / c.height]);
  }, shot);
  expect(blobs).toHaveLength(2);
  // One click inside each: the command takes both drawings and centres the small one.
  for (const [fx, fy] of blobs) {
    await page.mouse.click(box.x + box.width * fx!, box.y + box.height * fy!);
    await page.waitForTimeout(200);
  }
  await expect(dof).not.toHaveText(before ?? "", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await click(page, '[data-sketch-command="finish"]');
  await page.keyboard.press("Control+s");
  type Pt = { id: string; x: number; y: number };
  const saved = async () => (await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { points: Pt[] }[] } }).document.features[0]!, api));
  await expect.poll(async () => {
    const s = await saved();
    const at = (id: string) => s.points.find((p) => p.id === id)!;
    return [Math.round((at("p4").x + at("p5").x) / 2), Math.round((at("p4").y + at("p5").y) / 2)];
  }, { timeout: 30_000 }).toEqual([35, 35]);
  expect(errors).toEqual([]);
});
