/** « Ma bibliothèque » : un module inséré se colle contre la face d'un meuble choisie avant, en une seule annulation. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const canvas = (page: Page) => page.locator("canvas.cad-view");

test("un caisson de la bibliothèque se colle contre la face choisie, et une annulation le reprend", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-bibliotheque-collage");
  // A cabinet in the middle of the view.
  await click(page, '[data-action="cabinet"]');
  await page.waitForTimeout(600);
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const close = page.getByRole("button", { name: "Fermer", exact: true }).first();
  if (await close.isVisible()) await close.click();
  await page.waitForTimeout(1200);
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(800);
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // Kept in the library, from a face of it.
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('[data-ref="status-selection"]')).not.toContainText("Aucune");
  await click(page, "[data-library]");
  const library = page.getByRole("dialog", { name: /bibliothèque/i });
  const name = `Caisson collé ${Date.now()}`;
  await library.getByLabel("Nom du module").fill(name);
  await library.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(library).toContainText(`« ${name} » est dans la bibliothèque`);

  // Its front face still chosen, then « Insérer »: glued against it, in front, one undo step with the insertion.
  await expect(page.locator('[data-ref="status-selection"]')).not.toContainText("Aucune");
  const price = page.locator("[data-live-price]");
  await expect(price).toContainText("MAD");
  const before = await price.textContent();
  const row = library.locator("li, div").filter({ hasText: name }).last();
  await row.getByRole("button", { name: "Insérer" }).click();
  await expect(page.getByText(`« ${name} » inséré contre la face choisie`)).toBeVisible({ timeout: 30_000 });
  await expect(price).not.toHaveText(before!, { timeout: 15_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bibliotheque-collage.png` });
  await click(page, '[data-action="undo"]');
  await expect(price).toHaveText(before!, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("seulement les pièces choisies : une porte d'un dressing gardée seule, remise seule dans un autre projet", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-bibliotheque-seule");
  // A wall of a dressing, from the front, a door on its first case.
  await click(page, '[data-workshop="dressing-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de dressing" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button", { name: /^(Modifier|Répartition)$/ }).click();
  await page.getByRole("dialog", { name: "Répartition" }).getByRole("button", { name: "Fermer", exact: true }).click();
  await page.waitForTimeout(1000);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(800);
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]').click();
  await page.getByRole("button", { name: "Porte sur des niches choisies…" }).click();
  const door = page.getByRole("dialog", { name: "Porte sur niches" });
  const box = (await canvas(page).boundingBox())!;
  const at = [box.x + box.width * 0.33, box.y + box.height * 0.5] as const;
  await page.mouse.click(...at);
  await door.getByRole("button", { name: "OK", exact: true }).click();
  await door.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1000);

  // The door chosen, kept alone.
  await page.mouse.click(...at);
  await expect(page.locator('[data-ref="status-selection"]')).not.toContainText("Aucune");
  await click(page, "[data-library]");
  const library = page.getByRole("dialog", { name: /bibliothèque/i });
  const name = `Porte seule ${Date.now()}`;
  await library.getByLabel("Nom du module").fill(name);
  await library.locator("[data-library-only]").check();
  await library.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(library).toContainText(`« ${name} » est dans la bibliothèque`);
  const kept = await page.evaluate(async (name) => {
    const list = (await (await fetch("/api/library/", { headers: { Accept: "application/json" } })).json()) as { modules: { id: number; name: string }[] };
    const id = list.modules.find((m) => m.name === name)!.id;
    return ((await (await fetch(`/api/library/${id}/`, { headers: { Accept: "application/json" } })).json()) as { document: { removedBodies?: string[]; features: { type: string }[] } }).document;
  }, name);
  expect(kept.features.some((f) => f.type === "niche")).toBe(true);
  expect(kept.removedBodies?.length ?? 0).toBeGreaterThan(3);

  // In another project: the door only, its wall left out.
  await page.goto("/projects/");
  await page.fill("#id_name", "zz-test-bibliotheque-seule-2");
  await page.getByRole("button", { name: "Créer et ouvrir" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, "[data-library]");
  const again = page.getByRole("dialog", { name: /bibliothèque/i });
  await again.locator("li, div").filter({ hasText: name }).last().getByRole("button", { name: "Insérer" }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await expect(page.getByLabel(/^Navigateur : corps/).getByText(/^Porte \d+$/).first()).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bibliotheque-seule.png` });
  expect(errors).toEqual([]);
});

test("un module inséré sur la face d'une porte en prend la place, la porte d'avant retirée avec sa poignée", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-bibliotheque-a-la-place");
  const removed = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    // The pieces of the flat door taken out (the module's own hidden ones apart).
    return page.evaluate(async (url) => {
      const { document } = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { removedBodies?: string[]; features: { id: string; type: string; fill?: string; style?: string }[] } };
      const flat = document.features.find((f) => f.type === "niche" && f.fill === "door" && (f.style ?? "flat") === "flat")!.id;
      return (document.removedBodies ?? []).filter((b) => b.startsWith(`${flat}#`));
    }, api);
  };
  await click(page, '[data-workshop="dressing-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de dressing" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button", { name: /^(Modifier|Répartition)$/ }).click();
  await page.getByRole("dialog", { name: "Répartition" }).getByRole("button", { name: "Fermer", exact: true }).click();
  await page.waitForTimeout(1000);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(800);
  // Two doors: a framed one on the first case, a flat one on the last.
  await page.getByRole("tab", { name: "Dressing", exact: true }).click();
  await page.getByRole("group", { name: "Dressing" }).locator('[data-action="fronts"]').click();
  await page.getByRole("button", { name: "Porte sur des niches choisies…" }).click();
  const door = page.getByRole("dialog", { name: "Porte sur niches" });
  const box = (await canvas(page).boundingBox())!;
  const [first, last] = [[box.x + box.width * 0.33, box.y + box.height * 0.5], [box.x + box.width * 0.75, box.y + box.height * 0.5]] as const;
  await page.mouse.click(...first);
  await door.getByRole("combobox", { name: "Style" }).selectOption("frame");
  await door.locator("[data-door-another]").click();
  await page.mouse.click(...last);
  await door.getByRole("combobox", { name: "Style" }).selectOption("flat");
  await door.getByRole("button", { name: "OK", exact: true }).click();
  await door.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1000);

  // The framed door kept alone; then the flat one's face chosen, and « Insérer ».
  await page.mouse.click(...first);
  await click(page, "[data-library]");
  const library = page.getByRole("dialog", { name: /bibliothèque/i });
  const name = `Porte à cadre ${Date.now()}`;
  await library.getByLabel("Nom du module").fill(name);
  await library.locator("[data-library-only]").check();
  await library.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(library).toContainText(`« ${name} » est dans la bibliothèque`);
  expect(await removed()).toEqual([]);
  // Its face picked (the filter « Faces »: not the wall's sketch in front of it).
  await page.getByRole("group", { name: "Filtre de sélection" }).getByRole("button", { name: "Faces" }).click();
  await page.mouse.click(...last);
  await expect(page.locator('[data-ref="status-selection"]')).toContainText("face");
  await library.locator("li, div").filter({ hasText: name }).last().getByRole("button", { name: "Insérer" }).click();
  await expect(page.getByText(`« ${name} » inséré à la place de la façade choisie`)).toBeVisible({ timeout: 30_000 });
  // The flat door and its handle out of the model.
  await expect.poll(async () => (await removed()).length, { timeout: 30_000 }).toBe(2);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bibliotheque-a-la-place.png` });
  expect(errors).toEqual([]);
});
