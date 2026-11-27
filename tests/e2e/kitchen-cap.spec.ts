/** La casquette des meubles hauts du Plan de cuisine dans un vrai navigateur : choisie, bâtie par le noyau, dessinée sur la bande. */
import { expect, test } from "@playwright/test";
import { newProject, openCard, wallsOnly } from "./helpers";

test("plan de cuisine : une casquette en caisson sur les meubles hauts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-casquette");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await openCard(tool, "Matières et finitions");
  await tool.locator("[data-plan-cap]").selectOption("box");
  await expect(tool.getByLabel(/^Hauteur de la casquette/)).toHaveValue(/^8|^80/);
  await expect(tool.getByLabel(/^Débord de la casquette/)).toBeVisible();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  // Its top, the band in front, built by the kernel; drawn on the run's strip as the finishing sides.
  await expect(page.locator('[title="Casquette A — OK"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[title="Bandeau de casquette A — OK"]').first()).toBeAttached();
  await tool.locator('[data-open-run="A"]').click();
  // On the strip: the top and the band in front of each piece, and its ends at the free ends.
  await expect(tool.locator('[data-run-strip="A"] [data-finish="cap"]').first()).toBeAttached();
  expect(errors).toEqual([]);
});

test("plan de cuisine : la casquette en caissons à porte relevante, un caisson sur chaque meuble haut", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-casquette-caissons");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await openCard(tool, "Matières et finitions");
  await tool.locator("[data-plan-cap]").selectOption("units");
  // Their height only: each as wide and deep as the unit under it.
  await expect(tool.getByLabel(/^Hauteur des caissons/)).toHaveValue(/^35/);
  await expect(tool.getByLabel(/^Débord de la casquette/)).toHaveCount(0);
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  await expect(page.locator('[title^="Casquette"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[title^="Bandeau de casquette"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Meubles de cuisine, avec un Plan de cuisine : la casquette se pose sur le meuble haut, pas à côté dans le linéaire", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-test-casquette-catalogue");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-units"]')?.click());
  await page.getByRole("tablist", { name: "Familles de meubles" }).getByRole("tab", { name: "Hauts" }).click();
  await page.locator('[data-unit="wall-haut-1-porte-600"]').click();
  await expect(page.getByText("Haut 1 porte 600 (A1)").first()).toBeVisible({ timeout: 60_000 });
  // The casquettes in their own tab, beside « Hauts » (no longer among them).
  await expect(page.locator('[data-unit="wall-casquette-relevante-600"]')).toHaveCount(0);
  await page.getByRole("tablist", { name: "Familles de meubles" }).getByRole("tab", { name: "Casquettes" }).click();
  await page.locator('[data-unit="wall-casquette-relevante-600"]').click();
  await expect(page.getByText(/Casquette relevante 600 ajouté/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  type Cab = { type: string; name: string; origin: number[]; height: number; depth: number };
  const cabinets = (project.document.features as Cab[]).filter((f) => f.type === "cabinet");
  const unit = cabinets.find((c) => c.name === "Haut 1 porte 600 (A1)")!;
  const cap = cabinets.find((c) => c.name.startsWith("Casquette relevante 600"))!;
  // 58 cm deep (as a column), its back against the wall unit's: it comes out in front of it.
  expect(cap.depth).toBe(580);
  expect(cap.origin).toEqual([unit.origin[0], unit.origin[1]! - (580 - unit.depth), unit.origin[2]! + unit.height]);
  expect(errors).toEqual([]);
});

test("dans un linéaire du Plan de cuisine, choisir une casquette met la casquette du plan en caissons", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-casquette-lineaire");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.getByRole("tab", { name: "Casquettes" }).click();
  await tool.locator('[data-add="wall-casquette-sur-colonne-400"]').click();
  await expect(page.getByText(/Casquette en caissons à porte relevante/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/ne tient pas sur ce linéaire/)).toHaveCount(0);
  await expect(page.locator('[title^="Casquette"]').first()).toBeAttached({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("Plan de cuisine : l'habillage de réfrigérateur pris dans l'onglet Colonnes, sans erreur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-habillage-plan");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.getByRole("tab", { name: "Colonnes" }).click();
  // Its widths, and one's own (made to measure, as a unit).
  await expect(tool.locator('[data-add^="app-fridge-surround-"]')).toHaveCount(7);
  await expect(tool.locator('[data-width-other^="app-fridge-surround-"]')).toBeVisible();
  await tool.locator('[data-add="app-fridge-surround-968"]').click();
  // The fridge's height, set: its caisson takes the rest.
  const chosen = tool.locator('[data-fold="chosen"]');
  if ((await chosen.getAttribute("aria-expanded")) !== "true") await chosen.click();
  await expect(tool.locator('[data-size="fridge"]')).toHaveValue("187");
  await tool.locator('[data-size="fridge"]').fill("178");
  await tool.locator('[data-size="fridge"]').press("Enter");
  await expect(tool.locator('[data-size="fridge"]')).toHaveValue("178");
  await tool.locator("[data-run-close]").click();
  await expect(page.locator('[title^="Côté gauche habillage"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  expect(errors).toEqual([]);
});


test("plan de cuisine : le décalage de l'îlot se tape, d'un côté ou de l'autre du milieu du mur A", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-ilot-decale");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await openCard(tool, "Cotes");
  await tool.getByRole("checkbox", { name: "Îlot", exact: true }).check();
  const shift = tool.getByLabel(/^Décalage de l'îlot/);
  await expect(shift).toHaveValue("0");
  await shift.fill("-40");
  await shift.press("Enter");
  await expect(tool.getByLabel(/^Décalage de l'îlot/)).toHaveValue("-40");
  await expect(tool.getByLabel(/^Décalage de l'îlot/)).not.toHaveAttribute("aria-invalid", "true");
  // Too far: the plan says so, and cannot be made.
  await tool.getByLabel(/^Décalage de l'îlot/).fill("900");
  await tool.getByLabel(/^Décalage de l'îlot/).press("Enter");
  await expect(tool.getByText(/L'îlot se décale d'au plus/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("plan de cuisine : un linéaire vidé oublie où allait son reste, son premier meuble se colle à l'angle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-reste-oublie");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="B"]').click();
  const fold = async (name: string) => {
    const f = tool.locator(`[data-fold="${name}"]`);
    if ((await f.getAttribute("aria-expanded")) !== "true") await f.click();
  };
  await fold("add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await fold("space");
  // Of itself, wall B's rest is at its free end: its units stand against the corner.
  await expect(tool.locator('[data-rest="start"]')).toHaveAttribute("aria-pressed", "true");
  await tool.locator('[data-rest="end"]').click();
  await expect(tool.locator('[data-rest="end"]')).toHaveAttribute("aria-pressed", "true");
  // Emptied, then a unit again: back against the corner, not where the older arrangement left the rest.
  await tool.getByRole("button", { name: "Vider le linéaire" }).click();
  await fold("add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await fold("space");
  await expect(tool.locator('[data-rest="start"]')).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("un champ de nombre cliqué a tout son contenu sélectionné : on tape la nouvelle valeur directement", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-champ-selectionne");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await openCard(tool, "Cotes");
  const wall = tool.getByLabel(/^Longueur mur A/);
  await wall.click();
  await expect.poll(() => wall.evaluate((f) => [(f as HTMLInputElement).selectionStart, (f as HTMLInputElement).selectionEnd, (f as HTMLInputElement).value.length])).toEqual([0, 3, 3]);
  await page.keyboard.type("420");
  await page.keyboard.press("Enter");
  await expect(tool.getByLabel(/^Longueur mur A/)).toHaveValue("420");
  // A second click in the field already chosen puts the caret, to change one figure.
  const depth = tool.getByLabel(/^Hauteur sous plafond/);
  await depth.click();
  await depth.click();
  await expect.poll(() => depth.evaluate((f) => (f as HTMLInputElement).selectionStart === (f as HTMLInputElement).selectionEnd)).toBe(true);
  expect(errors).toEqual([]);
});

test("plan de cuisine : les façades de toute la cuisine — style, poignées, couleur, épaisseur — bâties par le noyau", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-facades-cuisine");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await openCard(tool, /^Façades$/);
  // Only what fronts are made of: no backing panel, no batten.
  const materials = await tool.getByLabel("Matière des façades", { exact: true }).locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
  expect(materials).not.toContain("hdf");
  expect(materials).not.toContain("pine-batten");
  await tool.locator("[data-front-style]").selectOption("frame");
  await tool.locator("[data-front-handles]").selectOption("none");
  await tool.locator("[data-front-color]").evaluate((c) => {
    (c as HTMLInputElement).value = "#2f5d50";
    c.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const thick = tool.locator("[data-front-thickness]");
  await thick.fill(await thick.evaluate((f) => ((f as HTMLInputElement).getAttribute("aria-label") ?? "").includes("(mm)") ? "22" : "2,2"));
  await thick.press("Enter");
  await expect(tool.locator("[data-front-style]")).toHaveValue("frame");
  await expect(tool.locator("[data-front-handles]")).toHaveValue("none");
  await expect(tool.locator("[data-front-color-clear]")).toBeEnabled();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  await expect(page.locator('[title^="Façades "]').first()).toBeAttached({ timeout: 60_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/facades-cuisine.png` });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("plan de cuisine : une colonne à deux portes, une de face et une sur son côté gauche, bâtie par le noyau", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-porte-cote");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const fold = async (name: string) => {
    const f = tool.locator(`[data-fold="${name}"]`);
    if ((await f.getAttribute("aria-expanded")) !== "true") await f.click();
  };
  await fold("add");
  await tool.getByRole("tab", { name: "Colonnes" }).click();
  await tool.locator('[data-add^="tall-colonne-rangement-"]').first().click();
  await fold("chosen");
  await tool.locator("[data-side-door]").selectOption("left");
  await expect(tool.locator("[data-side-door]")).toHaveValue("left");
  await tool.locator("[data-run-close]").click();
  await expect(page.locator('[title^="Façades "][title*="(2)"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/porte-cote.png` });
  expect(errors).toEqual([]);
});

test("plan de cuisine : la profondeur tapée sur une carte, pour tout ce modèle ou pour le prochain ajouté", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-profondeur-carte");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const fold = async (name: string) => {
    const f = tool.locator(`[data-fold="${name}"]`);
    if ((await f.getAttribute("aria-expanded")) !== "true") await f.click();
  };
  await fold("add");
  await tool.getByRole("tab", { name: "Bas", exact: true }).click();
  const card = tool.locator('[data-card-depth="base-bas-1-porte"]');
  const unit = (await card.getAttribute("aria-label"))!.match(/\((\w+)\)$/)![1];
  const typed = (mm: number) => (unit === "mm" ? String(mm) : unit === "m" ? String(mm / 1000).replace(".", ",") : String(mm / 10).replace(".", ","));
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  // For all of the model: the unit already put takes it.
  await card.fill(typed(500));
  await card.press("Enter");
  await fold("chosen");
  await expect(tool.locator('[data-size="depth"]')).toHaveValue(typed(500));
  // For the next added only: that one takes it, the model keeps its own.
  await fold("add");
  await tool.locator("[data-depth-for]").selectOption("next");
  await tool.locator('[data-card-depth="base-bas-1-porte"]').fill(typed(450));
  await tool.locator('[data-card-depth="base-bas-1-porte"]').press("Enter");
  await tool.locator('[data-add="base-bas-1-porte-400"]').click();
  await expect(tool.locator('[data-card-depth="base-bas-1-porte"]')).toHaveValue(typed(500));
  await fold("chosen");
  await expect(tool.locator('[data-size="depth"]')).toHaveValue(typed(450));
  await tool.locator("[data-run-close]").click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("plan de cuisine, « Plan fixe » : la carte ouverte reste seule, son titre fixé sous le plan ; fermée, les autres reviennent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-carte-seule");
  await page.evaluate(() => localStorage.removeItem("cao.fold-focus-off"));
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const heads = tool.locator("[data-fold]");
  const all = await heads.count();
  expect(all).toBeGreaterThan(3);
  await expect(tool.getByText(/^Cliquez un meuble, un appareil/)).toBeVisible();
  await tool.locator('[data-fold="add"]').click();
  // Alone: the other cards wait, and nothing stands between it and the plan (no hint, no buttons).
  await expect(heads).toHaveCount(1);
  await expect(tool.getByText(/^Cliquez un meuble, un appareil/)).toHaveCount(0);
  // Scrolled down: its title stays just under the fixed plan.
  await tool.locator('[data-add]').last().scrollIntoViewIfNeeded();
  const fixed = (await tool.locator("[data-run-fixed]").boundingBox())!;
  const head = (await tool.locator('[data-fold="add"]').boundingBox())!;
  expect(Math.abs(head.y - (fixed.y + fixed.height))).toBeLessThan(4);
  // Closed: the others are back.
  await tool.locator('[data-fold="add"]').click();
  await expect(heads).toHaveCount(all);
  expect(errors).toEqual([]);
});

test("plan de cuisine : « Caissons en Répartition », la cuisine proposée faite de caissons du dressing, bâtie par le noyau", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-caissons-repartition");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await openCard(tool, /^Façades$/);
  await tool.locator('[data-plan-switch="asCaissons"]').check();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  const tree = page.getByLabel(/^Navigateur : corps/);
  await expect(tree.getByText(/^Caisson — /).first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/caissons-repartition.png` });
  // The option over the cards of « Ajouter des meubles » too; the run emptied, its caissons go with their places.
  await tool.getByRole("button", { name: "Aménager" }).click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await expect(tool.locator("[data-run-as-caissons]")).toBeChecked();
  await tool.getByRole("button", { name: "Vider le linéaire" }).click();
  await expect(tree.getByText(/^Caisson — /)).toHaveCount(0, { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("plan de cuisine : l'habillage est un seul meuble — la hauteur de son caisson changée dans Caisson, ses côtés la suivent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-test-habillage-un-meuble");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.getByRole("tab", { name: "Colonnes" }).click();
  await tool.locator('[data-add="app-fridge-surround-968"]').click();
  await tool.locator("[data-run-close]").click();
  await expect(page.locator('[title^="Côté gauche habillage"]').first()).toBeAttached({ timeout: 60_000 });
  // Its caisson opened in the Caisson tool, from the history, 30 cm high.
  const ops = page.getByRole("toolbar", { name: "Historique des opérations" });
  const cabinetOp = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-op]")].map((b) => b.dataset.op!).find((id) => id.startsWith("cb")));
  await ops.locator(`[data-op="${cabinetOp}"]`).click();
  await page.getByRole("dialog", { name: /Habillage réfrigérateur/ }).getByRole("button", { name: "Modifier", exact: true }).click();
  const caisson = page.getByRole("dialog", { name: "Caisson", exact: true });
  const height = caisson.getByLabel(/^Hauteur/).first();
  const unit = (await height.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  await height.fill(unit === "mm" ? "300" : unit === "m" ? "0,3" : "30");
  await height.press("Enter");
  await page.waitForTimeout(1500);
  await caisson.getByRole("button", { name: "Fermer", exact: true }).click();
  // The sides end where the caisson now ends: 1870 + 30 + 300.
  await expect.poll(async () => {
    const doc = (await page.evaluate(async (url) => (await (await fetch(url, { headers: { Accept: "application/json" } })).json()).document, api)) as { features: { name: string; distance?: number }[] };
    return doc.features.find((f) => f.name.startsWith("Côté gauche habillage"))?.distance;
  }, { timeout: 30_000 }).toBe(2200);
  expect(errors).toEqual([]);
});

test("plan de cuisine : un meuble cliqué dans la 3D s'ouvre sous « Meuble choisi » de son linéaire", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-clic-meuble-choisi");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-ribbon-tab="kitchen"]')?.click());
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="kitchen-plan"]')?.click());
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  // A wall hardly wider than the surround: seen from the front, it is in the middle of the view.
  await openCard(tool, "Cotes");
  const length = tool.getByLabel(/^Longueur mur A/);
  const cm = (await length.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  await length.fill(cm === "mm" ? "1100" : cm === "m" ? "1,1" : "110");
  await length.press("Enter");
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.evaluate((b) => (b as HTMLElement).click());
  // (The strip of so short a wall stands over the panel: clicked through.)
  await tool.getByRole("tab", { name: "Colonnes" }).evaluate((b) => (b as HTMLElement).click());
  await tool.locator('[data-add="app-fridge-surround-968"]').evaluate((b) => (b as HTMLElement).click());
  await tool.locator("[data-run-close]").click();
  await expect(page.locator('[title^="Côté gauche habillage"]').first()).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  // A click on the surround, seen from the front: its run opens, it chosen there.
  const view = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(view.x + view.width * 0.47, view.y + view.height * 0.4);
  await expect(tool.locator('[data-fold="chosen"]')).toContainText(/Meuble choisi : Habillage/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("plan de cuisine : la hauteur de l'habillage a sa cote dans « Voir », tapée elle refait l'habillage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-hauteur-habillage");
  const click = (s: string) => page.evaluate((x) => document.querySelector<HTMLElement>(x)?.click(), s);
  await click('[data-ribbon-tab="kitchen"]');
  await click('[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await wallsOnly(tool);
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const head = tool.locator('[data-fold="add"]');
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await tool.getByRole("tab", { name: "Colonnes" }).click();
  await tool.locator('[data-add^="app-fridge-surround-"]').first().click();
  await tool.locator("[data-run-close]").click();
  await tool.locator('[data-see-run="A"]').click();
  // Beside it, its height (230 cm), to be typed; the ceiling (250 cm) has its own.
  const heights = page.locator('[data-run-dim="z"][data-editable]');
  await heights.filter({ hasText: /^230$/ }).click();
  const field = page.locator("[data-dim-editor]");
  await field.fill("240");
  await field.press("Enter");
  await expect(heights.filter({ hasText: /^240$/ })).toHaveCount(1, { timeout: 30_000 });
  await expect(heights.filter({ hasText: /^250$/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("sur la bande : la casquette se choisit d'un clic — sa sorte, sa hauteur, sa profondeur, et Supprimer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-casquette-bande");
  const click = (s: string) => page.evaluate((x) => document.querySelector<HTMLElement>(x)?.click(), s);
  await click('[data-ribbon-tab="kitchen"]');
  await click('[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await wallsOnly(tool);
  await openCard(tool, "Matières et finitions");
  await tool.locator("[data-plan-cap]").selectOption("box");
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const head = tool.locator('[data-fold="add"]');
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await tool.getByRole("tab", { name: "Hauts" }).click();
  await tool.locator('[data-add="wall-haut-1-porte-600"]').click();
  const names = async () => (await page.evaluate(() => document.body.innerText)).split("\n");
  await expect.poll(async () => (await names()).filter((l) => /^Bandeau de casquette A/.test(l)).length).toBe(1);
  // Chosen on the strip: outlined, its settings under the strip.
  await page.evaluate(() => document.querySelector<SVGElement>('[data-run-strip="A"] [data-cap-strip]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const bar = tool.locator("[data-strip-actions]");
  await expect(bar).toContainText("Casquette des meubles hauts");
  await expect(bar.locator("[data-strip-cap-kind]")).toHaveValue("box");
  await expect(tool.locator('[data-run-strip="A"] [data-cap-strip][stroke]')).not.toHaveCount(0);
  // 58 cm deep: the whole casquette.
  const depth = bar.locator("[data-strip-capDepth]");
  await depth.fill((await depth.getAttribute("aria-label"))?.includes("(mm)") ? "580" : "58");
  await depth.press("Enter");
  await expect.poll(async () => (await names()).filter((l) => /^Bandeau de casquette A/.test(l)).length).toBe(1);
  // Deleted (the button, or Suppr): no casquette left.
  await page.evaluate(() => document.querySelector<SVGElement>('[data-run-strip="A"] [data-cap-strip]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await tool.locator("[data-strip-actions]").getByRole("button", { name: "Supprimer la casquette" }).click();
  await expect.poll(async () => (await names()).filter((l) => /^(Casquette|Bandeau de casquette|Bout de casquette) [A-Z]/.test(l)).length).toBe(0);
  expect(errors).toEqual([]);
});
