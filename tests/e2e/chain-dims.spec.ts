/** Chaîne de cotes et cote de rayon dans l'esquisse : trois trous cotés d'un coup, un cercle coté par son rayon. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Sketch = { id: string; constraints: { kind: string; value?: number; driving?: boolean; curve?: string }[]; curves: { id: string; kind: string }[] };

test("trois cercles cotés en chaîne, puis un cercle coté par son rayon", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-chaine-de-cotes");
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

  // Three holes in a row.
  await click(page, '[data-sketch-tool="circle"]');
  const edges: [number, number][] = [];
  for (const [x, y] of [[0.3, 0.45], [0.42, 0.47], [0.6, 0.45]] as [number, number][]) {
    await page.mouse.click(...at(x, y));
    edges.push(at(x + 0.02, y));
    await page.mouse.click(...edges.at(-1)!);
  }
  await page.keyboard.press("Escape");
  await click(page, '[data-sketch-tool="select"]');
  for (const edge of edges) await page.mouse.click(...edge);
  await click(page, '[data-sketch-command="dimChain"]');
  // A circle by its radius: the button waits, the circle is clicked.
  await click(page, '[data-sketch-command="dimRadius"]');
  await page.mouse.click(...edges[0]!);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await shot(page, "chaine-de-cotes");
  await click(page, '[data-sketch-command="finish"]');
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");

  const after = await sketch();
  const added = after.constraints.filter((c) => !before.constraints.some((b) => JSON.stringify(b) === JSON.stringify(c)));
  const chain = added.filter((c) => c.kind === "distanceX");
  expect(chain).toHaveLength(2);
  expect(chain.every((c) => (c.value ?? 0) > 0)).toBe(true);
  const radius = added.filter((c) => c.kind === "radius");
  expect(radius).toHaveLength(1);
  expect(after.curves.find((c) => c.id === radius[0]!.curve)?.kind).toBe("circle");
  expect(errors).toEqual([]);
});
