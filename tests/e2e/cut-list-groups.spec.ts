/** La liste de débit rangée en listes : par type d'élément, par bois, par épaisseur, par type et épaisseur. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("la liste de débit se range par type d'élément, par bois, par épaisseur, ou par type et épaisseur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-listes-debit");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (const unit of ["base-bas-2-portes-1000", "base-bas-1-porte-600"]) await plan.locator(`[data-add="${unit}"]`).click();
  await plan.locator("[data-run-ok]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Terminer" }).click();

  await click(page, '[data-workshop="cutlist"]');
  const list = page.getByRole("dialog", { name: "Liste de débit" });
  const titles = () => list.locator(".cut-group:not([hidden]) h3").allInnerTexts().then((all) => all.map((t) => t.replace(/\s+/g, " ").trim()));
  const pieces = async () => Number(((await list.locator(".cut-facts dd").first().innerText()).match(/\d+/) ?? ["0"])[0]);
  const total = await pieces();
  expect(total).toBeGreaterThan(10);
  // As it comes: one list per material and thickness.
  const grouping = list.getByLabel("Listes par");
  await expect(grouping).toHaveValue("material");
  const byMaterial = await titles();

  // By kind of piece: sides, tops, shelves, doors… each its list, no part lost.
  await grouping.selectOption("kind");
  const kinds = await titles();
  expect(kinds).toEqual(expect.arrayContaining(["Côté", "Dessous", "Dessus", "Étagère", "Fond", "Porte"]));
  expect(kinds).not.toEqual(byMaterial);
  const count = async () => (await list.locator(".cut-group td.cut-qty").allInnerTexts()).reduce((sum, t) => sum + Number(t), 0);
  expect(await count()).toBe(total);
  const sides = list.locator('[data-cut-group="Côté"]');
  await expect(sides.locator("header p")).toContainText("4 pièces");
  await expect(sides.locator("thead")).toContainText("Matière");
  await shot(page, "listes-par-type");

  // By kind and thickness at once: the thickness in each heading.
  await grouping.selectOption("kind-thickness");
  expect((await titles()).some((t) => /^Côté\s*\d/.test(t))).toBe(true);
  expect(await count()).toBe(total);
  // By thickness, by wood.
  await grouping.selectOption("thickness");
  expect((await titles()).every((t) => /^Épaisseur\s*\d/.test(t))).toBe(true);
  await grouping.selectOption("wood");
  expect(await count()).toBe(total);
  expect((await titles()).length).toBeLessThanOrEqual(byMaterial.length);

  // The filter still works on the lists; the choice is kept when the list is opened again.
  await grouping.selectOption("kind");
  await list.getByLabel("Filtrer la liste de débit").fill("étagère");
  expect(await titles()).toEqual(["Étagère"]);
  await list.getByRole("button", { name: "Fermer" }).first().click();
  await click(page, '[data-workshop="cutlist"]');
  await expect(list.getByLabel("Listes par")).toHaveValue("kind");
  expect(errors).toEqual([]);
});
