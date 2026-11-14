/** D'autres façons de tracer dans l'esquisse : rectangle par trois points, cercle par trois points, arc par trois points, arc tangent. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Sketch = { id: string; curves: { id: string; kind: string; construction?: boolean }[]; constraints: { kind: string }[] };

test("rectangle par trois points, cercle par trois points, arc par trois points et arc tangent, dans l'esquisse", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-traces-variantes");
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
  const canvas = page.locator('[data-ref="viewport"] canvas');
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number): [number, number] => [box.x + box.width * x, box.y + box.height * y];
  const hint = page.locator('[data-ref="status-hint"]');

  // A rectangle at an angle: a side, then its width.
  await click(page, '[data-sketch-tool="rectangle-3pt"]');
  await expect(hint).toContainText("début du premier côté");
  await page.mouse.click(...at(0.12, 0.75));
  await page.mouse.click(...at(0.25, 0.6));
  await expect(hint).toContainText("largeur");
  await page.mouse.click(...at(0.3, 0.8));
  // A circle through three points.
  await click(page, '[data-sketch-tool="circle-3pt"]');
  await page.mouse.click(...at(0.45, 0.3));
  await page.mouse.click(...at(0.55, 0.2));
  await page.mouse.click(...at(0.6, 0.35));
  // An arc through three points.
  await click(page, '[data-sketch-tool="arc-3pt"]');
  await page.mouse.click(...at(0.7, 0.75));
  await page.mouse.click(...at(0.88, 0.75));
  await page.mouse.click(...at(0.79, 0.62));
  // A line, then a tangent arc from its end.
  await click(page, '[data-sketch-tool="line"]');
  await page.mouse.click(...at(0.4, 0.85));
  await page.mouse.click(...at(0.55, 0.85));
  await page.keyboard.press("Escape");
  await click(page, '[data-sketch-tool="arc-tangent"]');
  await expect(hint).toContainText("bout d'un trait");
  await page.mouse.click(...at(0.55, 0.85));
  await page.mouse.click(...at(0.62, 0.72));
  await page.waitForTimeout(400);
  await shot(page, "traces-variantes");
  await click(page, '[data-sketch-command="finish"]');
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");

  const after = await sketch();
  const added = after.curves.filter((c) => !before.curves.some((b) => b.id === c.id));
  const kinds = added.filter((c) => !c.construction).map((c) => c.kind).sort();
  // 4 sides + 1 line, 1 circle, 2 arcs.
  expect(kinds).toEqual(["arc", "arc", "circle", "line", "line", "line", "line", "line"]);
  expect(after.constraints.filter((c) => c.kind === "perpendicular").length).toBeGreaterThanOrEqual(2);
  expect(after.constraints.filter((c) => c.kind === "pointOnCurve").length).toBeGreaterThanOrEqual(3);
  // The shapes go into the plate's own sketch: its hole may no longer fall in it, the recompute is not this test's.
  expect(errors).toEqual([]);
});
