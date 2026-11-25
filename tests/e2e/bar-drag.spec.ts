/** Glisser les icônes d'une barre à l'autre, ou hors des barres pour les enlever ; « Tout ouvrir » dans la colonne de droite. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("une icône du ruban glissée dans une colonne, sur la colonne de droite, dans Mes outils, hors des barres et de retour au ruban", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 900 });
  await newProject(page, "zz-glisser-barres");
  await page.evaluate(() => localStorage.removeItem("cao.tool-columns-off"));
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const view = page.locator('[data-ref="viewport"]');
  const ribbonExtrude = page.locator('[data-ribbon="model"] .ribbon-row > [data-action="extrude"]');
  const column = page.locator('[data-tool-column="0"]');
  const side = page.locator("[data-side-tools]");
  await expect(ribbonExtrude).toBeVisible();

  // From the ribbon into a column: it stays in the ribbon too.
  await ribbonExtrude.dragTo(column.locator("[data-tool-column-add]"));
  await expect(column.locator('[data-tool-column-tool="data-action:extrude"]')).toBeVisible();
  await expect(ribbonExtrude).toBeVisible();

  // From the column onto the column beside the view: it moves there, and runs the tool.
  await column.locator('[data-tool-column-tool="data-action:extrude"]').dragTo(side.locator("[data-side-add]"));
  const proxy = side.locator('[data-side-extra-tool="data-action:extrude"]');
  await expect(proxy).toBeVisible();
  await expect(column.locator("[data-tool-column-tool]")).toHaveCount(0);
  await shot(page, "glisser-colonne-droite");

  // Out of the bars: it leaves the column beside the view; one of its own (Rayons X) is put away, and its « + » brings it back.
  await proxy.dragTo(view);
  await expect(proxy).toHaveCount(0);
  await side.locator("[data-xray]").dragTo(view);
  await expect(side.locator("[data-xray]")).toBeHidden();
  await side.locator("[data-side-add]").click();
  const picker = page.getByRole("dialog", { name: "Sélection et vue : choisir les outils" });
  await picker.getByRole("searchbox", { name: "Rechercher un outil" }).fill("rayons");
  await picker.locator('[data-tool-pick="data-xray:"]').click();
  await page.keyboard.press("Escape");
  await expect(side.locator("[data-xray]")).toBeVisible();

  // Into Mes outils, then out of it.
  const favorites = page.locator('[data-favorites="model"]');
  await ribbonExtrude.dragTo(favorites);
  const favorite = favorites.locator('[data-favorite-tool="data-action:extrude"]');
  await expect(favorite).toBeVisible();
  await favorite.dragTo(view);
  await expect(favorite).toHaveCount(0);

  // Out of the ribbon: put away in its group's menu; dragged back from a column, shown again.
  await ribbonExtrude.dragTo(column.locator("[data-tool-column-add]"));
  await ribbonExtrude.dragTo(view);
  await expect(ribbonExtrude).toBeHidden();
  await column.locator('[data-tool-column-tool="data-action:extrude"]').dragTo(page.locator('[data-ribbon="model"]'));
  await expect(ribbonExtrude).toBeVisible();
  await expect(column.locator("[data-tool-column-tool]")).toHaveCount(0);

  // Remembered.
  await side.locator("[data-select-window]").dragTo(view);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(side.locator("[data-select-window]")).toBeHidden();
  await expect(side.locator("[data-xray]")).toBeVisible();
  expect(errors).toEqual([]);
});

test("« Tout ouvrir » sort les tiroirs d'un bureau, un second clic les rentre", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-tout-ouvrir");
  const button = page.locator("[data-open-all]");
  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("desk");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bureau 1 » posé")).toBeVisible();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(800);

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  await shot(page, "tout-ouvrir");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("ranger les icônes dans leur barre : le ruban (même d'un groupe à l'autre) et la colonne de droite, gardé", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 900 });
  await newProject(page, "zz-ranger-icones");
  const keys = (selector: string) => page.locator(selector).evaluateAll((bs) => bs.filter((b) => !(b as HTMLElement).hidden).map((b) => (b as HTMLElement).dataset.action ?? (b as HTMLElement).getAttribute("aria-label")));
  const ribbon = page.locator('[data-ribbon="model"]');
  const modify = '[data-ribbon="model"] .ribbon-group[aria-label="Modifier"]:not([hidden]) .ribbon-row > button';
  const before = await keys(modify);
  // The third icon dropped on the left half of the first: it goes first.
  const first = ribbon.locator(".ribbon-group[aria-label='Modifier'] .ribbon-row > button:visible").first();
  await ribbon.locator(".ribbon-group[aria-label='Modifier'] .ribbon-row > button:visible").nth(2).dragTo(first, { targetPosition: { x: 3, y: 10 } });
  expect(await keys(modify)).toEqual([before[2], before[0], before[1], ...before.slice(3)]);
  // Into another group: on « Créer »'s first icon.
  const create = ribbon.locator(".ribbon-group[aria-label='Créer'] .ribbon-row > button:visible").first();
  await ribbon.locator(".ribbon-group[aria-label='Modifier'] .ribbon-row > button:visible").first().dragTo(create, { targetPosition: { x: 3, y: 10 } });
  expect((await keys('[data-ribbon="model"] .ribbon-group[aria-label="Créer"] .ribbon-row > button'))[0]).toBe(before[2]);

  // The column beside the view: Rayons X above « Tout ouvrir », in their box « Voir dedans ».
  const side = page.locator("[data-side-tools]");
  await side.locator("[data-xray]").dragTo(side.locator("[data-open-all]"), { targetPosition: { x: 10, y: 2 } });
  const vue = side.locator('[role="group"][aria-label="Voir dedans"] > button');
  await expect(vue.first()).toHaveAttribute("data-xray", "");
  // Onto an icon of another card (the grid, in « Affichage »): it goes into that card, and stays there.
  await side.locator("[data-open-all]").dragTo(side.locator("[data-grid-toggle]"), { targetPosition: { x: 10, y: 2 } });
  const shown = side.locator('[role="group"][aria-label="Affichage"] > button');
  await expect(shown.first()).toHaveAttribute("data-open-all", "");

  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect((await keys('[data-ribbon="model"] .ribbon-group[aria-label="Créer"] .ribbon-row > button'))[0]).toBe(before[2]);
  expect(await keys(modify)).toEqual([before[0], before[1], ...before.slice(3)]);
  await expect(vue.first()).toHaveAttribute("data-xray", "");
  await expect(shown.first()).toHaveAttribute("data-open-all", "");
  expect(errors).toEqual([]);
});
