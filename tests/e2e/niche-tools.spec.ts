/** Concevoir dans la vue, dans un vrai navigateur : menu de la niche, copie, cote tapée, étagère tirée, répétition, vue d'un mur, style. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const tree = (page: Page) => page.getByLabel(/^Navigateur : corps/);

/** A plan with two free walls, wall A made, seen from the front. */
async function ready(page: Page) {
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
  await page.waitForTimeout(700);
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  return { tool, at: (x: number, y: number) => [box.x + box.width * x, box.y + box.height * y] as const };
}

test("menu de la niche, copie, cote tapée, étagère tirée, répétition", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Niches e2e");
  const { at } = await ready(page);

  // The menu of a niche opens Étagères on it.
  const [x1, y1] = at(0.38, 0.55);
  await page.mouse.click(x1, y1, { button: "right" });
  const menu = page.getByRole("menu", { name: "Menu de la niche" });
  await menu.getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await expect(shelves).toContainText("Niche choisie");
  await shelves.getByRole("combobox").first().selectOption("3");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await expect(tree(page).getByText("Étagères", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1200);

  // That niche copied to the next one, from its menu.
  await page.mouse.click(x1, y1, { button: "right" });
  await menu.getByRole("menuitem", { name: "Copier cette niche" }).click();
  const copy = page.getByRole("dialog", { name: "Copier une niche" });
  await expect(copy).toContainText("Cliquez les niches à faire pareil");
  const [x2, y2] = at(0.62, 0.55);
  await page.mouse.click(x2, y2);
  await expect(page.getByText("Niche copiée.")).toBeVisible();
  await copy.getByRole("button", { name: "Terminer" }).click();
  await expect(tree(page).getByText("Étagères", { exact: true }).first().locator("..")).toContainText("6");
  await page.waitForTimeout(1200);

  // A dimension typed in the view.
  const dims = page.locator('[data-piece-dims]');
  if ((await dims.getAttribute("aria-pressed")) !== "true") await click(page, "[data-piece-dims]");
  await page.keyboard.press("Escape");
  await tree(page).getByText("Dessous", { exact: true }).first().click();
  const editable = page.locator('.cad-plan-dim[data-editable]:not([data-level="total"])').first();
  await expect(editable).toBeVisible();
  const before = await editable.innerText();
  await editable.click();
  const input = page.getByRole("textbox", { name: "Nouvelle cote" });
  await input.fill("31");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await page.waitForTimeout(1200);

  // A shelf pulled by its handle.
  await tree(page).getByRole("button", { name: "Déplier Étagères", exact: true }).first().click();
  await tree(page).getByText("Étagère 1", { exact: true }).first().click();
  const handle = page.locator("[data-shelf-handle]");
  await expect(handle).toBeVisible();
  // Its step in the history is framed in green.
  const lit = page.locator("[data-op][data-lit]");
  await expect(lit).toHaveCount(1);
  await expect(lit).toHaveAttribute("aria-label", /^Étagères/);
  await expect(lit).toHaveCSS("border-top-color", "rgb(99, 223, 15)");
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y - 30, { steps: 4 });
  await expect(handle).toContainText("/");
  await page.mouse.up();
  await expect(handle).toBeHidden();
  await page.waitForTimeout(1200);
  await tree(page).getByText("Étagère 1", { exact: true }).first().click();
  await expect(page.locator(".cad-plan-dim").filter({ hasText: /^(60|61|62|63|64|65),?\d?$/ }).first()).toBeVisible();

  // R runs the last tool again, with its settings, on the niche under the pointer.
  await click(page, '[data-action="shelves"]');
  const again = page.getByRole("dialog", { name: "Étagères" });
  await again.getByRole("button", { name: "Terminer" }).click();
  await page.mouse.move(...at(0.2, 0.55));
  await page.keyboard.press("r");
  await expect(page.getByRole("dialog", { name: "Étagères" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  expect(before).not.toBe("");
});

test("voir un mur, mes murs, style du dressing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Style e2e");
  await ready(page);
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await expect(tool.getByRole("list", { name: "Zones du plan" })).toBeVisible();
  await tool.getByRole("button", { name: "Voir" }).click();
  await expect(tool.getByRole("button", { name: "Tout montrer" })).toBeVisible();
  await tool.getByRole("button", { name: "Tout montrer" }).click();
  await expect(page.locator("[data-zone-isolated]")).toHaveCount(0);

  await tool.getByRole("button", { name: "Garder" }).click();
  await expect(page.getByText(/^Mur gardé/)).toBeVisible();
  await tool.getByRole("button", { name: "Poser" }).click();
  await expect(page.getByText("Mur posé : Mur B.")).toBeVisible();
  await expect(tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").nth(1)).toContainText("Modifier");

  await click(page, '[data-workshop="dressing-style"]');
  const style = page.getByRole("dialog", { name: "Style du dressing" });
  await style.getByRole("button", { name: "Chêne et noir" }).click();
  await expect(page.getByText("Style appliqué : Chêne et noir.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Module marche sur les étagères copiées et alignées, jusqu'au bord et sur un autre mur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Module copié e2e");
  const { at } = await ready(page);
  const [mx, my] = at(0.38, 0.55);
  await page.mouse.click(mx, my, { button: "right" });
  await page.getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await shelves.getByRole("combobox").first().selectOption("3");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1000);

  // The niche at the left edge, seen in perspective, aligned on the model.
  await page.mouse.click(mx, my, { button: "right" });
  await page.getByRole("menuitem", { name: "Aligner sur cette niche" }).click();
  const copy = page.getByRole("dialog", { name: "Copier une niche" });
  await page.mouse.click(...at(0.2, 0.55));
  await expect(page.getByText("Étagères alignées.")).toBeVisible();
  await copy.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1000);

  await click(page, '[data-action="module"]');
  const mod = page.getByRole("dialog", { name: "Module" });
  await page.mouse.click(...at(0.2, 0.5));
  await expect(mod).toContainText("Modifier : Étagères");
  await mod.getByRole("button", { name: "Penderie longue" }).click();
  await mod.getByRole("button", { name: "OK", exact: true }).click();
  await expect(tree(page).getByText("Penderie 1", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);

  // A niche of another wall than the last one made: Module follows the click.
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").nth(1).getByRole("button").last().click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "OK", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1000);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(700);
  await click(page, '[data-action="module"]');
  await page.waitForTimeout(500);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width * 0.38, view.y + view.height * 0.55);
  await expect(page.getByRole("dialog", { name: "Module" })).toContainText("Modifier : ");
  expect(errors).toEqual([]);
});

