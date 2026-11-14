/** Un paramètre nommé pilote une cote d'esquisse : « largeur » liée à la longueur de la plaque, la plaque suit. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

type Sketch = { id: string; constraints: { id: string; value?: number }[]; points: { x: number }[]; expressions?: Record<string, string> };

test("la longueur de l'esquisse liée au paramètre « largeur »", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-parametres-esquisse");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="parameters"]')?.click());
  await page.getByRole("textbox", { name: "Nom du paramètre" }).fill("largeur");
  await page.getByRole("textbox", { name: "Valeur du nouveau paramètre" }).fill("120");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByRole("combobox", { name: "Fonction à lier" }).selectOption({ label: "Esquisse 1" });
  await page.getByRole("combobox", { name: "Cote à lier" }).selectOption({ index: 0 });
  await expect(page.getByRole("combobox", { name: "Cote à lier" })).toContainText("Longueur");
  await page.getByRole("textbox", { name: "Formule" }).fill("largeur");
  await page.getByRole("button", { name: "Lier", exact: true }).click();
  await expect(page.getByText("Esquisse 1 · Longueur :")).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 15_000 });
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const sk = (project.document.features as Sketch[]).find((f) => f.id === "sk1")!;
  expect(sk.expressions).toEqual({ "cote:d1": "largeur" });
  expect(sk.constraints.find((c) => c.id === "d1")?.value).toBe(120);
  const xs = sk.points.map((p) => p.x);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(120, 6);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
