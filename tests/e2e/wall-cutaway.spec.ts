/** Les murs qui cachent la vue s'effacent quand on tourne autour de la pièce, et reviennent devant elle. */
import { expect, test, type Page } from "@playwright/test";
import { newProject, wallsOnly } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("le mur entre l'œil et la cuisine s'efface avec ses meubles, la vue tournée derrière lui", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-murs-masques");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await wallsOnly(tool);
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  for (const run of ["A", "B"]) {
    await tool.locator(`[data-open-run="${run}"]`).click();
    const add = tool.locator('[data-fold="add"]');
    if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
    await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
    await tool.locator("[data-run-close]").click();
    await expect(page.getByText(`Mur ${run} aménagé`).first()).toBeVisible({ timeout: 60_000 });
  }
  const view = page.locator("canvas.cad-view");

  // In front of wall A's run: no wall in the way.
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await expect(view).toHaveAttribute("data-walls-cut", "0");
  await expect(view).toHaveAttribute("data-furniture-cut", "0");
  await shot(page, "mur-devant");
  // Turned round to look from behind wall A: it is no longer drawn, nor the units standing against it (their backs);
  // those of wall B stay.
  const box = (await view.boundingBox())!;
  const halfTurn = async () => {
    // The view set by a button turns to it, and a drag glides on: wait for it to be still.
    await page.waitForTimeout(900);
    for (let turn = 0; turn < 2; turn++) {
      await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 20 });
      await page.mouse.up();
    }
    await page.waitForTimeout(900);
  };
  await halfTurn();
  await expect(view).not.toHaveAttribute("data-walls-cut", "0");
  const hidden = Number(await view.getAttribute("data-furniture-cut"));
  expect(hidden).toBeGreaterThan(5);
  await page.waitForTimeout(800);
  await shot(page, "mur-masque");

  // From the right, in front of wall B's run: all back. Half a turn on, behind wall B: its units only go, those of
  // wall A stay whole, in the corner too.
  await click(page, '[data-action="view"][data-view="right"]');
  await click(page, '[data-action="fit"]');
  await expect(view).toHaveAttribute("data-furniture-cut", "0");
  await halfTurn();
  await expect(view).not.toHaveAttribute("data-walls-cut", "0");
  const behindB = Number(await view.getAttribute("data-furniture-cut"));
  expect(behindB).toBeGreaterThan(5);
  await shot(page, "mur-b-masque");

  // In « Affichage »: the units back with « avec leurs meubles » off, the wall too with the first box off.
  await click(page, "[data-display-menu]");
  const units = page.locator("[data-wall-cutaway-furniture]");
  await units.uncheck();
  await expect(view).toHaveAttribute("data-furniture-cut", "0");
  await expect(view).not.toHaveAttribute("data-walls-cut", "0");
  await shot(page, "mur-masque-meubles-gardes");
  await units.check();
  await expect(view).toHaveAttribute("data-furniture-cut", String(behindB));
  const option = page.locator("[data-wall-cutaway]");
  await option.uncheck();
  await expect(view).toHaveAttribute("data-walls-cut", "0");
  await expect(units).toBeDisabled();
  await option.check();
  await expect(view).not.toHaveAttribute("data-walls-cut", "0");
  expect(errors).toEqual([]);
});

test("dressing en L : le mur qui cache la vue s'efface avec sa zone, l'autre zone reste entière", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-murs-masques-dressing");
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByLabel("Dessiner les murs").check();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  const zones = tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem");
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await expect(zones).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await zones.nth(i).getByRole("button").last().click();
    await partition.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(partition).toHaveCount(0);
    await page.waitForTimeout(1000);
    if (!(await tool.isVisible())) await click(page, '[data-workshop="dressing-plan"]');
  }
  // Sliding doors on wall A's zone: no way of their own, they go with their zone.
  await tool.getByLabel("Portes coulissantes, Mur A").selectOption("2");
  await expect(page.getByText(/portes coulissantes/).first()).toBeVisible();
  await page.waitForTimeout(1000);
  const view = page.locator("canvas.cad-view");
  await expect(view).toHaveAttribute("data-walls", "2");
  const box = (await view.boundingBox())!;
  const halfTurn = async () => {
    await page.waitForTimeout(900);
    for (let turn = 0; turn < 2; turn++) {
      await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 20 });
      await page.mouse.up();
    }
    await page.waitForTimeout(900);
  };

  // In front of wall A: nothing in the way. Behind it: the wall gone, and a zone with it, the other left whole.
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await expect(view).toHaveAttribute("data-walls-cut", "0");
  await shot(page, "dressing-devant");
  await halfTurn();
  await expect(view).not.toHaveAttribute("data-walls-cut", "0");
  const out = Number(await view.getAttribute("data-furniture-cut"));
  expect(out).toBeGreaterThan(3);
  await shot(page, "dressing-mur-masque");
  // Without its doors, the zone has fewer bodies to take out: they went with it.
  await tool.getByLabel("Portes coulissantes, Mur A").selectOption("0");
  await page.waitForTimeout(1500);
  expect(Number(await view.getAttribute("data-furniture-cut"))).toBeLessThan(out);
  expect(errors).toEqual([]);
});

test("le bouton de la colonne de la vue garde les murs et les meubles affichés, puis les efface de nouveau", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Bouton murs e2e");
  const toggle = page.locator("[data-wall-cutaway-toggle]");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("canvas.cad-view")).toHaveAttribute("data-walls-cut", "0");
  // The menu's box says the same; the choice is kept by the browser.
  await expect(page.locator("[data-wall-cutaway]")).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("cao.wall-cutaway"))).toBe("0");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
