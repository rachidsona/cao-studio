/** Façades décor : la porte d'un caisson cannelée, puis à tasseaux, puis à cadre, par l'outil Façades. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("la porte d'un caisson se fait cannelée, à tasseaux ou à cadre, sans erreur du noyau", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-facades-decor");
  const saved = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; style?: string; pitch?: number; frameDepth?: number }[] } }).document.features.find((f) => f.type === "fronts"), api);
  };
  const status = page.locator('[data-ref="status-recompute"]');

  await click(page, '[data-action="cabinet"]');
  const cabinet = page.getByRole("dialog", { name: "Caisson" });
  await cabinet.getByRole("combobox", { name: "Portes" }).selectOption("none");
  await page.waitForTimeout(800);
  await cabinet.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="fronts"]');
  const tool = page.getByRole("dialog", { name: "Façades" });
  await expect(tool).toBeVisible();
  const style = tool.getByRole("combobox", { name: "Style des portes" });

  // Fluted: its pitch and depth (the project counts in cm).
  await style.selectOption("fluted");
  await expect(tool.getByRole("textbox", { name: "Entraxe des cannelures" })).toHaveValue("3");
  await expect(tool.getByRole("textbox", { name: "Profondeur des rainures" })).toHaveValue("0,3");
  await page.waitForTimeout(1200);
  await expect(status).not.toContainText("erreur");
  await expect.poll(saved, { timeout: 30_000 }).toMatchObject({ style: "fluted", pitch: 30, frameDepth: 3 });
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  await shot(page, "porte-cannelee");

  // Slats, then too deep: refused.
  await style.selectOption("slats");
  await expect(tool.getByRole("textbox", { name: "Entraxe des tasseaux" })).toHaveValue("4,5");
  await page.waitForTimeout(1200);
  await expect(status).not.toContainText("erreur");
  await click(page, '[data-action="view"][data-view="iso"]');
  await page.waitForTimeout(1000);
  await shot(page, "porte-a-tasseaux");
  const depth = tool.getByRole("textbox", { name: "Profondeur des rainures" });
  await depth.fill("1,7");
  await depth.press("Tab");
  await expect(tool).toContainText("trop profondes");

  // Framed: a caisson's door can be now.
  await style.selectOption("frame");
  await expect(tool.getByRole("textbox", { name: "Largeur du cadre" })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(status).not.toContainText("erreur");
  await expect.poll(saved, { timeout: 30_000 }).toMatchObject({ style: "frame" });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  expect(errors).toEqual([]);
});
