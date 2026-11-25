/** « Isoler la sélection » : plusieurs éléments choisis restent seuls dans la vue, pour y travailler. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("deux caissons choisis, isolés par le bouton, puis tout montré ; la touche I et le clic droit aussi", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-isoler-selection");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (let i = 0; i < 3; i++) await plan.locator('[data-add="base-bas-2-portes-1000"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "isoler-avant");

  // Nothing selected: the button says what to do.
  const bar = page.locator("[data-zone-isolated]");
  await click(page, "[data-isolate-selection]");
  await expect(page.getByText(/Sélectionnez d'abord les éléments à isoler/).first()).toBeVisible();
  await expect(bar).toHaveCount(0);

  // The first unit, then the second with Maj: the two alone in the view.
  await page.mouse.click(430, 660);
  await page.keyboard.down("Shift");
  await page.mouse.click(600, 660);
  await page.keyboard.up("Shift");
  await click(page, "[data-isolate-selection]");
  await expect(bar).toContainText("2 éléments isolés");
  await expect(page.locator("[data-isolate-selection]")).toHaveAttribute("aria-pressed", "true");
  const shown = Number(await bar.getAttribute("data-shown"));
  expect(shown).toBeGreaterThan(8);
  if (process.env.SHOTS) await page.waitForTimeout(7000);
  await shot(page, "isoler-deux");

  // The key I with nothing selected: all back.
  await page.keyboard.press("Escape");
  await page.keyboard.press("i");
  await expect(bar).toHaveCount(0);
  await expect(page.locator("[data-isolate-selection]")).toHaveAttribute("aria-pressed", "false");

  // One unit, by the right click: it alone, fewer bodies than the two.
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await page.mouse.click(430, 660);
  await page.mouse.click(430, 660, { button: "right" });
  // First in the menu: « Modifier la sélection », the tool that made the unit.
  await expect(page.getByRole("menuitem").first()).toHaveText("Modifier la sélection");
  await page.getByRole("menuitem", { name: "Isoler la sélection" }).click();
  await expect(bar).toContainText(/« Bas 2 portes 1000 \(A1\) » isolé/);
  const unit = Number(await bar.getAttribute("data-shown"));
  expect(unit).toBeLessThan(shown);
  // Inside it, a piece chosen and isolated again: that piece alone.
  // (A face picked: one piece, not the whole unit a click would take.)
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-select-filter="face"]')?.click());
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await page.keyboard.press("i");
  await expect.poll(async () => Number(await bar.getAttribute("data-shown"))).toBe(1);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-select-filter="auto"]')?.click());
  await bar.getByRole("button", { name: "Tout montrer" }).click();
  await expect(bar).toHaveCount(0);
  // « Modifier la sélection » on a board of a cabinet (a side, a shelf): the Caisson tool, its shelves set there.
  await page.mouse.click(430, 660);
  await page.mouse.click(430, 660, { button: "right" });
  await page.getByRole("menuitem", { name: "Modifier la sélection" }).click();
  await expect(page.getByRole("dialog", { name: "Caisson" })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("« Cacher la sélection » : deux pièces cachées d'un coup (pas leurs caissons), listées par meuble, montrées une à une puis toutes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-cacher-selection");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (let i = 0; i < 3; i++) await plan.locator('[data-add="base-bas-2-portes-1000"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  const button = page.locator("[data-hide-selection]");

  // Nothing hidden, nothing selected: the button says what to do.
  await button.click();
  await expect(page.getByText(/Sélectionnez d'abord ce qu'il faut cacher/).first()).toBeVisible();
  await expect(button).toHaveAttribute("data-count", "0");

  // Two units: hidden at once, the count on the button.
  await page.mouse.click(430, 660);
  await page.keyboard.down("Shift");
  await page.mouse.click(600, 660);
  await page.keyboard.up("Shift");
  await button.click();
  await expect(page.getByText(/2 éléments cachés/).first()).toBeVisible();
  await expect(button).toHaveAttribute("data-count", "2", { timeout: 30_000 });
  // Only the two pieces clicked, not the whole cabinets: no cabinet hidden, two pieces in the hidden list.
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const saved = (await page.evaluate(async (url) => (await (await fetch(url, { headers: { Accept: "application/json" } })).json()).document, api)) as { hiddenBodies?: string[]; features: { type: string; hidden?: boolean }[] };
  expect(saved.hiddenBodies ?? []).toHaveLength(2);
  expect(saved.features.filter((f) => f.type === "cabinet" && f.hidden)).toHaveLength(0);

  // The list, one line per unit: one shown again, then all.
  await button.click();
  const list = page.getByRole("menu", { name: "Éléments cachés" });
  await expect(list.locator("[data-show-hidden]")).toHaveCount(2);
  // One piece of each: no detail under them (a unit with several pieces hidden lists each).
  await expect(list.locator("[data-show-hidden-piece]")).toHaveCount(0);
  await shot(page, "cacher-liste");
  await list.locator("[data-show-hidden]").first().click();
  await expect(button).toHaveAttribute("data-count", "1", { timeout: 30_000 });
  await expect(list.locator("[data-show-hidden]")).toHaveCount(1);
  await list.locator("[data-show-all-hidden]").click();
  await expect(button).toHaveAttribute("data-count", "0", { timeout: 30_000 });
  await expect(list).toHaveCount(0);

  // « Tout montrer » is one undo step: Ctrl + Z hides that one again.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveAttribute("data-count", "1", { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("« Cacher la sélection » sur la façade d'un tiroir : le tiroir entier se cache, sa façade et son caisson, pas le meuble", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-cacher-tiroir");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  for (let i = 0; i < 3; i++) await plan.locator('[data-add="base-bas-3-tiroirs-900"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  // A face of a drawer front chosen, then hidden.
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-select-filter="face"]')?.click());
  await page.mouse.click(430, 660);
  await page.locator("[data-hide-selection]").click();
  await expect(page.locator("[data-hide-selection]")).toHaveAttribute("data-count", "1", { timeout: 30_000 });
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const saved = (await page.evaluate(async (url) => (await (await fetch(url, { headers: { Accept: "application/json" } })).json()).document, api)) as { hiddenBodies?: string[]; features: { id: string; type: string; hidden?: boolean }[] };
  const hidden = saved.hiddenBodies ?? [];
  // Its front, its two sides, its back and its bottom at least, all of one fronts feature; no cabinet hidden.
  expect(hidden.length).toBeGreaterThanOrEqual(5);
  const fronts = new Set(hidden.map((id) => id.split("#")[0]));
  expect(fronts.size).toBe(1);
  expect(saved.features.find((f) => f.id === [...fronts][0])?.type).toBe("fronts");
  expect(saved.features.filter((f) => f.type === "cabinet" && f.hidden)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("« Modifier la sélection » sur une porte : l'outil Façades, sur ses façades", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-test-modifier-porte");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await plan.locator('[data-add="base-bas-2-portes-1000"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  // The unit seen from the front, framed with its wall: its right door.
  const [x, y] = [470, 660];
  await page.mouse.click(x, y);
  await page.mouse.click(x, y, { button: "right" });
  await page.getByRole("menuitem", { name: "Modifier la sélection" }).click();
  await expect(page.getByRole("dialog", { name: "Façades" })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("« Modifier la sélection » sur le panneau d'angle : Façades sur la porte d'angle, sans en ajouter une", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-modifier-porte-angle");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const corners = plan.locator('[data-fold="corners"]');
  if ((await corners.getAttribute("aria-expanded")) !== "true") await corners.click();
  await plan.locator('[data-corner-choice="left"] [data-corner-kind="unit"]').click();
  await plan.locator("[data-run-close]").click();
  await expect(page.getByText("Meuble d'angle A").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Fermer", exact: true }).click();
  // The corner's panel alone in the view, framed from the front.
  await page.evaluate(() => ([...document.querySelectorAll<HTMLElement>('[data-select^="body:"]')].find((b) => /Panneau d'angle A/.test(b.textContent ?? "")) as HTMLElement | undefined)?.click());
  await page.keyboard.press("i");
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(1500);
  await shot(page, "angle-panneau-isole");
  // Where it shows: the middle of the white board, in the picture of the view (clear of its tool bars).
  const canvas = page.locator("canvas.cad-view");
  const view = (await canvas.boundingBox())!;
  const at = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    [c.width, c.height] = [img.width, img.height];
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let [sx, sy, n] = [0, 0, 0];
    for (let y = 0; y < c.height * 0.7; y++) for (let x = Math.round(c.width * 0.12); x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i]! > 225 && d[i + 1]! > 225 && d[i + 2]! > 225) [sx, sy, n] = [sx + x, sy + y, n + 1];
    }
    return n ? [sx / n / c.width, sy / n / c.height] : null;
  }, (await canvas.screenshot()).toString("base64"));
  expect(at).not.toBeNull();
  await page.mouse.click(view.x + at![0]! * view.width, view.y + at![1]! * view.height, { button: "right" });
  await shot(page, "angle-panneau-menu");
  await page.getByRole("menuitem", { name: "Modifier « Panneau d'angle A »" }).click();
  const fronts = page.getByRole("dialog", { name: "Façades" });
  await expect(fronts).toBeVisible({ timeout: 30_000 });
  await fronts.getByRole("button", { name: "OK", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const made = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { id: string; type: string; name: string; cabinet?: string }[] } }).document.features, api);
  const unit = made.find((f) => f.type === "cabinet" && f.name === "Meuble d'angle A")!;
  // One door on the corner unit, its own: no board for it any more.
  expect(made.filter((f) => f.type === "fronts" && f.cabinet === unit.id).map((f) => f.name)).toEqual(["Façades Meuble d'angle A"]);
  expect(made.some((f) => f.type === "extrude" && f.name.startsWith("Porte d'angle"))).toBe(false);
  expect(errors).toEqual([]);
});
