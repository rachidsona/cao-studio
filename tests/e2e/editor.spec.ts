/**
 * Parcours clés de l'éditeur dans un vrai navigateur : ouvrir un projet, modifier une esquisse et retrouver la
 * modification après rechargement, ouvrir la liste de débit. Chaque test crée son propre compte sur le serveur de
 * test (base .e2e/db.sqlite3, recréée à chaque lancement).
 */
import { expect, test, type Page } from "@playwright/test";
import { joinStaff, newProject } from "./helpers";

async function sketchCurves(page: Page, api: string, sketchId: string): Promise<number> {
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const sketch = (project.document.features as { id: string; curves?: unknown[] }[]).find((f) => f.id === sketchId);
  return sketch?.curves?.length ?? 0;
}

test("un projet s'ouvre : noyau prêt, corps listé, aucune erreur", { tag: "@rapide" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Plaque e2e");
  await expect(page.locator('[data-ref="status-kernel"]')).toHaveText("Noyau OpenCascade prêt");
  await expect(page.locator('[data-select^="body:"]')).toHaveCount(1);
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré");
  expect(errors).toEqual([]);
});

test("une ligne tracée dans l'esquisse est enregistrée et retrouvée après rechargement", { tag: "@rapide" }, async ({ page }) => {
  const api = await newProject(page, "Esquisse e2e");
  const before = await sketchCurves(page, api, "sk1");
  // The sketch's row in the "Esquisses" section (it is also in the history of the body).
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  await page.locator('[data-sketch-tool="line"]').click();
  const canvas = page.locator('[data-ref="viewport"] canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.8);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Terminer l'esquisse" }).click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 15_000 });
  await expect.poll(() => sketchCurves(page, api, "sk1")).toBe(before + 1);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect(await sketchCurves(page, api, "sk1")).toBe(before + 1);
});

test("le projet exemple s'ouvre : six panneaux, devis et aide", { tag: "@rapide" }, async ({ page }) => {
  await newProject(page, "Compte e2e");
  await page.goto("/projects/");
  await page.getByRole("button", { name: "Ouvrir le projet exemple" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('[data-select^="body:"]')).toHaveCount(6);
  // Folded into « Client ▾ » when the bar is narrow: its button still opens the quote.
  await page.locator('[data-workshop="quote"]').dispatchEvent("click");
  const quote = page.getByRole("dialog", { name: "Devis" });
  await expect(quote).toContainText("Mélaminé chêne 1,8 cm"); // centimetres by default
  await expect(quote).toContainText("Total TTC");
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Aide", exact: true })).toBeVisible();
});

test("les panneaux latéraux s'élargissent à la poignée et gardent leur largeur", async ({ page }) => {
  await newProject(page, "Panneaux e2e");
  const panel = page.locator('[data-ref="panel-properties"]');
  const before = (await panel.boundingBox())!.width;
  const handle = (await page.locator('[data-panel-resize="left"]').boundingBox())!;
  const x = handle.x + handle.width / 2;
  await page.mouse.move(x, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(x - 120, handle.y + 100, { steps: 5 });
  await page.mouse.up();
  const width = async () => Math.round((await panel.boundingBox())!.width);
  await expect.poll(width).toBeGreaterThan(before + 110);
  const dragged = await width();
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect(await width()).toBe(dragged);
});

test("une apparence de la bibliothèque se donne à un corps, s'enregistre et s'annule", async ({ page }) => {
  const api = await newProject(page, "Apparence e2e");
  const appearanceOf = async () => {
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return Object.values((project.document.bodyInfo ?? {}) as Record<string, { appearance?: string }>).map((i) => i.appearance).filter(Boolean);
  };
  await page.locator('[data-select^="body:"]').first().click();
  await page.getByRole("button", { name: "Apparence", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Apparence" });
  await panel.getByRole("searchbox", { name: "Rechercher une apparence" }).fill("carrare");
  await panel.locator('[data-appearance-grid] [data-appearance="marble-carrara"]').click();
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 15_000 });
  await expect.poll(appearanceOf).toEqual(["marble-carrara"]);
  await expect(panel).toContainText("Dans ce modèle");
  await page.locator('[data-ref="undo"]').click();
  await expect.poll(appearanceOf, { timeout: 15_000 }).toEqual([]);
});

// The headless browser draws WebGL in software: the path tracer starts but does not get far, so only opening and
// closing are checked here (the refining is checked by hand in a real browser).
test("le mode Rendu s'ouvre et rend la main à l'édition", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Rendu e2e");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="render-mode"]')?.click());
  await expect(page.locator("#editor")).toHaveAttribute("data-render", "on");
  await expect(page.locator("[data-render-panel]")).toBeVisible();
  await expect(page.locator("[data-render-status]")).toContainText("échantillons");
  await expect(page.locator('[data-ribbon="model"]')).toBeHidden();
  await page.getByRole("button", { name: "Quitter le rendu" }).first().click();
  await expect(page.locator("#editor")).not.toHaveAttribute("data-render", "on");
  await expect(page.locator('[data-ribbon="model"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("la liste de débit s'ouvre avec les pièces du modèle", async ({ page }) => {
  await newProject(page, "Débit e2e");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="cutlist"]')?.click());
  await expect(page.getByRole("dialog", { name: /Liste de débit/ })).toBeVisible();
});

test("la mise en plan s'ouvre de la barre du haut : une feuille avec les vues standard, gardée avec le projet", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "Mise en plan e2e");
  await page.locator('header > [data-workshop="drawing"]').click();
  const workspace = page.getByRole("dialog", { name: "Mise en plan" });
  await expect(workspace).toBeVisible();
  // Front, top, left and isometric views, the title block.
  await expect(workspace.locator('[data-drawing-stage] g[data-id^="view"]')).toHaveCount(4);
  await expect(workspace.locator('[data-drawing-stage] [data-id="title-block"]')).toContainText("Mise en plan e2e");
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 15_000 });
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  expect(project.document.drawings[0].views).toHaveLength(4);
  await page.locator("[data-drawing-close]").click();
  await expect(workspace).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("CAO Studio : le catalogue de l'atelier arrive, Rayons X et Affichage marchent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Catalogue e2e");
  await expect(page).toHaveTitle(/CAO Studio/);
  // The catalogue seeded by the migration (apps/catalog): 23 materials, 9 hardware rules, the profile.
  const catalog = await page.evaluate(async () => (await fetch("/api/catalog/", { headers: { Accept: "application/json" } })).json());
  expect(catalog.materials).toHaveLength(23);
  expect(catalog.hardware).toHaveLength(9);
  expect(catalog.company.name).toBe("Mon atelier");
  const xray = page.locator("[data-xray]");
  await xray.click();
  await expect(xray).toHaveAttribute("aria-pressed", "true");
  await xray.click();
  await expect(xray).toHaveAttribute("aria-pressed", "false");
  const display = page.getByRole("group", { name: "Modifier" }).locator("[data-display-menu]");
  await display.click();
  const families = page.locator("[data-display-options]");
  await expect(families).toBeVisible();
  const [under, panel] = [(await display.boundingBox())!, (await families.boundingBox())!];
  expect(Math.round(panel.y - under.y - under.height)).toBe(4);
  await page.mouse.click(700, 500);
  await expect(families).toBeHidden();
  await display.click();
  await page.locator("[data-display-work]").click();
  await expect(page.locator("[data-display-menu]")).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-display-all]").click();
  await expect(page.locator("[data-display-menu]")).toHaveAttribute("aria-pressed", "false");
  // Sélection++ is back in the column: on by default, it turns off and on again.
  const selectPlus = page.locator("[data-select-plus]");
  await expect(selectPlus).toBeVisible();
  await expect(selectPlus).toHaveAttribute("aria-pressed", "true");
  await selectPlus.click();
  await expect(selectPlus).toHaveAttribute("aria-pressed", "false");
  await selectPlus.click();
  await expect(selectPlus).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("le menu du nom du projet : projets, paramètres de l'atelier, mise en plan du caisson seul", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Menu e2e");
  // A plate only: no cabinet to draw, the menu says what to do.
  await page.locator("[data-project-menu] summary").click();
  const menu = page.locator('[data-project-menu] [role="menu"]');
  await expect(menu.getByRole("menuitem", { name: "← Mes projets" })).toHaveAttribute("href", "/projects/");
  await expect(menu.getByRole("menuitem", { name: "Paramètres de l'atelier" })).toHaveAttribute("href", "/catalogue/");
  await expect(menu.getByRole("menuitem", { name: "Fiche du projet" })).toHaveAttribute("href", /\/fiche\/$/);
  for (const name of ["Dossier de production", "Liste de débit", "Devis", "Lien client"]) await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
  // « Pour l'atelier » runs the ribbon's tool: the cut list of the plate.
  await menu.getByRole("menuitem", { name: "Liste de débit", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Liste de débit" })).toBeVisible();
  await page.getByRole("dialog", { name: "Liste de débit" }).getByRole("button", { name: "Fermer" }).first().click();
  await page.locator("[data-project-menu] summary").click();
  await menu.getByRole("menuitem", { name: "Mise en plan du caisson sélectionné" }).click();
  await expect(page.getByText("Cliquez d'abord une pièce du caisson")).toBeVisible();
  await expect(menu).toBeHidden();
  // The example project: one cabinet, its own sheet with its four views.
  await page.goto("/projects/");
  await page.getByRole("button", { name: "Ouvrir le projet exemple" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.locator("[data-project-menu] summary").click();
  await menu.getByRole("menuitem", { name: "Mise en plan du caisson sélectionné" }).click();
  const workspace = page.getByRole("dialog", { name: "Mise en plan" });
  await expect(workspace).toBeVisible();
  // Its sheet is the tab open (the tabs are at the bottom; the navigator lists the sheet too).
  await expect(workspace.locator("button.h-7", { hasText: "Caisson — Caisson bas" })).toHaveClass(/font-semibold/);
  await expect(workspace.locator('[data-drawing-stage] g[data-id^="view"]')).toHaveCount(4);
  await expect(workspace.locator('[data-drawing-stage] [data-id="title-block"]')).toContainText("Caisson bas");
  expect(errors).toEqual([]);
});

test("Répartition : les cotes de plan s'affichent pendant l'outil et suivent ses réglages", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Cotes e2e");
  const action = (name: string) => page.evaluate((a) => document.querySelector<HTMLElement>(`[data-action="${a}"]`)?.click(), name);
  const toggle = () => page.evaluate(() => document.querySelector<HTMLElement>("[data-piece-dims]")?.click());
  const dims = page.locator(".cad-plan-dim");

  // A Répartition of 3 cases: the totals, the chain of its niches and the depth, the button off.
  await action("partition");
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(dims.filter({ hasText: /^180$/ })).toHaveCount(1);
  await expect(dims.filter({ hasText: /^250$/ })).toHaveCount(1);
  await expect(dims.filter({ hasText: /^57$/ })).toHaveCount(3);
  // Entrée (as « OK ») stores it, the tool staying; « Terminer » (Échap) closes it.
  await page.keyboard.press("Enter");
  await expect(dims.filter({ hasText: /^180$/ })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dims).toHaveCount(0);
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);

  // Étagères: the niche chosen is cut in the dimensions before OK; the button hides them for this tool.
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(600);
  await action("shelves");
  await expect(dims.filter({ hasText: /^246,4$/ })).toHaveCount(1);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(dims.filter({ hasText: /^122,3$/ })).toHaveCount(2);
  await toggle();
  await expect(dims).toHaveCount(0);
  await toggle();
  await expect(dims.filter({ hasText: /^122,3$/ })).toHaveCount(2);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(dims).toHaveCount(0);

  // With the button on, a Répartition has its plan's dimensions, not those of its pieces.
  await toggle();
  await expect(dims.filter({ hasText: /^122,3$/ })).toHaveCount(2);
  await expect(page.locator(".cad-piece-dim")).toHaveCount(0);
  await toggle();
  expect(errors).toEqual([]);
});


test("Répartition avec portes : chaque porte a ses cotes, sur le bouton Cotes des pièces", async ({ page }) => {
  await newProject(page, "Portes e2e");
  const dims = page.locator(".cad-plan-dim");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="partition"]')?.click());
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByLabel("Une porte par case").check();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>("[data-piece-dims]")?.click());
  await expect(page.locator('.cad-plan-dim[data-level="door"]')).toHaveCount(6);
  await page.evaluate(() => document.querySelector<HTMLElement>("[data-piece-dims]")?.click());
  await expect(dims).toHaveCount(0);
});

