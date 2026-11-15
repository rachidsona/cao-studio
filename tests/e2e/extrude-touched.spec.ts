/** Une extrusion qui coupe, appliquée à tous les corps qu'elle touche : une rainure à travers les côtés d'un cadre. */
import { expect, test, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("une rainure qui coupait un côté du cadre coupe les deux qu'elle traverse", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-extrusion-touches");
  // A frame 600 × 400 × 720 split into its sides; a groove 20 wide right across it, 58 deep from the top, on the left side only.
  const features = [
    { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Cadre", sketch: "sk1", distance: 720, operation: "new" },
    { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "butt", frame: true },
    { id: "sk2", type: "sketch", name: "Tracé", plane: "XY", offset: 720, ...centeredRectangle(1000, 20) },
    { id: "ex2", type: "extrude", name: "Rainure", sketch: "sk2", distance: -58, operation: "cut", target: "sh1#0" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Cadre" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const cuts = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; operation?: string; target?: string }[] } }).document.features.filter((f) => f.type === "extrude" && f.operation === "cut").map((f) => f.target), api);
  };
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);

  // The groove, from the history: « Modifier ».
  await page.locator('[data-op="ex2"]').click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  const target = page.getByRole("combobox", { name: "Corps cible" });
  // The body it cuts is used up by it: still shown as its target, not « every body » by default.
  await expect(target).toHaveValue("sh1#0");
  await expect(page.locator("[data-extrude-touched]")).toHaveCount(0);
  await target.selectOption("*touched");
  await expect(page.locator("[data-extrude-touched]")).toContainText("Elle coupe 2 corps");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect.poll(cuts, { timeout: 30_000 }).toHaveLength(2);
  expect((await cuts()).sort()).toEqual(["sh1#0", "sh1#3"].sort());
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/extrusion-tous-touches.png` });
  expect(errors).toEqual([]);
});
