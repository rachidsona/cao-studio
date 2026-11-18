/** Le Plan de cuisine dans un vrai navigateur : le plan vu de dessus, un linéaire aménagé sur sa bande de face, la cuisine proposée, le plan modifié. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { newProject } from "./helpers";

/** Where to keep pictures of each step, when asked (SHOTS=<dossier>). */
const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const tree = (page: Page) => page.evaluate(() => document.body.innerText);
/** A folded part of the panel opened (the others close). */
const unfold = async (scope: Locator, key: string) => {
  const head = scope.locator(`[data-fold="${key}"]`);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
};

test("plan de cuisine : plan en L avec îlot, mur A aménagé, cuisine proposée puis plan modifié", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByLabel("Îlot", { exact: true }).check();
  await expect(tool.getByLabel("Mur B passe", { exact: false }).or(tool.getByLabel("Angle gauche"))).toBeVisible();
  await shot(page, "1-reglages");
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  const runs = tool.getByRole("list", { name: "Linéaires du plan" });
  await expect(runs.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("Plan de la cuisine").first()).toBeVisible();

  // Wall A, unit by unit on its front view.
  await tool.locator('[data-open-run="A"]').click();
  await expect(tool.getByRole("heading", { name: "Linéaire — mur A" })).toBeVisible();
  await unfold(tool, "add");
  await tool.getByRole("tab", { name: "Électro." }).click();
  await tool.locator('[data-add="app-sink-600"]').click();
  await tool.locator('[data-add="app-dishwasher-600"]').click();
  await tool.getByRole("tab", { name: "Bas" }).click();
  await tool.locator('[data-add="base-bas-3-tiroirs-600"]').click();
  await tool.getByRole("tab", { name: "Électro." }).click();
  await tool.locator('[data-add="app-hob-oven-600"]').click();
  await tool.getByRole("tab", { name: "Hauts" }).click();
  await tool.locator('[data-add="wall-haut-1-porte-600"]').click();
  await expect(tool.locator('[data-run-strip="A"] [data-item]')).toHaveCount(5);
  // What is left stays open, dashed, with its width: no big filler.
  await expect(tool.locator('[data-fold="space"]')).toContainText("libres en bas");
  await expect(tool.locator('[data-run-strip="A"] [data-free="base"]')).toHaveCount(1);
  // The drawers chosen on the strip, a step to the left, then wider.
  await tool.locator('[data-run-strip="A"] [data-item]').nth(2).click();
  await expect(tool.locator('[data-fold="chosen"]')).toContainText("Bas 3 tiroirs");
  await tool.locator("[data-run-item]").getByRole("button", { name: "←" }).click();
  await tool.locator('[data-run-item] [data-width="800"]').click();
  await expect(tool.locator('[data-fold="chosen"]')).toContainText(/Bas 3 tiroirs · 80/);
  await expect(tool.locator('[data-run-strip="A"] [data-free="base"]')).toHaveCount(1);
  await shot(page, "2-lineaire");
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText(/Mur A aménagé/).first()).toBeVisible();
  await expect(page.getByText("Évier 600 (A1)").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Plan de travail A").first()).toBeVisible();

  // The whole kitchen proposed, as the Implantation does it.
  await tool.locator("[data-propose]").click();
  await page.getByRole("button", { name: "Proposer", exact: true }).click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  await expect(page.getByText("Plan de travail B").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Plan de travail I").first()).toBeVisible();
  await expect(page.getByText("Hotte").first()).toBeVisible();
  expect(await tree(page)).toMatch(/Colonne réfrigérateur 600/);
  await shot(page, "3-proposee");

  // The plan changed: the kitchen follows; the island gone, its units with it.
  await tool.getByRole("button", { name: "Modifier le plan" }).click();
  const length = tool.getByLabel(/^Longueur mur A/);
  const unit = (await length.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  await length.fill(unit === "mm" ? "4200" : unit === "m" ? "4,2" : "420");
  await length.press("Enter");
  await tool.getByLabel("Îlot", { exact: true }).uncheck();
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.getByRole("button", { name: "Appliquer", exact: true }).last().click();
  await expect(runs.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Plan de travail I")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText("Plan de travail A").first()).toBeVisible();
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();

  // A unit it made, chosen in the browser: its run opens again.
  await page.evaluate(() => ([...document.querySelectorAll<HTMLElement>('[data-select^="body:"]')].find((b) => /Évier 600/.test(b.textContent ?? "")) as HTMLElement | undefined)?.click());
  await expect(page.getByRole("heading", { name: "Linéaire — mur A" })).toBeVisible();
  await shot(page, "4-rouvert");
  expect(errors).toEqual([]);
});

test("meubles de cuisine : un clic sur une largeur range le meuble dans le linéaire du plan", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-meubles");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await expect(tool.getByRole("list", { name: "Linéaires du plan" })).toBeVisible();

  await click(page, '[data-workshop="kitchen-units"]');
  await expect(page.locator("[data-units-where]")).toContainText("plan de cuisine");
  await page.locator('[data-unit="base-bas-2-portes-1000"]').click();
  await expect(page.getByText(/Bas 2 portes rangé dans le plan de cuisine, mur A\. Place libre sur le mur A : .+ libres en bas/).first()).toBeVisible();
  await expect(page.locator("[data-units-space]")).toContainText("Mur A :");
  await expect(page.getByText("Bas 2 portes 1000 (A1)").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Plan de travail A").first()).toBeVisible();
  // The next one goes after it, on the same run.
  await page.locator('[data-unit="base-bas-3-tiroirs-600"]').click();
  await expect(page.getByText("Bas 3 tiroirs 600 (A2)").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Bas 2 portes 1000 (A1)").first()).toBeVisible();
  await expect(page.locator("[data-units-where]")).toContainText("mur A, après le meuble choisi");
  await shot(page, "5-meubles-dans-le-plan");
  expect(errors).toEqual([]);
});

test("angles : chaque angle se choisit dans le linéaire ou dans Meubles de cuisine, et la cuisine suit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-angles");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En U", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "corners");
  const left = tool.locator('[data-corner-choice="left"]');
  await expect(left.locator("[data-corner-kind]")).toHaveCount(7);
  await left.locator('[data-corner-kind="lemans"]').click();
  await expect(left.locator('[data-corner-kind="lemans"]')).toHaveAttribute("aria-checked", "true");
  await expect(tool.locator('[data-run-strip="A"] [data-corner-front="door"]')).toHaveCount(1);
  await shot(page, "6-angle-lineaire");
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Meuble d'angle LeMans A").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Plateau LeMans 1 A").first()).toBeVisible();

  await click(page, '[data-workshop="kitchen-units"]');
  await page.getByRole("tablist", { name: "Familles de meubles" }).getByRole("tab", { name: "Angles" }).click();
  await page.locator('[data-corner-choice="right"] [data-corner-kind="l"]').click();
  await expect(page.getByText(/Meuble d'angle en L dans l'angle/).first()).toBeVisible();
  await expect(page.getByText("Meuble d'angle en L A (droite)").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Meuble d'angle en L C").first()).toBeVisible();
  await shot(page, "7-angle-catalogue");
  // A carousel and a Magic Corner: their fittings built in their cabinets.
  await page.locator('[data-corner-choice="right"] [data-corner-kind="carousel"]').click();
  await expect(page.getByText("Plateau tournant 1 A (droite)").first()).toBeVisible({ timeout: 60_000 });
  await page.locator('[data-corner-choice="left"] [data-corner-kind="magic"]').click();
  await expect(page.getByText("Panier Magic Corner 4 A").first()).toBeVisible({ timeout: 60_000 });
  // Cut at 45°: its boards drawn to their outline, built by the kernel.
  await page.locator('[data-corner-choice="left"] [data-corner-kind="diagonal"]').click();
  await expect(page.locator('[title="Meuble d\'angle en biais A — porte en biais — OK"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[title="Meuble d\'angle en biais A — dessous — OK"]').first()).toBeAttached();
  await expect(page.locator('[data-ref="status-recompute"]')).toHaveText(/^Recalcul \d+ ms$/);
  expect(errors).toEqual([]);
});

test("linéaire : un bouton par mur pour voir les autres, ce qui est changé appliqué d'abord", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-murs");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En U", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="B"]').click();
  const walls = tool.getByRole("group", { name: "Voir un autre linéaire" });
  await expect(walls.getByRole("button")).toHaveCount(3);
  await expect(walls.locator('[data-go-run="B"]')).toHaveAttribute("aria-pressed", "true");
  // Nothing changed: wall C opens at once.
  await walls.locator('[data-go-run="C"]').click();
  await expect(tool.getByRole("heading", { name: "Linéaire — mur C" })).toBeVisible();
  // A unit added, then wall B asked for: what waits is stored first.
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  // Still in sight with the panel scrolled down.
  await expect(tool.getByRole("group", { name: "Voir un autre linéaire" })).toBeInViewport();
  await shot(page, "8-murs");
  await tool.getByRole("group", { name: "Voir un autre linéaire" }).locator('[data-go-run="B"]').click();
  await expect(tool.getByRole("heading", { name: "Linéaire — mur B" })).toBeVisible();
  await expect(page.getByText("Bas 1 porte 600 (C1)").first()).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("linéaire : le reste partagé en deux, un fileur de chaque côté, entre les angles", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-reste");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En U", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  // Wall A between its two corners: 360 − 2 × 62,9 = 234,2 cm; 120 + 60 + 40 = 220 cm, 14,2 cm left.
  await unfold(tool, "add");
  for (const unit of ["base-bas-2-portes-1200", "base-bas-1-porte-600", "base-bas-1-porte-400"]) await tool.locator(`[data-add="${unit}"]`).click();
  const strip = tool.locator('[data-run-strip="A"]');
  await expect(strip.locator("[data-filler]")).toHaveCount(1);
  // The splashback over the units, as the 3D has it.
  await expect(strip.locator('[data-finish="splashback"]').first()).toBeAttached();
  // Only the room left free is hatched (the wall row, still empty), not the corners the corner units take.
  await expect(strip.locator('[data-empty="free"]')).toHaveCount(1);
  await expect(strip.locator("[data-empty]")).toHaveCount(1);
  await unfold(tool, "space");
  await expect(tool.locator('[data-rest="both"]')).toContainText("2 fileurs de");
  await tool.locator('[data-rest="both"]').click();
  await expect(tool.locator('[data-rest="both"]')).toHaveAttribute("aria-pressed", "true");
  await expect(strip.locator("[data-filler]")).toHaveCount(2);
  await shot(page, "9-reste-partage");
  // A filler of the plan clicked: the two put by hand in their places (nothing moves), the one clicked chosen as a unit
  // is; Suppr takes it out, its room left free (not closed again by the plan).
  await strip.locator("[data-filler]").first().click();
  await expect(strip.locator("[data-hand-filler]")).toHaveCount(2);
  await expect(strip.locator("[data-filler]")).toHaveCount(0);
  await page.keyboard.press("Delete");
  await expect(strip.locator("[data-hand-filler]")).toHaveCount(1);
  await expect(strip.locator("[data-filler]")).toHaveCount(0);
  await expect(strip.locator('[data-free="base"]')).toHaveCount(1);
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Fileur posé A1").first()).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("linéaire : le reste contre les murs, entre chaque mur et son meuble d'angle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-murs-reste");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En U", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  // No corner unit yet: no such choice.
  await unfold(tool, "space");
  await expect(tool.locator('[data-rest="walls"]')).toHaveCount(0);
  await unfold(tool, "corners");
  for (const side of ["left", "right"]) await tool.locator(`[data-corner-choice="${side}"] [data-corner-kind="unit"]`).click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-2-portes-1200"]').click();
  await unfold(tool, "space");
  await expect(tool.locator('[data-rest="walls"]')).toContainText("2 fileurs muraux de");
  await tool.locator('[data-rest="walls"]').click();
  await expect(tool.locator('[data-run-strip="A"] [data-corner-front="filler"]')).toHaveCount(2);
  await tool.locator('[data-run-strip="A"]').scrollIntoViewIfNeeded();
  await shot(page, "10-contre-les-murs");
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Fileur mural A").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Fileur mural A (droite)").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("linéaire : les cotes d'un meuble se tapent, ou sa largeur se tire par son bord sur la bande", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-cotes");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  await strip.locator("[data-item]").first().click();
  const panel = tool.locator("[data-run-item]");
  // Typed, in the display unit.
  const width = panel.locator('[data-size="width"]');
  const unit = (await width.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  const typed = (mm: number) => (unit === "mm" ? String(mm) : unit === "m" ? String(mm / 1000).replace(".", ",") : String(mm / 10).replace(".", ","));
  await width.fill(typed(640));
  await width.press("Enter");
  await expect(panel).toContainText("Sur mesure");
  await expect(strip.locator("[data-item]").first()).toContainText("64");
  const depth = panel.locator('[data-size="depth"]');
  await depth.fill(typed(400));
  await depth.press("Enter");
  await expect(panel.locator('[data-size="depth"]')).toHaveValue(typed(400));
  // Pulled by its right edge on the strip: 64 cm → about 70 cm.
  const handle = strip.locator("[data-resize]");
  const box = (await handle.boundingBox())!;
  const svg = (await strip.locator("svg").boundingBox())!;
  const perMm = svg.width / (3600 + 80);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60 * perMm, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(panel.locator('[data-size="width"]')).toHaveValue(typed(700));
  await shot(page, "11-cotes");
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Bas 1 porte 700 (A1)").first()).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("plan de cuisine : les réglages de l'Implantation, socle, plan, crédence, plinthes, et ce que Proposer met", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-reglages");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await expect(tool.getByLabel(/^Socle/)).toBeVisible();
  await expect(tool.getByLabel(/^Épaisseur du plan de travail/)).toBeVisible();
  await tool.getByLabel("Façades des bas").selectOption("drawers");
  await tool.locator('[data-plan-switch="splashback"]').uncheck();
  await tool.locator('[data-plan-switch="wallUnits"]').uncheck();
  await tool.getByLabel("Retour du plan aux bouts libres").selectOption("miter");
  await tool.locator('[data-plan-switch="endPanels"]').check();
  // Each look by its sphere: the list opened, Dekton Aura clicked, shown as the one chosen.
  await tool.locator('[data-worktop-looks] summary').click();
  await expect(tool.locator('[data-worktop-look="dekton-aura"] img')).toHaveAttribute("src", /^data:image\/png/);
  await tool.locator('[data-worktop-look="dekton-aura"]').click();
  await expect(tool.locator('[data-worktop-looks] summary')).toContainText("Dekton Aura");
  await shot(page, "12-reglages");
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  await expect(page.getByText(/Bas 3 tiroirs \d+ \(A\d\)/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Plan de travail A").first()).toBeVisible();
  await expect(page.getByText("Crédence A")).toHaveCount(0);
  // The worktop down to the floor at a free end of the run, both cut at 45° (drawn upright, built by the kernel).
  await expect(page.getByText(/^Retour de plan A/).first()).toBeVisible();
  await expect(page.locator('[title="Retour de plan A (gauche) — OK"]').first()).toBeAttached();
  await expect(page.locator('[title="Plan de travail A — OK"]').first()).toBeAttached();
  // The finishing side against the fridge column, at the run's free end.
  await expect(page.getByText(/^Joue de finition A/).first()).toBeVisible();
  await shot(page, "13-retour-de-plan");
  await expect(page.getByText(/^Bas 1 porte|^Haut 1 porte/)).toHaveCount(0);
  // The run's strip draws them as the 3D has them: the return and the finishing side (no splashback: unticked).
  await tool.locator('[data-open-run="A"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  await expect(strip.locator('[data-finish="return"]')).toHaveCount(1);
  await expect(strip.locator('[data-finish="end-panel"]')).toHaveCount(1);
  await expect(strip.locator('[data-finish="splashback"]')).toHaveCount(0);
  await shot(page, "14-bande-finitions");
  expect(errors).toEqual([]);
});

test("linéaire : chaque titre se plie, tous fermés au départ, un seul ouvert ; les meubles dessinés comme dans Meubles de cuisine", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-plis");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En U", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const heads = tool.locator("[data-fold]");
  await expect(heads).toHaveCount(6);
  for (const head of await heads.all()) await expect(head).toHaveAttribute("aria-expanded", "false");
  await expect(tool.locator('[data-fold="price"]')).toContainText("Prix du projet");
  // One open: the others close.
  await tool.locator('[data-fold="corners"]').click();
  await expect(tool.locator("[data-corner-choice]")).toHaveCount(2);
  await tool.locator('[data-fold="add"]').click();
  await expect(tool.locator('[data-fold="corners"]')).toHaveAttribute("aria-expanded", "false");
  await expect(tool.locator("[data-corner-choice]")).toHaveCount(0);
  // The units drawn, their widths a click away, as in Meubles de cuisine.
  const models = tool.locator("[data-model]");
  expect(await models.count()).toBeGreaterThan(4);
  await expect(models.first().locator("svg")).toHaveCount(1);
  await tool.locator('[data-add="base-bas-2-portes-800"]').click();
  await expect(tool.locator('[data-run-strip="A"] [data-item]')).toHaveCount(1);
  await shot(page, "13-plis");
  // Clicked again: closed.
  await tool.locator('[data-fold="add"]').click();
  await expect(tool.locator("[data-model]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("angles : la porte du meuble d'angle se règle, et un haut d'angle se pose en haut, réglable aussi", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-test-plan-cuisine-hauts-angle");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "corners");
  const corner = tool.locator('[data-corner-choice="left"]');
  await corner.locator('[data-corner-kind="unit"]').click();
  const door = corner.locator('[data-corner-size="door"]');
  const unit = (await door.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  const typed = (mm: number) => (unit === "mm" ? String(mm) : unit === "m" ? String(mm / 1000).replace(".", ",") : String(mm / 10).replace(".", ","));
  await door.fill(typed(600));
  await door.press("Enter");
  await expect(corner.locator('[data-corner-size="door"]')).toHaveValue(typed(600));
  await corner.locator('[data-wall-corner-kind="unit"]').click();
  await expect(tool.locator('[data-run-strip="A"] [data-wall-corner-front="door"]')).toHaveCount(1);
  const wallDoor = corner.locator('[data-corner-size="wallDoor"]');
  await wallDoor.fill(typed(400));
  await wallDoor.press("Enter");
  await expect(corner.locator('[data-corner-size="wallDoor"]')).toHaveValue(typed(400));
  // The strip gives each front of the corner its width (cm): the door and the fixed part, low and up.
  const strip = tool.locator('[data-run-strip="A"]');
  await expect(strip.locator('[data-corner-width="door"]')).toHaveCount(2);
  // Up 40 cm, low 60 cm, less their gaps.
  // (the number, its tip aside)
  expect((await strip.locator('[data-corner-width="door"]').allTextContents()).map((t) => t.replace(/^\D+/, "")).sort()).toEqual(["39,7", "59,7"]);
  await expect(strip.locator('[data-corner-width="blind"]').first()).toHaveText(/\d+(,\d)?$/);
  await shot(page, "14-hauts-angle");
  // Clicked on the strip, a corner unit is chosen as a unit is: « Meuble choisi » sets it, its shelves too.
  await strip.locator('[data-corner-front="blind"]').click({ position: { x: 4, y: 4 } });
  const chosen = tool.locator('[data-fold="chosen"]');
  await expect(chosen).toContainText("Meuble d'angle A");
  await tool.locator("[data-corner-shelves]").filter({ hasText: "+" }).click();
  await expect(tool.locator('[data-corner-count="shelves"]')).toHaveText("2");
  await strip.locator('[data-wall-corner-front="blind"]').click({ position: { x: 4, y: 4 } });
  await expect(chosen).toContainText("Haut d'angle A");
  await tool.locator("[data-corner-wall-shelves]").filter({ hasText: "−" }).click();
  await expect(tool.locator('[data-corner-count="wall-shelves"]')).toHaveText("1");
  // Their fronts hidden on the strip: their shelves are seen, 2 low and 1 up.
  await tool.locator("[data-strip-no-doors]").check();
  await expect(strip.locator("[data-corner-shelf]")).toHaveCount(3);
  await tool.locator("[data-strip-no-doors]").uncheck();
  await expect(strip.locator("[data-corner-shelf]")).toHaveCount(0);
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Haut d'angle A").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Meuble d'angle A").first()).toBeVisible();
  await expect(page.getByText("Porte d'angle haute A").first()).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const cabinets = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; name: string; shelves?: number }[] } }).document.features.filter((f) => f.type === "cabinet").map((f) => [f.name, f.shelves]), api);
  expect(cabinets).toEqual(expect.arrayContaining([["Meuble d'angle A", 2], ["Haut d'angle A", 1]]));
  expect(errors).toEqual([]);
});

