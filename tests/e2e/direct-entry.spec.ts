/** Saisie directe dans les outils : une valeur ou un calcul tapé sans cliquer de champ, comme dans l'esquisse. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("Extrusion : (190+100)/2 tapé sans cliquer le champ, Entrée — 145 cm ; puis 2*10 tapé dans le champ", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-saisie-directe");
  await expect(page.locator('[data-ref="status-recompute"]')).toContainText("Recalcul", { timeout: 60_000 });
  const extrusions = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as { type: string; distance?: number }[]).filter((f) => f.type === "extrude").map((f) => f.distance);
  };
  const tool = page.getByRole("dialog", { name: "Extrusion", exact: true });
  await click(page, '[data-action="extrude"]');
  await expect(tool).toBeVisible();
  const distance = tool.getByRole("textbox", { name: /^Distance/ });
  // Nothing focused: the keys go to the tool's first number field, outlined.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.type("(190+100)/2");
  await expect(distance).toHaveValue("(190+100)/2");
  await expect(distance).toHaveAttribute("data-direct-entry", "");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await extrusions())[1], { timeout: 30_000 }).toBe(1450);

  // In the field by hand: a calculation too, its result written at Entrée. The plate's profile clicked again.
  await click(page, '[data-action="extrude"]');
  await expect(tool).toBeVisible();
  await distance.fill("2*10");
  await distance.press("Enter");
  await expect.poll(async () => (await extrusions()).length, { timeout: 30_000 }).toBeGreaterThan(2);
  expect((await extrusions())[2]).toBe(200);
  expect(errors).toEqual([]);
});
