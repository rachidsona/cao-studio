/** Clic droit sur une porte → « Modifier les portes… » ; un clic sur une étape de l'historique sélectionne ce qu'elle a fait. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("les portes d'un caisson passent à deux et encastrées par leur clic droit ; l'historique sélectionne les façades", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-portes-clic-droit");
  await page.evaluate(async (url) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    const cabinet = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 800, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
    const fronts = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features: [cabinet, fronts] }, base_version: now.version, message: "Caisson" }) });
  }, api);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { id: string; layout?: string; mount?: string }[] } }).document.features.find((f) => f.id === "fr1"), api);
  };
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);

  // The history: the fronts' step selects the door in the view.
  await page.locator('[data-op="fr1"]').click();
  await expect(page.locator('[data-ref="status-selection"]')).toHaveText(/^\d+ corps sélectionné\(s\)$/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2, { button: "right" });
  await page.getByRole("menuitem", { name: "Modifier les portes…" }).click();
  const panel = page.getByRole("dialog", { name: "Modifier les portes" });
  await expect(panel).toContainText("Portes — Bas");
  await panel.getByRole("combobox", { name: "Nombre de portes" }).selectOption("doors");
  await expect.poll(async () => (await saved())?.layout, { timeout: 30_000 }).toBe("doors");
  await panel.getByRole("combobox", { name: "Pose" }).selectOption("inset");
  await expect.poll(async () => (await saved())?.mount, { timeout: 30_000 }).toBe("inset");
  await panel.getByRole("button", { name: "Fermer" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/portes-modifiees.png` });
  expect(errors).toEqual([]);
});
