/** Le ruban réorganisé et les outils qui facilitent la conception, dans un vrai navigateur. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const canvas = (page: Page) => page.locator("canvas.cad-view");

async function cabinet(page: Page) {
  await click(page, '[data-action="cabinet"]');
  await page.waitForTimeout(600);
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const ok = page.getByRole("button", { name: "OK", exact: true }).first();
  if (await ok.isVisible()) await ok.click();
  await page.waitForTimeout(1200);
}

/** A wall of a dressing, seen from the front. */
async function wall(page: Page) {
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button").last().click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "OK", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1000);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(800);
}

test("les onglets Conception 3D, Dressing et Cuisine montrent chacun leurs outils", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await newProject(page, "Ruban e2e");
  const tabs = page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab");
  await expect(tabs).toHaveText(["Conception 3D", "Dressing", "Cuisine"]);
  const groups = () => page.locator('[data-ribbon="model"] > .ribbon-group:visible').evaluateAll((all) => all.map((g) => g.getAttribute("aria-label")));
  expect(await groups()).toEqual(["Créer", "Modifier", "Curic", "Atelier", "Fabrication", "Client"]);
  await expect(page.locator('[data-action="extrude"]')).toBeVisible();

  await tabs.nth(1).click();
  expect(await groups()).toEqual(["Modifier", "Pièce", "Meuble", "Dressing", "Fabrication", "Client"]);
  await expect(page.locator('[data-action="partition"]')).toBeVisible();
  await expect(page.locator('[data-action="extrude"]')).toBeHidden();

  await tabs.nth(2).click();
  expect(await groups()).toEqual(["Modifier", "Pièce", "Cuisine", "Meuble", "Fabrication", "Client"]);
  await expect(page.locator('[data-action="kitchen"]')).toBeVisible();
  await expect(page.locator('[data-action="partition"]')).toBeHidden();

  // The last tab comes back with the page; an esquisse has its own bar, without the tabs.
  await page.reload();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-action="kitchen"]')).toBeVisible();
});

test("un ordre de groupes gardé passe aux nouveaux groupes", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.removeItem("cao.ribbon-groups-3");
      localStorage.setItem("cao.ribbon-order.model", JSON.stringify(["Modifier", "Créer", "Curic", "Atelier", "Menuiserie"]));
      localStorage.setItem("cao.ribbon-hidden.model", JSON.stringify(["data-action:module"]));
    }
  });
  await newProject(page, "Ordre e2e");
  const names = await page.locator('[data-ribbon="model"] > .ribbon-group').evaluateAll((all) => all.map((g) => g.getAttribute("aria-label")));
  expect(names).toEqual(["Modifier", "Pièce", "Cuisine", "Meuble", "Dressing", "Créer", "Curic", "Atelier", "Fabrication", "Client"]);
  await page.getByRole("tab", { name: "Dressing" }).click();
  await expect(page.locator('[data-ribbon="model"] [data-action="module"]')).toBeVisible();
});

test("une cote de pièce et un total de Répartition se changent d'un clic", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Cote e2e");
  await cabinet(page);
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, "[data-piece-dims]");
  const tall = page.locator(".cad-piece-dim[data-editable]").filter({ hasText: /^87$/ }).first();
  await tall.click();
  await page.locator("[data-dim-editor]").fill("90");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cad-piece-dim").filter({ hasText: /^90$/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Annuler" }).click();
  await click(page, "[data-piece-dims]");
  expect(errors).toEqual([]);
});

test("glisser un module dans une niche, et la barre contextuelle d'une niche", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Glisser e2e");
  await wall(page);
  const view = page.locator("canvas.cad-view");
  const box = (await view.boundingBox())!;
  const niche = { x: box.width * 0.33, y: box.height * 0.5 };

  await click(page, '[data-workshop="module-palette"]');
  await page.locator('[data-module="drawers"]').dragTo(view, { targetPosition: niche });
  await expect(page.getByText(/Niche équipée/)).toBeVisible();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);

  await page.mouse.click(box.x + niche.x, box.y + niche.y);
  const bar = page.locator("[data-context-bar]");
  await expect(bar).toContainText("Niche");
  await bar.getByRole("button", { name: "Étagères" }).click();
  await expect(page.getByRole("dialog", { name: "Étagères" })).toBeVisible();
  await expect(bar).toBeHidden();
  expect(errors).toEqual([]);
});

