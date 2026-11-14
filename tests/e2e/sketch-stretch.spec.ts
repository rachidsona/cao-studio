/** Étirer : un rectangle coté, son côté droit encadré puis tiré de 5 cm ; sa largeur cotée suit. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Sketch = { id: string; constraints: { id: string; kind: string; value?: number; line?: string }[] };

test("un côté encadré et tiré de 5 cm : la largeur cotée suit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-etirer");
  const sketch = async () => {
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(600);
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as Sketch[]).find((f) => f.id === "sk1")!;
  };
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const box = (await page.locator('[data-ref="viewport"] canvas').boundingBox())!;
  const at = (x: number, y: number): [number, number] => [box.x + box.width * x, box.y + box.height * y];

  await click(page, '[data-sketch-tool="rectangle"]');
  await page.mouse.click(...at(0.15, 0.2));
  await page.mouse.click(...at(0.3, 0.35));
  await page.keyboard.press("Escape");
  await click(page, '[data-sketch-command="fullydefine"]');
  await expect(page.locator('[data-ref="sketch-dof"]')).toHaveAttribute("data-state", "full");
  const before = await sketch();
  const lengths = (s: Sketch) => s.constraints.filter((c) => c.kind === "length" && !before.constraints.some((b) => b.id === c.id && b.value === c.value) ? true : c.kind === "length").map((c) => c.value!).sort((a, b) => a - b);

  await click(page, '[data-sketch-tool="stretch"]');
  await expect(page.getByRole("dialog", { name: "Étirer" })).toBeVisible();
  // A frame around the right side, from an empty spot.
  await page.mouse.move(...at(0.33, 0.16));
  await page.mouse.down();
  await page.mouse.move(...at(0.3, 0.3), { steps: 4 });
  await page.mouse.move(...at(0.27, 0.39), { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Étirer" })).toContainText("2 éléments (2 points)");
  await page.getByRole("textbox", { name: "ΔX" }).fill("5");
  await page.getByRole("textbox", { name: "ΔX" }).press("Enter");
  await expect(page.getByText(/Étirement appliqué \(2 points\)/)).toBeVisible();
  await shot(page, "etirer");
  await page.keyboard.press("Escape");

  const after = await sketch();
  const was = lengths(before);
  const now = lengths(after);
  // The width grew by 50 mm, the other lengths kept theirs.
  const grown = now.filter((v) => !was.includes(v));
  expect(grown).toHaveLength(1);
  expect(was.some((v) => Math.abs(v + 50 - grown[0]!) < 1e-6)).toBe(true);
  expect(errors).toEqual([]);
});
