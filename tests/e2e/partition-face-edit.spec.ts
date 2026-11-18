/** Sur la face d'un mur du dressing : une étagère choisie, dupliquée, tirée, poussée au clavier, supprimée ; un tiroir de plus, des tiroirs supprimés ; une cote tapée sur place — chaque geste enregistré aussitôt, une annulation chacun. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const action = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const planTool = (page: Page) => page.getByRole("dialog", { name: "Plan de dressing" });
const zones = (page: Page) => planTool(page).getByRole("list", { name: "Zones du plan" });

test("face du mur : étagère dupliquée, tirée, poussée, supprimée ; tiroirs ; tringle tapée — chaque geste enregistré aussitôt", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Face modifiable e2e");
  await action(page, '[data-workshop="dressing-plan"]');
  const tool = planTool(page);
  await tool.getByRole("button", { name: "Droit", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await expect(zones(page)).toBeVisible();
  await tool.getByRole("button", { name: "Remplir selon les besoins" }).click();
  await tool.getByLabel("Penderie longue (m)").fill("0,9");
  await tool.getByLabel("Penderie courte (m)").fill("0");
  await tool.getByLabel("Chaussures (paires)").fill("0");
  await tool.getByLabel("Tiroirs", { exact: true }).fill("3");
  await tool.getByLabel("Étagères (m)").fill("0,6");
  await tool.getByRole("button", { name: "Poser les modules" }).click();
  await expect(page.getByText("Modules posés sur 1 zone.")).toBeVisible();
  await page.waitForTimeout(1500);

  const partition = page.getByRole("dialog", { name: "Répartition" });
  const strip = partition.locator("[data-partition-strip]");
  const reopen = async () => {
    await action(page, '[data-workshop="dressing-plan"]');
    await zones(page).getByRole("listitem").first().getByRole("button", { name: /^(Modifier|Répartition)$/ }).click();
    await expect(partition).toContainText("Modifier");
  };
  await reopen();
  const pieces = strip.locator("[data-piece]");
  const fronts = strip.locator("[data-front]");
  const storedPieces = await pieces.count();
  const storedFronts = await fronts.count();
  expect(storedPieces).toBeGreaterThanOrEqual(1);
  expect(storedFronts).toBeGreaterThanOrEqual(3);

  // A shelf clicked is chosen: outlined, with its bar.
  await pieces.first().click();
  await expect(partition).toContainText(/(Étagère|Cloison) choisie/);
  await expect(strip.locator("[data-picked]")).toHaveCount(1);
  const actions = partition.locator('[data-ref="partition-face-actions"]');
  await expect(actions.getByRole("button", { name: "Dupliquer" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Aligner" })).toBeVisible();

  // Duplicated: one more piece, stored at once (the 3D is made again).
  await actions.getByRole("button", { name: "Dupliquer" }).click();
  await expect(pieces).toHaveCount(storedPieces + 1);
  await expect(strip.locator("[data-picked]")).toHaveCount(1);
  await expect(page.getByText(/(Étagère|Cloison) dupliquée\./)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/partition-face-live.png" });

  // Pushed with the keyboard: 32 mm a step along its axis.
  const picked = strip.locator("[data-picked]");
  const where = async () => {
    const [x, y] = await Promise.all([picked.getAttribute("x"), picked.getAttribute("y")]);
    return [Number(x), Number(y)];
  };
  const before = await where();
  const vertical = (await partition.textContent())!.includes("Cloison choisie");
  await strip.focus();
  await page.keyboard.press(vertical ? "ArrowRight" : "ArrowUp");
  await expect.poll(async () => (await where())[vertical ? 0 : 1]).toBeCloseTo(before[vertical ? 0 : 1]! + (vertical ? 32 : -32), 0);

  // Pulled with the mouse: it moves, by whole steps of 32 mm (or onto a shelf beside).
  const grip = (await picked.boundingBox())!;
  const pulledFrom = await where();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(grip.x + grip.width / 2 + (vertical ? k * 5 : 0), grip.y + grip.height / 2 + (vertical ? 0 : k * 5));
  await expect(strip.locator("[data-ghost]")).toBeAttached();
  await page.mouse.up();
  await expect.poll(async () => (await where())[vertical ? 0 : 1]).not.toBeCloseTo(pulledFrom[vertical ? 0 : 1]!, 0);
  await partition.screenshot({ path: "test-results/partition-face-edit-shelf.png" });

  // Deleted with the key: one piece less again.
  await strip.focus();
  await page.keyboard.press("Delete");
  await expect(pieces).toHaveCount(storedPieces);
  await expect(page.getByText(/(Étagère|Cloison) supprimée/)).toBeVisible();

  // Drawers chosen: one more.
  await strip.locator("[data-equip]").and(strip.locator("rect")).first().click();
  const more = actions.getByRole("button", { name: "+ tiroir" });
  if (await more.isVisible()) {
    await more.click();
    await expect(fronts).toHaveCount(storedFronts + 1);
  } else {
    // The first equipment was the rod: take the drawers.
    const count = await strip.locator("[data-equip]").count();
    for (let k = 0; k < count && !(await more.isVisible()); k++) await strip.locator("[data-equip]").nth(k).click();
    await more.click();
    await expect(fronts).toHaveCount(storedFronts + 1);
  }

  // The drawers deleted: their fronts go.
  const withMore = await fronts.count();
  await actions.getByRole("button", { name: "Supprimer" }).click();
  await expect.poll(() => fronts.count()).toBeLessThan(withMore);
  const afterDelete = await fronts.count();

  // The rod's height typed on the spot.
  const rod = strip.locator('[data-label="rod"]').first();
  const rodText = await rod.textContent();
  await rod.click();
  const entry = partition.locator("[data-face-entry]");
  await expect(entry).toBeVisible();
  const value = Number((await entry.inputValue()).replace(",", "."));
  await entry.fill(String(Math.round(value * 0.9)));
  await entry.press("Enter");
  await expect(entry).toHaveCount(0);
  await expect(strip.locator('[data-label="rod"]').first()).not.toHaveText(rodText!);
  await partition.screenshot({ path: "test-results/partition-face-edit.png" });

  // Left without OK: every gesture is already in the document.
  const rodTyped = await strip.locator('[data-label="rod"]').first().textContent();
  await partition.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await reopen();
  await expect(pieces).toHaveCount(storedPieces);
  await expect(fronts).toHaveCount(afterDelete);
  await expect(strip.locator('[data-label="rod"]').first()).toHaveText(rodTyped!);
  await partition.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(partition).toHaveCount(0);
  // One undo: the last gesture only (the rod's height).
  await page.locator('[data-action="undo"]').first().click();
  await page.waitForTimeout(1500);
  await reopen();
  await expect(strip.locator('[data-label="rod"]').first()).toHaveText(rodText!);
  await expect(fronts).toHaveCount(afterDelete);

  // The 3D stays free while the panel is open: a shelf chosen in the Navigator, pulled by its handle in the view —
  // the face follows at once, the panel stays open, no message stops it.
  const free = async () => (await strip.locator('[data-label="niche"]').allTextContents()).join("|");
  const freeBefore = await free();
  const tree = page.getByLabel(/^Navigateur : corps/);
  await tree.getByRole("button", { name: "Déplier Étagères", exact: true }).first().click();
  await tree.getByText("Étagère 1", { exact: true }).first().click();
  const handle = page.locator("[data-shelf-handle]");
  await expect(handle).toBeVisible();
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y - 30, { steps: 4 });
  await page.mouse.up();
  await expect.poll(free).not.toBe(freeBefore);
  await expect(partition).toBeVisible();
  await expect(page.getByText(/reste à sa place/)).toHaveCount(0);
  await partition.screenshot({ path: "test-results/partition-face-follows-3d.png" });
  expect(errors).toEqual([]);
});
