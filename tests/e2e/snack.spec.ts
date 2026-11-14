/** Snack et comptoir : sur l'îlot d'une cuisine proposée, un snack au dos, puis en bar ; ses consoles au devis. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("un snack au dos de l'îlot, ses tabourets, puis en bar ; les consoles au devis", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-snack");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await plan.getByLabel("Îlot", { exact: true }).check();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator("[data-propose]").click();
  const confirm = page.getByRole("button", { name: "Proposer", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByText("Plan de travail I").first()).toBeVisible({ timeout: 60_000 });

  await click(page, '[data-action="snack"]');
  const tool = page.getByRole("dialog", { name: "Snack et comptoir" });
  await expect(tool.getByRole("combobox", { name: "Plan de travail" })).toHaveValue(/.+/);
  await expect(tool).toContainText(/\d+ tabourets? de 65 cm d'assise/);
  await page.waitForTimeout(1500);
  await tool.getByRole("combobox", { name: "Hauteur" }).selectOption("bar");
  await expect(tool).toContainText(/de 75 cm d'assise.*plan à 105 cm/);
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/snack.png` });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const doc = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; name: string; snack?: { height: string } }[] } }).document, api);
  expect(doc.features.find((f) => f.type === "trim" && f.snack)?.snack?.height).toBe("bar");

  await click(page, '[data-workshop="quote"]');
  await expect(page.getByRole("dialog", { name: "Devis" })).toContainText("Console de snack");
  expect(errors).toEqual([]);
});
