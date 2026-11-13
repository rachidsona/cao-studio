/** Assistant Dressing : un style de façades pour ses portes battantes et ses tiroirs. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Niche = { type: string; fill?: string; style?: string; pitch?: number };

test("l'Assistant Dressing pose des portes et des tiroirs à tasseaux", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-dressing-facades");
  const niches = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Niche[] } }).document.features.filter((f) => f.type === "niche" && (f.fill === "doors" || f.fill === "drawers")), api);
  };
  await click(page, '[data-action="dressing"]');
  const tool = page.getByRole("dialog", { name: "Dressing" });
  await expect(tool).toBeVisible();
  await tool.getByRole("combobox", { name: "Portes" }).selectOption("hinged");
  await tool.getByRole("combobox", { name: "Style des façades" }).selectOption("slats");
  await expect(tool.getByRole("textbox", { name: "Entraxe des tasseaux" })).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await expect.poll(async () => (await niches()).map((f) => [f.fill, f.style, f.pitch]), { timeout: 60_000 }).toEqual(expect.arrayContaining([["doors", "slats", 45], ["drawers", "slats", 45]]));
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "dressing-portes-a-tasseaux");
  expect(errors).toEqual([]);
});
