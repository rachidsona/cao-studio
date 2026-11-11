/** Le plan de travail et la crédence s'arrêtent aux meubles : rien au-dessus de la place libre du mur. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("le plan de travail suit les meubles du linéaire, puis s'allonge avec eux", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-plan-suit-meubles");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (const unit of ["base-bas-2-portes-1000", "base-bas-1-porte-600"]) await plan.locator(`[data-add="${unit}"]`).click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/plan-suit-meubles.png` });

  // A wall of 360 cm with 160 cm of units: the worktop and the splashback are 160 cm long, not 360.
  const lengthOf = async (piece: string) => {
    await click(page, '[data-workshop="cutlist"]');
    const list = page.getByRole("dialog", { name: "Liste de débit" });
    await list.getByLabel("Filtrer la liste de débit").fill(piece);
    const length = await list.locator("tr[data-row]:not([hidden]) td[data-label='Longueur']").first().innerText();
    await list.getByRole("button", { name: "Fermer" }).first().click();
    return length.trim();
  };
  expect(await lengthOf("plan de travail")).toBe("160");
  expect(await lengthOf("crédence")).toBe("160");

  // One more unit: the worktop goes on over it.
  await click(page, '[data-workshop="kitchen-plan"]');
  await plan.locator('[data-open-run="A"]').click();
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await plan.locator('[data-add="base-bas-2-portes-1000"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  // Stored a moment after the unit is added (the message of the first one may still show): until it is.
  await expect.poll(() => lengthOf("plan de travail"), { timeout: 60_000 }).toBe("260");
  expect(errors).toEqual([]);
});
