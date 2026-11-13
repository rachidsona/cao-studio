/** Un caisson créé avec ses portes : le modèle « Vitrine à portes en verre noir », ou « Portes » réglé à la main. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Fronts = { type: string; cabinet?: string; layout?: string; style?: string; glass?: string; profile?: string };

test("un caisson arrive avec ses portes en verre noir, deux portes au-delà de 600 mm", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-caisson-verre-noir");
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Fronts[] } }).document.features.filter((f) => f.type === "fronts"), api);
  };

  // The model: a showcase 800 wide, its two doors in black glass, their frames in black aluminium.
  await click(page, '[data-action="cabinet"]');
  const tool = page.getByRole("dialog", { name: "Caisson" });
  await tool.getByRole("combobox", { name: "Modèle" }).selectOption("showcase-black");
  await expect(tool.getByRole("combobox", { name: "Portes" })).toHaveValue("glass");
  await expect(tool.getByRole("combobox", { name: "Verre (trempé 4 mm)" })).toHaveValue("black");
  await expect(tool.getByRole("combobox", { name: "Cadre" })).toHaveValue("black");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  const tree = page.getByLabel(/^Navigateur : corps/);
  await expect(tree.getByText("Vitre porte gauche").first()).toBeVisible();
  await expect(tree.getByText("Vitre porte droite").first()).toBeVisible();
  expect(await saved()).toMatchObject([{ layout: "doors", style: "glass", glass: "black", profile: "black" }]);
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await shot(page, "caisson-verre-noir");

  // By hand: plain doors on a cabinet 500 mm wide (the project counts in cm) — one door.
  await click(page, '[data-action="cabinet"]');
  await tool.getByRole("combobox", { name: "Portes" }).selectOption("flat");
  await expect(tool.getByRole("combobox", { name: "Verre (trempé 4 mm)" })).toHaveCount(0);
  const width = tool.getByRole("textbox", { name: /^Largeur/ });
  await width.fill("50");
  await width.press("Tab");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  const fronts = await saved();
  expect(fronts).toHaveLength(2);
  expect(fronts[1]).toMatchObject({ layout: "door" });
  expect(fronts[1]!.style).toBeUndefined();
  expect(errors).toEqual([]);
});
