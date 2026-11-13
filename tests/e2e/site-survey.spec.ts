/** Finitions, « Relevé de chantier » : un mur en faux aplomb donne un fileur recoupé ; un mur qui avance trop, le meuble ne rentre pas. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

/** A room of two walls and a caisson against the first, 60 mm from the second (on its right, seen from the front). */
const FEATURES = [
  { id: "rm1", type: "room", name: "Pièce", walls: [{ length: 3000, angle: 90 }, { length: 2000, angle: 90 }], height: 2500, thickness: 100, obstacles: [] },
  { id: "cb1", type: "cabinet", name: "Caisson 1", origin: [2340, -560, 0], width: 600, height: 2000, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 2, plinth: 0, construction: "sides-through" },
];

test("relevé de chantier : le fileur suit le mur en faux aplomb ; un mur qui avance trop est signalé", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-releve-de-chantier");
  // The project of this test given its room and its caisson, then opened again.
  await page.evaluate(
    async ({ url, features }) => {
      const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
      const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: { features: unknown[] } };
      const put = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features, bodyInfo: { "rm1#0": { room: true }, "rm1#1": { room: true } } }, base_version: now.version, message: "Pièce et caisson" }) });
      if (!put.ok) throw new Error(`Enregistrement refusé : ${put.status} ${await put.text()}`);
    },
    { url: api, features: FEATURES },
  );
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const tree = page.getByLabel(/^Navigateur : corps/);
  await expect(tree.getByText("Caisson 1").first()).toBeVisible();
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; parts?: { name: string; outline?: unknown }[] }[] } }).document.features.find((f) => f.type === "trim"), api);
  };
  await page.waitForTimeout(1500);

  // Finitions on the whole furniture: a plain filler to the wall on the right, 60 mm away less the end panel.
  await click(page, '[data-action="trim"]');
  const tool = page.getByRole("dialog", { name: "Finitions" });
  await expect(tool).toBeVisible();
  await tool.getByRole("checkbox", { name: "Joue gauche" }).uncheck();
  await tool.getByRole("checkbox", { name: "Joue droite" }).uncheck();
  await expect(tree.getByText("Fileur droit").first()).toBeVisible();

  // The wall measured on site: 8 mm closer at mid-height, 20 mm at the top (the project counts in cm).
  await tool.getByRole("checkbox", { name: /^Relevé de chantier/ }).check();
  const field = (name: string) => tool.getByRole("textbox", { name, exact: true });
  await field("Mur droit — à mi-hauteur").fill("0,8");
  await field("Mur droit — à mi-hauteur").press("Tab");
  await field("Mur droit — en haut").fill("2");
  await field("Mur droit — en haut").press("Tab");
  await expect(tool).toContainText("Fileur droit à recouper : 60 mm en bas, 52 à mi-hauteur, 40 en haut.");
  await expect(tool.locator("[data-survey-problem]")).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await expect
    .poll(async () => (await saved())?.parts?.find((p) => p.name === "Fileur droit")?.outline, { timeout: 30_000 })
    .toMatchObject({ axis: 0, points: [[2940, 0], [3000, 0], [2992, 1000], [2980, 2000], [2940, 2000]] });
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  await shot(page, "releve-fileur");

  // The wall 7,5 cm closer at the top: the furniture does not fit, by 15 mm.
  await field("Mur droit — en haut").fill("7,5");
  await field("Mur droit — en haut").press("Tab");
  await expect(tool.locator("[data-survey-problem]")).toContainText("Mur de droite : il avance trop en haut — le meuble ne rentre pas, il manque 15 mm.");
  await shot(page, "releve-ne-rentre-pas");
  expect(errors).toEqual([]);
});
