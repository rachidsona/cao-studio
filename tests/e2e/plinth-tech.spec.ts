/** Plinthe technique : sur une cuisine proposée, grilles et tiroirs de plinthe appliqués, construits sans erreur, au devis ; puis retirés. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("grilles et tiroirs de plinthe sur la cuisine proposée, au devis, puis retirés", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-plinthe-technique");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator("[data-propose]").click();
  const confirm = page.getByRole("button", { name: "Proposer", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByText("Plan de travail B").first()).toBeVisible({ timeout: 60_000 });
  const status = page.locator('[data-ref="status-recompute"]');

  await click(page, '[data-workshop="plinth-tech"]');
  const tool = page.getByRole("dialog", { name: "Plinthe technique" });
  await tool.getByRole("checkbox", { name: "Tiroirs de plinthe" }).check();
  await tool.getByRole("button", { name: "Appliquer" }).click();
  await expect(page.getByText(/tiroirs? de plinthe sous les meubles bas/).first()).toBeVisible();
  await expect(page.getByText(/Plinthe technique|Tiroir de plinthe 1/).first()).toBeAttached();
  await expect(status).not.toContainText("erreur", { timeout: 60_000 });
  if (process.env.SHOTS) {
    await click(page, '[data-action="view"][data-view="front"]');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${process.env.SHOTS}/plinthe-technique.png` });
  }
  await click(page, '[data-workshop="quote"]');
  const quote = page.getByRole("dialog", { name: "Devis" });
  await expect(quote).toContainText("Coulisses de tiroir de plinthe (paire)");
  await quote.getByRole("button", { name: "Fermer", exact: true }).first().click();

  // Unticked, applied: taken away, the plinths given back.
  await click(page, '[data-workshop="plinth-tech"]');
  await tool.getByRole("checkbox", { name: "Grilles d'aération" }).uncheck();
  await tool.getByRole("checkbox", { name: "Tiroirs de plinthe" }).uncheck();
  await tool.getByRole("button", { name: "Appliquer" }).click();
  await expect(page.getByText("Plinthe technique retirée : les plinthes sont rendues.")).toBeVisible();
  expect(errors).toEqual([]);
});
