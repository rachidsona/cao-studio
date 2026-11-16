/**
 * Sélections intelligentes : « semblables » sans rien de choisi le dit ; un trou choisi, ses semblables sont les trous
 * du même diamètre (pas le grand) ; Ctrl + A choisit tout le dessin.
 */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("les semblables d'un trou, puis tout le dessin", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-selection-semblables");
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const box = (await page.locator('[data-ref="viewport"] canvas').boundingBox())!;
  const at = (x: number, y: number): [number, number] => [box.x + box.width * x, box.y + box.height * y];
  await click(page, '[data-sketch-tool="circle"]');
  for (const x of [0.1, 0.15, 0.2]) {
    await page.mouse.click(...at(x, 0.2));
    await page.keyboard.type("0.5");
    await page.keyboard.press("Enter");
  }
  await page.mouse.click(...at(0.3, 0.2));
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await click(page, '[data-sketch-tool="select"]');
  // Nothing chosen: the command says what to do.
  await click(page, '[data-sketch-command="skselectsimilar"]');
  await expect(page.getByText("Choisissez d'abord un trait")).toBeVisible();
  // One small hole (clicked at its middle, near its outline): the three small ones, not the big one.
  await page.mouse.click(...at(0.15, 0.2));
  await click(page, '[data-sketch-command="skselectsimilar"]');
  await expect(page.getByText("3 éléments semblables sélectionnés.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByText(/éléments sélectionnés\./)).toBeVisible();
  const all = Number((await page.getByText(/éléments sélectionnés\./).last().innerText()).split(" ")[0]);
  // The plate's four sides and the four circles.
  expect(all).toBe(8);
  // The same from the button of the sketch bar, shown there.
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-sketch-command="skselectall"]')).toBeVisible();
  await page.locator('[data-sketch-command="skselectall"]').click();
  await expect(page.getByText("8 éléments sélectionnés.").last()).toBeVisible();
  expect(errors).toEqual([]);
});
