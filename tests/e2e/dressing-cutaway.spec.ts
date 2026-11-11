/** Un dressing sans pièce : le mur (la Répartition) qu'on voit de dos s'efface quand on tourne autour, comme les murs de la cuisine. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("dressing en U sans pièce : vue tournée derrière un mur, ce mur s'efface, jamais tout le dressing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Dressing coupé e2e");
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En U", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await expect(tool.getByRole("list", { name: "Zones du plan" })).toBeVisible();
  await tool.getByRole("button", { name: "Remplir selon les besoins" }).click();
  await tool.getByRole("button", { name: "Poser les modules" }).click();
  await expect(page.getByText(/Modules posés sur \d+ zones?\./)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const view = page.locator("canvas.cad-view");
  const box = (await view.boundingBox())!;
  const cut = async () => Number((await view.getAttribute("data-pieces-cut")) ?? "0");
  const halfTurn = async () => {
    await page.waitForTimeout(900);
    for (let turn = 0; turn < 2; turn++) {
      await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 20 });
      await page.mouse.up();
    }
    await page.waitForTimeout(900);
  };

  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(900);
  const front = await cut();
  await halfTurn();
  const turned = await cut();
  // On one side the dressing faces the eye, nothing goes; on the other one wall (at least) shows its back and goes.
  expect(Math.max(front, turned)).toBeGreaterThan(5);
  expect(Math.min(front, turned)).toBe(0);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/dressing-coupe.png` });
  await page.screenshot({ path: "test-results/dressing-cutaway.png" });

  // « Affichage »: off with « avec leurs meubles », everything back.
  const units = page.locator("[data-wall-cutaway-furniture]");
  const behind = turned > 0;
  if (!behind) await halfTurn();
  await page.evaluate(() => {
    const box = document.querySelector<HTMLInputElement>("[data-wall-cutaway-furniture]");
    if (box && box.checked) box.click();
  });
  await expect.poll(cut).toBe(0);
  await page.evaluate(() => document.querySelector<HTMLInputElement>("[data-wall-cutaway-furniture]")?.click());
  expect(await units.count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
