/** « Prolonger élément » sur une pièce qui n'est ni un caisson ni une Répartition : une plinthe du Plan de cuisine. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("prolonger élément : la face d'une plinthe de cuisine tirée jusqu'au plan d'une autre pièce", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-prolonger-plinthe");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await plan.locator('[data-add="base-bas-2-portes-1000"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);

  await click(page, '[data-action="extend-element"]');
  const tool = page.getByRole("dialog", { name: "Prolonger élément" });
  await expect(tool).toContainText("1. Cliquez la face à prolonger");
  // The front of the plinth, under the doors; then the front of the worktop, 2,1 cm before it.
  await page.mouse.click(430, 735);
  await expect(tool).toContainText("À prolonger : « Plinthe A »");
  await page.mouse.click(470, 596);
  // Shown first, kept by OK.
  await expect(tool.locator("[data-extend-result]")).toContainText(/« Plinthe A » prolongé de 2,1 cm jusqu'à « Plan de travail A », qu'il suivra/);
  await expect(tool.locator("[data-extend-ok]")).toBeEnabled({ timeout: 30_000 });
  await tool.locator("[data-extend-ok]").click();
  await expect(page.getByText(/« Plinthe A » prolongé de 2,1 cm jusqu'à « Plan de travail A »/).first()).toBeVisible();
  await expect(tool).toHaveCount(0);
  // An operation on the plinth, to change or take away like any other.
  await expect(page.getByRole("textbox", { name: "Nom", exact: true })).toHaveValue("Prolongement 1");
  await expect(page.getByLabel(/^Distance/).first()).toHaveValue("2,1");
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/prolonger-plinthe.png` });
  expect(errors).toEqual([]);
});
