/** « Modules à glisser » : les réglages du module au bas du panneau, avant de le glisser et une fois posé. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

/** A wall of a dressing, seen from the front. */
async function wall(page: Page) {
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
  await page.waitForTimeout(800);
}

test("le module glissé se règle au bas du panneau : avant de le glisser, puis posé, puis repris d'un clic", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-modules-a-glisser");
  await wall(page);
  const view = page.locator("canvas.cad-view");
  const box = (await view.boundingBox())!;
  const niche = { x: box.width * 0.33, y: box.height * 0.5 };
  const tree = page.getByLabel(/^Navigateur : corps/);

  await click(page, '[data-workshop="module-palette"]');
  const panel = page.getByRole("dialog", { name: "Modules à glisser" });
  const options = panel.getByRole("group", { name: "Réglages du module" });
  // The first module of the list, its settings below, for the next one dragged.
  await expect(options).toHaveAttribute("data-module-options", "next");
  await expect(options.locator("[data-module-options-title]")).toHaveText("Réglages : Penderie longue");
  // Another one chosen: its own settings; four drawers instead of three, before it is dragged.
  await panel.locator('[data-module="drawers"]').click();
  await expect(options.locator("[data-module-options-title]")).toHaveText(/^Réglages : /);
  await expect(panel.locator('[data-module="drawers"]')).toHaveAttribute("aria-pressed", "true");
  await options.getByRole("combobox", { name: "Tiroirs" }).selectOption("4");
  await panel.locator('[data-module="drawers"]').dragTo(view, { targetPosition: niche });
  await expect(page.getByText(/Niche équipée/)).toBeVisible();
  await expect(tree.getByText("Façade tiroir 4").first()).toBeVisible();

  // Laid: the settings are its own, and change it where it is.
  await expect(options).toHaveAttribute("data-module-options", "placed");
  await expect(options.locator("[data-module-options-title]")).toHaveText(/^Module posé : /);
  await expect(options.getByRole("combobox", { name: "Tiroirs" })).toHaveValue("4");
  await shot(page, "modules-a-glisser-pose");
  await options.getByRole("combobox", { name: "Tiroirs" }).selectOption("2");
  await expect(page.getByText(/Module modifié/)).toBeVisible();
  await expect(tree.getByText("Façade tiroir 4")).toHaveCount(0);
  await expect(tree.getByText("Façade tiroir 2").first()).toBeVisible();
  await expect(options.getByRole("combobox", { name: "Tiroirs" })).toHaveValue("2");
  // An undo takes the change back: the settings follow.
  await page.keyboard.press("Control+z");
  await expect(options.getByRole("combobox", { name: "Tiroirs" })).toHaveValue("4");

  // Another module chosen in the list: the settings of the next one again; a click on the one laid takes it up.
  await panel.locator('[data-module="long"]').click();
  await expect(options).toHaveAttribute("data-module-options", "next");
  await page.mouse.click(box.x + niche.x, box.y + niche.y);
  await expect(options).toHaveAttribute("data-module-options", "placed");
  await expect(options.getByRole("combobox", { name: "Tiroirs" })).toHaveValue("4");

  // Taken away: its niche is free, the settings of the next one show.
  await options.locator("[data-module-remove]").click();
  await expect(page.getByText(/Module retiré/)).toBeVisible();
  await expect(tree.getByText("Façade tiroir 1")).toHaveCount(0);
  await expect(options).toHaveAttribute("data-module-options", "next");
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});

test("les façades des tiroirs d'un module se choisissent cannelées avant de le glisser, puis à tasseaux une fois posé", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-modules-decor");
  await wall(page);
  const view = page.locator("canvas.cad-view");
  const box = (await view.boundingBox())!;
  const niche = { x: box.width * 0.33, y: box.height * 0.5 };
  const drawers = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; fill?: string; style?: string; pitch?: number }[] } }).document.features.find((f) => f.type === "niche" && f.fill === "drawers"), api);
  };

  await click(page, '[data-workshop="module-palette"]');
  const panel = page.getByRole("dialog", { name: "Modules à glisser" });
  const options = panel.getByRole("group", { name: "Réglages du module" });
  await panel.locator('[data-module="drawers"]').click();
  await options.getByRole("combobox", { name: "Style des façades" }).selectOption("fluted");
  await expect(options.getByRole("textbox", { name: /^Entraxe des cannelures/ })).toBeVisible();
  await panel.locator('[data-module="drawers"]').dragTo(view, { targetPosition: niche });
  await expect(page.getByText(/Niche équipée/)).toBeVisible();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect.poll(drawers, { timeout: 30_000 }).toMatchObject({ style: "fluted", pitch: 30 });

  // Laid: its settings show the style, and change it where it is.
  await expect(options).toHaveAttribute("data-module-options", "placed");
  await expect(options.getByRole("combobox", { name: "Style des façades" })).toHaveValue("fluted");
  await options.getByRole("combobox", { name: "Style des façades" }).selectOption("slats");
  await expect(page.getByText(/Module modifié/)).toBeVisible();
  await expect(options.getByRole("textbox", { name: /^Entraxe des tasseaux/ })).toBeVisible();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect.poll(drawers, { timeout: 30_000 }).toMatchObject({ style: "slats", pitch: 45 });
  await page.waitForTimeout(1200);
  await shot(page, "module-tiroirs-a-tasseaux");
  expect(errors).toEqual([]);
});
