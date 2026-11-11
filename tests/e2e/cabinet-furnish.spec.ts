/** Un caisson de cuisine isolé et aménagé comme un caisson du dressing : clic droit, puis les outils de niche. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const unfold = async (scope: Locator, key: string) => {
  const head = scope.locator(`[data-fold="${key}"]`);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
};

test("caisson de cuisine : isolé et aménagé par le clic droit, étagères posées, sa place gardée sur le linéaire", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-caisson-amenage");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(1500);

  // On its door: isolate and furnish the cabinet.
  await page.mouse.click(500, 610, { button: "right" });
  await page.locator("[data-tree-menu]").getByText("Isoler et aménager le caisson").click();
  await expect(page.locator("[data-zone-isolated]")).toContainText("Bas 2 portes 1000");
  await expect(page.getByText(/est prêt à aménager/).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "caisson-isole");

  // A niche of it: two shelves more.
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: "right" });
  const menu = page.getByRole("menu", { name: "Menu de la niche" });
  await menu.getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await expect(shelves).toContainText("Niche choisie");
  await shelves.getByRole("combobox").first().selectOption("2");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1200);
  await shot(page, "caisson-etageres");
  expect(await page.evaluate(() => document.body.innerText)).toMatch(/Caisson — Bas 2 portes 1000/);

  // Kept in « Mes caissons », under its name.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45, { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: /Garder ce caisson/ }).click();
  await page.locator("[data-caisson-name]").fill("Mon caisson rangement");
  await page.locator("[data-caisson-name]").press("Enter");
  await expect(page.getByText(/gardé dans Mes caissons/).first()).toBeVisible();

  // The whole kitchen again; its run keeps the cabinet's place, free.
  await page.locator("[data-zone-isolated]").getByRole("button", { name: "Tout montrer" }).click();
  await expect(page.locator("[data-zone-isolated]")).toHaveCount(0);
  await click(page, '[data-workshop="kitchen-plan"]');
  await tool.locator('[data-open-run="A"]').click();
  await expect(tool.locator('[data-run-strip="A"] [data-free="base"]')).toHaveCount(1);

  // Put again on the run, from « Mes meubles »: made with its shelves, its place kept too.
  await unfold(tool, "add");
  await tool.getByRole("tab", { name: "Mes meubles" }).click();
  await expect(tool.getByText("Caisson aménagé").first()).toBeVisible();
  await tool.getByRole("button", { name: /^Ajouter Mon caisson rangement de / }).click();
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => document.body.innerText)).toMatch(/Caisson — Mon caisson rangement/);
  await shot(page, "caisson-repose");

  // The rest of the wall sent to the other side: the furnished caissons go with their places.
  const caissons = async () => {
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    const features = project.document.features as { id: string; name: string; frame?: { origin: number[] } }[];
    return Object.fromEntries(features.filter((f) => f.name.startsWith("Caisson — ")).map((f) => [f.name, f.frame!.origin[0]!]));
  };
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(800);
  await shot(page, "caisson-avant");
  const before = await caissons();
  expect(Object.keys(before)).toHaveLength(2);
  await click(page, '[data-workshop="kitchen-plan"]');
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "space");
  const other = tool.locator('[data-rest][aria-pressed="false"]').filter({ hasNotText: "Partagé" }).first();
  await other.click();
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const after = await caissons();
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  const shifts = Object.keys(before).map((name) => after[name]! - before[name]!);
  expect(Math.abs(shifts[0]!)).toBeGreaterThan(100);
  expect(shifts[1]).toBeCloseTo(shifts[0]!, 0);
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(800);
  await shot(page, "caisson-suit");
  expect(errors).toEqual([]);
});

test("Mes caissons : une colonne d'un dressing gardée, puis posée dans une autre case", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-mes-caissons-dressing");
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button").last().click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1000);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(700);
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  const at = (x: number, y: number) => [box.x + box.width * x, box.y + box.height * y] as const;

  // Shelves in a case, and the caisson kept.
  const [x1, y1] = at(0.38, 0.55);
  await page.mouse.click(x1, y1, { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await shelves.getByRole("combobox").first().selectOption("3");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1200);
  await page.mouse.click(x1, y1, { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: /Garder ce caisson/ }).click();
  await page.locator("[data-caisson-name]").fill("Colonne à étagères");
  await page.locator("[data-caisson-name]").press("Enter");
  await expect(page.getByText(/gardé dans Mes caissons/).first()).toBeVisible();

  // Put in another case: its inside there.
  const [x2, y2] = at(0.62, 0.55);
  await page.mouse.click(x2, y2, { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: /Poser un de Mes caissons/ }).click();
  await page.getByRole("menu", { name: "Mes caissons" }).getByRole("menuitem", { name: "Colonne à étagères" }).click();
  await expect(page.getByText(/« Colonne à étagères » posé/).first()).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "mes-caissons-dressing");
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
