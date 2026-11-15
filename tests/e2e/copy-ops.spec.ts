/** « Copier les opérations » : la poche d'un côté d'un cadre refaite sur le côté d'en face et sur un côté en travers. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

/** Clicks from the middle of the view towards (dx, dy) until the panel's text changes: the first body met. */
async function clickToward(page: Page, tool: Locator, dx: number, dy: number): Promise<void> {
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const before = await tool.innerText();
  for (let k = 4; k < 120; k++) {
    const [x, y] = [view.x + view.width / 2 + dx * k * 4, view.y + view.height / 2 + dy * k * 4];
    await page.mouse.click(x, y);
    await page.waitForTimeout(60);
    if ((await tool.innerText()) !== before) return;
  }
  throw new Error("aucun corps dans cette direction");
}

test("la poche d'un côté du cadre refaite sur le côté d'en face et sur un côté en travers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-copier-operations");
  // A frame 600 × 400 × 720 split into its sides; a pocket 200 × 8, 40 deep, in the top of the front side (y < 0).
  const pocket = centeredRectangle(200, 8);
  pocket.points.forEach((p) => (p.y -= 191));
  pocket.constraints = [];
  const features = [
    { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 720, operation: "new" },
    { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "butt", frame: true },
    { id: "sk2", type: "sketch", name: "Tracé 1", plane: "XY", offset: 720, ...pocket },
    { id: "ex2", type: "extrude", name: "Poche", sketch: "sk2", distance: -40, operation: "cut", target: "sh1#1" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Cadre" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const status = page.locator('[data-ref="status-recompute"]');
  const cuts = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    const all = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { id: string; type: string; operation?: string; target?: string; sketch?: string }[] } }).document.features, api);
    return all.filter((f) => f.type === "extrude" && f.operation === "cut").map((f) => ({ target: f.target, sketch: all.some((s) => s.id === f.sketch && s.type === "sketch") }));
  };
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);

  await click(page, '[data-action="copy-ops"]');
  const tool = page.getByRole("dialog", { name: "Copier les opérations" });
  await expect(tool).toContainText("Cliquez le corps dont vous voulez recopier");
  // From above, the front side (with the pocket) is down the middle of the view.
  await clickToward(page, tool, 0, 1);
  await expect(tool).toContainText("Corps d'origine");
  await expect(tool.locator("[data-copy-op]")).toHaveCount(1);
  await expect(tool.locator('[data-copy-op="ex2"] input')).toBeChecked();
  // The back side, up; then a short side, to the right.
  await clickToward(page, tool, 0, -1);
  await expect(tool).toContainText("Sur : ");
  await clickToward(page, tool, 1, 0);
  await expect(tool).toContainText(/Sur : « [^»]+ », « [^»]+ »/);
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/copier-operations.png` });
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect.poll(async () => (await cuts()).length, { timeout: 30_000 }).toBe(3);
  const made = await cuts();
  expect(made.map((c) => c.target).sort()).toEqual(["sh1#1", "sh1#2", "sh1#3"]);
  expect(made.every((c) => c.sketch)).toBe(true);
  await expect(status).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
