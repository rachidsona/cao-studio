/** Un meuble du Plan de cuisine supprimé dans la 3D : sa place est libre sur le linéaire, un autre la prend. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("supprimer un meuble dans la 3D libère sa place ; un autre meuble la prend, ses voisins ne bougent pas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-supprimer-meuble");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (let i = 0; i < 3; i++) await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  const cabinets = async () => {
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    const features = project.document.features as { type: string; name: string; origin?: number[] }[];
    return features.filter((f) => f.type === "cabinet").map((f) => [f.name.replace(/ \(A\d\)$/, ""), Math.round(f.origin![0]!)]);
  };
  await page.keyboard.press("Control+s");
  expect(await cabinets()).toEqual([["Bas 2 portes 1000", 0], ["Bas 2 portes 1000", 1000], ["Bas 2 portes 1000", 2000]]);

  // The middle unit chosen whole in the browser, then « Supprimer ».
  await page.locator('[data-head^="group:"]').filter({ hasText: "Bas 2 portes 1000 (A2)" }).first().click();
  await expect(page.getByRole("toolbar", { name: "Caisson sélectionné" })).toContainText("Bas 2 portes 1000 (A2)");
  await page.locator("canvas.cad-view").focus().catch(() => {});
  await page.keyboard.press("Delete");
  await page.waitForTimeout(600);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/supprimer-1.png` });
  for (let i = 0; i < 2; i++) {
    const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1500);
  await page.keyboard.press("Control+s");
  // Gone, its neighbours where they were; the run keeps its place, free.
  expect(await cabinets()).toEqual([["Bas 2 portes 1000", 0], ["Bas 2 portes 1000", 2000]]);
  await click(page, '[data-workshop="kitchen-plan"]');
  await tool.locator('[data-open-run="A"]').click();
  const space = tool.locator('[data-fold="space"]');
  await expect(space).toContainText("100 cm + 60 cm libres en bas");

  // Another unit added: it goes in that place.
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await expect(space).toContainText("60 cm libres en bas");
  await expect(space).not.toContainText("100 cm +");
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Control+s");
  expect((await cabinets()).map(([, x]) => x).sort((a, b) => Number(a) - Number(b))).toEqual([0, 1000, 2000]);
  expect(errors).toEqual([]);
});
