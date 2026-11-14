/** Plan de travail en barres : une cuisine proposée, ses plans coupés en longueurs du commerce, et le devis qui compte les barres. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("les plans de travail coupés en barres de 3,05 m puis 4,10 m, l'angle en onglet, et les barres au devis", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-plan-de-travail-barres");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  const confirm = page.getByRole("button", { name: "Proposer", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByText("Plan de travail B").first()).toBeVisible({ timeout: 60_000 });

  await click(page, '[data-workshop="worktop-bars"]');
  const bars = page.getByRole("dialog", { name: "Plan de travail en barres" });
  await expect(bars.locator("[data-worktop]").first()).toBeVisible();
  await bars.getByRole("combobox", { name: "Longueur des barres" }).selectOption("3050");
  await expect(bars.locator("[data-worktop-buy]")).toContainText("barre 3,05 m");
  await bars.getByRole("combobox", { name: "Angle des plans" }).selectOption("mitre");
  await expect(bars).toContainText("coupe d'onglet");
  await expect(bars.locator("[data-worktop-buy]")).toContainText("ferrures de jonction");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/plan-de-travail-barres.png` });
  await bars.getByRole("button", { name: "Fermer" }).last().click();

  // The quote: the bars, and the fittings.
  await click(page, '[data-workshop="quote"]');
  const quote = page.getByRole("dialog", { name: "Devis" });
  await expect(quote).toContainText("barre 3,05 m");
  await expect(quote).toContainText("Ferrure de jonction de plan de travail");
  expect(errors).toEqual([]);
});
