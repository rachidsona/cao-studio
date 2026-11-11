/** La face d'un mur du dressing dans le panneau de sa Répartition : ce qu'il a, à l'échelle ; une case choisie, son bord tiré, une étape d'historique. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const action = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const planTool = (page: Page) => page.getByRole("dialog", { name: "Plan de dressing" });
const zones = (page: Page) => planTool(page).getByRole("list", { name: "Zones du plan" });

test("face du mur : les tiroirs posés s'y voient, une case choisie s'élargit en tirant son bord, OK puis une annulation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Face du mur e2e");
  await action(page, '[data-workshop="dressing-plan"]');
  const tool = planTool(page);
  await tool.getByRole("button", { name: "Droit", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await expect(zones(page)).toBeVisible();
  // Drawers in the wall, to see them on its face.
  await tool.getByRole("button", { name: "Remplir selon les besoins" }).click();
  await tool.getByLabel("Penderie longue (m)").fill("0,9");
  await tool.getByLabel("Penderie courte (m)").fill("0");
  await tool.getByLabel("Chaussures (paires)").fill("0");
  await tool.getByLabel("Tiroirs", { exact: true }).fill("3");
  await tool.getByLabel("Étagères (m)").fill("0");
  await tool.getByRole("button", { name: "Poser les modules" }).click();
  await expect(page.getByText("Modules posés sur 1 zone.")).toBeVisible();
  await page.waitForTimeout(1500);

  const partition = page.getByRole("dialog", { name: "Répartition" });
  const strip = partition.locator("[data-partition-strip]");
  const reopen = async () => {
    await action(page, '[data-workshop="dressing-plan"]');
    await zones(page).getByRole("listitem").first().getByRole("button").last().click();
    await expect(partition).toContainText("Modifier");
  };
  await reopen();

  // The face, at the top of the panel, before the measures: its cases, their widths, the drawers and the rod.
  await expect(strip).toBeVisible();
  const box = (await strip.boundingBox())!;
  const height = (await partition.getByLabel(/^Hauteur/).first().boundingBox())!;
  expect(box.y).toBeLessThan(height.y);
  const cases = await strip.locator("[data-case]").count();
  expect(cases).toBeGreaterThanOrEqual(2);
  await expect(strip.locator("[data-width]")).toHaveCount(cases);
  await expect(strip.locator("[data-front]").first()).toBeAttached();
  expect(await strip.locator("[data-front]").count()).toBeGreaterThanOrEqual(3);
  expect(await strip.locator("[data-rod]").count()).toBeGreaterThanOrEqual(1);
  await expect(strip.locator('[data-dim="height"]')).toHaveText(/\d/);
  // Every dimension: the panels' thickness, each drawer front's height, the rod's height, the free height of the niches.
  await expect(strip.locator('[data-label="panel"]')).toHaveText(/^ép\. \d/);
  expect(await strip.locator('[data-label="front"]').count()).toBe(await strip.locator("[data-front]").count());
  await expect(strip.locator('[data-label="rod"]').first()).toHaveText(/^tringle \d/);
  await expect(strip.locator('[data-label="niche"]').first()).toHaveText(/\d/);
  await partition.screenshot({ path: "test-results/partition-strip-dims.png" });

  // As the modules left it (their widths), to find it again after the undo.
  const stored = await strip.locator('[data-width="0"]').textContent();

  // It follows the panel: a case more, before OK (the cases are then equal again).
  await partition.getByLabel("Cases", { exact: true }).selectOption(String(cases + 1));
  await expect(strip.locator("[data-case]")).toHaveCount(cases + 1);
  await partition.getByLabel("Cases", { exact: true }).selectOption(String(cases));
  await expect(strip.locator("[data-case]")).toHaveCount(cases);

  // A case clicked is chosen; its right edge, pulled, makes it wider and its neighbour narrower.
  const before = await strip.locator('[data-width="0"]').textContent();
  const next = await strip.locator('[data-width="1"]').textContent();
  await strip.locator('[data-case="0"]').click({ position: { x: 5, y: 5 } });
  await expect(partition).toContainText("Case 1 choisie");
  await expect(strip.locator("[data-chosen]")).toHaveCount(1);
  const grip = (await strip.locator('[data-resize="right"] rect').last().boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 5; k++) await page.mouse.move(grip.x + grip.width / 2 + k * 4, grip.y + grip.height / 2);
  await page.mouse.up();
  await expect(strip.locator('[data-width="0"]')).not.toHaveText(before!);
  const wider = await strip.locator('[data-width="0"]').textContent();
  const number = (text: string | null) => Number(text!.replace(",", "."));
  expect(number(wider)).toBeGreaterThan(number(before));
  expect(number(await strip.locator('[data-width="1"]').textContent())).toBeCloseTo(number(before) + number(next) - number(wider), 0);
  await expect(partition.getByLabel("Largeur des cases")).toHaveValue("shares");
  await partition.screenshot({ path: "test-results/partition-strip.png" });

  // Stored as soon as it is let go (one step); OK has nothing more to store: one undo takes it back.
  await partition.getByRole("button", { name: "OK", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1500);
  await reopen();
  await expect(strip.locator('[data-width="0"]')).toHaveText(wider!);
  await partition.getByRole("button", { name: "Annuler" }).click();
  await expect(partition).toHaveCount(0);
  await page.locator('[data-action="undo"]').first().click();
  await page.waitForTimeout(1500);
  await reopen();
  await expect(strip.locator('[data-width="0"]')).toHaveText(stored!);
  expect(errors).toEqual([]);
});
