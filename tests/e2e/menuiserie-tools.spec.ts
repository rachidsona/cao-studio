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
  const ok = page.getByRole("button", { name: "Fermer", exact: true }).first();
  if (await ok.isVisible()) await ok.click();
  await page.waitForTimeout(1200);
}

/** A wall of a dressing, seen from the front. */
async function wall(page: Page) {
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button", { name: /^(Modifier|Répartition)$/ }).click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "Fermer", exact: true }).click();
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
  expect(await groups()).toEqual(["Créer", "Modifier", "Atelier", "Fabrication", "Client"]);
  await expect(page.locator('[data-action="extrude"]')).toBeVisible();

  await tabs.nth(1).click();
  expect(await groups()).toEqual(["Modifier", "Pièce", "Dressing", "Fabrication", "Client"]);
  await expect(page.locator('[data-action="partition"]')).toBeVisible();
  await expect(page.locator('[data-action="extrude"]')).toBeHidden();
  await expect(page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]')).toBeVisible();
  await expect(page.getByRole("group", { name: "Dressing" }).locator('[data-action="trim"]')).toBeVisible();

  await tabs.nth(2).click();
  expect(await groups()).toEqual(["Modifier", "Pièce", "Cuisine", "Meuble", "Fabrication", "Client"]);
  await expect(page.locator('[data-action="kitchen"]')).toBeVisible();
  await expect(page.locator('[data-action="partition"]')).toBeHidden();

  // The last tab comes back with the page; an esquisse has its own bar, without the tabs.
  await page.reload();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-action="kitchen"]')).toBeVisible();
});

