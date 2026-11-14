/** Formes de menuiserie : une rangée système 32 de 5 trous posée d'un clic, cotée ; puis une découpe de plaque. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Sketch = { id: string; curves: { id: string; kind: string; radius?: number }[]; constraints: { kind: string; value?: number }[] };

test("une rangée système 32 et une découpe de plaque posées d'un clic, cotées", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-formes-menuiserie");
  const sketch = async () => {
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(600);
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as Sketch[]).find((f) => f.id === "sk1")!;
  };
  const before = await sketch();
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const box = (await page.locator('[data-ref="viewport"] canvas').boundingBox())!;
  const at = (x: number, y: number): [number, number] => [box.x + box.width * x, box.y + box.height * y];

  await click(page, '[data-sketch-command="joineryshapes"]');
  const dialog = page.getByRole("dialog", { name: "Formes de menuiserie" });
  await dialog.getByRole("combobox", { name: "Forme" }).selectOption("row32");
  await dialog.getByRole("textbox", { name: "Nombre de trous" }).fill("5");
  await dialog.getByRole("button", { name: "Poser dans l'esquisse" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-ref="status-hint"]')).toContainText("Rangée de trous système 32");
  await page.mouse.move(...at(0.2, 0.25));
  await page.mouse.click(...at(0.2, 0.25));
  // A hob cut-out, too small for the plate: laid elsewhere.
  await click(page, '[data-sketch-command="joineryshapes"]');
  await dialog.getByRole("combobox", { name: "Forme" }).selectOption("hob");
  await dialog.getByRole("textbox", { name: "Largeur" }).fill("6");
  await dialog.getByRole("textbox", { name: "Profondeur" }).fill("3");
  await dialog.getByRole("button", { name: "Poser dans l'esquisse" }).click();
  await page.mouse.click(...at(0.25, 0.75));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await shot(page, "formes-menuiserie");
  await click(page, '[data-sketch-command="finish"]');
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");

  const after = await sketch();
  const circles = after.curves.filter((c) => c.kind === "circle" && !before.curves.some((b) => b.id === c.id));
  expect(circles).toHaveLength(5);
  expect(circles.every((c) => Math.abs(c.radius! - 2.5) < 1e-6)).toBe(true);
  const added = after.constraints.slice(before.constraints.length);
  expect(added.filter((c) => c.kind === "distanceX").map((c) => c.value)).toEqual([32, 32, 32, 32]);
  expect(added.filter((c) => c.kind === "length").map((c) => c.value).sort()).toEqual([30, 60]);
  expect(errors).toEqual([]);
});

test("un profil de doucine posé d'un clic : un contour fermé de deux arcs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-profil-doucine");
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const box = (await page.locator('[data-ref="viewport"] canvas').boundingBox())!;
  await click(page, '[data-sketch-command="joineryshapes"]');
  const dialog = page.getByRole("dialog", { name: "Formes de menuiserie" });
  await dialog.getByRole("combobox", { name: "Forme" }).selectOption("ogee");
  await dialog.getByRole("textbox", { name: "Côté" }).fill("2");
  await dialog.getByRole("button", { name: "Poser dans l'esquisse" }).click();
  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.2);
  await page.keyboard.press("Escape");
  await shot(page, "profil-doucine");
  await click(page, '[data-sketch-command="finish"]');
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(600);
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const sk = (project.document.features as Sketch[]).find((f) => f.id === "sk1")!;
  expect(sk.curves.filter((c) => c.kind === "arc").map((c) => c.radius)).toEqual([10, 10]);
  expect(errors).toEqual([]);
});
