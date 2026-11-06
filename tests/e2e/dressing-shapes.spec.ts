/** Les formes du Plan de dressing dans un vrai navigateur : rampant, angle arrondi et îlot, jusqu'aux vrais panneaux. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

/** A plan of this model, every zone made with its Répartition. */
async function planOf(page: Page, name: string, set?: (tool: ReturnType<Page["getByRole"]>) => Promise<void>) {
  const open = () => page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="dressing-plan"]')?.click());
  await open();
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name, exact: true }).click();
  await set?.(tool);
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  const zones = tool.getByRole("list", { name: "Zones du plan" });
  await expect(zones).toBeVisible();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  const count = await zones.getByRole("listitem").count();
  for (let i = 0; i < count; i++) {
    await zones.getByRole("listitem").nth(i).getByRole("button").last().click();
    await partition.getByRole("button", { name: "OK", exact: true }).click();
    await expect(partition).toHaveCount(0);
    await page.waitForTimeout(800);
    await open();
    await expect(zones).toBeVisible();
  }
  return tool;
}

test("rampant : pas de dessus à plat, une planche en pente, et rien au-dessus", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Rampant e2e");
  const tool = await planOf(page, "Droit", async (t) => {
    await t.getByLabel("Rampant").selectOption({ label: "Bas à gauche" });
  });
  await expect(page.getByText("Mur A — dessus", { exact: true }).first()).toBeVisible();
  await tool.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText("Dessus", { exact: true })).toHaveCount(0);
  await page.getByText("Mur A — dessus", { exact: true }).first().click();
  await expect(page.locator("[data-ref=status-selection], [data-ref=selection-status]").first()).not.toHaveText("Aucune sélection");
  expect(errors).toEqual([]);
});

test("angle arrondi : la porte cintrée se pose, le plan change avec elle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Arrondi e2e");
  const tool = await planOf(page, "En L à droite, angle arrondi");
  await tool.getByLabel("Porte cintrée sur l'arrondi").check();
  await expect(page.getByText("Angle droit — porte cintrée", { exact: true }).first()).toBeVisible();
  await tool.getByRole("button", { name: "Modifier le plan" }).click();
  await tool.getByLabel(/^Angle sur le mur A/).fill("120");
  await tool.getByLabel(/^Angle sur le mur A/).press("Enter");
  await tool.getByRole("button", { name: "Appliquer" }).click();
  await expect(tool.getByRole("list", { name: "Zones du plan" })).toBeVisible();
  await expect(page.getByText("Angle droit — porte cintrée", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("îlot : une zone de plus, refusée quand elle touche un autre linéaire", async ({ page }) => {
  await newProject(page, "Îlot e2e");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="dressing-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En U presque fermé, entrée à droite", exact: true }).click();
  await tool.getByLabel("Îlot central").check();
  await expect(tool).toContainText("L'îlot touche");
  await expect(tool.getByRole("button", { name: "Créer le plan" })).toBeDisabled();
  await tool.getByLabel(/^Longueur mur B/).fill("400");
  await tool.getByLabel(/^Longueur mur B/).press("Enter");
  await expect(tool.getByRole("button", { name: "Créer le plan" })).toBeEnabled();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await expect(tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem")).toHaveCount(5);
  await expect(tool.getByRole("list", { name: "Zones du plan" })).toContainText("Îlot");
});

test("angle droit : le mur B passe, le mur A s'arrête contre lui, et les panneaux suivent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Angle e2e");
  const tool = await planOf(page, "En U", async (t) => {
    await t.getByLabel("Angle gauche").selectOption({ label: "Mur B passe" });
    await expect(t.getByRole("img", { name: "Schéma du plan vu de dessus" })).toContainText("240 cm");
    await expect(t.getByRole("img", { name: "Schéma du plan vu de dessus" })).toContainText("200 cm");
  });
  await tool.getByRole("button", { name: "Modifier le plan" }).click();
  await expect(tool.getByLabel("Angle gauche")).toHaveValue("1");
  await tool.getByLabel("Angle gauche").selectOption({ label: "Mur A passe" });
  await tool.getByRole("button", { name: "Appliquer" }).click();
  await expect(tool.getByRole("list", { name: "Zones du plan" })).toContainText("Mur A · 300 cm");
  await expect(tool.getByRole("list", { name: "Zones du plan" })).toContainText("Mur B · 140 cm");
  expect(errors).toEqual([]);
});
