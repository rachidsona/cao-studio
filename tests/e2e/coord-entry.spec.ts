/** Saisie par coordonnées : « # » pour le premier point, « @ » en polaire pour le second ; la ligne tombe pile. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
type Sketch = { id: string; points: { id: string; x: number; y: number }[]; curves: { id: string; kind: string; p1?: string; p2?: string }[] };

test("une ligne posée au clavier : #-30;20 puis @20<0", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-coordonnees");
  const sketch = async () => {
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(600);
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return { unit: project.document.settings?.unit as string | undefined, sk: (project.document.features as Sketch[]).find((f) => f.id === "sk1")! };
  };
  const before = (await sketch()).sk;
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const hint = page.locator('[data-ref="status-hint"]');
  await click(page, '[data-sketch-tool="line"]');
  await page.keyboard.type("#-30;20");
  await expect(hint).toContainText("Coordonnées absolues");
  await expect(hint).toContainText("#-30;20");
  await page.keyboard.press("Enter");
  await page.keyboard.type("@20<0");
  await expect(hint).toContainText("Coordonnées relatives");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await click(page, '[data-sketch-command="finish"]');
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");

  const { sk } = await sketch();
  const line = sk.curves.find((c) => c.kind === "line" && !before.curves.some((b) => b.id === c.id))!;
  const at = (id: string) => sk.points.find((p) => p.id === id)!;
  // The project counts in cm: -30;20 cm is -300;200 mm, and the line runs 200 mm to the right.
  expect([at(line.p1!).x, at(line.p1!).y]).toEqual([-300, 200]);
  expect(at(line.p2!).x).toBeCloseTo(-100, 6);
  expect(at(line.p2!).y).toBeCloseTo(200, 6);
  expect(errors).toEqual([]);
});
