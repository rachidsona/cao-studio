/** La bande du linéaire : supprimer, dupliquer et déplacer ce qui est choisi, par la barre, le clavier ou le clic droit. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("sur la bande : dupliquer, déplacer et supprimer un meuble, ôter et remettre le plan de travail", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-bande-actions");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  const units = strip.locator("[data-item]");
  const bar = tool.locator("[data-strip-actions]");
  const names = () => units.evaluateAll((all) => all.map((g) => (g.querySelector("title")?.textContent ?? "").replace(/ \d+$/, "")));
  await expect(units).toHaveCount(2);
  // A unit under the pointer in the 3D: ringed on the strip (and back, the strip's under the pointer lit in the 3D).
  await page.waitForTimeout(1200);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const ringed = () => units.evaluateAll((all) => all.filter((g) => (g as SVGElement).style.filter).length);
  let found = 0;
  for (let i = 0; i < 80 && !found; i++) {
    await page.mouse.move(view.x + view.width * (0.1 + 0.08 * (i % 10)), view.y + view.height * (0.2 + 0.08 * Math.floor(i / 10)));
    await page.waitForTimeout(40);
    found = await ringed();
  }
  expect(found).toBe(1);
  // « Cacher : Hauts » and back, in the view only.
  const hide = tool.locator('[data-hide-row="wall"]');
  await hide.check();
  await expect(hide).toBeChecked();
  await hide.uncheck();
  await expect(units).toHaveCount(2);
  await units.first().hover();
  await page.mouse.move(view.x + 5, view.y + 5);
  await expect.poll(ringed).toBe(0);

  // The unit of 60 is the one just added, chosen: its bar under the strip.
  await expect(bar).toContainText("Bas 1 porte");
  // Duplicated by the bar, then by Ctrl + D on the strip: three of them after the unit of 100.
  await bar.locator("[data-strip-copy]").click();
  await expect(units).toHaveCount(3);
  await strip.locator("svg").press("Control+d");
  await expect(units).toHaveCount(4);
  expect(await names()).toEqual(["Bas 2 portes", "Bas 1 porte", "Bas 1 porte", "Bas 1 porte"]);
  // 100 + 4 × 60 = 340 of 360: no room for one more, said rather than left unseen.
  await strip.locator("svg").press("Control+d");
  await strip.locator("svg").press("Control+d");
  await expect(page.getByText(/« Bas 1 porte » de 60 cm ne tient pas sur ce linéaire/).first()).toBeVisible();
  await expect(units).toHaveCount(5);

  // The first unit chosen (a click on the strip), moved one place to the right by the arrow, then back by the bar.
  await units.first().click();
  await expect(bar).toContainText("Bas 2 portes");
  await strip.locator("svg").press("ArrowRight");
  expect((await names())[1]).toBe("Bas 2 portes");
  await bar.locator("[data-strip-left]").click();
  expect((await names())[0]).toBe("Bas 2 portes");
  // Suppr takes it off the run; a right click on another: « Supprimer ».
  await strip.locator("svg").press("Delete");
  await expect(units).toHaveCount(4);
  expect(await names()).not.toContain("Bas 2 portes");
  await units.first().click({ button: "right" });
  await page.locator("[data-tree-menu]").getByText("Supprimer", { exact: true }).click();
  await expect(units).toHaveCount(3);
  await shot(page, "bande-actions");

  // The worktop clicked on the strip, then taken away; put back by its button.
  await strip.locator("[data-worktop]").first().click();
  await expect(bar).toContainText("Plan de travail");
  await bar.locator("[data-strip-remove]").click();
  await expect(strip.locator("[data-worktop]")).toHaveCount(0);
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-select^="body:"]').filter({ hasText: "Plan de travail A" })).toHaveCount(0);
  await expect(page.locator('[data-select^="body:"]').filter({ hasText: "Crédence A" })).toHaveCount(1);
  await tool.locator('[data-open-run="A"]').click();
  await tool.locator("[data-strip-worktop-on]").click();
  await expect(strip.locator("[data-worktop]")).toHaveCount(1);
  await tool.locator("[data-run-close]").click();
  await expect(page.locator('[data-select^="body:"]').filter({ hasText: "Plan de travail A" })).toHaveCount(1, { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("dans la 3D : le caisson choisi se duplique sur son linéaire et se supprime, par sa barre", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-dupliquer-3d");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await tool.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  const cabinets = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    const features = project.document.features as { type: string; name: string; origin?: number[] }[];
    return features.filter((f) => f.type === "cabinet").map((f) => [f.name.replace(/ \(A\d\)$/, ""), Math.round(f.origin![0]!)]);
  };
  const bar = page.getByRole("toolbar", { name: "Caisson sélectionné" });
  const choose = async (name: string) => {
    await page.locator('[data-head^="group:"]').filter({ hasText: name }).first().click();
    await expect(bar).toContainText(name);
  };

  // The unit of 60 chosen: duplicated by its bar, the copy just after it on the run.
  await choose("Bas 1 porte 600 (A2)");
  await bar.getByLabel("Dupliquer le caisson").click();
  await expect(page.getByText(/« Bas 1 porte » dupliqué sur son linéaire/).first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await cabinets()).toEqual([["Bas 2 portes 1000", 0], ["Bas 1 porte 600", 1000], ["Bas 1 porte 600", 1600]]);

  // The unit of 100, taken away by its bar: gone, the others where they were.
  await choose("Bas 2 portes 1000 (A1)");
  await bar.getByLabel("Supprimer le caisson").click();
  await page.waitForTimeout(1500);
  expect(await cabinets()).toEqual([["Bas 1 porte 600", 1000], ["Bas 1 porte 600", 1600]]);
  expect(errors).toEqual([]);
});

test("sur la bande : un meuble haut s'aligne sur le meuble bas qui est sous lui", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-aligner-haut");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  // Low: 100 then 60 (from 100 to 160 cm). Up: 80, then 60 — from 80 to 140 cm, astride the two low units.
  await tool.locator('[data-add="base-bas-2-portes-1000"]').click();
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await tool.getByRole("tab", { name: "Hauts" }).click();
  await tool.locator('[data-add="wall-haut-2-portes-800"]').click();
  await tool.locator('[data-add="wall-haut-1-porte-600"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  const bar = tool.locator("[data-strip-actions]");
  const chosenAt = async () => Number((await strip.locator("[data-item]").last().getAttribute("transform"))!.match(/translate\(([\d.]+)/)![1]);
  await expect(bar).toContainText("Haut 1 porte");
  expect(await chosenAt()).toBe(800);

  // Aligned: its left edge over the left edge of the low unit of 60, 20 cm of room kept free before it.
  await bar.locator("[data-strip-align]").click();
  await expect(page.getByText("Aligné sur « Bas 1 porte », bord gauche.").first()).toBeVisible();
  expect(await chosenAt()).toBe(1000);
  await expect(tool.locator('[data-fold="space"]')).toContainText("20 cm");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bande-aligner.png` });
  // Again: nothing to do, said so. A low unit has no such button.
  await bar.locator("[data-strip-align]").click();
  await expect(page.getByText(/« Haut 1 porte » est déjà aligné sur « Bas 1 porte »/).first()).toBeVisible();
  await strip.locator("[data-item]").first().click();
  await expect(bar).toContainText("Bas 2 portes");
  await expect(bar.locator("[data-strip-align]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("la bande du linéaire et ses murs restent en haut du panneau quand on le fait défiler", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-bande-fixe");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const fixed = tool.locator("[data-run-fixed]");
  await expect(fixed.locator('[data-run-strip="A"]')).toBeVisible();
  await expect(fixed.getByRole("group", { name: "Voir un autre linéaire" })).toBeVisible();
  // The sentence of the run's lengths is gone.
  await expect(tool).not.toContainText("Glissez un meuble pour le changer de place");
  // The settings opened and the panel scrolled to its end: the walls and the strip still at its top.
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  const scroller = await fixed.evaluateHandle((node) => {
    let p = node.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    return p;
  });
  const before = (await fixed.boundingBox())!;
  await page.evaluate((s) => s && s.scrollTo({ top: s.scrollHeight }), scroller);
  await page.waitForTimeout(300);
  const scrolled = await page.evaluate((s) => (s ? s.scrollTop : 0), scroller);
  expect(scrolled).toBeGreaterThan(100);
  const after = (await fixed.boundingBox())!;
  const top = await page.evaluate((s) => (s ? s.getBoundingClientRect().top : 0), scroller);
  expect(after.y).toBeLessThanOrEqual(Math.max(top, before.y) + 1);
  expect(after.y).toBeGreaterThanOrEqual(top - 1);
  await expect(tool.locator('[data-run-strip="A"]')).toBeInViewport();
  await shot(page, "bande-fixe");
  expect(errors).toEqual([]);
});

test("sur la bande : la place libre de chaque côté du meuble choisi se tape, et un meuble copié se colle sur un autre mur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-bande-place-copie");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  // The unit added, chosen: the free room after it written beside it; typed 50, it slides there, the rest before it.
  const right = strip.locator('[data-edit-gap="right"]');
  await expect(right).toHaveCount(1);
  const room = Number((await right.textContent())!.match(/[\d,]+$/)![0].replace(",", "."));
  await right.click();
  await page.locator("[data-strip-width]").fill("50");
  await page.locator("[data-strip-width]").press("Enter");
  await expect(strip.locator('[data-edit-gap="right"]')).toHaveText(/glisse50$/);
  await expect(strip.locator('[data-edit-gap="left"]')).toHaveText(new RegExp(`glisse${String(room - 50).replace(".", ",")}$`));

  // Copied (Ctrl + C), then pasted on wall B (Ctrl + V): the same unit there.
  await strip.locator("svg").press("Control+c");
  await tool.locator('[data-go-run="B"]').click();
  const other = tool.locator('[data-run-strip="B"]');
  await expect(other).toBeVisible();
  const before = await other.locator("[data-item]").count();
  await other.locator("svg").press("Control+v");
  await expect(other.locator("[data-item]")).toHaveCount(before + 1);
  expect(await other.locator("[data-item]").evaluateAll((all) => all.map((g) => g.querySelector("title")?.textContent ?? ""))).toContain("Bas 1 porte 60");
  expect(errors).toEqual([]);
});

test("caissons en Répartition : survol relié, place libre tapée, copier-coller sur un autre mur, poignées ✥ et ↔ dans la 3D", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-bande-caissons");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator('[data-open-run="A"]').click();
  const add = tool.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await tool.locator("[data-run-as-caissons]").check();
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  await tool.locator('[data-add="base-bas-1-porte-600"]').click();
  const strip = tool.locator('[data-run-strip="A"]');
  const held = strip.locator("[data-held]");
  await expect(held).toHaveCount(2, { timeout: 60_000 });
  await page.waitForTimeout(1500);

  // A caisson under the pointer in the 3D: ringed on the strip.
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const ringed = () => held.evaluateAll((all) => all.filter((g) => (g as SVGElement).style.filter).length);
  let found = 0;
  for (let i = 0; i < 100 && !found; i++) {
    await page.mouse.move(view.x + view.width * (0.08 + 0.08 * (i % 10)), view.y + view.height * (0.2 + 0.07 * Math.floor(i / 10)));
    await page.waitForTimeout(40);
    found = await ringed();
  }
  expect(found).toBe(1);

  // The second chosen: its free room typed, 50 left on its right.
  await held.nth(1).click();
  const right = strip.locator('[data-edit-gap="right"]');
  await expect(right).toHaveCount(1);
  await right.click();
  await page.locator("[data-strip-width]").fill("50");
  await page.locator("[data-strip-width]").press("Enter");
  await expect(strip.locator('[data-edit-gap="right"]')).toHaveText(/glisse50$/, { timeout: 60_000 });

  // Copied, pasted on wall B: a caisson there too.
  await strip.locator("svg").press("Control+c");
  await tool.locator('[data-go-run="B"]').click();
  const other = tool.locator('[data-run-strip="B"]');
  await expect(other).toBeVisible();
  const before = await other.locator("[data-held], [data-item]").count();
  await other.locator("svg").press("Control+v");
  await expect(other.locator("[data-held], [data-item]")).toHaveCount(before + 1, { timeout: 60_000 });

  // A caisson chosen in the 3D: the grips that slide it and pull its width.
  await page.getByLabel(/^Navigateur : corps/).getByText(/^Caisson — /).first().click();
  const bar = page.getByRole("toolbar", { name: "Caisson sélectionné" });
  await expect(bar.getByLabel("Déplacer le caisson")).toBeVisible();
  await expect(bar.getByLabel("Tirer la largeur du caisson")).toBeVisible();
  expect(errors).toEqual([]);
});
