/** Découpes du plan de travail : un « Bas évier » découpe le plan tout seul ; une découpe prend les cotes de la notice. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
type Cut = { appliance: string; along: number; size?: number[]; radius?: number; name?: string };

test("un Bas évier découpe le plan de travail ; une plaque aux cotes de la notice, angles arrondis, gardée dans Mes découpes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-test-decoupes-plan");
  const cuts = async (): Promise<Cut[][]> => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as { type: string; kind?: string; cutouts?: Cut[] }[]).filter((f) => f.type === "machining" && f.kind === "cutout").map((f) => f.cutouts ?? []);
  };
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator('[data-open-run="A"]').click();
  const add = plan.locator('[data-fold="add"]');
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  // A plain unit, then the sink base of the tab « Bas » (no appliance of « Électro. »).
  await plan.locator('[data-add="base-bas-1-porte-600"]').click();
  await plan.locator('[data-add="base-bas-evier-800"]').click();
  // More units after it: the worktop stops at the last one, and a cut needs 5 cm of worktop at each end.
  await plan.locator('[data-add="base-bas-2-portes-1200"]').click();
  await plan.locator("[data-run-ok]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Terminer" }).click();
  // The worktop is cut over the sink base: its middle at 60 + 40 cm.
  expect(await cuts()).toEqual([[{ appliance: "sink-1", along: 1000, front: null, auto: true }]]);
  await click(page, '[data-action="view"][data-view="iso"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await shot(page, "decoupe-bas-evier");

  // « Découpes du plan de travail » on the worktop: a hob, at the sizes of its leaflet, its corners rounded.
  await page.locator('[data-select^="body:"]').filter({ hasText: "Plan de travail A" }).first().click();
  await click(page, '[data-action="cutout"]');
  const tool = page.getByRole("dialog", { name: "Découpes du plan de travail" });
  await tool.getByLabel("Ajouter une découpe").selectOption("hob-60");
  // The tool opens on the plan's own cut-outs: the sink is the first, the hob the second.
  await expect(tool).toContainText("Modifier : Découpes Plan de travail A");
  // Over the unit of 120, clear of the sink: its middle at 200 cm from the end of the worktop.
  await tool.getByLabel("Milieu ← bout", { exact: true }).last().fill("200");
  await tool.getByLabel("Milieu ← bout", { exact: true }).last().press("Tab");
  const width = tool.getByLabel("Largeur", { exact: true }).last();
  await expect(width).toHaveValue("56");
  await width.fill("58");
  await width.press("Tab");
  await tool.getByLabel("Rayon des angles", { exact: true }).last().fill("0,8");
  await tool.getByLabel("Rayon des angles", { exact: true }).last().press("Tab");
  await tool.locator('[data-cutout-keep="1"]').click();
  await page.locator("[data-cutout-name]").fill("Plaque Bosch 58");
  await page.locator("[data-cutout-name]").press("Enter");
  await expect(page.getByText("« Plaque Bosch 58 » gardée dans Mes découpes.").first()).toBeVisible();
  await expect(tool.getByText("Plaque Bosch 58 — 580 × 490, R8")).toBeVisible();
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  const made = (await cuts()).flat().find((c) => c.appliance === "hob-60")!;
  expect(made).toMatchObject({ size: [580, 490], radius: 8, name: "Plaque Bosch 58" });
  await shot(page, "decoupe-plaque");

  // The kitchen made again (a unit added): the hob put by hand is still cut in the worktop.
  await click(page, '[data-workshop="kitchen-plan"]');
  await plan.locator('[data-open-run="A"]').click();
  if ((await add.getAttribute("aria-expanded")) !== "true") await add.click();
  await plan.locator('[data-add="base-bas-1-porte-400"]').click();
  await plan.locator("[data-run-ok]").click();
  await expect(page.getByText("Mur A aménagé").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: "Terminer" }).click();
  expect((await cuts()).flat().map((c) => c.appliance).sort()).toEqual(["hob-60", "sink-1"]);

  // Kept: offered again under its name.
  await page.locator('[data-select^="body:"]').filter({ hasText: "Plan de travail A" }).first().click();
  await click(page, '[data-action="cutout"]');
  await expect(tool.getByLabel("Ajouter une découpe").locator("optgroup[label='Mes découpes'] option")).toHaveText(["Plaque Bosch 58"]);
  expect(errors).toEqual([]);
});
