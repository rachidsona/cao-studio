/** Magie extrusion : les formes de l'esquisse (polygone, rectangle par le centre…) posées sur la grille, cotes affichées, mesures tapées. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("Magie extrusion : un polygone sur la grille, puis un rectangle par le centre de 60 × 40 cm tapés", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-magie-formes");
  await click(page, '[data-action="view"][data-view="top"]');
  await page.waitForTimeout(1200);
  const view = await page.evaluate(() => {
    const r = document.querySelector("canvas.cad-view")!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  type Sk = { type: string; plane?: string; curves?: { kind: string; construction?: boolean }[]; constraints?: unknown[] };
  const sketches = async () => {
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as Sk[]).filter((f) => f.type === "sketch");
  };
  const before = (await sketches()).length;

  await click(page, '[data-action="face-strip"]');
  const tool = page.getByRole("dialog", { name: "Magie extrusion" });
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("polygon");
  await expect(page.locator("#editor")).toHaveAttribute("data-tool", "faceSketch");
  await expect(tool.getByRole("textbox", { name: "Côtés" }).or(tool.getByRole("spinbutton", { name: "Côtés" })).first()).toBeVisible();
  await tool.getByRole("checkbox", { name: "Puis tirer / pousser" }).uncheck();
  const [cx, cy] = [view.x + view.w * 0.2, view.y + view.h * 0.3];
  await page.mouse.move(cx, cy);
  await page.mouse.move(cx + 1, cy);
  await page.mouse.click(cx + 1, cy);
  await page.mouse.move(cx + 80, cy + 10);
  // Its sides measured in the view while it is drawn.
  await expect(page.locator(".cad-measure").first()).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/magie-polygone.png` });
  await page.mouse.click(cx + 80, cy + 10);
  const poly = await sketches();
  expect(poly).toHaveLength(before + 1);
  expect(poly.at(-1)!.curves!.filter((c) => c.kind === "line" && !c.construction)).toHaveLength(6);

  // Rectangle par le centre: the centre clicked, then « 60;40 » typed and Entrée.
  await click(page, '[data-action="face-strip"]');
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("rectangle-center");
  await page.mouse.move(cx + 300, cy + 200);
  await page.mouse.move(cx + 301, cy + 200);
  await page.mouse.click(cx + 301, cy + 200);
  await page.mouse.move(cx + 380, cy + 260);
  await page.keyboard.type("60;40");
  await page.keyboard.press("Enter");
  const all = await sketches();
  expect(all).toHaveLength(before + 2);
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const rect = (project.document.features as { type: string; points: { id: string; x: number; y: number }[]; curves: { kind: string; p1: string; p2: string; construction?: boolean }[] }[]).filter((f) => f.type === "sketch").at(-1)!;
  const xs = rect.curves.filter((c) => c.kind === "line" && !c.construction).flatMap((c) => [c.p1, c.p2]).map((id) => rect.points.find((p) => p.id === id)!);
  const span = (k: "x" | "y") => Math.round(Math.max(...xs.map((p) => p[k])) - Math.min(...xs.map((p) => p[k])));
  expect([span("x"), span("y")]).toEqual([600, 400]);
  expect(errors).toEqual([]);
});
