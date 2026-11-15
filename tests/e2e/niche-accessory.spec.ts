/** « Accessoire intérieur » : un accessoire acheté posé dans une niche, par le clic droit, refusé s'il ne tient pas, au devis. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

/** A wall of a dressing, seen from the front. */
async function wall(page: Page) {
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button").last().click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1000);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(800);
}

test("un accessoire se pose dans une niche par le clic droit, refuse une niche trop large, et va au devis", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-accessoires");
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; fill?: string }[] } }).document.features.filter((f) => f.type === "niche" && f.fill === "accessory"), api);
  };
  await wall(page);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const [x, y] = [view.x + view.width * 0.38, view.y + view.height * 0.55];
  const tree = page.getByLabel(/^Navigateur : corps/);

  // From the menu of the niche: the tool, its niche chosen.
  await page.mouse.click(x, y, { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: "Accessoire intérieur" }).click();
  const tool = page.getByRole("dialog", { name: "Accessoire" });
  await expect(tool).toContainText("Niche choisie");
  const model = tool.getByRole("combobox", { name: "Accessoire", exact: true });
  const ok = tool.getByRole("button", { name: "OK", exact: true });

  // A bottle rack is for a narrow niche: refused here, with what it asks for.
  await model.selectOption({ label: "Range-bouteilles coulissant" });
  await expect(tool).toContainText("trop large pour « Range-bouteilles coulissant »");
  await expect(ok).toBeDisabled();

  // A trouser rack, 50 cm above the bottom of the niche (the project counts in cm).
  await model.selectOption({ label: "Porte-pantalons coulissant" });
  await expect(tool.locator("[data-accessory-needs]")).toContainText("de profondeur");
  const lift = tool.getByRole("textbox", { name: /^Bas à/ });
  await lift.fill("50");
  await lift.press("Tab");
  await expect(tool).toContainText("à 50 cm du bas de la niche");
  await expect(tool).toContainText("Prix indicatif");
  await expect(ok).toBeEnabled();
  await page.waitForTimeout(600);
  await shot(page, "accessoire-apercu");
  await ok.click();
  await expect(page.getByText("Niche équipée : accessoire.")).toBeVisible();
  // The tool stays for other niches; Terminer closes it.
  await expect(tool).toBeVisible();
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect(tree.getByText("Porte-pantalons coulissant 1", { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-ref="status-save"]')).not.toContainText("erreur");
  await expect.poll(saved, { timeout: 30_000 }).toMatchObject([{ name: "Porte-pantalons coulissant 1", accessory: { model: "trousers", lift: 500 } }]);
  await page.waitForTimeout(1500);
  await click(page, '[data-action="view"][data-view="iso"]');
  await page.waitForTimeout(900);
  await shot(page, "accessoire-pose");

  // Clicked in the view, it comes out on its slides; clicked again, it goes back (the view only).
  const [rack] = (await saved()) as unknown as { id: string }[];
  const view3d = page.locator("canvas.cad-view");
  const look = async () => (await view3d.screenshot()).toString("base64");
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  const closed = await look();
  const flip = () => page.evaluate((id) => document.dispatchEvent(new CustomEvent("cad:toggle-door", { detail: `${id}#4` })), rack!.id);
  await flip();
  await page.waitForTimeout(700);
  expect(await look()).not.toBe(closed);
  await shot(page, "accessoire-sorti");
  await flip();
  await page.waitForTimeout(700);
  expect(await look()).toBe(closed);

  // Bought: in the quote, not in the cut list.
  await click(page, '[data-workshop="quote"]');
  const quote = page.getByRole("dialog", { name: "Devis" });
  await expect(quote).toContainText("Porte-pantalons coulissant");
  await quote.getByRole("button", { name: "Fermer", exact: true }).first().click();
  await click(page, '[data-workshop="cutlist"]');
  const list = page.getByRole("dialog", { name: "Liste de débit" });
  await expect(list).toBeVisible();
  await expect(list).not.toContainText("Barre 1");
  expect(errors).toEqual([]);
});

test("les accessoires d'angle sont au catalogue de la cuisine ; celui qui tient dans la niche se pose, les autres sont refusés", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-accessoires-angle");
  await wall(page);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width * 0.38, view.y + view.height * 0.55, { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: "Accessoire intérieur" }).click();
  const tool = page.getByRole("dialog", { name: "Accessoire" });
  const model = tool.getByRole("combobox", { name: "Accessoire", exact: true });
  const kitchen = model.locator('optgroup[label="Cuisine"] option');
  await expect(kitchen).toContainText(["Plateaux tournants d'angle (2 niveaux)", "Demi-lunes pivotantes (2 plateaux)", "Magic corner (paniers d'angle coulissants)"]);
  // The niche's width (in cm): the trays turn in 70 to 100 cm, the half-moons and the magic corner go behind a door of 40 to 60.
  const width = Number(/Niche choisie : ([\d,]+) cm/.exec((await tool.innerText()).replace(/\s+/g, " "))![1]!.replace(",", "."));
  const ok = tool.getByRole("button", { name: "OK", exact: true });
  for (const [label, fits] of [["Plateaux tournants d'angle (2 niveaux)", width >= 70 && width <= 100], ["Demi-lunes pivotantes (2 plateaux)", width >= 40 && width <= 60]] as const) {
    await model.selectOption({ label });
    if (fits) await expect(ok).toBeEnabled();
    else await expect(tool).toContainText(`« ${label} »`);
  }

  // The trays fit here (72,75 cm): set, then turned a third of a round by a click on them, and back.
  await model.selectOption({ label: "Plateaux tournants d'angle (2 niveaux)" });
  await ok.click();
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const carousel = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { id: string; fill?: string }[] } }).document.features.find((f) => f.fill === "accessory")!.id, api);
  await click(page, '[data-action="view"][data-view="iso"]');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1500);
  const view3d = page.locator("canvas.cad-view");
  const look = async () => (await view3d.screenshot()).toString("base64");
  const still = await look();
  const flip = () => page.evaluate((id) => document.dispatchEvent(new CustomEvent("cad:toggle-door", { detail: `${id}#1` })), carousel);
  await flip();
  await page.waitForTimeout(700);
  expect(await look()).not.toBe(still);
  await shot(page, "plateaux-tournes");
  await flip();
  await page.waitForTimeout(700);
  expect(await look()).toBe(still);
  expect(errors).toEqual([]);
});
