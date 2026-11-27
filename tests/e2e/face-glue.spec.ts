/** « Coller par face » dans un vrai navigateur : la face d'un meuble haut cliquée, puis celle du bas, et le haut vient à fleur. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const SHOTS = process.env.SHOTS;
const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("coller par face : un haut vient à fleur de la façade du bas, caisson et façades ensemble", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-coller-face");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Hauts" }).click();
  await page.locator('[data-unit="wall-haut-1-porte-600"]').click();
  await expect(page.getByText(/Haut 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-action="face-glue"]').first()).toBeAttached();
  await click(page, '[data-action="face-glue"]');
  const tool = page.getByRole("dialog", { name: "Coller par face" });
  await expect(tool).toContainText("1. Cliquez la face de l'élément à déplacer");
  // In front view: the wall unit's door above, the base unit's door below.
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const at = (x: number, y: number) => page.mouse.click(canvas.x + canvas.width * x, canvas.y + canvas.height * y);
  await page.waitForTimeout(800);
  await at(0.505, 0.33);
  await expect(tool).toContainText("Face qui bouge : « Façades Haut 1 porte 600");
  await at(0.505, 0.75);
  await expect(page.getByText(/« Haut 1 porte 600 » collé à fleur de « Façades Bas 1 porte 600/).first()).toBeVisible();
  // Glued: the tool is there afresh for another one; « Terminer » closes it.
  await expect(tool).toBeVisible();
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  // From the right, the two doors in one plane.
  await click(page, '[data-action="view"][data-view="right"]');
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/15-coller-par-face.png` });
  expect(errors).toEqual([]);
});

test("coller par face dans tous les sens : le devant d'un haut sur le côté d'un bas, le haut tourne d'un quart puis s'y pose, bords affleurés", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-coller-tous-sens");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Hauts" }).click();
  await page.locator('[data-unit="wall-haut-1-porte-600"]').click();
  await expect(page.getByText(/Haut 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  const steps = await page.locator("[data-op]").count();
  await click(page, '[data-action="face-glue"]');
  const tool = page.getByRole("dialog", { name: "Coller par face" });
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const at = (x: number, y: number) => page.mouse.click(canvas.x + canvas.width * x, canvas.y + canvas.height * y);
  await page.waitForTimeout(800);
  // The wall unit's door, from the front; then, seen from the right, the base unit's right side: square to it.
  await at(0.505, 0.33);
  await expect(tool).toContainText("Face qui bouge : « Façades Haut 1 porte 600");
  await click(page, '[data-action="view"][data-view="right"]');
  await page.waitForTimeout(1000);
  for (const [x, y] of [[0.5, 0.75], [0.48, 0.72], [0.52, 0.78], [0.5, 0.68]] as [number, number][]) {
    await at(x, y);
    await page.waitForTimeout(700);
    if (await page.getByText(/« Haut 1 porte 600 » collé sur « .*Bas 1 porte 600/).count()) break;
  }
  await expect(page.getByText(/« Haut 1 porte 600 » collé sur « .*Bas 1 porte 600/).first()).toBeVisible();
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  // The cabinet turned and moved in place: no turn nor move of a piece in the history.
  expect(await page.locator("[data-op]").count()).toBe(steps);
  await click(page, '[data-action="view"][data-view="iso"]');
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/coller-tous-sens.png` });
  expect(errors).toEqual([]);
});

test("aligner face sur face : la face d'une façade cliquée, c'est tout le meuble qui se pose, sans opération par pièce", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-aligner-meuble");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Hauts" }).click();
  await page.locator('[data-unit="wall-haut-1-porte-600"]').click();
  await expect(page.getByText(/Haut 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  const steps = await page.locator("[data-op]").count();
  await click(page, '[data-action="align"]');
  const tool = page.getByRole("dialog", { name: "Aligner" });
  // « Face sur face » at first: a cabinet laid by two faces clicked.
  await expect(tool.getByRole("combobox", { name: "Méthode" })).toHaveValue("faces");
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const at = (x: number, y: number) => page.mouse.click(canvas.x + canvas.width * x, canvas.y + canvas.height * y);
  await page.waitForTimeout(800);
  await at(0.505, 0.33);
  await expect(tool).toContainText("Face qui bouge : « Façades Haut 1 porte 600");
  await expect(tool.getByRole("combobox", { name: "Ce qui bouge" })).toHaveValue("whole");
  await expect(tool).toContainText("Bouge : « Haut 1 porte 600 » tout entier.");
  await at(0.505, 0.75);
  await expect(tool.getByRole("combobox", { name: "Où" })).toHaveValue("corner");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");
  // Entrée, as « OK », keeps it and the tool stays for the next one; Échap, as « Terminer », closes it.
  await expect(tool).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tool).toHaveCount(0);
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  // The cabinet set again in place: no rotation nor move of a piece added to the history.
  expect(await page.locator("[data-op]").count()).toBe(steps);
  await click(page, '[data-action="view"][data-view="iso"]');
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/aligner-meuble-entier.png` });
  await expect(page.getByLabel(/^Navigateur : corps/).getByText(/^Déplacement|^Rotation/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("prolonger élément : un haut s'allonge en profondeur jusqu'au plan de la façade du bas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-prolonger");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Hauts" }).click();
  await page.locator('[data-unit="wall-haut-1-porte-600"]').click();
  await expect(page.getByText(/Haut 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  await click(page, '[data-action="extend-element"]');
  const tool = page.getByRole("dialog", { name: "Prolonger élément" });
  await expect(tool).toContainText("1. Cliquez la face à prolonger");
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const at = (x: number, y: number) => page.mouse.click(canvas.x + canvas.width * x, canvas.y + canvas.height * y);
  await page.waitForTimeout(800);
  await at(0.505, 0.33);
  await expect(tool).toContainText("À prolonger : « Haut 1 porte 600 »");
  await at(0.505, 0.75);
  await expect(tool.locator("[data-extend-result]")).toContainText(/« Haut 1 porte 600 » prolongé de 23 cm jusqu'à « Façades Bas 1 porte 600/);
  await expect(tool.locator("[data-extend-ok]")).toBeEnabled({ timeout: 30_000 });
  await tool.locator("[data-extend-ok]").click();
  await expect(page.getByText(/« Haut 1 porte 600 » prolongé de 23 cm jusqu'à « Façades Bas 1 porte 600/).first()).toBeVisible();
  // Its depth: 35 + 23 = 58 cm.
  await expect(page.getByLabel(/^Profondeur/).first()).toHaveValue(/^58(,0+)?$/);
  // The base unit pushed 4 cm toward the room: the wall unit follows its front, in the same undo step.
  await page.waitForTimeout(1500);
  await click(page, '[data-action="push"]');
  const push = page.getByRole("dialog", { name: "Pousser" });
  await at(0.505, 0.75);
  await expect(push).toContainText("À pousser : « Bas 1 porte 600 »");
  const unit = (await push.locator("[data-push-step]").getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  await page.keyboard.type(unit === "mm" ? "40" : unit === "m" ? "0,04" : "4");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(800);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/« Haut 1 porte 600 » suit « Façades Bas 1 porte 600/).first()).toBeVisible({ timeout: 30_000 });
  const props = page.getByRole("complementary", { name: "Propriétés" });
  await page.getByRole("button", { name: "Haut 1 porte 600", exact: true }).last().click();
  await expect(props.getByLabel("Nom", { exact: true })).toHaveValue("Haut 1 porte 600");
  await expect(props.getByLabel(/^Profondeur/).first()).toHaveValue(/^62(,0+)?$/);
  expect(errors).toEqual([]);
});

test("pousser : le pas tapé au clavier, puis les flèches poussent le caisson et ses façades ; OK garde", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-pousser");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  await click(page, '[data-action="push"]');
  const tool = page.getByRole("dialog", { name: "Pousser" });
  await expect(tool).toContainText("Cliquez un caisson");
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  await page.waitForTimeout(800);
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.55);
  await expect(tool).toContainText("À pousser : « Bas 1 porte 600 »");
  // The step typed on the keyboard, then pushed twice to the right, once up.
  const unit = (await tool.locator("[data-push-step]").getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  const step = unit === "mm" ? "250" : unit === "m" ? "0,25" : "25";
  await page.keyboard.type(step);
  await expect(tool.locator("[data-push-step]")).toHaveValue(step);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("PageUp");
  const total = tool.locator("[data-push-total]");
  await expect(total).toContainText(/X 50(0|,0)? ?(mm|cm|m)?/);
  await expect(total).toContainText(/Z 25(0)?/);
  await page.keyboard.press("ArrowLeft");
  await expect(total).toContainText(/X 25(0)? ?(mm|cm)/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/19-pousser.png` });
  await page.keyboard.press("Enter");
  // Entrée, as « OK », keeps it and the tool stays for the next one; Échap, as « Terminer », closes it.
  await expect(tool).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tool).toHaveCount(0);
  // Kept as one step of the history.
  await expect(page.locator('[data-action="undo"], [data-ref="undo"]').first()).toBeEnabled();
  expect(errors).toEqual([]);
});

test("pousser : un caisson poussé vers son voisin s'arrête à son côté, il n'y entre pas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-pousser-contact");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await page.locator('[data-unit="base-bas-1-porte-400"]').click();
  await expect(page.getByText(/Bas 1 porte 400 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  await click(page, '[data-action="push"]');
  const tool = page.getByRole("dialog", { name: "Pousser" });
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  await page.waitForTimeout(800);
  await page.mouse.click(canvas.x + canvas.width * 0.42, canvas.y + canvas.height * 0.55);
  await expect(tool).toContainText("À pousser :");
  // Side by side: one way it is already against the other, and does not move.
  await page.keyboard.type("10");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(/Déjà contre « Bas 1 porte (400|600) » /).first()).toBeVisible();
  const total = await tool.locator("[data-push-total]").innerText();
  // It went one step the free way and came back, or stayed: never into the neighbour.
  expect(total).toMatch(/X (0|-?10 cm|-?100 mm)/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/20-pousser-contact.png` });
  expect(errors).toEqual([]);
});

test("clic droit sur une porte : son sens d'ouverture, son nom, la supprimer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-menu-porte");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  await page.waitForTimeout(800);
  const right = () => page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5, { button: "right" });
  const menu = page.locator("[data-tree-menu]");
  await right();
  await expect(menu).toContainText("Ouvrir de l'autre côté (charnières à droite)");
  await expect(menu).toContainText("Ôter les poignées");
  await expect(menu).toContainText("Remplacer par des tiroirs");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/21-menu-porte.png` });
  await menu.getByRole("menuitem", { name: /Ouvrir de l'autre côté/ }).click();
  await expect(page.getByText(/s'ouvre maintenant à droite/).first()).toBeVisible();
  await page.waitForTimeout(800);
  await right();
  await expect(menu).toContainText("charnières à gauche");
  // Renamed: the navigator shows it.
  await menu.getByRole("menuitem", { name: "Renommer…" }).click();
  await page.locator("[data-door-name]").fill("Porte évier");
  await page.locator("[data-door-name]").press("Enter");
  await expect(page.getByText("Porte renommée « Porte évier ».").first()).toBeVisible();
  await page.waitForTimeout(800);
  await right();
  await expect(menu).toContainText("Porte évier");
  await menu.getByRole("menuitem", { name: "Supprimer la porte" }).click();
  await expect(page.getByText(/supprimée \(Annuler la remet\)/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("électroménager : un four choisi dans la bibliothèque se pose dans le caisson cliqué, une hotte au-dessus", { tag: "@rapide" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-electromenager");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  await click(page, '[data-action="appliances"]');
  const tool = page.getByRole("dialog", { name: "Électroménager" });
  await expect(tool.locator("[data-appliance]").first()).toBeVisible();
  await tool.locator('[data-appliance="oven-pyro"]').click();
  await tool.locator('[data-appliance-finish="black"]').click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/23-bibliotheque-electromenager.png` });
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  await page.waitForTimeout(800);
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5);
  await expect(page.getByText(/« Four encastrable pyrolyse » posé dans « Bas 1 porte 600 »/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Façades du caisson ôtées/).first()).toBeVisible();
  // Still open: a hood over it.
  await tool.locator('[data-appliance-family="hood"]').click();
  await tool.locator('[data-appliance="hood-chimney"]').click();
  await page.waitForTimeout(1200);
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.62);
  await expect(page.getByText(/« Hotte murale cheminée » posé/).first()).toBeVisible({ timeout: 30_000 });
  await click(page, '[data-action="view"][data-view="iso"]');
  await page.waitForTimeout(1500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/24-four-et-hotte.png` });
  // Its pieces in the navigator, by name.
  await expect(page.getByText("Vitre", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Cheminée", { exact: true }).first()).toBeAttached();
  expect(errors).toEqual([]);
});

test("électroménager : un caisson poussé emporte le four posé dedans", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-electromenager-pousse");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  await click(page, '[data-action="appliances"]');
  const tool = page.getByRole("dialog", { name: "Électroménager" });
  await tool.locator('[data-appliance="oven-pyro"]').click();
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  await page.waitForTimeout(800);
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5);
  await expect(page.getByText(/« Four encastrable pyrolyse » posé dans/).first()).toBeVisible({ timeout: 30_000 });
  await tool.getByRole("button", { name: "Fermer" }).click();
  // Pushed 25 cm to the right with Pousser: the oven clicked, its cabinet goes, the oven with it.
  await click(page, '[data-action="push"]');
  const push = page.getByRole("dialog", { name: "Pousser" });
  await page.waitForTimeout(800);
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5);
  await expect(push).toContainText("À pousser : « Bas 1 porte 600 »");
  const unit = (await push.locator("[data-push-step]").getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  await page.keyboard.type(unit === "mm" ? "250" : unit === "m" ? "0,25" : "25");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  // Entrée, as « OK », keeps it and the tool stays for the next one; Échap, as « Terminer », closes it.
  await expect(push).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(push).toHaveCount(0);
  // Saved: the oven stands in its cabinet where it went.
  await page.getByRole("button", { name: /Enregistrer/ }).first().click();
  await expect(page.getByText("Enregistré", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  const doc = await page.evaluate(async (url) => (await (await fetch(url)).json()).document, api);
  const cabinet = doc.features.find((f: { type: string }) => f.type === "cabinet");
  const oven = doc.features.find((f: { type: string }) => f.type === "appliance");
  expect(Math.abs(cabinet.origin[0] - 0) > 1 || Math.abs(cabinet.origin[1] - 0) > 1).toBe(true);
  expect(oven.origin[0] - cabinet.origin[0]).toBeCloseTo((600 - 595) / 2, 3);
  expect(errors).toEqual([]);
});

test("réseau jusqu'à… : la dernière copie arrive à la face cliquée, la distance se calcule", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-reseau-jusqua");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-1-porte-600"]').click();
  await expect(page.getByText(/Bas 1 porte 600 ajouté/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Hauts" }).click();
  await page.locator('[data-unit="wall-haut-1-porte-600"]').click();
  await expect(page.getByText(/Haut 1 porte 600 ajouté/).first()).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await click(page, '[data-action="view"][data-view="front"]');
  await page.keyboard.press("Escape");
  await click(page, '[data-action="array"]');
  const tool = page.getByRole("dialog", { name: "Réseau" });
  await tool.getByRole("combobox", { name: "Placement" }).selectOption("spread");
  await tool.getByRole("combobox", { name: "Axe" }).selectOption("2");
  const distance = tool.getByLabel("Distance", { exact: true });
  const before = await distance.inputValue();
  // « Jusqu'à… », then the base unit's door low down: the last copy's bottom there, below.
  await tool.locator("[data-array-arrival]").click();
  await expect(tool.locator("[data-array-arrival]")).toHaveAttribute("aria-pressed", "true");
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  await page.waitForTimeout(800);
  await page.mouse.click(canvas.x + canvas.width * 0.505, canvas.y + canvas.height * 0.85);
  await expect(tool.locator("[data-array-arrival]")).toHaveAttribute("aria-pressed", "false");
  await expect(distance).not.toHaveValue(before);
  await expect(distance).toHaveValue(/^-\d/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/reseau-jusqua.png` });
  expect(errors).toEqual([]);
});
