/** « Assistant meuble » : un bureau puis une bibliothèque posés à leurs cotes, l'assistant restant ouvert ; une cote hors limites refusée. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("l'assistant pose un bureau puis une bibliothèque, refuse une cote hors limites, et se ferme par Terminer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-assistant-meuble");
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { name: string }[] } }).document.features.map((f) => f.name), api);
  };
  const tree = page.getByLabel(/^Navigateur : corps/);
  const status = page.locator('[data-ref="status-recompute"]');

  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await expect(tool).toBeVisible();
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("desk");
  await expect(tool.locator("[data-furniture-what]")).toContainText("trois tiroirs");
  await expect(tool.getByRole("textbox", { name: "Largeur" })).toHaveValue("140");

  // Too high for a desk: said, OK disabled (the project counts in cm).
  const height = tool.getByRole("textbox", { name: "Hauteur" });
  await height.fill("95");
  await height.press("Enter");
  await expect(tool).toContainText("Bureau : la hauteur va de 65 cm à 80 cm.");
  await expect(tool.getByRole("button", { name: "OK", exact: true })).toBeDisabled();
  await height.fill("75");
  await height.press("Enter");
  await tool.getByRole("combobox", { name: "Caisson à tiroirs" }).selectOption("right");
  await tool.getByRole("combobox", { name: "Matière" }).selectOption("melamine-oak");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bureau 1 » posé")).toBeVisible();
  await expect(tree.getByText("Bureau 1 — Plateau").first()).toBeAttached();
  await expect(status).not.toContainText("erreur");

  // The assistant stays: a bookcase, drawers at the bottom.
  await expect(tool).toBeVisible();
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("bookcase");
  await tool.getByRole("combobox", { name: "Bas du meuble" }).selectOption("drawers");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bibliothèque 1 » posé")).toBeVisible();
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await expect.poll(saved, { timeout: 30_000 }).toEqual(expect.arrayContaining(["Bureau 1 — Plateau", "Bureau 1 — Caisson du bureau", "Bibliothèque 1"]));
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "assistant-meuble");
  expect(errors).toEqual([]);
});
