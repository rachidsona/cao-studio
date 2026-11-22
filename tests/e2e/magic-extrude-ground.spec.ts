/** Magie extrusion sans corps : un rectangle dessiné directement sur la grille — dessus (XY) ou face (XZ) — devient une esquisse à lui. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("Magie extrusion : un rectangle sur la grille, là où il n'y a aucun corps", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-magie-grille");
  await click(page, '[data-action="view"][data-view="top"]');
  await page.waitForTimeout(1200);
  const view = await page.evaluate(() => {
    const r = document.querySelector("canvas.cad-view")!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const sketches = async () => {
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as { type: string; plane?: string; support?: string; curves?: unknown[] }[]).filter((f) => f.type === "sketch");
  };
  const before = (await sketches()).length;

  await click(page, '[data-action="face-strip"]');
  const tool = page.getByRole("dialog", { name: "Magie extrusion" });
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("rectangle");
  await expect(tool).toContainText("ou sur la grille");
  await tool.getByRole("checkbox", { name: "Puis tirer / pousser" }).uncheck();
  // « Afficher les axes »: the three axes of the view, as in SketchUp — kept in this browser.
  const axes = tool.getByRole("checkbox", { name: "Afficher les axes" });
  await expect(axes).not.toBeChecked();
  await axes.check();
  expect(await page.evaluate(() => localStorage.getItem("cao.axes-visible"))).toBe("1");
  if (process.env.SHOTS) {
    await click(page, '[data-action="view"][data-view="iso"]');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${process.env.SHOTS}/magie-axes.png` });
    await click(page, '[data-action="view"][data-view="top"]');
    await page.waitForTimeout(1200);
  }
  // Away from anything: the upper left of the view, then a corner further on.
  const [x0, y0] = [view.x + view.w * 0.15, view.y + view.h * 0.2];
  await page.mouse.move(x0, y0);
  await page.mouse.move(x0 + 1, y0);
  await page.mouse.click(x0 + 1, y0);
  await page.mouse.move(x0 + 120, y0 + 80);
  await page.mouse.click(x0 + 120, y0 + 80);
  const after = await sketches();
  expect(after).toHaveLength(before + 1);
  const made = after.at(-1)!;
  expect(made.plane).toBe("XY");
  expect(made.support).toBeUndefined();
  expect(made.curves).toHaveLength(4);

  // « Sans corps, sur : Face (XZ) », as « Nouvelle esquisse » offers it: seen from the front, a rectangle standing up.
  // (The sketch kept closed the tool: opened again, on the rectangle.)
  await click(page, '[data-action="face-strip"]');
  await expect(tool.getByRole("combobox", { name: "Tracé" })).toHaveValue("rectangle");
  await expect(tool.getByRole("checkbox", { name: "Afficher les axes" })).toBeChecked();
  await tool.getByRole("combobox", { name: "Sans corps, sur" }).selectOption("XZ");
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(1200);
  await page.mouse.move(x0, y0);
  await page.mouse.move(x0 + 1, y0);
  await page.mouse.click(x0 + 1, y0);
  await page.mouse.move(x0 + 100, y0 + 60);
  await page.mouse.click(x0 + 100, y0 + 60);
  const front = await sketches();
  expect(front).toHaveLength(before + 2);
  expect(front.at(-1)!.plane).toBe("XZ");
  expect(front.at(-1)!.support).toBeUndefined();
  expect(errors).toEqual([]);
  // Hidden again: kept so — the box is there with every trace (an offset, a line from an edge too).
  await click(page, '[data-action="face-strip"]');
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("offset");
  await expect(tool.getByRole("checkbox", { name: "Afficher les axes" })).toBeChecked();
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("edge");
  await expect(tool.getByRole("checkbox", { name: "Afficher les axes" })).toBeChecked();
  await tool.getByRole("checkbox", { name: "Afficher les axes" }).uncheck();
  expect(await page.evaluate(() => localStorage.getItem("cao.axes-visible"))).toBe("0");
});