test("Voir isole un mur : seul avec ses cotes, et il le reste pendant le travail", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Isoler e2e");
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En U", exact: true }).click();
  await tool.getByLabel("Dessiner les murs").check();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.getByRole("button", { name: "Remplir", exact: true }).first().click();
  await tool.getByRole("button", { name: /caissons? / }).first().click();
  await expect(tool.getByRole("button", { name: "Voir" }).first()).toBeVisible();
  await tool.getByRole("button", { name: "Remplir", exact: true }).first().click();
  await tool.getByRole("button", { name: /caissons? / }).first().click();
  await tool.getByRole("button", { name: "Voir" }).first().click();
  const bar = page.locator("[data-zone-isolated]");
  await expect(bar).toContainText("Mur A isolé");
  await page.waitForTimeout(800);
  const shown = await page.evaluate(() => document.querySelectorAll(".cad-piece-dim").length);
  expect(shown).toBe(0);
  await expect(page.locator(".cad-plan-dim").first()).toBeVisible();

  // A tool from the ribbon works on that wall, and the wall stays alone after its OK.
  await tool.getByRole("button", { name: "Terminer" }).click();
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  // Through an empty niche, the hidden wall behind it is neither lit nor picked.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.locator('[data-ref="status-selection"]')).toHaveText("Aucune sélection");
  await click(page, '[data-action="module"]');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const mod = page.getByRole("dialog", { name: "Module" });
  await expect(mod).toContainText("Niche choisie");
  await mod.getByRole("button", { name: "OK", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  await expect(bar).toContainText("Mur A isolé");
  await bar.getByRole("button", { name: "Tout montrer" }).click();
  await expect(bar).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test("Cloisons coupe la niche mère : les étagères restent d'un côté, l'autre devient vide", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Niche mère e2e");
  const { at } = await ready(page);
  const [mx, my] = at(0.38, 0.55);
  await page.mouse.click(mx, my, { button: "right" });
  await page.getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await shelves.getByRole("combobox").first().selectOption("3");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1000);

  await page.mouse.click(mx, my, { button: "right" });
  await page.getByRole("menuitem", { name: "Cloisons" }).click();
  const cloisons = page.getByRole("dialog", { name: "Cloisons" });
  const niche = await cloisons.innerText();
  await cloisons.getByLabel("Couper toute la niche mère").check();
  await expect(cloisons).not.toHaveText(niche);
  await expect(cloisons.getByLabel("Ce qu'elle contient va")).toHaveValue("left");
  await cloisons.getByRole("button", { name: "OK", exact: true }).click();
  await cloisons.getByRole("button", { name: "Terminer" }).click();
  await expect(tree(page).getByText("Cloison 1", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(tree(page).getByText("Étagères", { exact: true }).first().locator("..")).toContainText("3");
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});

test("une cloison à travers trois niches coupe les deux étagères entre elles", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Cloison à travers e2e");
  const { at } = await ready(page);
  await page.mouse.click(...at(0.38, 0.5), { button: "right" });
  await page.getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await shelves.getByRole("combobox").first().selectOption("5");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1200);

  await click(page, '[data-action="cloisons"]');
  const cloisons = page.getByRole("dialog", { name: "Cloisons" });
  for (const y of [0.37, 0.47, 0.57]) {
    await page.mouse.move(...at(0.38, y));
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
  await expect(cloisons).toContainText("3 niches choisies");
  await expect(cloisons.getByLabel("Une seule cloison, qui coupe les étagères")).toBeChecked();
  await cloisons.getByRole("button", { name: "OK", exact: true }).click();
  await cloisons.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect(tree(page).getByText("Cloison 1", { exact: true }).first()).toBeVisible();
  // 5 shelves: 3 stay whole, the 2 of the middle are cut in two.
  await expect(tree(page).getByText("Étagères", { exact: true }).first().locator("..")).toContainText("7");

  // The right half of a row and the whole row under it: their cloisons on one straight line.
  await click(page, '[data-action="cloisons"]');
  const line = page.getByRole("dialog", { name: "Cloisons" });
  for (const [x, y] of [[0.46, 0.37], [0.46, 0.47], [0.38, 0.65]] as const) {
    await page.mouse.move(...at(x, y));
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
  await expect(line.getByLabel("Cloisons alignées sur une seule ligne")).toBeChecked();
  await expect(line).toContainText("Cloisons sur une même ligne");
  await line.getByRole("button", { name: "OK", exact: true }).click();
  await line.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});

test("façades communes, chants d'un clic et modèle d'étiquette", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Atelier e2e");
  const { at } = await ready(page);

  // One door over two cases, from the view.
  await click(page, '[data-workshop="door-fronts"]');
  const fronts = page.getByRole("dialog", { name: "Façades communes" });
  await expect(fronts).toBeVisible();
  await expect(fronts.locator("[data-fronts-state]")).toContainText("première case");
  const [x1, y1] = at(0.38, 0.55);
  await page.mouse.click(x1, y1);
  await expect(fronts.locator("[data-fronts-state]")).toContainText("dernière case");
  const [x2, y2] = at(0.55, 0.55);
  await page.mouse.click(x2, y2);
  await expect(page.getByText(/Une seule porte sur 2 cases/)).toBeVisible();
  await page.waitForTimeout(800);
  await fronts.getByRole("combobox", { name: "Sens d'ouverture" }).selectOption("right");
  await page.waitForTimeout(800);
  await fronts.getByRole("button", { name: "Terminer" }).click();
  await expect(fronts).toHaveCount(0);

  // An edge band laid with a click, then taken off; Échap closes the tool.
  await click(page, '[data-workshop="edge-paint"]');
  const paint = page.getByRole("dialog", { name: "Peindre les chants" });
  await expect(paint).toBeVisible();
  await paint.getByRole("combobox", { name: "Au clic" }).selectOption("all");
  await page.mouse.click(x1, y1);
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await expect(paint).toHaveCount(0);

  // The label template: its preview follows, and it is kept.
  await click(page, '[data-workshop="labels"]');
  const labels = page.getByRole("dialog", { name: "Étiquettes" });
  await expect(labels).toContainText("Aperçu");
  await labels.getByRole("combobox", { name: "QR code" }).selectOption("none");
  await labels.getByRole("checkbox", { name: "Projet" }).uncheck();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("cao.label-template") ?? "{}") as { qr: string; fields: string[] });
  expect(kept.qr).toBe("none");
  expect(kept.fields).not.toContain("project");
  expect(await page.locator("[data-label-preview]").evaluate((n) => n.shadowRoot?.querySelector(".qr"))).toBeFalsy();
  await labels.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(labels).toHaveCount(0);

  // The cut list filters.
  await click(page, '[data-workshop="cutlist"]');
  const filter = page.getByLabel("Filtrer la liste de débit");
  await filter.fill("xyz-rien");
  await expect(page.locator("[data-cut-count]")).toContainText("0");
  expect(errors).toEqual([]);
});