test("plan de cuisine : « Voir » isole un linéaire, de face, avec ses cotes ; l'autre mur ouvert le suit ; « Tout montrer »", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-voir");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  // Nothing built yet: nothing to see.
  await expect(tool.locator('[data-see-run="A"]')).toBeDisabled();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText("Plan de travail B").first()).toBeVisible({ timeout: 60_000 });
  await tool.locator('[data-see-run="A"]').click();
  const bar = page.locator("[data-zone-isolated]");
  await expect(bar).toContainText("Mur A isolé");
  // Its dimensions: the widths along the bottom, the wall's length, the heights.
  await expect(page.locator('[data-run-dim="u"]').first()).toBeVisible();
  expect(await page.locator('[data-run-dim="u"]').count()).toBeGreaterThan(6);
  expect(await page.locator('[data-run-dim="z"]').count()).toBe(3);
  await shot(page, "16-voir-mur-a");
  // A width typed on its dimension: the unit takes it, the kitchen is made again, the run stays alone.
  const width = page.locator('[data-run-dim="u"][data-editable]').filter({ hasText: /^60$/ }).first();
  await width.click();
  const field = page.locator("[data-dim-editor]");
  // The calculator, its keypad: 60 cm (or 600 mm) less a sixth becomes 50 cm, in the display unit.
  const calculator = page.getByRole("dialog", { name: "Nouvelle cote" });
  await expect(calculator.getByRole("button", { name: "Diviser" })).toBeVisible();
  const was = await field.inputValue();
  await field.fill(`${was} - ${was}`);
  await calculator.getByRole("button", { name: "Diviser" }).click();
  await calculator.getByRole("button", { name: "6", exact: true }).click();
  await shot(page, "16b-calculatrice-cote");
  await calculator.getByRole("button", { name: "Valider" }).click();
  await expect.poll(async () => /500 \(A\d+\)/.test(await tree(page)), { timeout: 60_000 }).toBe(true);
  await expect(bar).toContainText("Mur A isolé");
  // A size the plan takes from the room or that does not fit is refused with why.
  await page.locator('[data-run-dim="z"][data-editable]').first().click();
  await page.locator("[data-dim-editor]").fill("1");
  await page.locator("[data-dim-editor]").press("Enter");
  await expect(page.getByText("Le plan de travail est de 70 à 110 cm du sol.").first()).toBeVisible();
  // Wall B opened from the plan: it is the one seen.
  await tool.locator('[data-open-run="B"]').click();
  await expect(bar).toContainText("Mur B isolé");
  await expect(tool.locator('[data-see-run="B"]')).toHaveText("Tout montrer");
  await tool.locator('[data-see-run="B"]').click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator("[data-run-dim]")).toHaveCount(0);
  await expect(tool.locator('[data-see-run="B"]')).toContainText("Voir mur B isolé");
  expect(errors).toEqual([]);
});

