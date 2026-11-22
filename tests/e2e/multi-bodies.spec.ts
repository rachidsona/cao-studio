/**
 * Plusieurs corps avant un seul OK : Modificateur, Façades, Extrusion de faces, Déformer, Prolonger élément, Vider un
 * corps et Panneaux sur faces font la même opération sur deux corps cliqués l'un après l'autre, une étape chacun, et
 * une seule annulation les reprend.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
type Saved = { id: string; type: string; target?: string; cabinet?: string; kind?: string; faces?: unknown[]; height?: number };

/** A new project holding these features, loaded; returns what is saved after Ctrl+S. */
async function project(page: Page, name: string, features: unknown[]): Promise<() => Promise<Saved[]>> {
  const api = await newProject(page, name);
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Départ" }) });
  }, { url: api, features });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  return async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Saved[] } }).document.features, api);
  };
}

/** Two blocks 600 × 400 × 720, the second 900 mm to the right. */
function blocks(): unknown[] {
  const shifted = centeredRectangle(600, 400);
  shifted.points.forEach((p) => (p.x += 900));
  shifted.constraints = [];
  return [
    { id: "sk1", type: "sketch", name: "Bloc", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Bloc A", sketch: "sk1", distance: 720, operation: "new" },
    { id: "sk2", type: "sketch", name: "Bloc 2", plane: "XY", offset: 0, ...shifted },
    { id: "ex2", type: "extrude", name: "Bloc B", sketch: "sk2", distance: 720, operation: "new" },
  ];
}

/** Two cabinets 600 wide, the second 900 mm to the right. */
const cabinets = () =>
  [["cb1", "Bas", 0], ["cb2", "Haut", 900]].map(([id, name, x]) => ({ id, type: "cabinet", name, origin: [x, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" }));

/** Seen from a side, fitted. */
async function look(page: Page, view: string): Promise<void> {
  await click(page, `[data-action="view"][data-view="${view}"]`);
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
}

/**
 * Clicks across the middle of the view — from the left, or from the right — until `done` says so: the first body
 * met, then the other one from the other side. Maj held when asked.
 */
async function across(page: Page, done: () => Promise<boolean>, fromRight = false, shift = false): Promise<void> {
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  for (let k = 2; k < 100; k += 2) {
    const x = view.x + (view.width * (fromRight ? 100 - k : k)) / 100;
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.click(x, view.y + view.height / 2);
    if (shift) await page.keyboard.up("Shift");
    await page.waitForTimeout(150);
    if (await done()) return;
  }
  throw new Error("aucun corps trouvé");
}

const says = (tool: Locator, text: RegExp) => async () => text.test(await tool.innerText());

/** OK, the steps made, then one undo takes them all back. */
async function okThenUndo(page: Page, tool: Locator, saved: () => Promise<Saved[]>, made: (f: Saved) => string | undefined, expected: string[]): Promise<void> {
  await expect(tool.getByRole("button", { name: "OK", exact: true })).toBeEnabled({ timeout: 30_000 });
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  const list = async () => (await saved()).flatMap((f) => made(f) ?? []).sort();
  await expect.poll(list, { timeout: 30_000 }).toEqual(expected);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await click(page, '[data-action="undo"]');
  await expect.poll(list, { timeout: 30_000 }).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("Modificateur : deux blocs effilés ensemble, en une seule annulation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await project(page, "zz-plusieurs-modificateur", blocks());
  await look(page, "front");
  await click(page, '[data-action="modifier"]');
  const tool = page.getByRole("dialog", { name: "Modificateur" });
  await tool.getByRole("combobox", { name: "Effet" }).selectOption("taper");
  await across(page, async () => (await tool.getByRole("combobox", { name: "Planche" }).inputValue()) !== "");
  await across(page, says(tool, /2 planches/), true);
  await okThenUndo(page, tool, saved, (f) => (f.type === "modifier" ? f.target : undefined), ["ex1", "ex2"]);
  expect(errors).toEqual([]);
});

test("Façades : deux caissons cliqués reçoivent les mêmes façades, en une seule annulation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await project(page, "zz-plusieurs-facades", cabinets());
  await look(page, "front");
  await click(page, '[data-action="fronts"]');
  const tool = page.getByRole("dialog", { name: "Façades" });
  await expect(tool).toBeVisible();
  // The first cabinet clicked takes the place of the one chosen by default, the next one is added.
  await across(page, says(tool, /2 caissons/), true);
  await okThenUndo(page, tool, saved, (f) => (f.type === "fronts" ? f.cabinet : undefined), ["cb1", "cb2"]);
  expect(errors).toEqual([]);
});

test("Extrusion de faces : la face d'un autre bloc prise par Maj + clic est tirée de même", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await project(page, "zz-plusieurs-extrusion", blocks());
  await look(page, "front");
  await click(page, '[data-select-filter="face"]');
  const selection = page.locator('[data-ref="status-selection"]');
  await across(page, async () => /1 face\(s\)/.test(await selection.innerText()));
  await click(page, '[data-action="extrude"]');
  const tool = page.getByRole("dialog", { name: "Extrusion de faces" });
  await expect(tool).toContainText("1 face(s)");
  const distance = tool.getByRole("textbox", { name: "Distance" });
  await distance.fill("3");
  await distance.press("Enter");
  await across(page, says(tool, /sur 2 corps/), true, true);
  await okThenUndo(page, tool, saved, (f) => (f.type === "extrude" && f.faces ? f.target : undefined), ["ex1", "ex2"]);
  expect(errors).toEqual([]);
});

test("Déformer : la face d'un autre bloc cliquée prend la même échelle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await project(page, "zz-plusieurs-deformer", blocks());
  await look(page, "front");
  await click(page, '[data-action="ffd"]');
  const tool = page.getByRole("dialog", { name: "Déformer" });
  await across(page, says(tool, /Face de « /));
  const scale = tool.getByRole("textbox", { name: "Échelle" });
  await scale.fill("0,8");
  await scale.press("Enter");
  await across(page, says(tool, /Et 1 autre/), true);
  await okThenUndo(page, tool, saved, (f) => (f.type === "modifier" && f.kind === "face-scale" ? f.target : undefined), ["ex1", "ex2"]);
  expect(errors).toEqual([]);
});

test("Prolonger élément : deux caissons montés de 10 cm tapés, en une seule annulation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await project(page, "zz-plusieurs-prolonger", cabinets());
  await look(page, "top");
  await click(page, '[data-action="extend-element"]');
  const tool = page.getByRole("dialog", { name: "Prolonger élément" });
  await across(page, says(tool, /À prolonger : « /));
  await across(page, says(tool, /À prolonger : « [^»]+ », « /), true, true);
  const by = tool.locator("[data-extend-measures]").getByRole("textbox", { name: "De" });
  await by.fill("10");
  await by.press("Enter");
  await expect(tool.locator("[data-extend-result]")).toContainText("prolongé de 10 cm. «");
  await expect(tool.locator("[data-extend-ok]")).toBeEnabled({ timeout: 30_000 });
  await tool.locator("[data-extend-ok]").click();
  const heights = async () => (await saved()).filter((f) => f.type === "cabinet").map((f) => f.height);
  await expect.poll(heights, { timeout: 30_000 }).toEqual([820, 820]);
  await click(page, '[data-action="undo"]');
  await expect.poll(heights, { timeout: 30_000 }).toEqual([720, 720]);
  expect(errors).toEqual([]);
});

test("Vider un corps : deux blocs cliqués par leur devant sont vidés de même, en une seule annulation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await project(page, "zz-plusieurs-vider", blocks());
  await look(page, "front");
  await click(page, '[data-action="hollow"]');
  const tool = page.getByRole("dialog", { name: "Vider un corps" });
  await across(page, says(tool, /Cliquez un autre corps/));
  await expect(tool).toContainText("2 face(s) ouverte(s)");
  await across(page, says(tool, /Et 1 autre/), true);
  await okThenUndo(page, tool, saved, (f) => (f.type === "shell" && (f.faces?.length ?? 0) === 2 ? f.target : undefined), ["ex1", "ex2"]);
  expect(errors).toEqual([]);
});

test("Panneaux sur faces : la face d'un autre bloc cliquée le met en panneaux de même, en une seule annulation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await project(page, "zz-plusieurs-panneaux", blocks());
  await look(page, "front");
  await click(page, '[data-action="paneling"]');
  const tool = page.getByRole("dialog", { name: "Panneaux sur faces" });
  await across(page, says(tool, /Cliquez une face d'un autre volume/));
  await across(page, says(tool, /2 volumes/), true);
  await okThenUndo(page, tool, saved, (f) => (f.type === "paneling" ? f.target : undefined), ["ex1", "ex2"]);
  expect(errors).toEqual([]);
});
