/** « Couleur de la face » : une seule face d'un corps colorée, le reste du corps garde sa couleur. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("une face choisie prend une couleur à elle, puis la rend", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-couleur-face");
  await expect(page.locator('[data-ref="status-recompute"]')).toContainText("Recalcul", { timeout: 60_000 });
  type Info = { faces?: { appearance: string; color?: string }[] };
  const looks = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    const doc = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { bodyInfo?: Record<string, Info> } }).document, api);
    return Object.values(doc.bodyInfo ?? {}).flatMap((i) => i.faces ?? []);
  };
  // The plate's top face, in the middle of the view as it opens.
  await click(page, '[data-select-filter="face"]');
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await expect(page.locator('[data-ref="status-selection"]')).toHaveText("0 arête(s), 1 face(s) sélectionnée(s)");
  const colour = page.locator("[data-face-color]");
  await expect(colour).toBeVisible();
  await colour.evaluate((input: HTMLInputElement) => {
    input.value = "#2e86de";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(looks, { timeout: 30_000 }).toEqual([{ normal: expect.any(Array), rel: expect.any(Array), appearance: "lacquer-satin", color: "#2e86de" }]);
  await expect(page.locator('[data-workshop="render"]')).toHaveAttribute("aria-pressed", "true");
  // Its own colour back.
  await page.getByRole("button", { name: "D'origine" }).click();
  await expect.poll(looks, { timeout: 30_000 }).toEqual([]);
  expect(errors).toEqual([]);
});