test("Dressing : les cotes de plan s'affichent pendant l'assistant et suivent ses réglages", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Dressing e2e");
  const dims = page.locator(".cad-plan-dim");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="dressing"]')?.click());
  await page.waitForTimeout(2000);
  // The whole preview in view: a value out of it is not in the page.
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="iso"]')?.click());
  await expect(dims.filter({ hasText: /^300$/ })).toHaveCount(1);
  await expect(dims.filter({ hasText: /^250$/ })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dims).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Dressing : le + d'un mur ouvre la liste des modules à choisir", async ({ page }) => {
  await newProject(page, "Programme e2e");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="dressing"]')?.click());
  const rows = page.locator('[data-group="A"] select');
  await expect(rows).toHaveCount(4);
  await page.getByRole("button", { name: "Ajouter un module au mur A" }).click();
  const list = page.getByRole("list", { name: "Modules" });
  await expect(list.getByRole("button")).toHaveCount(7);
  await list.getByRole("button", { name: /Chaussures/ }).click();
  await expect(list).toHaveCount(0);
  await expect(rows).toHaveCount(5);
  await expect(rows.last()).toHaveValue("shoes");
});

test("Module : la liste, l'aperçu et les cotes, une seule annulation, Mes modules", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Module e2e");
  const action = (name: string) => page.evaluate((a) => document.querySelector<HTMLElement>(`[data-action="${a}"]`)?.click(), name);
  await action("partition");
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(600);

  await action("module");
  const panel = page.getByRole("dialog", { name: "Module" });
  await panel.getByRole("button", { name: "Double penderie" }).click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panel).toContainText("Niche choisie");
  // The two rods are out of reach or not, but the niches of the module are already in the dimensions.
  const niches = page.locator('.cad-plan-dim');
  await expect(niches.filter({ hasText: /^30$/ }).first()).toBeVisible();
  // Stored by itself a moment later (no « OK »).
  await expect(page.getByText("Niche équipée : double penderie.")).toBeVisible();

  // Kept under a name, it comes back in the list.
  await panel.getByRole("button", { name: "Tiroirs et étagères" }).click();
  await panel.getByLabel("Nom du module").fill("Mes tiroirs");
  await panel.getByRole("button", { name: "Garder" }).click();
  await expect(panel.getByRole("list", { name: "Mes modules" }).getByRole("button", { name: "Mes tiroirs" })).toBeVisible();

  // Each setting is stored at once: the module placed, then changed to « Tiroirs et étagères » — two undos take it away.
  await page.keyboard.press("Escape");
  const tree = page.getByLabel(/^Navigateur : corps/);
  await expect(tree.getByText("Étagères", { exact: true })).toBeVisible();
  await page.locator('[data-action="undo"]').click();
  await page.waitForTimeout(800);
  await page.locator('[data-action="undo"]').click();
  await expect(tree.getByText("Étagères", { exact: true })).toHaveCount(0);
  await expect(tree.getByText("Côtés", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Apparence : une vignette glissée sur la sélection va à toute la sélection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Apparence e2e");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="partition"]')?.click());
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="appearance"]')?.click());

  // All the boards of the Répartition, then a swatch dropped beside them in the view.
  await page.locator('[data-head^="group:"]').first().click();
  await expect(page.getByText(/Appliquer à : 9 corps/)).toBeVisible();
  await page.locator("[data-appearance]:visible").nth(3).dragTo(canvas, { targetPosition: { x: 12, y: box.height - 90 } });
  await expect(page.locator("[data-appearance]").filter({ hasText: "9 corps" })).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test("tableau de bord : une cuisine créée de l'accueil, son devis calculé par l'éditeur, sa fiche client", { tag: "@rapide" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Tableau e2e");
  await page.goto("/projects/");
  await page.fill("#space-name", "Cuisine Dupont");
  await page.getByRole("button", { name: "Créer une cuisine" }).click();
  await page.waitForURL("**/editor/**");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  // Opened on its tab, empty, its plan at the right; a kitchen proposed, the quote's total goes to the server.
  await expect(page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab", { name: "Cuisine" })).toHaveAttribute("aria-selected", "true");
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await expect(plan).toBeVisible();
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  const saved = page.waitForResponse(async (r) => r.url().endsWith("/price/") && r.request().method() === "POST" && (r.request().postDataJSON() as { price: number | null }).price !== null, { timeout: 60_000 });
  await plan.locator("[data-propose]").click();
  expect((await saved).status()).toBe(200);
  // The dashboard: its stage, its total; the sheet keeps the client.
  await page.goto("/projects/");
  const row = page.locator("[data-project-row]", { hasText: "Cuisine Dupont" });
  await expect(row.locator('[data-status="draft"]')).toHaveText("Esquisse");
  await expect(row.locator("[data-price]")).toContainText("MAD");
  await row.getByRole("link", { name: "Fiche" }).click();
  await page.fill("#id_client_name", "M. Dupont");
  await page.selectOption("#id_status", "quoted");
  await page.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(page.getByText("Fiche du projet enregistrée.")).toBeVisible();
  await page.goto("/projects/?statut=quoted");
  await expect(page.locator("[data-project-row]")).toHaveCount(1);
  await expect(page.locator("[data-project-row]")).toContainText("M. Dupont");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tableau-de-bord.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("paramètres de l'atelier : la marge changée dans le devis de l'éditeur est celle de l'atelier, sur tous les ordinateurs", { tag: "@rapide" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Tarifs e2e");
  // The workshop's rates are the staff's.
  joinStaff();
  await page.goto("/projects/");
  await page.getByRole("button", { name: "Ouvrir le projet exemple" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="quote"]')?.click());
  await page.getByText("Tarifs (indicatifs, modifiables)").click();
  const margin = page.getByRole("spinbutton", { name: "Marge", exact: true });
  await expect(margin).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/catalog/rates/") && r.request().method() === "POST");
  await margin.fill("37");
  expect((await saved).status()).toBe(200);
  await page.goto("/catalogue/tarifs/");
  await expect(page.getByRole("heading", { name: "Paramètres de l'atelier" })).toBeVisible();
  await expect(page.locator("#id_margin")).toHaveValue("37.0");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/parametres-atelier.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("paramètres de l'atelier : un compte hors du personnel voit les tarifs de l'atelier sans pouvoir les changer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Tarifs lus e2e");
  await page.goto("/projects/");
  await page.getByRole("button", { name: "Ouvrir le projet exemple" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="quote"]')?.click());
  await page.getByText("Tarifs (indicatifs, modifiables)").click();
  await expect(page.getByRole("spinbutton", { name: "Marge", exact: true })).toBeDisabled();
  await expect(page.getByRole("spinbutton", { name: "TVA", exact: true })).toBeDisabled();
  // The prices of the boards stay this browser's.
  await expect(page.getByRole("dialog", { name: "Devis" }).getByRole("spinbutton").first()).toBeEnabled();
  await page.goto("/catalogue/tarifs/");
  await expect(page.getByText("Seul le personnel de l'atelier peut modifier ces réglages.")).toBeVisible();
  await expect(page.locator("#id_margin")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("un projet par espace : l'onglet Dressing d'une cuisine ouvre ou crée un dressing dans un autre onglet de projet", { tag: "@rapide" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Espaces e2e");
  // Spaces kept apart, as for a user.
  await page.evaluate(() => localStorage.removeItem("cao.free-spaces"));
  await page.goto("/projects/");
  await page.fill("#space-name", "Cuisine Martin");
  await page.getByRole("button", { name: "Créer une cuisine" }).click();
  await page.waitForURL("**/editor/**");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const tabs = page.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  // The Dressing tab does not show the kitchen: it offers a dressing of its own.
  await tabs.nth(1).click();
  const chooser = page.getByRole("dialog", { name: "Dressing" });
  await expect(chooser).toContainText("« Cuisine Martin » est une cuisine (Cuisine)");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/espaces.png` });
  await chooser.locator("[data-space-name]").fill("Placard de l'entrée");
  await chooser.getByRole("button", { name: "Créer" }).click();
  // In a project tab of its own, open on its tab, its plan at the right.
  const projects = page.getByRole("tablist", { name: "Projets ouverts" });
  await expect(projects.getByRole("tab", { name: "Placard de l'entrée" })).toHaveAttribute("aria-selected", "true");
  const frame = page.frameLocator('iframe[data-project-frame]');
  await expect(frame.getByRole("tablist", { name: "Espaces de travail" }).getByRole("tab", { name: "Dressing" })).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });
  await expect(frame.getByRole("dialog", { name: "Plan de dressing" })).toBeVisible();
  // Back to the kitchen: the dressing is listed now; its tools can still be borrowed here.
  // (the dressing's editor covers the page: its own bar of the open projects)
  await frame.getByRole("tablist", { name: "Projets ouverts" }).getByRole("tab", { name: "Cuisine Martin" }).click();
  await expect(projects.getByRole("tab", { name: "Cuisine Martin" })).toHaveAttribute("aria-selected", "true");
  await tabs.nth(1).click();
  await expect(chooser.getByRole("button", { name: "Placard de l'entrée" })).toBeVisible();
  await chooser.locator("[data-space-borrow]").click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("un raccourci clavier à soi : donné à un outil dans la palette, il le lance, et l'aide le liste", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Raccourcis e2e");
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await page.keyboard.press("Control+k");
  await page.keyboard.type("plan de dres");
  const chip = palette.getByRole("option").first().locator("[data-shortcut-of]");
  await expect(chip).toHaveText("+ touche");
  await chip.click();
  await expect(chip).toHaveText("Appuyez sur une touche…");
  // One of the editor's own: refused, the choice still open.
  await page.keyboard.press("Control+s");
  await expect(palette.getByRole("status")).toContainText("raccourci de l'éditeur");
  await page.keyboard.press("Alt+p");
  await expect(chip).toHaveText("⌥+P");
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await page.keyboard.press("Alt+p");
  await expect(page.getByRole("dialog", { name: "Plan de dressing" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("canvas").first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("?");
  await expect(page.getByText("Mes raccourcis")).toBeVisible();
  await expect(page.getByText("⌥+P", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Pipette : l'outil à part prend l'apparence d'un corps (un verre) et la donne à un autre d'un clic", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Pipette e2e");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="partition"]')?.click());
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="appearance"]')?.click());
  const panel = page.getByRole("dialog", { name: "Apparence" });
  // The two bottoms in clear acrylic: their group chosen in the navigator, then the swatch.
  const at = { x: box.width / 2, y: box.height / 2 };
  await page.locator('[data-head^="group:"]').filter({ hasText: "Dessous" }).first().click();
  await expect(panel.getByText(/Appliquer à : 2 corps/)).toBeVisible();
  await panel.getByRole("searchbox", { name: "Rechercher une apparence" }).fill("plexiglas");
  await page.locator("[data-appearance-grid] [data-appearance]").first().click();
  const glass = panel.locator("[data-appearance]").filter({ hasText: "Plexiglas transparent" }).first();
  await expect(glass).toContainText("2 corps");
  // The pipette, a tool of its own: its look taken, then given to another board.
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="pipette"]')?.click());
  const pipette = page.getByRole("dialog", { name: "Pipette" });
  await expect(pipette.locator("[data-pipette-state]")).toContainText("Cliquez le corps dont vous prenez");
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await expect(pipette.locator("[data-pipette-state]")).toContainText("Cliquez les corps qui prennent");
  // Other boards clicked (on the one taken, nothing happens; beside the boards, nothing either).
  for (const y of [0.3, 0.4, 0.6, 0.7]) for (const x of [0.3, 0.4, 0.6, 0.7]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.keyboard.press("Escape");
  await expect(pipette).toHaveCount(0);
  // Apparence again: more boards in clear acrylic than the two bottoms.
  const looks = page.getByRole("dialog", { name: "Apparence" });
  // (Its button may still think it open: a second click opens it.)
  for (let i = 0; i < 2 && !(await looks.isVisible()); i++) await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="appearance"]')?.click());
  await expect(looks.locator("[data-appearance]").filter({ hasText: "Plexiglas transparent" }).first()).toContainText(/[3-9] corps/);
  expect(errors).toEqual([]);
});
