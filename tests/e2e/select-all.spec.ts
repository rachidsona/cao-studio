/** « Tout sélectionner » : le bouton de la colonne Vue et Ctrl + A prennent tous les corps montrés ; Échap les rend. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("un bureau posé, tout sélectionné par le bouton puis par Ctrl + A, et vidé par Échap", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-tout-selectionner");
  const status = page.locator('[data-ref="status-selection"]');

  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("desk");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bureau 1 » posé")).toBeVisible();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);

  await click(page, "[data-select-all]");
  await expect(status).toHaveText(/^\d+ corps( et \d+ esquisses?)? sélectionnés$/);
  const all = (await status.textContent()) ?? "";
  const count = Number(all.match(/\d+/)?.[0]);
  expect(count).toBeGreaterThan(5);
  await expect(page.getByText(new RegExp(`^Tout est sélectionné : ${count} corps`)).first()).toBeVisible();
  await shot(page, "tout-selectionner");

  await page.keyboard.press("Escape");
  await expect(status).toHaveText("Aucune sélection");
  await page.mouse.move(700, 450);
  await page.keyboard.press("ControlOrMeta+a");
  await expect(status).toHaveText(all);

  // « Supprimer la sélection », la touche Suppr en bouton : rien de choisi, il le dit ; tout choisi, tout part.
  await page.keyboard.press("Escape");
  await click(page, "[data-delete-selection]");
  await expect(page.getByText(/^Rien à supprimer/).first()).toBeVisible();
  await click(page, "[data-select-all]");
  await expect(status).toHaveText(all);
  await click(page, "[data-delete-selection]");
  const sure = page.getByRole("button", { name: "Supprimer", exact: true });
  await sure.click({ timeout: 5000 }).catch(() => undefined);
  await expect(status).toHaveText("Aucune sélection");
  await click(page, "[data-select-all]");
  await expect(page.getByText(/^Rien à sélectionner/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
