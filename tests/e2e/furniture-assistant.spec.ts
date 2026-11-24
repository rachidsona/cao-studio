/** « Assistant meuble » : un bureau puis une bibliothèque posés à leurs cotes, l'assistant restant ouvert ; une cote hors limites refusée. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("l'assistant pose un bureau puis une bibliothèque, refuse une cote hors limites, et se ferme par Terminer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-assistant-meuble");
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { name: string }[] } }).document.features.map((f) => f.name), api);
  };
  const tree = page.getByLabel(/^Navigateur : corps/);
  const status = page.locator('[data-ref="status-recompute"]');

  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await expect(tool).toBeVisible();
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("desk");
  await expect(tool.locator("[data-furniture-what]")).toContainText("trois tiroirs");
  await expect(tool.getByRole("textbox", { name: "Largeur" })).toHaveValue("140");

  // Too high for a desk: said, OK disabled (the project counts in cm).
  const height = tool.getByRole("textbox", { name: "Hauteur" });
  await height.fill("95");
  await height.press("Enter");
  await expect(tool).toContainText("Bureau : la hauteur va de 65 cm à 80 cm.");
  await expect(tool.getByRole("button", { name: "OK", exact: true })).toBeDisabled();
  await height.fill("75");
  await height.press("Enter");
  await tool.getByRole("combobox", { name: "Caisson à tiroirs" }).selectOption("right");
  await tool.getByRole("combobox", { name: "Matière" }).selectOption("melamine-oak");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bureau 1 » posé")).toBeVisible();
  await expect(tree.getByText("Bureau 1 — Plateau").first()).toBeAttached();
  await expect(status).not.toContainText("erreur");

  // The assistant stays: a bookcase, drawers at the bottom.
  await expect(tool).toBeVisible();
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("bookcase");
  await tool.getByRole("combobox", { name: "Bas du meuble" }).selectOption("drawers");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bibliothèque 1 » posé")).toBeVisible();
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect.poll(saved, { timeout: 30_000 }).toEqual(expect.arrayContaining(["Bureau 1 — Plateau", "Bureau 1 — Caisson du bureau", "Bibliothèque 1"]));
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "assistant-meuble");
  expect(errors).toEqual([]);
});

test("un lit contre le mur B de la Pièce, puis repris et refait plus large à sa place", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-assistant-mur");
  type Record = { name: string; ask: { width: number }; corner: number[]; along: number[] };
  const furniture = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { furniture?: Record[] } }).document.furniture ?? [], api);
  };
  const status = page.locator('[data-ref="status-recompute"]');
  // The Pièce as it comes: four walls, 3 m × 2,5 m.
  await click(page, '[data-action="room"]');
  const room = page.getByRole("dialog", { name: "Pièce" });
  await expect(room).toBeVisible();
  await page.waitForTimeout(1500);
  await room.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });

  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("bed");
  await tool.getByRole("combobox", { name: "Où le poser" }).selectOption({ label: "Contre le mur B (Pièce 1)" });
  const from = tool.getByRole("textbox", { name: /^Depuis le début du mur/ });
  await from.fill("20");
  await from.press("Enter");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Lit 1 » posé")).toBeVisible();
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  // Wall B runs from (3000, 0) along −Y: the bed's back against it, 20 cm from its start.
  await expect.poll(furniture, { timeout: 30_000 }).toEqual([expect.objectContaining({ name: "Lit 1", corner: [3000, -200, 0], along: [expect.closeTo(0, 6), -1] })]);
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  await shot(page, "assistant-lit-mur");

  // One of its boards selected, the assistant takes it back: 180 cm wide, made again where it stands.
  // Seen from above, the bed against wall B: a click on it (its base) selects one of its boards.
  await page.mouse.click(700, 480);
  await expect(page.locator('[data-ref="status-selection"]')).not.toHaveText("Aucune sélection");
  await click(page, '[data-workshop="furniture"]');
  await expect(tool).toContainText("Modifier : Lit 1");
  const width = tool.getByRole("textbox", { name: "Largeur" });
  await width.fill("180");
  await width.press("Enter");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Lit 1 » refait à ces cotes.")).toBeVisible();
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect.poll(furniture, { timeout: 30_000 }).toEqual([expect.objectContaining({ name: "Lit 1", ask: expect.objectContaining({ width: 1800 }), corner: [3000, -200, 0] })]);
  expect(errors).toEqual([]);
});

test("un placard sous escalier : caissons sous la pente et habillage en biais, sans erreur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-sous-escalier");
  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("stairs");
  await expect(tool.locator("[data-furniture-what]")).toContainText("sous la pente");
  const low = tool.getByRole("textbox", { name: /^Hauteur basse/ });
  await low.fill("40");
  await low.press("Enter");
  await tool.getByRole("combobox", { name: "Pente et façades" }).selectOption("left-doors");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Sous-escalier 1 » posé")).toBeVisible();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "sous-escalier");
  expect(errors).toEqual([]);
});

test("un habillage de réfrigérateur de 187 cm : les cotes du réfrigérateur et la hauteur totale, sans erreur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-habillage-frigo");
  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("fridge");
  await expect(tool.locator("[data-furniture-what]")).toContainText("au-dessus du réfrigérateur");
  const set = async (name: RegExp, value: string) => {
    const box = tool.getByRole("textbox", { name });
    await box.fill(value);
    await box.press("Enter");
  };
  await set(/^Hauteur du réfrigérateur/, "187");
  await set(/^Largeur du réfrigérateur/, "91");
  await set(/^Hauteur totale/, "240");
  await tool.getByRole("combobox", { name: "Caisson du haut, colonne" }).selectOption("doors-oven");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Habillage réfrigérateur 1 » posé")).toBeVisible();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const asked = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { furniture: { ask: object }[] } }).document.furniture[0]!.ask, api);
  expect(asked).toMatchObject({ kind: "fridge", width: 910, height: 1870, top: 2400, option: "doors-oven" });
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "habillage-frigo");
  expect(errors).toEqual([]);
});

test("un îlot de dressing au milieu de la Pièce : le passage trop étroit est dit, puis posé à sa place", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-ilot-dressing");
  type Record = { name: string; corner: number[]; along: number[] };
  const furniture = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { furniture?: Record[] } }).document.furniture ?? [], api);
  };
  const status = page.locator('[data-ref="status-recompute"]');
  // The Pièce as it comes: 3 m × 2,5 m, from (0, 0) along +X, then along −Y.
  await click(page, '[data-action="room"]');
  const room = page.getByRole("dialog", { name: "Pièce" });
  await expect(room).toBeVisible();
  await page.waitForTimeout(1500);
  await room.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });

  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("island");
  await expect(tool.getByRole("combobox", { name: "Où le poser" })).toHaveValue(/^mid:/);
  // 2,40 m wide in a 3 m room: 30 cm each side, said before it is set.
  const width = tool.getByRole("textbox", { name: "Largeur" });
  await width.fill("240");
  await width.press("Enter");
  await expect(tool.locator("[data-furniture-passage]")).toContainText("30 cm à gauche");
  await width.fill("120");
  await width.press("Enter");
  await expect(tool.locator("[data-furniture-passage]")).toHaveCount(0);
  await tool.getByRole("combobox", { name: "Des deux côtés" }).selectOption("drawers-shelves");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Îlot de dressing 1 » posé")).toBeVisible();
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  // Centred: 1,20 m × 90 cm in the middle of the room, its back left corner at (900, −800).
  await expect.poll(furniture, { timeout: 30_000 }).toEqual([expect.objectContaining({ name: "Îlot de dressing 1", corner: [900, -800, 0], along: [1, 0] })]);
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "ilot-dressing");
  expect(errors).toEqual([]);
});
