/** Visite à pied : marcher, être arrêté par le meuble, regarder, changer la hauteur des yeux, aller où l'on clique, revenir. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("la visite à pied : marcher vers le caisson jusqu'à lui, regarder, monter les yeux, aller au sol cliqué, puis Échap", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-visite-a-pied");
  await click(page, '[data-action="cabinet"]');
  const cabinet = page.getByRole("dialog", { name: "Caisson" });
  await cabinet.getByRole("combobox", { name: "Portes" }).selectOption("flat");
  await page.waitForTimeout(800);
  await cabinet.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await page.waitForTimeout(800);

  await click(page, '[data-workshop="walk"]');
  const panel = page.getByRole("dialog", { name: "Visite à pied" });
  await expect(panel).toBeVisible();
  const pad = page.locator("[data-walk-pad]");
  const where = async () => {
    const d = await pad.evaluate((p) => ({ ...(p as HTMLElement).dataset }));
    return { x: Number(d.x), y: Number(d.y), yaw: Number(d.yaw), eye: Number(d.eye) };
  };
  const start = await where();
  expect(start.eye).toBe(1600);
  await expect(panel.getByRole("textbox", { name: "Hauteur des yeux" })).toHaveValue("160");
  await shot(page, "visite-depart");

  // Forward (the up arrow) for a while: it walks, then the caisson stops it.
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(600);
  const walking = await where();
  expect(walking.y).toBeGreaterThan(start.y + 300);
  await page.waitForTimeout(3000);
  const stopped = await where();
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowUp");
  expect((await where()).y).toBe(stopped.y);
  expect(stopped.y).toBeLessThan(0);
  await shot(page, "visite-devant-le-caisson");

  // A step back with S (the key's place: W A S D), a look to the left by dragging, the eyes lower with the wheel.
  await page.keyboard.down("s");
  await page.waitForTimeout(400);
  await page.keyboard.up("s");
  expect((await where()).y).toBeLessThan(stopped.y);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const [cx, cy] = [view.x + view.width / 2, view.y + view.height / 2];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 100, cy, { steps: 5 });
  await page.mouse.up();
  expect((await where()).yaw).toBeGreaterThan(10);
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await where()).eye).toBeLessThan(1600);

  // Two metres back, looking down at the floor ahead (dragging down) and clicking it: the visitor goes there.
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(1500);
  await page.keyboard.up("ArrowDown");
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 150, { steps: 5 });
  await page.mouse.up();
  await shot(page, "visite-regard-au-sol");
  const before = await where();
  await page.mouse.click(cx, view.y + view.height * 0.9);
  await expect.poll(async () => { const now = await where(); return Math.hypot(now.x - before.x, now.y - before.y); }).toBeGreaterThan(100);

  // Échap: the view as it was, the panel and the joystick gone.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(pad).toHaveCount(0);
  expect(await page.evaluate(() => "walking" in document.body.dataset)).toBe(false);
  expect(errors).toEqual([]);
});

test("dans une pièce relevée, la visite part de son milieu et le mur arrête le visiteur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-visite-piece");
  // A room of four walls, 4 m × 3 m, 2,5 m high.
  await page.evaluate(async (url) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    const room = { id: "rm1", type: "room", name: "Pièce", walls: [{ length: 4000, angle: 90 }, { length: 3000, angle: 90 }, { length: 4000, angle: 90 }, { length: 3000, angle: 90 }], height: 2500, thickness: 100, obstacles: [] };
    const bodyInfo = Object.fromEntries([0, 1, 2, 3].map((i) => [`rm1#${i}`, { room: true }]));
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features: [room], bodyInfo }, base_version: now.version, message: "Pièce" }) });
  }, api);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await click(page, '[data-workshop="walk"]');
  const pad = page.locator("[data-walk-pad]");
  const where = async () => {
    const d = await pad.evaluate((p) => ({ ...(p as HTMLElement).dataset }));
    return { x: Number(d.x), y: Number(d.y) };
  };
  // The first wall runs along +X from the origin, the room on its −Y side: its middle is (2000, −1500).
  await expect.poll(where).toEqual({ x: 2000, y: -1500 });
  // It faces the first wall (+Y): backwards, towards the third wall (inside face at y = −3000), until it stops at
  // the body's width from it.
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(2500);
  await page.keyboard.up("ArrowDown");
  const stopped = await where();
  expect(stopped.y).toBeGreaterThanOrEqual(-3000 + 250);
  expect(stopped.y).toBeLessThan(-3000 + 250 + 150);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowDown");
  expect((await where()).y).toBe(stopped.y);
  await shot(page, "visite-dans-la-piece");
  await page.getByRole("dialog", { name: "Visite à pied" }).getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(pad).toHaveCount(0);
  expect(errors).toEqual([]);
});