test("plan de cuisine : un meuble changé dans la 3D change le plan, la cuisine est refaite avec lui", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-plan-cuisine-sync");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText("Plan de travail A").first()).toBeVisible({ timeout: 60_000 });
  // The first unit, its width typed under the view: 60 → 70 cm.
  await page.getByLabel(/^Navigateur : corps/).getByText(/\(A1\)$/).first().click();
  const chip = page.getByText(/^L 60 cm$/).first();
  await chip.click();
  // The chip becomes a field, focused.
  const field = page.locator('input[type="number"]:focus');
  await field.fill("70");
  await field.press("Enter");
  await expect.poll(async () => /\b700 \(A1\)/.test(await tree(page)), { timeout: 60_000 }).toBe(true);
  // The plan has it: its run, opened, shows the unit at 70.
  // (Choosing a unit of the plan opened its run.)
  await page.getByRole("tab", { name: "Plan de cuisine" }).click();
  await expect(tool.locator('[data-run-strip="A"] [data-item]').first()).toContainText("70");
  expect(errors).toEqual([]);
});

test("linéaire : des fileurs posés à la main, en bas et en haut, au début, après un meuble ou à la fin", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-fileurs");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await tool.getByRole("tab", { name: "Hauts" }).click();
  await tool.locator('[data-add="wall-haut-1-porte-600"]').click();
  await unfold(tool, "fillers");
  await tool.locator('[data-filler-add="base:start"]').click();
  await tool.locator('[data-filler-add="wall:start"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  await expect(strip.locator("[data-hand-filler]")).toHaveCount(2);
  await tool.locator('[data-filler-add="base:end"]').click();
  await expect(tool.locator('[data-fillers-placed="3"] [data-filler-remove]')).toHaveCount(3);
  await shot(page, "17-fileurs");
  // The second low one taken out by its button: two are left.
  await tool.locator("[data-filler-remove]").nth(1).click();
  await expect(strip.locator("[data-hand-filler]")).toHaveCount(2);
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Fileur posé A1").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Fileur posé haut A2").first()).toBeVisible();
  // All taken out at once.
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "fillers");
  await tool.locator("[data-filler-remove-all]").click();
  await expect(tool.locator('[data-fillers-placed="0"]')).toBeVisible();
  await expect(tool.locator('[data-run-strip="A"] [data-hand-filler]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("linéaire : chaque changement est gardé aussitôt dans la 3D, une annulation revient", { tag: "@rapide" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-apercu");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText("Plan de travail A").first()).toBeVisible({ timeout: 60_000 });
  await tool.locator('[data-see-run="A"]').click();
  await tool.locator('[data-open-run="A"]').click();
  const widths = () => page.locator('[data-run-dim="u"]').allTextContents();
  const before = await widths();
  // A unit's width typed: the 3D (and the wall's dimensions) show it, stored at once.
  const strip = tool.locator('[data-run-strip="A"]');
  await strip.locator("[data-item]").first().click();
  const width = tool.locator('[data-run-item] [data-size="width"]');
  const unit = (await width.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  const typed = (mm: number) => (unit === "mm" ? String(mm) : unit === "m" ? String(mm / 1000).replace(".", ",") : String(mm / 10).replace(".", ","));
  await width.fill(typed(370));
  await width.press("Enter");
  // Stored at once (no « OK »): the kitchen made again.
  await expect.poll(async () => (await widths()).some((t) => /^37(0)?$/.test(t.trim())), { timeout: 60_000 }).toBe(true);
  await shot(page, "18-apercu");
  // Closed, then one undo: the kitchen as it was.
  await tool.locator("[data-run-close]").click();
  await page.locator('[data-action="undo"]').first().click();
  await expect.poll(widths, { timeout: 60_000 }).toEqual(before);
  // Again, and closing keeps it.
  await tool.locator('[data-open-run="A"]').click();
  await strip.locator("[data-item]").first().click();
  await width.fill(typed(370));
  await width.press("Enter");
  await tool.locator("[data-run-close]").click();
  await expect.poll(async () => /370 \(A\d+\)/.test(await tree(page)), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(1500);
  await shot(page, "18b-apercu-ok");
  expect(errors).toEqual([]);
});

test("linéaire : plusieurs meubles choisis (Maj + clic) reçoivent une largeur commune, la même largeur, la place libre", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-plusieurs");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  for (const unit of ["base-bas-1-porte-600", "base-bas-1-porte-400", "base-bas-1-porte-450"]) await tool.locator(`[data-add="${unit}"]`).click();
  const strip = tool.locator('[data-run-strip="A"]');
  const items = strip.locator("[data-item]");
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ["Shift"] });
  await items.nth(2).click({ modifiers: ["Shift"] });
  await expect(strip.locator("[data-picked]")).toHaveCount(3);
  await expect(tool.locator('[data-fold="chosen"]')).toContainText("Meubles choisis (3)");
  // One width for all.
  const width = tool.locator('[data-common="width"]');
  const unit = (await width.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  const typed = (mm: number) => (unit === "mm" ? String(mm) : unit === "m" ? String(mm / 1000).replace(".", ",") : String(mm / 10).replace(".", ","));
  await width.fill(typed(500));
  await tool.locator('[data-common-apply="width"]').click();
  for (let i = 0; i < 3; i++) await expect(items.nth(i)).toContainText("50");
  await shot(page, "22-plusieurs-meubles");
  // No height for base units (the worktop sets it); the room left of their row only: 3600 − 3 × 500 = 2100.
  await expect(tool.locator('[data-common="height"]')).toHaveCount(0);
  await expect(tool.locator("[data-multi-share]")).toContainText(unit === "mm" ? "2100" : unit === "m" ? "2,1" : "210");
  await tool.locator("[data-multi-share]").click();
  await expect(page.getByText(/partagés entre eux/).first()).toBeVisible();
  await tool.locator("[data-multi-equal]").click();
  const widths = await items.allTextContents();
  expect(new Set(widths.map((t) => t.replace(/\D/g, "").slice(-3))).size).toBe(1);
  // Taken out together.
  await tool.locator("[data-multi-remove]").click();
  await expect(items).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("plan de cuisine : un meuble haut poussé dans la 3D reste où il est, le linéaire garde la place libre laissée", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-plan-cuisine-pousse");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  await expect(page.getByText("Plan de travail A").first()).toBeVisible({ timeout: 60_000 });
  // The hood taken out: room up at the end of the wall row.
  await tool.getByRole("button", { name: "Aménager" }).click();
  const strip = tool.locator('[data-run-strip="A"]');
  await strip.locator("[data-item]").filter({ has: page.locator("title", { hasText: "Hotte" }) }).click();
  await tool.locator("[data-run-item]").getByRole("button", { name: "Retirer" }).click();
  // Its place left empty; closed up, the room is at the end of the row.
  await tool.locator("[data-strip-close-up]").click();
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible();
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  // The last wall unit pushed 30 cm towards the end of the wall, in the 3D.
  await click(page, '[data-action="push"]');
  const push = page.getByRole("dialog", { name: "Pousser" });
  await page.mouse.click(680, 440);
  await expect(push).toContainText("À pousser : « Haut");
  const unit = (await push.locator("[data-push-step]").getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  await page.keyboard.type(unit === "mm" ? "300" : unit === "m" ? "0,3" : "30");
  await page.keyboard.press("ArrowRight");
  await expect(push.locator("[data-push-total]")).toContainText(/X 30/);
  // Entrée, as « OK », keeps it and the tool stays for the next one; Échap, as « Terminer », closes it.
  await page.keyboard.press("Enter");
  await expect(push).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(push).toHaveCount(0);
  // Its run has the room it left, before it, and what is left after it.
  await page.getByRole("tab", { name: "Plan de cuisine" }).click();
  await tool.getByRole("button", { name: "Aménager" }).click();
  await expect(strip.locator('[data-free="wall"]')).toHaveCount(2);
  await shot(page, "plan-cuisine-pousse");
  await unfold(tool, "space");
  await expect(tool.locator("[data-spaces]")).toHaveAttribute("data-spaces", "1");
  // Taken out: the unit closes up, the room is one again at the end.
  await tool.locator("[data-space-remove]").click();
  await expect(strip.locator('[data-free="wall"]')).toHaveCount(1);
  await tool.locator("[data-run-close]").click();
  expect(errors).toEqual([]);
});

test("linéaire : pendant l'aperçu, pas encore gardé, les portes des meubles ajoutés s'ouvrent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-portes-apercu");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await page.waitForTimeout(1500);
  // Not recorded yet: the doors shown open all the same, and close again.
  const doors = page.getByRole("group", { name: "Cuisine", exact: true }).locator('[data-workshop="doors-open"]');
  await doors.click();
  await expect(doors).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Il n'y a aucune porte dans ce modèle.")).toHaveCount(0);
  await doors.click();
  await expect(doors).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("linéaire : un meuble ajouté est gardé aussitôt ; un clic droit sur sa porte ouvre le menu de la porte", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-plan-cuisine-clic-droit");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await page.waitForTimeout(1500);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(1500);
  // Stored by itself (no « OK »): the kitchen is made again with it.
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  // Kept: a right click on its door opens the door's menu.
  await page.mouse.click(500, 610, { button: "right" });
  await expect(page.locator("[data-tree-menu]")).toContainText("Ouvrir de l'autre côté");
  expect(errors).toEqual([]);
});

test("linéaire : une largeur cliquée sur la bande s'ouvre dans la calculatrice, d'un meuble ou d'une porte d'angle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-plan-cuisine-calculatrice");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await unfold(tool, "corners");
  await tool.locator('[data-corner-choice="left"] [data-corner-kind="unit"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  const field = page.locator("[data-strip-width]");
  const unit = async () => ((await field.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1] ?? "cm");
  const typed = (cm: string, u: string) => (u === "mm" ? `${cm} × 10` : u === "m" ? `${cm} ÷ 100` : cm);
  // A unit's width: 60 → 50 by a calculation.
  await strip.locator("[data-edit-item]").first().click();
  await expect(page.getByRole("dialog", { name: "Largeur du meuble" })).toBeVisible();
  await field.fill(typed("60 - 10", await unit()));
  await field.press("Enter");
  await expect(strip.locator("[data-edit-item]").first()).toHaveText(/50$/);
  // Too narrow: refused, with why, the calculator still open.
  await strip.locator("[data-edit-item]").first().click();
  await field.fill(typed("5", await unit()));
  await field.press("Enter");
  await expect(page.getByText(/La largeur va de/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  // The corner's door: 44,7 → 49,7 on the strip.
  await strip.locator('[data-edit-side="left"][data-edit-row="base"]').click();
  await expect(page.getByRole("dialog", { name: "Largeur de la porte d'angle" })).toBeVisible();
  await field.fill(typed("49,7", await unit()));
  await field.press("Enter");
  await expect(strip.locator('[data-edit-side="left"][data-edit-row="base"]')).toHaveText(/49,7$/);
  expect(errors).toEqual([]);
});

test("linéaire : façades et intérieur du meuble choisi — étagères, cloisons, tiroirs, tiroir au-dessus, depuis le plan", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-interieur");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-2-portes-800"]').click();
  // The unit just added is the one chosen: its settings, under « Meuble choisi ».
  await unfold(tool, "chosen");
  const inside = tool.locator("[data-unit-inside]");
  await expect(inside).toBeVisible();
  // Two shelves and an upright board: the caisson made again with them.
  await inside.locator("[data-inside-shelves]").getByRole("button", { name: /un de plus/ }).click();
  await expect(inside.locator("[data-inside-shelves]")).toHaveAttribute("data-inside-shelves", "2");
  await inside.locator("[data-inside-dividers]").getByRole("button", { name: /un de plus/ }).click();
  await expect(inside.locator("[data-inside-dividers]")).toHaveAttribute("data-inside-dividers", "1");
  await expect(page.locator('[title="Cloison 1 — OK"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[title="Étagère 4 — OK"]').first()).toBeAttached();
  // Drawers instead: no shelf nor upright board left; then doors under a drawer.
  await inside.locator("[data-inside-layout]").selectOption("drawers");
  await expect(inside.locator("[data-inside-dividers]")).toHaveCount(0);
  await expect(page.locator('[title="Façade tiroir 3 — OK"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[title="Cloison 1 — OK"]')).toHaveCount(0);
  await inside.locator("[data-inside-reset]").click();
  await inside.locator("[data-inside-top]").selectOption("1");
  await expect(page.locator('[title="Façade tiroir 1 — OK"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('[title="Porte gauche — OK"]').first()).toBeAttached();
  await expect(page.locator('[data-ref="status-recompute"]')).toHaveText(/^Recalcul \d+ ms$/);
  await shot(page, "20-interieur-du-meuble");
  // The plinth, chosen on the strip: set back, given a look, taken away and put back.
  const strip = tool.locator('[data-run-strip="A"]');
  const bar = tool.locator("[data-strip-actions]");
  await strip.locator("[data-kick]").first().click();
  await expect(bar).toContainText("Plinthe");
  await bar.locator("[data-strip-kick-back]").click();
  await expect(bar).toContainText("reculée de 1 cm");
  // Stored (the kitchen made again): the plinth is still the one chosen.
  await expect(tool.locator("[data-run-preview]")).toHaveCount(0, { timeout: 60_000 });
  await expect(bar).toContainText("reculée de 1 cm");
  await bar.locator("[data-kick-looks] summary").click();
  await bar.locator('[data-kick-look="dekton-sirius"]').click();
  await expect(bar.locator("[data-kick-looks] summary")).toContainText("Dekton Sirius");
  await expect(page.locator('[title="Plinthe A — OK"]').first()).toBeAttached({ timeout: 60_000 });
  await expect(tool.locator("[data-run-preview]")).toHaveCount(0, { timeout: 60_000 });
  await bar.locator("[data-strip-remove]").click();
  await expect(strip.locator("[data-kick]")).toHaveCount(0);
  await expect(page.locator('[title="Plinthe A — OK"]')).toHaveCount(0, { timeout: 60_000 });
  await bar.locator("[data-strip-kick-on]").click();
  await expect(strip.locator("[data-kick]")).toHaveCount(1);
  await shot(page, "21-plinthe");
  expect(errors).toEqual([]);
});

test("linéaire : un meuble glissé à la souris dans la place vide s'y pose, la place qu'il laisse gardée libre", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-test-plan-cuisine-glisser");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await expect(page.getByText("Bas 2 portes 1000 (A1)").first()).toBeVisible({ timeout: 60_000 });
  const strip = tool.locator('[data-run-strip="A"]');
  await expect(strip.locator('[data-free="base"]')).toHaveCount(1);
  // Taken by its middle and dropped further along the wall, in the room left free.
  const unit = (await strip.locator("[data-item]").first().boundingBox())!;
  const whole = (await strip.locator("svg").boundingBox())!;
  const [x, y] = [unit.x + unit.width / 2, unit.y + unit.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + whole.width * 0.15, y, { steps: 4 });
  await page.mouse.move(x + whole.width * 0.3, y, { steps: 4 });
  await page.mouse.up();
  // Free room before it and after it now.
  await expect(strip.locator('[data-free="base"]')).toHaveCount(2);
  await expect(tool.locator("[data-run-preview]")).toHaveCount(0, { timeout: 60_000 });
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const features = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; name: string; origin?: number[] }[] } }).document.features, api);
  const cabinet = features.find((f) => f.type === "cabinet" && f.name.startsWith("Bas 2 portes 1000"))!;
  // 30 % of a 3,60 m wall (and its margins): about 1,10 m from where it stood, at the wall's start.
  expect(cabinet.origin![0]).toBeGreaterThan(800);
  expect(cabinet.origin![0]).toBeLessThan(1400);
  await shot(page, "22-meuble-glisse");
  // A second unit added (it takes the room left free before the first), then deleted: its room stays empty, the
  // first one where it was; one decides to close up, and the units come together.
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  const small = strip.locator("[data-item]", { hasText: "Bas 1 porte 60" });
  const big = strip.locator("[data-item]", { hasText: "Bas 2 portes 100" });
  await expect(small).toHaveCount(1);
  await expect(tool.locator("[data-run-preview]")).toHaveCount(0, { timeout: 60_000 });
  const left = async () => Math.round((await big.boundingBox())!.x);
  const was = await left();
  // Just added, it is the one chosen already (a click would let it go).
  await expect(tool.locator("[data-strip-actions]")).toContainText("Bas 1 porte");
  await tool.locator("[data-strip-remove]").click();
  await expect(small).toHaveCount(0);
  await expect(tool.locator("[data-run-preview]")).toHaveCount(0, { timeout: 60_000 });
  expect(Math.abs((await left()) - was)).toBeLessThanOrEqual(2);
  const close = tool.locator("[data-strip-close-up]");
  await expect(close).toContainText("Resserrer les meubles");
  await close.click();
  await expect(close).toHaveCount(0);
  await expect.poll(left, { timeout: 30_000 }).toBeLessThan(was - 50);
  expect(errors).toEqual([]);
});

