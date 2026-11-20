/** Dans Tiroirs (Penderie, Porte, Accessoire) : « Supprimer les tiroirs » retire seulement l'équipement de la niche choisie. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("des tiroirs posés puis supprimés seuls, la niche et le meuble restant", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-supprimer-tiroirs");
  // A wall of a dressing plan, from the front (as the joinery tests make it).
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="dressing-plan"]')?.click());
  const plan = page.getByRole("dialog", { name: "Plan de dressing" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button", { name: /^(Modifier|Répartition)$/ }).click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(800);
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  const at = { x: box.x + box.width * 0.33, y: box.y + box.height * 0.5 };
  await page.mouse.click(at.x, at.y);
  await page.locator("[data-context-bar]").getByRole("button", { name: "Tiroirs" }).click();
  const tool = page.getByRole("dialog", { name: "Tiroirs" });
  await expect(tool).toContainText("Niche choisie");
  await expect(tool.locator("[data-niche-remove]")).toHaveCount(0);
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  type Doc = { features: { type: string; fill?: string }[] };
  const drawers = async () => (await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: Doc }).document, api)).features.filter((f) => f.type === "niche" && f.fill === "drawers").length;
  await page.keyboard.press("Control+s");
  await expect.poll(drawers, { timeout: 20_000 }).toBe(1);
  // The same niche chosen again: its drawers can be taken out alone.
  await page.mouse.click(at.x, at.y);
  const remove = tool.locator('[data-niche-remove="drawers"]');
  await expect(remove).toHaveText("Supprimer les tiroirs");
  await remove.click();
  await page.keyboard.press("Control+s");
  await expect.poll(drawers, { timeout: 20_000 }).toBe(0);
  // The wall and its panels are there still.
  const extrudes = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: Doc }).document.features.filter((f) => f.type === "extrude").length, api);
  expect(extrudes).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