test("Éclairage d'un mur de dressing : un ruban par niche, même esquisse cachée, et il ne fait pas échouer l'historique", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Lumière e2e");
  const { at } = await ready(page);
  const [x, y] = at(0.38, 0.55);
  await page.mouse.click(x, y, { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await shelves.getByRole("combobox").first().selectOption("3");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");

  // The wall's sketch hidden: its panels are still the furniture.
  await page.getByRole("button", { name: "Masquer Plan — mur a", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Afficher Plan — mur a", exact: true })).toBeVisible();
  await click(page, '[data-action="lighting"]');
  await expect(page.getByText(/7 ruban\(s\) LED/)).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).first().click();
  await expect(tree(page).getByRole("button", { name: /^Masquer Ruban LED/ })).toHaveCount(7);
  await expect(page.locator('[data-status="error"], [data-state="error"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("une cloison coupe aussi les étagères d'un module, faites en deux fois", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Cloison module e2e");
  const { at } = await ready(page);
  await page.mouse.click(...at(0.38, 0.5), { button: "right" });
  await page.getByRole("menuitem", { name: "Module" }).click();
  const moduleTool = page.getByRole("dialog", { name: "Module" });
  await moduleTool.getByRole("button", { name: /^Tiroirs et étagères/ }).first().click();
  await moduleTool.getByRole("button", { name: "OK", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await click(page, '[data-action="cloisons"]');
  const cloisons = page.getByRole("dialog", { name: "Cloisons" });
  // The drawers' niche and the three above the shelf that closes them.
  for (const y of [0.41, 0.485, 0.55, 0.667]) {
    await page.mouse.move(...at(0.38, y));
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
  await expect(cloisons.getByLabel("Une seule cloison, qui coupe les étagères")).toBeChecked();
  await expect(cloisons.locator("[data-cut-shelves]")).toContainText("Elle coupe 3 étagères");
  await cloisons.getByRole("button", { name: "OK", exact: true }).click();
  await cloisons.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect(tree(page).getByText("Cloison 1", { exact: true }).first()).toBeVisible();
  await expect(tree(page).getByText("Cloison 2", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Déformer agrandit une face depuis son centre, à la poignée ou au chiffre", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Déformer e2e");
  const view = page.locator("canvas.cad-view");
  const box = (await view.boundingBox())!;
  await click(page, '[data-action="ffd"]');
  const tool = page.getByRole("dialog", { name: "Déformer" });
  await expect(tool).toContainText("Cliquez la face");

  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await expect(tool).toContainText("Face de");
  await tool.getByRole("textbox", { name: "Échelle" }).fill("1,5");
  await tool.getByRole("textbox", { name: "Échelle" }).press("Enter");
  await expect(tool).toContainText("Devient");
  await page.waitForTimeout(800);
  await tool.getByRole("textbox", { name: "Échelle" }).fill("1");
  await tool.getByRole("textbox", { name: "Échelle" }).press("Enter");

  // The pointer over a green handle turns into a hand: it is there that the drag starts.
  let handle: { x: number; y: number } | null = null;
  for (let y = box.y + 40; !handle && y < box.y + box.height - 40; y += 8) {
    for (let x = box.x + 40; !handle && x < box.x + box.width - 40; x += 8) {
      await page.mouse.move(x, y);
      if (await view.evaluate((c) => c.style.cursor === "grab")) handle = { x, y };
    }
  }
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x, handle!.y);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 60, handle!.y - 25, { steps: 6 });
  await page.mouse.up();
  await expect(tool).toContainText("Devient");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect(page.getByText("Aucun corps")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Panneaux sur faces : les faces d'un volume deviennent des panneaux", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Panneaux sur faces e2e");
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  await click(page, '[data-action="paneling"]');
  const tool = page.getByRole("dialog", { name: "Panneaux sur faces" });
  await expect(tool).toContainText("Cliquez une face du volume");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await expect(tool).toContainText("1 face(s) en panneaux");
  await tool.getByRole("button", { name: "Toutes les faces planes" }).click();
  await expect(tool).toContainText("6 face(s) en panneaux");
  await tool.getByRole("textbox", { name: "Épaisseur" }).fill("0,5");
  await tool.getByRole("textbox", { name: "Épaisseur" }).press("Enter");
  await expect(tool.getByRole("button", { name: "OK", exact: true })).toBeEnabled({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect(page.getByLabel(/^Navigateur : corps/).getByText(/panneau 6/i).first()).toBeVisible();
  // Les panneaux en onglet ne sont pas pris pour des pièces qui se chevauchent.
  await page.getByText(/à vérifier/).last().click();
  await expect(page.getByText(/se chevauchent/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