test("linéaire : le vide comblé en prolongeant un meuble choisi dans « Place libre »", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-prolonger");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await expect(tool.locator("[data-run-preview]")).toHaveCount(0, { timeout: 60_000 });
  const strip = tool.locator('[data-run-strip="A"]');
  await expect(strip.locator('[data-free="base"]')).toHaveCount(1);
  // The second one prolonged (by about 1 m, within its 2,40 m at most): no room left open, no filler.
  await unfold(tool, "space");
  const pick = tool.locator('[data-widen-pick="base"]');
  await pick.selectOption({ label: await pick.locator("option").nth(1).textContent() ?? "" });
  await tool.locator('[data-widen="base"]').click();
  await expect(strip.locator('[data-free="base"]')).toHaveCount(0, { timeout: 30_000 });
  await expect(tool.locator('[data-widen="base"]')).toHaveCount(0);
  expect((await strip.locator("[data-item]", { hasText: "Bas 2 portes" }).allTextContents()).some((t) => !/\b100\b/.test(t))).toBe(true);
  expect(errors).toEqual([]);
});

test("linéaire : « Sans portes » montre l'intérieur des meubles sur la bande ; les titres pliables sont des cartes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine-sans-portes");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  await unfold(tool, "add");
  await tool.locator('[data-add="base-bas-3-tiroirs-600"]').click();
  await tool.locator('[data-add="base-bas-tiroir-et-porte-600"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  const trays = strip.locator('rect[class*="stroke-dasharray"]');
  await expect(strip.locator("[data-item]")).toHaveCount(2);
  await expect(trays).toHaveCount(0);
  await shot(page, "23-avec-portes");
  // Their fronts taken off: the three drawers' boxes, the drawer over the door, the shelf.
  await tool.locator("[data-strip-no-doors]").check();
  await expect(trays).toHaveCount(4);
  await shot(page, "23-sans-portes");
  // Each title a card, its shadow under it.
  const shadow = await tool.locator('[data-fold-section="add"]').evaluate((e) => getComputedStyle(e).boxShadow);
  expect(shadow).not.toBe("none");
  await tool.locator("[data-strip-no-doors]").uncheck();
  await expect(trays).toHaveCount(0);
  expect(errors).toEqual([]);
});
