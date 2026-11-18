/** Tourner un meuble entier : il ne se pose pas dans son voisin, il arrive au ras de lui. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
type Rotate = { type: string; name?: string; center?: [number, number, number]; target?: string; origin?: number[]; width?: number; depth?: number };

test("un bas de 30 cm tourné d'un quart à côté d'un bas de 60 : posé au ras, pas dedans", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-tourner-au-ras");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await page.locator('[data-unit="base-bas-1-porte-300"]').click();
  await expect(page.locator('[data-ref="status-recompute"]')).toHaveText(/^Recalcul \d+ ms$/);
  await click(page, '[data-workshop="kitchen-units"]');
  // The 30 cm one, chosen as it came: turned a quarter, 56 cm deep, it would go 13 cm into its neighbour.
  await click(page, '[data-action="rotate"]');
  const tool = page.getByRole("dialog", { name: "Tourner" });
  await tool.getByRole("button", { name: "+90°", exact: true }).click();
  await expect(tool).toContainText("il est posé au ras, à côté");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).toHaveText(/^Recalcul \d+ ms$/);
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const features = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Rotate[] } }).document.features, api);
  const turns = features.filter((f) => f.type === "rotate");
  expect(turns.length).toBeGreaterThan(0);
  // The 30 cm caisson's corners turned a quarter around the pivot: all of them past the 60 cm one's side (x = 600).
  const small = features.find((f) => f.type === "cabinet" && f.name === "Bas 1 porte 300")!;
  const [cx, cy] = turns[0]!.center!;
  const [x0, y0] = small.origin!;
  const xs = [x0!, x0! + small.width!].flatMap((x) => [y0!, y0! + small.depth!].map((y) => cx - (y - cy)));
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(600 - 1);
  expect(errors).toEqual([]);
});
