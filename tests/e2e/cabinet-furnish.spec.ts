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
  await newProject(page, "zz-test-caisson-amenage");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await tool.locator("[data-run-ok]").click();
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

  // The whole kitchen again; its run keeps the cabinet's place, free.
  await page.locator("[data-zone-isolated]").getByRole("button", { name: "Tout montrer" }).click();
  await expect(page.locator("[data-zone-isolated]")).toHaveCount(0);
  await click(page, '[data-workshop="kitchen-plan"]');
  await tool.locator('[data-open-run="A"]').click();
  await expect(tool.locator('[data-run-strip="A"] [data-free="base"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
