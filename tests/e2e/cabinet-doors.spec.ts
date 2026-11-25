/** Un caisson créé avec ses portes : le modèle « Vitrine à portes en verre noir », ou « Portes » réglé à la main. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Fronts = { type: string; cabinet?: string; layout?: string; style?: string; glass?: string; profile?: string };

test("un caisson arrive avec ses portes en verre noir, deux portes au-delà de 600 mm", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-caisson-verre-noir");
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Fronts[] } }).document.features.filter((f) => f.type === "fronts"), api);
  };

  // The model: a showcase 800 wide, its two doors in black glass, their frames in black aluminium.
  await click(page, '[data-action="cabinet"]');
  const tool = page.getByRole("dialog", { name: "Caisson" });
  await tool.getByRole("combobox", { name: "Modèle" }).selectOption("showcase-black");
  await expect(tool.getByRole("combobox", { name: "Portes" })).toHaveValue("glass");
  await expect(tool.getByRole("combobox", { name: "Verre (trempé 4 mm)" })).toHaveValue("black");
  await expect(tool.getByRole("combobox", { name: "Cadre" })).toHaveValue("black");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  const tree = page.getByLabel(/^Navigateur : corps/);
  await expect(tree.getByText("Vitre porte gauche").first()).toBeVisible();
  await expect(tree.getByText("Vitre porte droite").first()).toBeVisible();
  expect(await saved()).toMatchObject([{ layout: "doors", style: "glass", glass: "black", profile: "black" }]);
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await shot(page, "caisson-verre-noir");

  // By hand: plain doors on a cabinet 500 mm wide (the project counts in cm) — one door.
  await click(page, '[data-action="cabinet"]');
  await tool.getByRole("combobox", { name: "Portes" }).selectOption("flat");
  await expect(tool.getByRole("combobox", { name: "Verre (trempé 4 mm)" })).toHaveCount(0);
  const width = tool.getByRole("textbox", { name: /^Largeur/ });
  await width.fill("50");
  await width.press("Tab");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  const fronts = await saved();
  expect(fronts).toHaveLength(2);
  expect(fronts[1]).toMatchObject({ layout: "door" });
  expect(fronts[1]!.style).toBeUndefined();
  expect(errors).toEqual([]);
});

test("Caisson : une porte de côté, à droite, puis passée à gauche, puis ôtée — le côté sans panneau suit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-caisson-porte-cote");
  type Saved = { id: string; type: string; cabinet?: string; face?: string; side?: string; open?: string };
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const features = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Saved[] } }).document.features, api);
    const cabinet = features.find((f) => f.type === "cabinet")!;
    return { open: cabinet.open ?? null, doors: features.filter((f) => f.type === "fronts").map((f) => [f.face ?? "front", f.side ?? null]) };
  };
  await click(page, '[data-action="cabinet"]');
  const tool = page.getByRole("dialog", { name: "Caisson" });
  await tool.getByRole("combobox", { name: "Portes" }).selectOption("flat");
  await tool.getByRole("combobox", { name: "Porte de côté" }).selectOption("right");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  const tree = page.getByLabel(/^Navigateur : corps/);
  await expect(tree.getByText(/^Porte de côté Caisson/).first()).toBeVisible();
  expect(await saved()).toEqual({ open: "right", doors: [["front", null], ["right", "left"]] });
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  await shot(page, "caisson-porte-cote");

  // The cabinet changed: its side door goes to the left with its open side, then away.
  await page.getByRole("toolbar", { name: "Historique des opérations" }).locator('[data-op="cb1"]').click();
  await page.getByRole("dialog", { name: /^Caisson/ }).getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(tool.getByRole("combobox", { name: "Porte de côté" })).toHaveValue("right");
  await tool.getByRole("combobox", { name: "Porte de côté" }).selectOption("left");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  expect(await saved()).toEqual({ open: "left", doors: [["front", null], ["left", "right"]] });
  await page.getByRole("toolbar", { name: "Historique des opérations" }).locator('[data-op="cb1"]').click();
  await page.getByRole("dialog", { name: /^Caisson/ }).getByRole("button", { name: "Modifier", exact: true }).click();
  await tool.getByRole("combobox", { name: "Porte de côté" }).selectOption("");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  expect(await saved()).toEqual({ open: null, doors: [["front", null]] });
  // An existing cabinet given a side door later: the door comes with it.
  await page.getByRole("toolbar", { name: "Historique des opérations" }).locator('[data-op="cb1"]').click();
  await page.getByRole("dialog", { name: /^Caisson/ }).getByRole("button", { name: "Modifier", exact: true }).click();
  await tool.getByRole("combobox", { name: "Porte de côté" }).selectOption("right");
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  expect(await saved()).toEqual({ open: "right", doors: [["front", null], ["right", "left"]] });
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});

test("une liste d'un panneau ouverte pendant que l'aperçu se termine n'est pas refermée : le panneau attend qu'on la quitte", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-liste-ouverte");
  await click(page, '[data-action="cabinet"]');
  const tool = page.getByRole("dialog", { name: "Caisson" });
  const doors = tool.getByRole("combobox", { name: "Portes" });
  // A change that starts a preview, then the list of the doors taken at once (as when it is opened).
  await tool.getByRole("combobox", { name: "Étagères" }).selectOption("3");
  await doors.focus();
  await doors.evaluate((s) => ((s as HTMLSelectElement & { mark?: number }).mark = 1));
  await page.waitForTimeout(1500);
  // Still the same list: not drawn again under the pointer.
  expect(await doors.evaluate((s) => (s as HTMLSelectElement & { mark?: number }).mark ?? 0)).toBe(1);
  // A choice in it: the panel follows it at once (the glass rows appear).
  await doors.selectOption("glass");
  await expect(tool.getByRole("combobox", { name: "Verre (trempé 4 mm)" })).toBeVisible();
  // Let go: the panel is drawn again, its result stored.
  await tool.getByRole("combobox", { name: "Étagères" }).focus();
  await page.waitForTimeout(800);
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect(page.getByLabel(/^Navigateur : corps/).getByText(/^Vitre porte/).first()).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
