/** Règles des fabricants dans le panneau Quincaillerie : une porte trop fine pour la cuvette, puis la charnière à petit boîtier. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("une porte de 15 mm sur une cuvette de 13 est refusée, la charnière Ø26 la règle ; « Voir » sélectionne la porte", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-regles-fabricants");
  // A base unit, its door 15 mm thick.
  await page.evaluate(async (url) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    const cabinet = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
    const fronts = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 15, hinges: true, handles: true };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features: [cabinet, fronts] }, base_version: now.version, message: "Caisson" }) });
  }, api);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });

  await click(page, '[data-workshop="hardware"]');
  const rules = page.locator("[data-maker-rules]");
  await expect(rules).toContainText("Règles des fabricants (1)");
  await expect(rules.locator('[data-maker-problem="error"]')).toContainText("16 mm au moins");
  await rules.getByRole("button", { name: "Voir" }).click();
  await expect(page.locator('[data-ref="status-selection"]')).toHaveText("1 corps sélectionné(s)");
  await shot(page, "regles-fabricants");

  await page.getByRole("combobox", { name: "Charnières" }).selectOption("small-26");
  await expect(rules).toContainText("Tout va avec ce choix");
  expect(errors).toEqual([]);
});
