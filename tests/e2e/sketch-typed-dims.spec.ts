/** Dans l'esquisse, les cotes d'une forme se tapent pendant qu'on la trace, comme dans Fusion 360. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Sketch = { id: string; curves: { id: string; kind: string }[]; constraints: { kind: string; value?: number; line?: string; curve?: string }[] };

test("un rectangle, une ligne et un cercle tracés en tapant leurs cotes : Tab passe à la suivante, Entrée pose la forme", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-cotes-tapees");
  const sketch = async () => {
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as Sketch[]).find((f) => f.id === "sk1")!;
  };
  const before = await sketch();
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const canvas = page.locator('[data-ref="viewport"] canvas');
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number): [number, number] => [box.x + box.width * x, box.y + box.height * y];
  const field = (id: string) => page.locator(`[data-dim-field="${id}"]`);

  // A rectangle: its first corner clicked, its width typed (the project counts in cm), Tab, its height, Entrée.
  await page.locator('[data-sketch-tool="rectangle"]').click();
  await page.mouse.click(...at(0.15, 0.2));
  await page.mouse.move(...at(0.3, 0.1));
  await expect(field("w")).toHaveAttribute("data-state", "active");
  await expect(field("h")).toHaveAttribute("data-state", "idle");
  await expect(page.locator('[data-ref="status-hint"]')).toContainText("tapez la largeur");
  await page.keyboard.type("3");
  await expect(field("w")).toHaveText("3");
  await page.keyboard.press("Tab");
  await expect(field("w")).toHaveAttribute("data-state", "locked");
  await expect(field("h")).toHaveAttribute("data-state", "active");
  await page.keyboard.type("1,5");
  await expect(field("h")).toHaveText("1,5");
  await shot(page, "cotes-tapees-rectangle");
  await page.keyboard.press("Enter");
  // Laid: still in the sketch (Entrée did not leave it), the fields gone, the tool still on for the next one.
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  await expect(field("w")).toHaveCount(0);
  await expect(page.locator('[data-sketch-tool="rectangle"]')).toHaveAttribute("aria-pressed", "true");

  // A rectangle far bigger than the screen (2 m by 1 m), with the same tool: the view steps back to show it whole.
  await page.mouse.click(...at(0.15, 0.6));
  await page.mouse.move(...at(0.3, 0.5));
  await page.keyboard.type("200");
  await page.keyboard.press("Tab");
  await page.keyboard.type("100");
  const inView = async (id: string) => {
    const r = (await field(id).boundingBox())!;
    return r.x >= box.x && r.y >= box.y && r.x + r.width <= box.x + box.width && r.y + r.height <= box.y + box.height;
  };
  await expect.poll(() => inView("w")).toBe(true);
  await expect.poll(() => inView("h")).toBe(true);
  await shot(page, "cotes-tapees-grand");
  await page.keyboard.press("Enter");
  // Échap leaves the tool: back to the selection, still in the sketch.
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-sketch-tool="rectangle"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");

  // A circle by its diameter, laid by a click: the pointer only says where.
  await page.locator('[data-sketch-tool="circle"]').click();
  await page.mouse.click(...at(0.8, 0.2));
  await page.mouse.move(...at(0.85, 0.3));
  await page.keyboard.type("2");
  await expect(field("c")).toHaveText("2");
  await page.mouse.click(...at(0.9, 0.35));

  // A line by its length, in the direction of the pointer.
  await page.locator('[data-sketch-tool="line"]').click();
  await page.mouse.click(...at(0.15, 0.8));
  await page.mouse.move(...at(0.4, 0.8));
  await expect(field("l")).toHaveAttribute("data-state", "active");
  await expect(field("a")).toHaveAttribute("data-state", "idle");
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Terminer l'esquisse" }).click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 15_000 });
  await expect.poll(async () => (await sketch()).curves.length).toBe(before.curves.length + 10);
  const after = await sketch();
  const added = after.constraints.filter((c) => c.value !== undefined && !before.constraints.some((b) => JSON.stringify(b) === JSON.stringify(c)));
  // Each value typed is a dimension of the sketch, in mm: 30 × 15, 2000 × 1000, Ø 20, 40 long.
  expect(added.map((c) => [c.kind, c.value]).sort()).toEqual([["diameter", 20], ["length", 1000], ["length", 15], ["length", 2000], ["length", 30], ["length", 40]]);
  expect(errors).toEqual([]);
});
