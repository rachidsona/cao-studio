/** « Combiner des corps » : la cible et les corps outils cliqués dans la vue, la liste repliée. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const canvas = (page: Page) => page.locator("canvas.cad-view");

test("combiner des corps : la cible puis les corps outils se cliquent dans la vue, un autre clic en retire un", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Combiner e2e");
  await page.getByRole("tab", { name: "Cuisine", exact: true }).click();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.locator('[data-unit="base-bas-2-portes-800"]').click();
  await expect(page.getByText(/ajouté avec ses façades/)).toBeVisible();
  await click(page, '[data-workshop="kitchen-units"]');
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await click(page, '[data-action="combine"]');
  const tool = page.getByRole("dialog", { name: "Combiner des corps" });
  await expect(tool).toBeVisible();
  // Nothing taken for granted: the target is clicked first.
  await expect(tool.locator('[data-combine-pick="target"]')).toHaveAttribute("aria-pressed", "true");
  const targetField = tool.locator('[data-combine-pick="target"]');
  await expect(targetField).toHaveAttribute("data-combine-value", "");
  await expect(tool).toContainText("Cliquez dans la vue le corps cible");

  const view = (await canvas(page).boundingBox())!;
  const at = (fx: number, fy: number): [number, number] => [view.x + view.width * fx, view.y + view.height * fy];
  await page.mouse.click(...at(0.5, 0.5));
  await expect(targetField).not.toHaveAttribute("data-combine-value", "");
  const target = (await targetField.getAttribute("data-combine-value"))!;
  await expect(tool.locator('[data-combine-pick="tools"]')).toHaveAttribute("aria-pressed", "true");

  // Another body: a tool. Points across the unit until one is not the target.
  const tools = tool.locator("[data-combine-tool]");
  for (const [fx, fy] of [[0.42, 0.5], [0.58, 0.5], [0.5, 0.38], [0.5, 0.62], [0.35, 0.45], [0.65, 0.45]] as [number, number][]) {
    await page.mouse.click(...at(fx, fy));
    if ((await tools.count()) > 0) break;
  }
  await expect(tools).toHaveCount(1);
  const tool1 = (await tools.first().getAttribute("data-combine-tool"))!;
  expect(tool1).not.toBe(target);
  await tool.screenshot({ path: "test-results/combine-pick.png" });
  // Made one (Union): the body they make is shown blue.
  await page.waitForTimeout(1500);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/combiner-bleu.png` });

  // As Fusion: the operation in three buttons; the tools of a cut marked in red.
  const view3d = canvas(page);
  await expect(view3d).toHaveAttribute("data-chosen", "first second");
  await tool.locator('[data-combine-op="cut"]').click();
  await expect(tool.locator('[data-combine-op="cut"]')).toHaveAttribute("aria-pressed", "true");
  await expect(view3d).toHaveAttribute("data-chosen", "first remove");
  await tool.locator('[data-combine-op="join"]').click();

  // Taken away with its ✕, then the list of every body stays folded.
  await tools.first().getByRole("button").click();
  await expect(tools).toHaveCount(0);
  await expect(tool.locator("details")).not.toHaveAttribute("open", "");

  // Nothing kept before OK: « Terminer » leaves the model as it was.
  const steps = await page.locator("[data-op]").count();
  await page.mouse.click(...at(0.42, 0.5));
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await page.locator("[data-op]").count()).toBe(steps);
  await expect(view3d).toHaveAttribute("data-chosen", "");
  expect(errors).toEqual([]);
});
