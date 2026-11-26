/** Électroménager : une plaque posée sur un meuble du Plan de cuisine s'appuie sur le plan de travail, pas sous lui. */
import { expect, test, type Page } from "@playwright/test";
import { newProject, wallsOnly } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("une plaque induction posée d'un clic sur un meuble bas : sur le plan de travail, sa découpe à travers lui", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-plaque-plan");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await wallsOnly(plan);
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

  await click(page, '[data-action="appliances"]');
  await page.locator('[data-appliance-family="hob"]').click();
  await page.locator('[data-appliance="hob-induction"]').click();
  await page.mouse.click(430, 660);
  await expect(page.getByText(/Plaque induction/).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  type F = { type: string; origin?: number[]; height?: number; ops?: { from: number[]; to: number[] }[]; kitchenPlan?: { worktopHeight: number; worktopThickness?: number } };
  const features = (await page.evaluate(async (url) => (await (await fetch(url, { headers: { Accept: "application/json" } })).json()).document.features, api)) as F[];
  const top = features.find((f) => f.kitchenPlan)!.kitchenPlan!.worktopHeight;
  const hob = features.find((f) => f.type === "appliance")!;
  // Its glass on the worktop: its top above it, its body under it.
  expect(hob.origin![2]! + hob.height!).toBeGreaterThan(top);
  expect(hob.origin![2]!).toBeLessThan(top);
  // The cut goes through the whole worktop.
  const cut = features.find((f) => f.type === "machining")!.ops![0]!;
  expect(cut.to[2]!).toBeGreaterThanOrEqual(top);
  expect(cut.from[2]!).toBeLessThanOrEqual(top - 30);
  expect(errors).toEqual([]);
});
