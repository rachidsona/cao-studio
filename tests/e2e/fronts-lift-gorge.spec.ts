/** Façades : une porte relevable sur compas, puis sans poignée (gorge), sur un caisson. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Fronts = { type: string; layout?: string; side?: string; grip?: string };

test("une porte relevable sur compas, puis sans poignée : la gorge va au devis, pas au débit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-porte-relevable");
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Fronts[] } }).document.features.filter((f) => f.type === "fronts"), api);
  };
  const tree = page.getByLabel(/^Navigateur : corps/);
  const status = page.locator('[data-ref="status-recompute"]');

  // A caisson without fronts, then « Façades » on it.
  await click(page, '[data-action="cabinet"]');
  const cabinet = page.getByRole("dialog", { name: "Caisson" });
  await cabinet.getByRole("combobox", { name: "Portes" }).selectOption("none");
  await page.waitForTimeout(800);
  await cabinet.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(cabinet).toHaveCount(0);
  await click(page, '[data-action="fronts"]');
  const tool = page.getByRole("dialog", { name: "Façades" });
  await expect(tool).toBeVisible();

  // Hinged along its top: its stays chosen from its weight and its height.
  await tool.getByRole("combobox", { name: "Ouverture" }).selectOption("top");
  await expect(tool).toContainText(/Porte relevable de \d+,?\d* kg/);
  await expect(tool).toContainText(/compas de porte relevable force \d \(paire\)/);
  await expect(tree.getByText("Façades 1 — Porte relevable", { exact: true }).first()).toBeVisible();
  await expect(status).not.toContainText("erreur");

  // Without handles: a gorge profile behind its top edge, no handle in the hardware.
  await tool.getByRole("checkbox", { name: /^Sans poignée/ }).check();
  await expect(tool).toContainText("de prise de main");
  await expect(tool).toContainText("profil gorge alu (m)");
  await expect(tool).not.toContainText("poignée entraxe");
  await expect(tool.getByRole("checkbox", { name: /^Percer les poignées/ })).toHaveCount(0);
  await expect(tree.getByText("Profil gorge 1", { exact: true }).first()).toBeVisible();
  await expect(status).not.toContainText("erreur");
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect.poll(saved, { timeout: 30_000 }).toMatchObject([{ layout: "door", side: "top", grip: "gorge" }]);

  // Opened in the view: upwards.
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  await click(page, '[data-workshop="doors-open"]');
  await page.waitForTimeout(900);
  await shot(page, "porte-relevable-ouverte");
  await click(page, '[data-workshop="doors-open"]');

  // The profile is bought: in the quote, not in the cut list.
  await click(page, '[data-workshop="quote"]');
  const quote = page.getByRole("dialog", { name: "Devis" });
  await expect(quote).toContainText("Profil gorge alu (m)");
  await expect(quote).toContainText(/Compas de porte relevable force \d \(paire\)/);
  await quote.getByRole("button", { name: "Fermer", exact: true }).first().click();
  await click(page, '[data-workshop="cutlist"]');
  const list = page.getByRole("dialog", { name: "Liste de débit" });
  await expect(list).toContainText("Porte relevable");
  await expect(list).not.toContainText("Profil gorge");
  expect(errors).toEqual([]);
});

test("un tiroir au-dessus de la porte, puis des tiroirs à l'anglaise derrière : bâtis par le noyau, coulisses au devis", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-tiroir-et-porte");
  const tree = page.getByLabel(/^Navigateur : corps/);
  const status = page.locator('[data-ref="status-recompute"]');
  await click(page, '[data-action="cabinet"]');
  const cabinet = page.getByRole("dialog", { name: "Caisson" });
  await cabinet.getByRole("combobox", { name: "Portes" }).selectOption("none");
  await page.waitForTimeout(800);
  await cabinet.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="fronts"]');
  const tool = page.getByRole("dialog", { name: "Façades" });
  const field = tool.getByLabel(/^Tiroir au-dessus/);
  await field.fill("15");
  await field.press("Enter");
  await expect(tree.getByText("Façade tiroir 1", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("Porte", { exact: true }).first()).toBeVisible();
  await expect(tool).toContainText("1 × coulisse de tiroir (paire)");
  const inner = tool.getByLabel(/^Tiroirs à l'anglaise/);
  await inner.fill("2");
  await inner.press("Enter");
  await expect(tree.getByText("Tiroir intérieur 2 — fond", { exact: true }).first()).toBeAttached();
  await expect(tool).toContainText("3 × coulisse de tiroir (paire)");
  await expect(status).toHaveText(/^Recalcul \d+ ms$/);
  await shot(page, "tiroir-et-porte");
  expect(errors).toEqual([]);
});
