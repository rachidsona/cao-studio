/** Inventaire du client : la garde-robe tapée, comparée au dressing posé ; ce qui manque, les modules à ajouter. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("la garde-robe du client comparée au dressing posé : ce qui manque et les modules", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-inventaire");
  await click(page, '[data-workshop="dressing-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de dressing" });
  await plan.getByRole("button", { name: "Droit", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.getByRole("button", { name: "Remplir selon les besoins" }).click();
  await plan.getByLabel("Penderie longue (m)").fill("0,9");
  await plan.getByLabel("Penderie courte (m)").fill("0");
  await plan.getByLabel("Chaussures (paires)").fill("0");
  await plan.getByLabel("Tiroirs", { exact: true }).fill("3");
  await plan.getByLabel("Étagères (m)").fill("0");
  await plan.getByRole("button", { name: "Poser les modules" }).click();
  await expect(page.getByText("Modules posés sur 1 zone.")).toBeVisible();
  await page.waitForTimeout(1500);

  await click(page, '[data-workshop="inventory"]');
  const tool = page.getByRole("dialog", { name: "Inventaire du client" });
  // Nothing typed: nothing missing.
  await expect(tool.locator("[data-inventory-ok]")).toBeVisible();
  await tool.getByRole("spinbutton", { name: "Chemises, chemisiers" }).fill("40");
  await tool.getByRole("spinbutton", { name: "Manteaux" }).fill("4");
  await tool.getByRole("spinbutton", { name: "Pulls et t-shirts pliés" }).fill("30");
  const text = tool.locator("[data-inventory-result]");
  // 40 shirts: 1,2 m of short hanging, none drawn; the coats fit in the long one drawn.
  await expect(text).toContainText("Penderie courte");
  await expect(tool.locator("[data-inventory-proposal]")).toContainText("Double penderie");
  await expect(tool.locator("[data-inventory-fill]")).toContainText("penderie courte 1,4 m");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/inventaire.png` });
  expect(errors).toEqual([]);
});
