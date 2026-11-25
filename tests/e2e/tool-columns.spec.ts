/** La barre à sept colonnes entre le Navigateur et la vue : choisir un outil, le lancer, changer l'ordre, replier et déplier. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("sept colonnes vides au départ, les mêmes dans les trois espaces ; un outil choisi s'y lance, change de place et s'en retire en le glissant dehors ; repliée, une colonne laisse sa place", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-quatre-colonnes");
  // The other tests leave the columns out (helpers.ts): here they are.
  await page.evaluate(() => localStorage.removeItem("cao.tool-columns-off"));
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const bar = page.locator("[data-tool-columns]");
  const column = (i: number) => bar.locator(`[data-tool-column="${i}"]`);
  const tab = (i: number) => page.locator(`[data-tool-column-unfold="${i}"]`);
  const viewLeft = async () => (await page.locator('[data-ref="workspace"]').boundingBox())!.x;
  await expect(bar).toBeVisible();
  await expect(bar.locator("[data-tool-column]")).toHaveCount(7);
  // Empty: the user chooses every tool.
  await expect(bar.locator("[data-tool-column-tool]")).toHaveCount(0);
  // Between the navigator and the view.
  const tree = (await page.locator('[data-ref="panel-tree"]').boundingBox())!;
  const columns = (await bar.boundingBox())!;
  expect(columns.x).toBeGreaterThanOrEqual(tree.x + tree.width - 1);
  const gap = (await viewLeft()) - (columns.x + columns.width);
  expect(gap).toBeGreaterThanOrEqual(-1);

  // The « + » of a column: the tools, found by their name.
  const choose = async (index: number, search: string, key: string) => {
    await column(index).locator("[data-tool-column-add]").click();
    const picker = page.getByRole("dialog", { name: `Outils de la colonne ${index + 1}` });
    await expect(picker).toBeVisible();
    await picker.getByRole("searchbox", { name: "Rechercher un outil" }).fill(search);
    const row = picker.locator(`[data-tool-pick="${key}"]`);
    await row.click();
    await expect(row).toHaveAttribute("aria-checked", "true");
    await shot(page, `colonnes-choix-${index + 1}`);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
  };
  await choose(3, "grille", "data-grid-toggle:");
  await choose(0, "plan de cuisine", "data-workshop:kitchen-plan");
  await choose(0, "caisson", "data-action:cabinet");
  await choose(0, "façades", "data-action:fronts");

  // The order of a column: an icon dragged above another, then Alt + ↓ one place down.
  const order = () => column(0).locator("[data-tool-column-tool]").evaluateAll((icons) => icons.map((i) => (i as HTMLElement).dataset.toolColumnTool));
  expect(await order()).toEqual(["data-workshop:kitchen-plan", "data-action:cabinet", "data-action:fronts"]);
  const fronts = column(0).locator('[data-tool-column-tool="data-action:fronts"]');
  const plan = column(0).locator('[data-tool-column-tool="data-workshop:kitchen-plan"]');
  await fronts.dragTo(plan, { targetPosition: { x: 18, y: 4 } });
  await expect.poll(order).toEqual(["data-action:fronts", "data-workshop:kitchen-plan", "data-action:cabinet"]);
  await shot(page, "colonnes-ordre");
  await fronts.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "data-action:fronts", "data-action:cabinet"]);
  await expect(fronts).toBeFocused();
  // And into another column.
  await column(0).locator('[data-tool-column-tool="data-action:cabinet"]').dragTo(column(5).locator("[data-tool-column-add]"));
  await expect(column(5).locator('[data-tool-column-tool="data-action:cabinet"]')).toBeVisible();
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "data-action:fronts"]);
  // Dragged out of the columns, onto the view: taken out.
  await column(5).locator('[data-tool-column-tool="data-action:cabinet"]').dragTo(page.locator('[data-ref="viewport"]'));
  await expect(column(5).locator("[data-tool-column-tool]")).toHaveCount(0);
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "data-action:fronts"]);

  // Separators from the « + »: a line and an empty place as big as an icon, at the end; the line dragged between the two
  // icons; the empty place taken out by a right-click. They stay after a reload.
  await column(0).locator("[data-tool-column-add]").click();
  const picker = page.getByRole("dialog", { name: "Outils de la colonne 1" });
  await picker.locator('[data-add-separator="line"]').click();
  await picker.locator('[data-add-separator="space"]').click();
  await page.keyboard.press("Escape");
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "data-action:fronts", "sep:line:1", "sep:space:2"]);
  const line = column(0).locator('[data-separator="line"]');
  const space = column(0).locator('[data-separator="space"]');
  const icon = (await plan.boundingBox())!;
  expect(Math.abs((await space.boundingBox())!.height - icon.height)).toBeLessThan(2);
  expect((await line.boundingBox())!.height).toBeLessThan(icon.height / 2);
  await line.dragTo(fronts, { targetPosition: { x: 18, y: 4 } });
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "sep:line:1", "data-action:fronts", "sep:space:2"]);
  await shot(page, "colonnes-separateurs");
  await space.click({ button: "right" });
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "sep:line:1", "data-action:fronts"]);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "sep:line:1", "data-action:fronts"]);

  // Its icons stand in cards, a line the limit between two; « ＋ Carte » adds an empty one, an icon dragged into it
  // goes there; its limit taken out, the two cards are one again.
  const cards = column(0).locator("[data-tool-card]");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator("[data-tool-column-tool]")).toHaveCount(1);
  // A card folds away by its arrow (how many icons it holds is left) and opens again; it stays so after a reload.
  await cards.nth(1).locator("[data-tool-card-fold]").click();
  await expect(cards.nth(1).locator("[data-tool-column-tool]")).toHaveCount(0);
  await expect(cards.nth(1).locator("[data-tool-card-fold]")).toHaveText("▸ 1");
  await expect(cards.nth(0).locator("[data-tool-column-tool]")).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(cards.nth(1).locator("[data-tool-card-fold]")).toHaveAttribute("aria-expanded", "false");
  await shot(page, "colonnes-carte-repliee");
  await cards.nth(1).locator("[data-tool-card-fold]").click();
  await expect(cards.nth(1).locator("[data-tool-column-tool]")).toHaveCount(1);
  await column(0).locator("[data-tool-column-add]").click();
  await page.getByRole("dialog", { name: "Outils de la colonne 1" }).locator('[data-add-separator="line"]').click();
  await page.keyboard.press("Escape");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).locator("[data-tool-column-tool]")).toHaveCount(0);
  await column(0).locator('[data-tool-column-tool="data-action:fronts"]').dragTo(cards.nth(2));
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "sep:line:1", "sep:line:2", "data-action:fronts"]);
  await expect(cards.nth(2).locator('[data-tool-column-tool="data-action:fronts"]')).toBeVisible();
  await shot(page, "colonnes-cartes");
  await column(0).locator('[data-tool-column-tool="sep:line:2"]').click({ button: "right" });
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "sep:line:1", "data-action:fronts"]);
  await expect(cards).toHaveCount(2);

  // Its icon runs the tool itself and shows its state.
  const grid = page.locator('[data-tool-column-tool="data-grid-toggle:"]');
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await grid.click();
  await expect(page.locator("[data-grid-toggle]")).toHaveAttribute("aria-pressed", "false");
  await expect(grid).toHaveAttribute("aria-pressed", "false");

  // The arrow folds the column away: no strip left, the view takes its room; a tab at its edge is all that stays.
  const before = await viewLeft();
  await column(3).locator("[data-tool-column-fold]").click();
  await expect(column(3)).toHaveCount(0);
  await expect(grid).toHaveCount(0);
  await expect(tab(3)).toBeVisible();
  await expect(column(0)).toBeVisible();
  expect(await viewLeft()).toBeLessThan(before - 30);
  await shot(page, "colonnes-repliee");

  // Kept from one visit to the next.
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(tab(3)).toBeVisible();
  await expect(column(3)).toHaveCount(0);
  await expect.poll(order).toEqual(["data-workshop:kitchen-plan", "sep:line:1", "data-action:fronts"]);

  // The same columns in the other spaces, and their tools run there too.
  for (const space of ["dressing", "kitchen"]) {
    await click(page, `[data-ribbon-tab="${space}"]`);
    await expect(page.locator(`[data-ribbon-tab="${space}"]`)).toHaveAttribute("aria-selected", "true");
    await expect(column(0).locator('[data-tool-column-tool="data-workshop:kitchen-plan"]')).toBeVisible();
    await expect(tab(3)).toBeVisible();
  }
  await column(0).locator('[data-tool-column-tool="data-workshop:kitchen-plan"]').click();
  await expect(page.getByRole("dialog", { name: "Plan de cuisine" })).toBeVisible();
  await shot(page, "colonnes-cuisine");

  // The tab opens the column again, with its tool; a right click takes the tool out.
  await tab(3).click();
  await expect(tab(3)).toHaveCount(0);
  await expect(grid).toBeVisible();
  await grid.click({ button: "right" });
  await expect(grid).toHaveCount(0);

  // All seven folded: nothing left beside the navigator.
  for (let i = 0; i < 7; i++) await column(i).locator("[data-tool-column-fold]").click();
  await expect(bar).toBeHidden();
  await expect(page.locator("[data-tool-column-unfold]")).toHaveCount(7);
  expect(await viewLeft()).toBeLessThanOrEqual(tree.x + tree.width + gap + 1);
  await shot(page, "colonnes-toutes-repliees");

  // A narrow screen keeps the view: no columns, no tabs.
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(tab(0)).toBeHidden();
  expect(errors).toEqual([]);
});

test("une fenêtre de 1024 px garde la vue : les colonnes qui n'y tiennent pas attendent à leur onglet, et reviennent quand elle s'élargit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-colonnes-etroit");
  await page.evaluate(() => localStorage.removeItem("cao.tool-columns-off"));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  // The view was 2 px wide before, pushed out by seven empty columns (309 px) beside the panels: now the columns that
  // do not fit beside 200 px of view wait at their tab, and the view has what the panels leave.
  const view = async () => (await page.locator('[data-ref="workspace"]').boundingBox())!.width;
  const shown = await page.locator("[data-tool-columns] [data-tool-column]").count();
  expect(shown).toBeLessThan(7);
  await expect(page.locator("[data-tool-column-unfold]")).toHaveCount(7 - shown);
  expect(await view()).toBeGreaterThan(100);
  // Wider: they all come back (none was folded for good).
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect(page.locator("[data-tool-columns] [data-tool-column]")).toHaveCount(7);
  await expect(page.locator("[data-tool-column-unfold]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
