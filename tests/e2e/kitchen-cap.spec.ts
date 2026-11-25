/** La casquette des meubles hauts du Plan de cuisine dans un vrai navigateur : choisie, bâtie par le noyau, dessinée sur la bande. */
import { expect, test } from "@playwright/test";
import { newProject, openCard } from "./helpers";

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
  // 60 cm deep, its back against the wall unit's: it comes out in front of it.
  expect(cap.depth).toBe(600);
  expect(cap.origin).toEqual([unit.origin[0], unit.origin[1]! - (600 - unit.depth), unit.origin[2]! + unit.height]);
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