test("Dressing et Cuisine : chacun sa barre de favoris, ses outils de départ, et son plan à droite", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Onglets e2e");
  const tabs = page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab");
  const bar = page.locator('[data-favorites^="model"]');
  await expect(bar).toHaveAttribute("data-favorites", "model");
  // Dressing: its own bar, with its tools, and the Plan de dressing at the right.
  await tabs.nth(1).click();
  await expect(bar).toHaveAttribute("data-favorites", "model-dressing");
  await expect(bar.getByRole("button", { name: "Plan de dressing" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Répartition" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Plan de dressing" })).toBeVisible();
  // Cuisine: the same, its own.
  await tabs.nth(2).click();
  await expect(bar).toHaveAttribute("data-favorites", "model-kitchen");
  await expect(bar.getByRole("button", { name: "Électroménager" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Répartition" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Plan de cuisine" })).toBeVisible();
  // A tool taken out of the kitchen's bar stays out of it; the dressing's keeps its own.
  await bar.getByRole("button", { name: "Électroménager" }).click({ button: "right" });
  await expect(bar.getByRole("button", { name: "Électroménager" })).toHaveCount(0);
  await tabs.nth(1).click();
  await expect(bar.getByRole("button", { name: "Plan de dressing" })).toBeVisible();
  await tabs.nth(2).click();
  await expect(bar.getByRole("button", { name: "Plan de cuisine" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Électroménager" })).toHaveCount(0);
  // Conception 3D: the bar of the model, and Sélection at the right.
  await tabs.nth(0).click();
  await expect(bar).toHaveAttribute("data-favorites", "model");
  await expect(bar.getByRole("button", { name: "Plan de cuisine" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Cuisine et Dressing : une barre d'étapes, les outils de l'étape à la place du ruban, la coche d'une étape faite", { tag: "@rapide" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Étapes e2e");
  // As a new user: the steps' tools, not the whole ribbon.
  await page.evaluate(() => localStorage.setItem("cao.steps-ribbon", "0"));
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const tabs = page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab");
  const steps = page.locator("[data-steps]");
  const ribbon = page.locator('[data-ribbon="model"]');
  // Conception 3D: the ribbon, no steps.
  await tabs.nth(0).click();
  await expect(steps).toBeHidden();
  await expect(ribbon).toBeVisible();
  await tabs.nth(2).click();
  await expect(steps).toBeVisible();
  await expect(ribbon).toBeHidden();
  await expect(steps.locator("[data-step]")).toHaveText(["1Pièce", "2Plan", "3Meubles", "4Électroménager", "5Finitions", "6Fabrication", "7Client"]);
  // A step: its tools, with their names; « Électroménager › » goes on.
  await steps.locator('[data-step="units"]').click();
  await expect(steps.locator('[data-step="units"]')).toHaveAttribute("aria-pressed", "true");
  await expect(steps.getByRole("button", { name: "Meubles de cuisine" })).toBeVisible();
  await steps.locator("[data-step-next]").click();
  await expect(steps.locator('[data-step="appliances"]')).toHaveAttribute("aria-pressed", "true");
  // A tool of the step works as the ribbon's: Électroménager opens.
  await steps.getByRole("button", { name: "Électroménager", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Électroménager" })).toBeVisible();
  await page.keyboard.press("Escape");
  // A unit added: « Meubles » gets its tick.
  await steps.locator('[data-step="units"]').click();
  await steps.getByRole("button", { name: "Meubles de cuisine" }).click();
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(steps.locator('[data-step="units"]')).toContainText("✓");
  // « Tous les outils »: the ribbon again, kept.
  await steps.locator("[data-steps-all]").click();
  await expect(ribbon).toBeVisible();
  await tabs.nth(1).click();
  // The kitchen unit has its fronts: « Façades » is done there too.
  await expect(steps.locator("[data-step]")).toHaveText(["1Pièce", "2Plan", "3Aménagement", "✓Façades", "5Finitions", "6Fabrication", "7Client"]);
  await expect(ribbon).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/etapes.png` });
  expect(errors).toEqual([]);
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
  expect(names).toEqual(["Modifier", "Pièce", "Cuisine", "Meuble", "Dressing", "Créer", "Atelier", "Fabrication", "Client"]);
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
  // The button hides the frames only: the count stays in the status bar.
  await click(page, '[data-workshop="live-check"]');
  await expect(page.locator('[data-workshop="live-check"]').first()).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(1500);
  await expect(status).toBeVisible();
  await click(page, '[data-workshop="live-check"]');
  await expect(page.locator('[data-workshop="live-check"]').first()).toHaveAttribute("aria-pressed", "true");
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
  await page.getByRole("dialog", { name: "Modules à glisser" }).getByRole("button", { name: "Fermer", exact: true }).click();

  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]').click();
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

test("un clic dans la vue ne déplace pas une Répartition rouverte : la vue reste libre, sans message, le panneau ouvert", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Clic e2e");
  await wall(page);
  await page.getByRole("tab", { name: "Plan de dressing" }).click();
  const zones = page.getByRole("dialog", { name: "Plan de dressing" }).getByRole("list", { name: "Zones du plan" });
  await zones.getByRole("listitem").first().getByRole("button", { name: /^(Modifier|Répartition)$/ }).click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await expect(partition).toBeVisible();
  const corner = partition.getByLabel(/^Coin X/);
  const before = await corner.inputValue();

  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await page.waitForTimeout(500);
  await expect(page.getByText(/reste à sa place/)).toHaveCount(0);
  await expect(partition).toBeVisible();
  await expect(corner).toHaveValue(before);
  expect(errors).toEqual([]);
});

/** The view under its messages. */
async function look(page: Page) {
  const box = (await canvas(page).boundingBox())!;
  return (await page.screenshot({ clip: { x: box.x, y: box.y + 180, width: box.width, height: box.height - 240 } })).toString("base64");
}
const doors = (page: Page, group: string) => page.getByRole("group", { name: group, exact: true }).locator('[data-workshop="doors-open"]');

/** Open, then closed again: the button says so, and the picture changes and comes back. */
async function opensAndCloses(page: Page, group: string) {
  const button = doors(page, group);
  await expect(button).toBeVisible();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  const closed = await look(page);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  expect(await look(page)).not.toBe(closed);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(5, 5);
  await page.waitForTimeout(600);
  expect(await look(page)).toBe(closed);
}

test("un bouton ouvre et ferme toutes les portes d'un dressing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Portes e2e");
  // No door yet: it says so, and stays up.
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await doors(page, "Dressing").click();
  await expect(page.getByText("Il n'y a aucune porte dans ce modèle.")).toBeVisible();
  await expect(doors(page, "Dressing")).toHaveAttribute("aria-pressed", "false");

  await wall(page);
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]').click();
  const fronts = page.getByRole("dialog", { name: "Façades" });
  await expect(fronts).toBeVisible();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5);
  await expect(page.getByText(/Porte posée sur la case/)).toBeVisible();
  await fronts.getByRole("button", { name: "Toutes les cases" }).click();
  await fronts.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.waitForTimeout(800);
  await opensAndCloses(page, "Dressing");
  expect(errors).toEqual([]);
});

test("le même bouton ouvre et ferme les portes d'un meuble de cuisine", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Portes cuisine e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-2-portes-800"]').click();
  await expect(page.getByText(/ajouté avec ses façades/)).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.waitForTimeout(800);
  await opensAndCloses(page, "Cuisine");
  expect(errors).toEqual([]);
});

test("un clic ouvre la porte cliquée, mais pas un clic pris par un outil", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Clic porte e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-2-portes-800"]').click();
  await expect(page.getByText(/ajouté avec ses façades/)).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.waitForTimeout(800);
  const box = (await canvas(page).boundingBox())!;
  const [x, y] = [box.x + box.width * 0.5, box.y + box.height * 0.5];
  await page.getByText("Tout désélectionner").click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1000);
  const closed = await look(page);
  // The click begins while a tool holds the view, and the tool closes before the button comes up: no door opens.
  await click(page, '[data-action="appliances"]');
  await expect(page.getByRole("dialog", { name: "Électroménager" })).toBeVisible();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Électroménager" })).toHaveCount(0);
  await page.mouse.up();
  // That click only chose the door (no tool holds it any more): unchosen, the door is still shut.
  await page.getByText("Tout désélectionner").click();
  await page.mouse.move(5, 5);
  await expect.poll(() => look(page), { timeout: 5000 }).toBe(closed);
  // Without a tool, the same click opens the door.
  await page.mouse.click(x, y);
  await page.getByText("Tout désélectionner").click();
  await page.mouse.move(5, 5);
  await expect.poll(() => look(page), { timeout: 5000 }).not.toBe(closed);
  expect(errors).toEqual([]);
});

test("le catalogue de cuisine montre chaque meuble dessiné, par famille, à la largeur survolée", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Catalogue e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  const families = page.getByRole("tablist", { name: "Familles de meubles" }).getByRole("tab");
  await expect(families).toHaveText(["Bas", "Hauts", "Colonnes", "Mes meubles"]);
  const model = page.locator('article[data-model="Bas 2 portes"]');
  await expect(model.locator("svg")).toBeVisible();
  await expect(model).toContainText("2 portes · 1 étagère");
  const before = await model.locator("svg").getAttribute("width");
  await model.locator('[data-unit="base-bas-2-portes-1200"]').hover();
  await expect(model.locator("[data-unit-size]")).toContainText("L 120");
  expect(await model.locator("svg").getAttribute("width")).not.toBe(before);

  await families.filter({ hasText: "Colonnes" }).click();
  await expect(page.locator('article[data-model="Colonne four"]')).toBeVisible();
  await expect(model).toHaveCount(0);
  await families.filter({ hasText: "Mes meubles" }).click();
  await expect(page.locator("[data-my-units]")).toBeVisible();
  expect(errors).toEqual([]);
});

test("le bas évier a deux traverses à la place du dessus, et le caisson se règle de même", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Évier e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-evier-800"]').click();
  await expect(page.getByText(/ajouté avec ses façades/)).toBeVisible();
  const tree = page.getByLabel(/^Navigateur : corps/);
  await expect(tree.getByText("Traverse avant", { exact: true })).toBeVisible();
  await expect(tree.getByText("Traverse arrière", { exact: true })).toBeVisible();
  await expect(tree.getByText("Dessus", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");

  // Le même réglage dans l'outil Caisson, pour un caisson sur mesure.
  await click(page, '[data-action="cabinet"]');
  const tool = page.getByRole("dialog", { name: "Caisson" });
  await tool.getByRole("combobox", { name: "Haut du caisson" }).selectOption("rails");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});

test("un double-clic sur une pièce sélectionne le caisson entier, façades comprises", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Double-clic e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-2-portes-800"]').click();
  await expect(page.getByText(/ajouté avec ses façades/)).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const view = (await canvas(page).boundingBox())!;
  await page.mouse.dblclick(view.x + view.width / 2, view.y + view.height / 2);
  await expect(page.getByText("« Bas 2 portes 800 » sélectionné en entier : 8 pièces.")).toBeVisible();
  await expect(page.getByText("8 corps sélectionné(s)")).toBeVisible();
  // The same on a piece of the navigator: one piece, then all of them.
  await page.keyboard.press("Escape");
  await page.getByLabel(/^Navigateur : corps/).getByText("Étagère 1", { exact: true }).first().dblclick();
  await expect(page.getByText("8 corps sélectionné(s)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Déplacer prend l'élément sélectionné ou le corps entier", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Corps entier e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-2-portes-800"]').click();
  await expect(page.getByText(/ajouté avec ses façades/)).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.waitForTimeout(500);

  await click(page, '[data-action="move"]');
  const choice = page.getByRole("combobox", { name: "Déplacer", exact: true });
  await expect(choice).toHaveValue("element");
  await expect(page.getByText(/Le corps entier : Bas 2 portes 800, 8 pièces/)).toBeVisible();
  await choice.selectOption("whole");
  await expect(page.getByText("Meuble : Bas 2 portes 800")).toBeVisible();
  await expect(choice).toHaveValue("whole");

  // Retour à l'élément, puis de nouveau le corps entier.
  await choice.selectOption("element");
  await expect(page.getByText(/^Corps : Bas 2 portes 800/)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Déplacer", exact: true })).toHaveValue("element");
  await page.getByRole("combobox", { name: "Déplacer", exact: true }).selectOption("whole");
  // The whole starts as a new move does: the manipulator goes on a point clicked, not in the middle.
  await expect(page.locator('[data-move-mode="points"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Pivot : survolez une face du corps/)).toBeVisible();
  const view = (await canvas(page).boundingBox())!;
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await expect(page.getByRole("button", { name: "Changer le pivot" })).toBeVisible();

  const tree = page.getByLabel(/^Navigateur : corps/);
  const before = await canvas(page).screenshot();
  await page.locator('[data-move-mode="relative"]').click();
  // The panel is drawn again when the preview ends: the field is typed in after that.
  await page.waitForTimeout(600);
  await page.getByRole("textbox", { name: "ΔX" }).fill("50");
  await page.getByRole("textbox", { name: "ΔX" }).press("Enter");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Fermer", exact: true }).last().click();
  await page.waitForTimeout(800);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect((await canvas(page).screenshot()).equals(before)).toBe(false);
  // Le meuble reste un seul meuble, sans une opération par pièce.
  await expect(tree.getByText("Porte gauche", { exact: true })).toBeVisible();
  await expect(tree.getByText(/Déplacement/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Déplacer à la façon de SketchUp : le meuble suit la souris, une flèche bloque un axe, une distance tapée puis Entrée", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Déplacer SketchUp e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-2-portes-800"]').click();
  await expect(page.getByText(/ajouté avec ses façades/)).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.waitForTimeout(500);
  await click(page, '[data-action="move"]');
  await page.getByRole("combobox", { name: "Déplacer", exact: true }).selectOption("whole");
  await expect(page.getByText("Meuble : Bas 2 portes 800")).toBeVisible();
  // The pivot put at the bottom (as Fusion's « Set pivot »): then it follows the pointer.
  await page.locator('[data-pivot="Bas"]').click();
  await expect(page.getByRole("button", { name: "Changer le pivot" })).toBeVisible();
  const view = (await canvas(page).boundingBox())!;
  await page.mouse.move(view.x + view.width / 2 + 40, view.y + view.height / 2 + 30);
  await page.mouse.move(view.x + view.width / 2 + 120, view.y + view.height / 2 + 60, { steps: 4 });
  const typed = page.locator("[data-move-typed]");
  await expect(typed).not.toContainText("Déplacement : 0");
  // → keeps X; 50 typed then Entrée: 50 along X.
  await page.keyboard.press("ArrowRight");
  await expect(typed).toContainText("bloqué sur X");
  await page.keyboard.type("50");
  await expect(typed).toContainText("Mesure : 50");
  await page.keyboard.press("Enter");
  await expect(typed).toContainText(/Déplacement : 50 ?cm|Déplacement : 500 ?mm|Déplacement : 0,5 ?m/);
  await expect(page.getByRole("textbox", { name: "ΔY" })).toHaveValue(/^-?0$/);
  // x3 on a whole cabinet: copies are made of a body only, it is said.
  await page.keyboard.type("x3");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Les copies se font sur un corps/).first()).toBeVisible();
  await page.waitForTimeout(1000);
  // Every tool ends with « Terminer » and « OK »: OK keeps it, the tool staying for the next one; « Terminer » closes.
  const panel = page.getByRole("dialog", { name: /Déplacer/ });
  await expect(panel.locator("[data-panel-done]")).toHaveText("Terminer");
  await panel.locator("[data-panel-ok]").click();
  await expect(panel).toBeVisible();
  await panel.locator("[data-panel-done]").click();
  await expect(panel).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});

test("Déplacer une Répartition entière emporte toutes ses pièces", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Répartition entière e2e");
  await wall(page);
  await page.getByLabel(/^Navigateur : corps/).getByText("Dessous", { exact: true }).first().click();
  await click(page, '[data-action="move"]');
  const choice = page.getByRole("combobox", { name: "Déplacer", exact: true });
  await expect(choice).toHaveValue("element");
  await choice.selectOption("whole");
  await expect(page.getByText("Esquisse : Plan — mur a")).toBeVisible();
  // Its pivot: a corner of one of its panels, or a point of its sketch.
  await expect(page.locator('[data-move-mode="points"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Pivot : cliquez un coin d'un de ses panneaux/)).toBeVisible();
  const view = (await canvas(page).boundingBox())!;
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await expect(page.getByRole("button", { name: "Changer le pivot" })).toBeVisible();
  const before = await canvas(page).screenshot();
  await page.locator('[data-move-mode="relative"]').click();
  // The panel is drawn again when the preview ends: the field is typed in after that.
  await page.waitForTimeout(600);
  await page.getByRole("textbox", { name: "ΔX" }).fill("40");
  await page.getByRole("textbox", { name: "ΔX" }).press("Enter");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Fermer", exact: true }).last().click();
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect((await canvas(page).screenshot()).equals(before)).toBe(false);
  await expect(page.getByLabel(/^Navigateur : corps/).getByText(/^Déplacement/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("une porte se pose sur les niches choisies, depuis Façades", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Porte sur niches e2e");
  await wall(page);
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]').click();
  await page.getByRole("button", { name: "Porte sur des niches choisies…" }).click();
  const tool = page.getByRole("dialog", { name: "Porte sur niches" });
  await expect(tool).toContainText("Cliquez les niches à fermer");
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(tool).toContainText("2 niches choisies");
  await expect(tool).toContainText(/Porte de .* sur 2 niches/);
  await tool.getByRole("combobox", { name: "Charnières" }).selectOption("right");
  // Inset, it fits in the niches: smaller than over the panels around them.
  const size = tool.getByText(/Porte de .* sur 2 niches/);
  const over = await size.textContent();
  // Overlaid, on the panel beside its niches: over all of it, wider; back to half of it.
  const cover = tool.getByRole("combobox", { name: "Sur une étagère" });
  await cover.selectOption("whole");
  await expect(size).not.toHaveText(over!);
  await cover.selectOption("half");
  await expect(size).toHaveText(over!);
  await tool.getByRole("combobox", { name: "Pose" }).selectOption("inset");
  await expect(cover).toHaveCount(0);
  await expect(size).not.toHaveText(over!);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("Porte posée sur 2 niches.")).toBeVisible();
  await tool.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(800);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect(page.getByLabel(/^Navigateur : corps/).getByText("Porte 1", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("des niches qui ne forment pas un rectangle : une porte chacune (ou par rectangle), sans refus", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Portes sans condition e2e");
  await wall(page);
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]').click();
  await page.getByRole("button", { name: "Porte sur des niches choisies…" }).click();
  const tool = page.getByRole("dialog", { name: "Porte sur niches" });
  const box = (await canvas(page).boundingBox())!;
  // Two cases with another between them: two doors, not « they must form a rectangle ».
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await expect(tool).toContainText("2 niches choisies");
  await expect(tool).toContainText("2 portes sur 2 niches");
  await expect(tool).not.toContainText("doivent former un rectangle");
  // A case next to the first: those two make a rectangle, one door over them — never three doors.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(tool).toContainText(/Porte de .* sur 3 niches|2 portes sur 3 niches/);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("2 portes posées sur 2 niches.")).toBeVisible();
  await tool.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(800);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect(page.getByLabel(/^Navigateur : corps/).getByText("Porte 2", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("une porte sur niches s'ouvre vers le haut, puis, par son menu, vers le bas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "Porte relevable e2e");
  const hinges = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; fill?: string; hinges?: string[] }[] } }).document.features.filter((f) => f.type === "niche" && f.fill === "door").map((f) => f.hinges), api);
  };
  await wall(page);
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]').click();
  await page.getByRole("button", { name: "Porte sur des niches choisies…" }).click();
  const tool = page.getByRole("dialog", { name: "Porte sur niches" });
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5);
  await tool.getByRole("combobox", { name: "Charnières" }).selectOption("top");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await tool.getByRole("button", { name: "Terminer" }).click();
  await expect.poll(hinges, { timeout: 30_000 }).toEqual([["top"]]);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  // Its menu (a right click on it): downwards now.
  await page.waitForTimeout(800);
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5, { button: "right" });
  await page.getByRole("menuitem", { name: "S'ouvre vers le bas (abattant)" }).click();
  await expect.poll(hinges, { timeout: 30_000 }).toEqual([["bottom"]]);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});

test("un bouton sort et rentre tous les tiroirs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Tiroirs e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  const button = page.getByRole("group", { name: "Cuisine", exact: true }).locator('[data-workshop="drawers-open"]');
  // No drawer yet: it says so.
  await button.click();
  await expect(page.getByText("Il n'y a aucun tiroir dans ce modèle.")).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-3-tiroirs-600"]').click();
  await expect(page.getByText(/ajouté avec ses façades/)).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.waitForTimeout(800);
  await page.mouse.move(5, 5);
  const closed = await look(page);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  expect(await look(page)).not.toBe(closed);
  // The doors' button stays up: only the drawers moved.
  await expect(page.getByRole("group", { name: "Cuisine", exact: true }).locator('[data-workshop="doors-open"]')).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(5, 5);
  await page.waitForTimeout(600);
  expect(await look(page)).toBe(closed);
  await expect(page.locator('.ribbon-group[aria-label="Dressing"] [data-workshop="drawers-open"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});


test("des tiroirs à l'anglaise derrière une porte : en retrait, sur cales, sans poignée, et la porte devant", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-tiroirs-anglaise");
  type Niche = { type: string; fill?: string; inner?: boolean; mount?: string; handles?: boolean };
  const niches = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Niche[] } }).document.features.filter((f) => f.type === "niche"), api);
  };
  await wall(page);
  await click(page, '[data-action="tiroirs"]');
  const tool = page.getByRole("dialog", { name: "Tiroirs" });
  await expect(tool).toBeVisible();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5);
  await tool.getByRole("combobox", { name: "Façades", exact: true }).selectOption("inner");
  // Behind a door: what it asks of the hinges, and no handle holes.
  await expect(tool).toContainText("Derrière une porte : les charnières du projet ouvrent à 110°");
  await expect(tool.getByText("Trous de poignée (entraxe 128)")).toHaveCount(0);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("Niche équipée : tiroirs.")).toBeVisible();
  await tool.getByRole("button", { name: "Terminer" }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await expect(page.getByLabel(/^Navigateur : corps/).getByText("Cale gauche 1", { exact: true }).first()).toBeAttached();

  // The door over the same niche, in front of the drawers.
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]').click();
  await page.getByRole("button", { name: "Porte sur des niches choisies…" }).click();
  const door = page.getByRole("dialog", { name: "Porte sur niches" });
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5);
  await expect(door).toContainText("sur 1 niche.");
  await door.getByRole("button", { name: "OK", exact: true }).click();
  await door.getByRole("button", { name: "Terminer" }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await expect.poll(async () => (await niches()).map((f) => [f.fill, f.inner ?? false]), { timeout: 30_000 }).toEqual(expect.arrayContaining([["drawers", true], ["door", false]]));
  expect(errors).toEqual([]);
});

test("rangement en hauteur : une tringle trop haute signalée, puis une penderie escamotable à sa place", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-rangement-hauteur");
  // Nothing drawn: nothing out of reach (the button is hidden in the ribbon until shown: clicked by script).
  await click(page, '[data-workshop="high-storage"]');
  const modal = page.getByRole("dialog", { name: "Rangement en hauteur" });
  await expect(modal).toContainText("Rien n'est hors de portée");
  await modal.getByRole("button", { name: "Fermer", exact: true }).last().click();

  // A wall of the dressing, a rod in one of its full-height niches: 6 cm under its top, far above 1,90 m.
  await wall(page);
  await click(page, '[data-action="penderie"]');
  const rod = page.getByRole("dialog", { name: "Penderie" });
  await expect(rod).toBeVisible();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.5);
  await rod.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText(/Niche équipée/)).toBeVisible();
  await rod.getByRole("button", { name: "Terminer" }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });

  await click(page, '[data-workshop="high-storage"]');
  const line = modal.locator("[data-high-niche]").filter({ hasText: "Penderie 1" });
  await expect(line).toContainText("hors de portée : une penderie escamotable la descend à hauteur de main");
  await line.getByRole("button", { name: "Poser une penderie escamotable" }).click();
  await expect(page.getByText(/« Penderie escamotable 1 » posée/)).toBeVisible();
  // Within reach now: its line goes, and no more button.
  await expect(modal.locator("[data-high-niche]").filter({ hasText: "Penderie 1" })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Poser une penderie escamotable" })).toHaveCount(0);
  await modal.getByRole("button", { name: "Fermer", exact: true }).last().click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await expect(page.getByLabel(/^Navigateur : corps/).getByText("Penderie escamotable 1", { exact: true }).first()).toBeAttached();
  expect(errors).toEqual([]);
});
