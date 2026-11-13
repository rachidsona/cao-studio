/** « Vider un corps » : un corps vidé à l'épaisseur saisie, ses côtés joints ou chacun à part. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("un corps se vide à l'épaisseur saisie, côtés joints puis chaque côté seul, et se rouvre depuis l'historique", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-vider-un-corps");
  const tree = page.getByLabel(/^Navigateur : corps/);
  const status = page.locator('[data-ref="status-recompute"]');
  const shell = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string }[] } }).document.features.find((f) => f.type === "shell"), api);
  };

  // The plate of the project (80 × 50 × 10 mm, a hole through it), chosen in the browser, then the tool.
  await tree.getByText("Corps 1", { exact: true }).first().click();
  await click(page, '[data-action="hollow"]');
  const tool = page.getByRole("dialog", { name: "Vider un corps" });
  await expect(tool).toBeVisible();
  // Sides 2 mm thick (the project counts in cm): one hollow body, nothing open.
  const thickness = tool.getByRole("textbox", { name: "Épaisseur des côtés" });
  await thickness.fill("0,2");
  await thickness.press("Tab");
  await expect(tool.getByRole("combobox", { name: "Côtés" })).toHaveValue("joined");
  await expect(tool.getByRole("combobox", { name: "Assemblage" })).toHaveCount(0);
  await expect(tool.getByRole("alert")).toHaveCount(0);
  await expect(status).not.toContainText("erreur");
  // Stored a moment after the setting is valid.
  await expect.poll(shell, { timeout: 30_000 }).toMatchObject({ name: "Corps vidé 1", target: "h1", faces: [], thickness: 2, sides: "joined" });

  // Each side on its own: its six flat sides boards, the wall of its hole one body more.
  await tool.getByRole("combobox", { name: "Côtés" }).selectOption("separate");
  await tool.getByRole("combobox", { name: "Assemblage" }).selectOption("butt");
  await expect(tree.getByText("Corps vidé 1", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("côté 7", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("côté 8", { exact: true })).toHaveCount(0);
  await expect(status).not.toContainText("erreur");
  await expect.poll(shell, { timeout: 30_000 }).toMatchObject({ sides: "separate", joint: "butt", thickness: 2 });
  await shot(page, "vider-un-corps");
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(tool).toHaveCount(0);

  // From the history, it is the same tool again, as it was set.
  await page.getByRole("toolbar", { name: "Historique des opérations" }).locator('[data-op="sh1"]').click();
  await page.getByRole("dialog", { name: "Coque Corps vidé 1" }).getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(tool).toBeVisible();
  await expect(tool.getByRole("combobox", { name: "Côtés" })).toHaveValue("separate");
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  expect(errors).toEqual([]);
});
