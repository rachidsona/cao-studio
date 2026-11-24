/** « Isoler la sélection » : plusieurs éléments choisis restent seuls dans la vue, pour y travailler. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("deux caissons choisis, isolés par le bouton, puis tout montré ; la touche I et le clic droit aussi", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-isoler-selection");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (let i = 0; i < 3; i++) await plan.locator('[data-add="base-bas-2-portes-1000"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "isoler-avant");

  // Nothing selected: the button says what to do.
  const bar = page.locator("[data-zone-isolated]");
  await click(page, "[data-isolate-selection]");
  await expect(page.getByText(/Sélectionnez d'abord les éléments à isoler/).first()).toBeVisible();
  await expect(bar).toHaveCount(0);

  // The first unit, then the second with Maj: the two alone in the view.
  await page.mouse.click(430, 660);
  await page.keyboard.down("Shift");
  await page.mouse.click(600, 660);
  await page.keyboard.up("Shift");
  await click(page, "[data-isolate-selection]");
  await expect(bar).toContainText("2 éléments isolés");
  await expect(page.locator("[data-isolate-selection]")).toHaveAttribute("aria-pressed", "true");
  const shown = Number(await bar.getAttribute("data-shown"));
  expect(shown).toBeGreaterThan(8);
  if (process.env.SHOTS) await page.waitForTimeout(7000);
  await shot(page, "isoler-deux");

  // The key I with nothing selected: all back.
  await page.keyboard.press("Escape");
  await page.keyboard.press("i");
  await expect(bar).toHaveCount(0);
  await expect(page.locator("[data-isolate-selection]")).toHaveAttribute("aria-pressed", "false");

  // One unit, by the right click: it alone, fewer bodies than the two.
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await page.mouse.click(430, 660);
  await page.mouse.click(430, 660, { button: "right" });
  // First in the menu: « Modifier la sélection », the tool that made the unit.
  await expect(page.getByRole("menuitem").first()).toHaveText("Modifier la sélection");
  await page.getByRole("menuitem", { name: "Isoler la sélection" }).click();
  await expect(bar).toContainText(/« Bas 2 portes 1000 \(A1\) » isolé/);
  const unit = Number(await bar.getAttribute("data-shown"));
  expect(unit).toBeLessThan(shown);
  // Inside it, a piece chosen and isolated again: that piece alone.
  // (A face picked: one piece, not the whole unit a click would take.)
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-select-filter="face"]')?.click());
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await page.keyboard.press("i");
  await expect.poll(async () => Number(await bar.getAttribute("data-shown"))).toBe(1);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-select-filter="auto"]')?.click());
  await bar.getByRole("button", { name: "Tout montrer" }).click();
  await expect(bar).toHaveCount(0);
  // « Modifier la sélection » on a unit of the Plan de cuisine: the plan on its run, the unit chosen, « Meuble choisi » open.
  await page.mouse.click(430, 660);
  await page.mouse.click(430, 660, { button: "right" });
  await page.getByRole("menuitem", { name: "Modifier la sélection" }).click();
  await expect(plan.locator('[data-fold="chosen"]')).toContainText("Bas 2 portes", { timeout: 30_000 });
  await expect(plan.locator('[data-fold="chosen"]')).toHaveAttribute("aria-expanded", "true");
  expect(errors).toEqual([]);
});

test("« Cacher la sélection » : deux pièces cachées d'un coup (pas leurs caissons), listées par meuble, montrées une à une puis toutes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-cacher-selection");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (let i = 0; i < 3; i++) await plan.locator('[data-add="base-bas-2-portes-1000"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  const button = page.locator("[data-hide-selection]");

  // Nothing hidden, nothing selected: the button says what to do.
  await button.click();
  await expect(page.getByText(/Sélectionnez d'abord ce qu'il faut cacher/).first()).toBeVisible();
  await expect(button).toHaveAttribute("data-count", "0");

  // Two units: hidden at once, the count on the button.
  await page.mouse.click(430, 660);
  await page.keyboard.down("Shift");
  await page.mouse.click(600, 660);
  await page.keyboard.up("Shift");
  await button.click();
  await expect(page.getByText(/2 éléments cachés/).first()).toBeVisible();
  await expect(button).toHaveAttribute("data-count", "2", { timeout: 30_000 });
  // Only the two pieces clicked, not the whole cabinets: no cabinet hidden, two pieces in the hidden list.
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const saved = (await page.evaluate(async (url) => (await (await fetch(url, { headers: { Accept: "application/json" } })).json()).document, api)) as { hiddenBodies?: string[]; features: { type: string; hidden?: boolean }[] };
  expect(saved.hiddenBodies ?? []).toHaveLength(2);
  expect(saved.features.filter((f) => f.type === "cabinet" && f.hidden)).toHaveLength(0);

  // The list, one line per unit: one shown again, then all.
  await button.click();
  const list = page.getByRole("menu", { name: "Éléments cachés" });
  await expect(list.locator("[data-show-hidden]")).toHaveCount(2);
  await shot(page, "cacher-liste");
  await list.locator("[data-show-hidden]").first().click();
  await expect(button).toHaveAttribute("data-count", "1", { timeout: 30_000 });
  await expect(list.locator("[data-show-hidden]")).toHaveCount(1);
  await list.locator("[data-show-all-hidden]").click();
  await expect(button).toHaveAttribute("data-count", "0", { timeout: 30_000 });
  await expect(list).toHaveCount(0);

  // « Tout montrer » is one undo step: Ctrl + Z hides that one again.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveAttribute("data-count", "1", { timeout: 30_000 });
  expect(errors).toEqual([]);
});
