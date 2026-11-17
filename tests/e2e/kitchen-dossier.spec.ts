/** Le dossier de cuisine dans un vrai navigateur : plan en L proposé, puis plan coté, élévations et liste en PDF. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("dossier de cuisine : plan coté, élévations et liste, téléchargés en PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-dossier-cuisine");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible({ timeout: 60_000 });
  await tool.locator("[data-kitchen-dossier-open]").click();
  const dossier = page.locator("[data-kitchen-dossier]");
  await expect(dossier.locator("[data-dossier-page]")).toHaveCount(4);
  await expect(dossier).toContainText("Plan de la cuisine");
  await shot(page, "dossier");
  await dossier.locator("[data-dossier-page]").nth(1).scrollIntoViewIfNeeded();
  await shot(page, "dossier-elevation");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Fichier PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/dossier de cuisine\.pdf$/);
  expect(errors).toEqual([]);
});
