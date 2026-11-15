/** Des tiroirs de niche à façade vitrée : choisis dans l'outil Tiroirs, faits sans erreur, verre et profilé au devis. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("les tiroirs d'une bibliothèque passent en façades vitrées par l'outil Tiroirs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-tiroirs-vitres");
  type Feature = { type: string; fill?: string; style?: string };
  const drawers = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Feature[] } }).document.features.find((f) => f.type === "niche" && f.fill === "drawers"), api);
  };
  await click(page, '[data-workshop="furniture"]');
  const assistant = page.getByRole("dialog", { name: "Assistant meuble" });
  await assistant.getByRole("combobox", { name: "Meuble" }).selectOption("bookcase");
  await assistant.getByRole("combobox", { name: "Bas du meuble" }).selectOption("drawers");
  await assistant.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bibliothèque 1 » posé")).toBeVisible();
  await assistant.getByRole("button", { name: "Terminer", exact: true }).click();
  const status = page.locator('[data-ref="status-recompute"]');
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  expect(await drawers()).toBeTruthy();

  // The drawers' tool, from the history: their step.
  const id = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { id: string; type: string; fill?: string }[] } }).document.features.find((f) => f.type === "niche" && f.fill === "drawers")!.id, api);
  await page.locator(`[data-op="${id}"]`).click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  const tool = page.getByRole("dialog", { name: /Tiroirs/ });
  await tool.getByRole("combobox", { name: "Style des façades" }).selectOption("glass");
  await expect(tool.getByRole("combobox", { name: "Verre" })).toBeVisible();
  await tool.getByRole("combobox", { name: "Verre" }).selectOption("smoked");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect.poll(async () => (await drawers())?.style, { timeout: 30_000 }).toBe("glass");
  await expect(status).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.keyboard.press("Escape");
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "tiroirs-vitres");
  expect(errors).toEqual([]);
});