test("le contrôle en direct signale deux caissons qui se chevauchent", async ({ page }) => {
  await newProject(page, "Direct e2e");
  await cabinet(page);
  await cabinet(page);
  const status = page.locator("[data-live-problems]");
  await page.waitForTimeout(1500);
  await expect(status).toBeHidden();
  await page.getByLabel(/^Navigateur : corps/).getByText("Caisson 1", { exact: true }).first().click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, "[data-piece-dims]");
  await page.locator(".cad-piece-dim[data-editable]").filter({ hasText: /^56,4$/ }).first().click();
  await page.locator("[data-dim-editor]").fill("150");
  await page.keyboard.press("Enter");
  await expect(status).toBeVisible({ timeout: 8000 });
  await expect(status).toContainText("à vérifier");
  await click(page, '[data-workshop="live-check"]');
  await expect(status).toBeHidden();
  await click(page, '[data-workshop="live-check"]');
  await expect(status).toBeVisible();
});

test("variantes : gardées avec leur prix, comparées, rouvertes, enregistrées avec le projet", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Variantes e2e");
  await cabinet(page);
  await click(page, '[data-workshop="variants"]');
  await page.getByLabel("Nom de la variante").fill("Chêne");
  await page.getByRole("button", { name: "Garder cette version" }).click();
  await expect(page.getByText("Variante gardée : Chêne.")).toBeVisible();
  const cards = page.getByRole("list", { name: "Variantes" }).getByRole("listitem");
  await expect(cards).toHaveCount(2);
  await page.keyboard.press("Escape");

  const parts = () => page.getByLabel(/^Navigateur : corps/).getByText("Caisson 2").first();
  await cabinet(page);
  await expect(parts()).toBeVisible();
  await click(page, '[data-workshop="variants"]');
  await expect(cards.filter({ hasText: "Chêne" })).toContainText("par rapport au projet en cours");
  await cards.filter({ hasText: "Chêne" }).getByRole("button", { name: "Ouvrir" }).click();
  await expect(parts()).toHaveCount(0);

  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Navigateur : corps/).getByText("Caisson 1").first()).toBeVisible();
  await click(page, '[data-workshop="variants"]');
  await expect(cards).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("Façades pose une porte sur une case de Répartition, module compris", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Façades e2e");
  await wall(page);
  const view = page.locator("canvas.cad-view");
  const box = (await view.boundingBox())!;
  const niche = { x: box.width * 0.33, y: box.height * 0.5 };
  const tree = page.getByLabel(/^Navigateur : corps/);

  await click(page, '[data-workshop="module-palette"]');
  await page.locator('[data-module="drawers"]').dragTo(view, { targetPosition: niche });
  await expect(page.getByText(/Niche équipée/)).toBeVisible();
  await page.getByRole("dialog", { name: "Modules à glisser" }).getByRole("button", { name: "Terminer" }).click();

  await click(page, '[data-action="fronts"]');
  const fronts = page.getByRole("dialog", { name: "Façades" });
  await expect(fronts).toBeVisible();
  await page.mouse.click(box.x + niche.x, box.y + niche.y);
  await expect(page.getByText(/Porte posée sur la case/)).toBeVisible();
  await expect(tree.getByText("Porte 1", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("Porte 2", { exact: true })).toHaveCount(0);

  await fronts.getByRole("button", { name: "Toutes les cases" }).click();
  await expect(tree.getByText("Porte 4", { exact: true }).first()).toBeVisible();
  await fronts.getByLabel("Style des portes").selectOption("frame");
  await page.waitForTimeout(800);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await fronts.getByRole("button", { name: "Aucune porte" }).click();
  await expect(tree.getByText("Porte 1", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
