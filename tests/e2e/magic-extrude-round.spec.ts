/** Magie extrusion sur le bout d'un cylindre : une face bordée d'un cercle entier se lit, on y trace et on y dessine. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("Magie extrusion : le dessus d'un cylindre se lit — distances au bord pour dessiner, et un trait depuis son bord rond", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-cylindre-magie");
  const features = [
    { id: "sk1", type: "sketch", name: "Rond", plane: "XY", offset: 0, points: [{ id: "c", x: 0, y: 0 }], curves: [{ id: "k", kind: "circle", center: "c", radius: 40 }], constraints: [] },
    { id: "ex1", type: "extrude", name: "Cylindre", sketch: "sk1", distance: 30, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Cylindre" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  const view = await page.evaluate(() => {
    const r = document.querySelector("canvas.cad-view")!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const [cx, cy] = [view.x + view.w / 2, view.y + view.h / 2];

  await click(page, '[data-action="face-strip"]');
  const tool = page.getByRole("dialog", { name: "Magie extrusion" });
  const values = page.getByRole("status", { name: "Mesures" });
  // A shape on the round top: its distances to the rim are read (it was refused before: « Face non plane »).
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("rectangle");
  await expect(async () => {
    await page.mouse.move(cx + 7, cy + 5);
    await page.mouse.move(cx + 8, cy + 5);
    await expect(values).not.toContainText(/Survolez|Face courbe/, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  // A line from its round rim: the rim is an edge (a trait parallel to it there), and no false corner along it.
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("edge");
  const radius = await page.evaluate(() => {
    // The fitted cylinder's rim, on screen: most of the view's height is the 80 mm diameter.
    const r = document.querySelector("canvas.cad-view")!.getBoundingClientRect();
    return r.height;
  });
  let found = 0;
  for (let k = 0.2; k < 0.5 && !found; k += 0.01) {
    await page.mouse.move(cx + radius * k, cy);
    await page.waitForTimeout(150);
    if (((await values.textContent()) ?? "").includes("part de cette arête")) found = cx + radius * k;
  }
  expect(found).toBeGreaterThan(0);

  // « Puis tirer / pousser » unticked: the line laid is kept as a sketch alone, nothing extruded.
  const count = async () => {
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    const features = project.document.features as { type: string }[];
    return [features.filter((f) => f.type === "sketch").length, features.filter((f) => f.type === "extrude").length];
  };
  const [sketches, extrudes] = (await count()) as [number, number];
  await tool.getByRole("checkbox", { name: "Puis tirer / pousser" }).uncheck();
  await page.mouse.move(found, cy);
  await page.mouse.move(found + 1, cy);
  await page.mouse.click(found + 1, cy);
  await page.mouse.move(found - 20, cy);
  await page.mouse.click(found - 20, cy);
  expect(await count()).toEqual([sketches + 1, extrudes]);
  expect(errors).toEqual([]);
});

test("Magie extrusion sur le flanc d'un cylindre : un rectangle creusé qui suit la face, puis un cercle percé vers l'axe", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-flanc-magie");
  const features = [
    { id: "sk1", type: "sketch", name: "Rond", plane: "XY", offset: 0, points: [{ id: "c", x: 0, y: 0 }], curves: [{ id: "k", kind: "circle", center: "c", radius: 40 }], constraints: [] },
    { id: "ex1", type: "extrude", name: "Cylindre", sketch: "sk1", distance: 80, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Cylindre" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  // Seen from the front: its round side faces us.
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  const view = await page.evaluate(() => {
    const r = document.querySelector("canvas.cad-view")!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const [cx, cy] = [view.x + view.w / 2, view.y + view.h / 2];
  const saved = async () => {
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return project.document.features as { name: string; type: string; operation?: string }[];
  };
  const values = page.getByRole("status", { name: "Mesures" });
  const tool = page.getByRole("dialog", { name: "Magie extrusion" });
  const unit = view.h * 0.08;

  for (const [shape, a, b, word] of [["rectangle", [-1, -1], [1, 1], "Rectangle courbe"], ["circle", [0, 2], [0.6, 2], "Cercle courbe"]] as const) {
    await click(page, '[data-action="face-strip"]');
    await tool.getByRole("combobox", { name: "Tracé" }).selectOption(shape);
    // The side read as a curved face: the shape follows it.
    await expect(async () => {
      await page.mouse.move(cx + a[0] * unit, cy + a[1] * unit);
      await page.mouse.move(cx + a[0] * unit + 1, cy + a[1] * unit);
      await expect(values).toContainText("sur la face courbe", { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await page.mouse.click(cx + a[0] * unit + 1, cy + a[1] * unit);
    await page.mouse.move(cx + b[0] * unit, cy + b[1] * unit);
    await page.mouse.click(cx + b[0] * unit, cy + b[1] * unit);
    await expect(tool.getByRole("textbox", { name: "Profondeur" })).toBeVisible();
    await tool.getByRole("button", { name: "OK", exact: true }).click();
    const made = await saved();
    expect(made.some((f) => f.type === "extrude" && f.name.startsWith(word) && f.operation === "cut")).toBe(true);
    await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  }
  // A line from its round rim: the band between the rim and the line, dug all round.
  await click(page, '[data-action="face-strip"]');
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("edge");
  await expect(async () => {
    await page.mouse.move(cx + unit * 2, cy - unit * 3);
    await page.mouse.move(cx + unit * 2 + 1, cy - unit * 3);
    await expect(values).toContainText("bord rond", { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.mouse.click(cx + unit * 2 + 1, cy - unit * 3);
  await expect(tool.getByRole("textbox", { name: "Profondeur" })).toBeVisible();
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  const ring = await saved();
  expect(ring.some((f) => f.type === "extrude" && f.name.startsWith("Bande ronde") && f.operation === "cut")).toBe(true);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
