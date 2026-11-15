/**
 * Un module à formules dans un vrai navigateur : créé dans l'outil Module (un paramètre, une formule d'abord fautive puis
 * juste, l'aperçu sur la niche), gardé dans « Mes modules », posé dans des niches de tailles différentes, chacune avec
 * son résultat, et rouvert avec ses formules.
 */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

type Offset = { name: string; formula?: { program: { formulas: Record<string, string> }; at: { hauteur: number } }; step?: { kind: string; niche: number[]; input: { count: number } } };

/** The divisions of the Répartition kept by the server: their niche, how many shelves, and whether they carry a program. */
async function divisions(page: Page, api: string): Promise<{ niche: string; count: number; formula: boolean }[]> {
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const sketches = (project.document.features as { type: string; offsets?: Offset[] }[]).filter((f) => f.type === "sketch");
  return sketches.flatMap((f) => f.offsets ?? []).filter((r) => r.step?.kind === "shelves").map((r) => ({ niche: r.step!.niche.join("."), count: r.step!.input.count, formula: Boolean(r.formula) })).sort((a, b) => a.niche.localeCompare(b.niche));
}

test("Module à formules : créé, gardé, posé dans des niches de tailles différentes avec le bon résultat", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "Formules e2e");
  const action = (name: string) => page.evaluate((a) => document.querySelector<HTMLElement>(`[data-action="${a}"]`)?.click(), name);
  await action("partition");
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(600);

  // Where the three cases are on the screen: their widths written under them, the height beside them.
  await action("module");
  const panel = page.getByRole("dialog", { name: "Module" });
  await panel.getByRole("button", { name: "Étagères", exact: true }).click();
  const centre = (text: string) =>
    page.evaluate((t) => [...document.querySelectorAll<HTMLElement>(".cad-plan-dim")].filter((d) => d.textContent === t).map((d) => {
      const r = d.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }), text);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panel).toContainText("Niche choisie");
  const cases = (await centre("57")).sort((a, b) => a.x - b.x);
  const middle = (await centre("250"))[0]!.y;
  expect(cases).toHaveLength(3);
  // Nothing kept on this first try: released, and the tool closed.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Escape");

  // A case cut in two by one shelf, a fixed module: two niches half as high.
  await action("module");
  await panel.getByRole("button", { name: "Étagères", exact: true }).click();
  await panel.getByLabel("Étagères", { exact: true }).selectOption("1");
  await page.mouse.click(cases[0]!.x, middle);
  await expect(page.getByText("Niche équipée : étagères.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // The module with formulas: a parameter, a formula wrong then right; the result is told before any niche.
  await action("module");
  // In a card of their own, closed as open: told apart from the module's other settings.
  const card = panel.locator("[data-formula-card]");
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Formules : calculer ce module sur la niche" }).click();
  await expect(card.getByRole("button", { name: "Sans formules" })).toBeVisible();
  const preview = card.locator("[data-formula-preview]");
  await expect(preview).toHaveText("Choisissez une niche : le résultat des formules s'y affiche.");
  await panel.getByRole("button", { name: "Ajouter un paramètre" }).click();
  await expect(panel.getByLabel("Nom du paramètre 1")).toHaveValue("pas");
  await expect(panel.getByLabel("Valeur du paramètre 1")).toHaveValue("350");
  const shelves = panel.getByLabel("Formule : Nombre d'étagères");
  await shelves.fill("plancher(hauteur / pas");
  await expect(preview).toHaveText("Nombre d'étagères — formule « plancher(hauteur / pas » : une parenthèse fermante manque pour « plancher( ».");
  await shelves.press("Enter");
  await expect(shelves).toHaveAttribute("aria-invalid", "true");
  await shelves.fill("max(plancher(hauteur / pas) - 1; 1)");
  await shelves.press("Enter");
  await expect(shelves).toHaveAttribute("aria-invalid", "false");
  await expect(preview).toHaveText("Choisissez une niche : le résultat des formules s'y affiche.");
  // The fixed count gives way to the formula.
  await expect(panel.getByLabel("Étagères", { exact: true })).toHaveCount(0);

  // Kept under a name, with its formulas.
  await panel.getByLabel("Nom du module").fill("Une étagère tous les 35 cm");
  await panel.getByRole("button", { name: "Garder" }).click();
  const mine = panel.getByRole("list", { name: "Mes modules" }).getByRole("button", { name: "Une étagère tous les 35 cm" });
  await expect(mine).toHaveAttribute("title", "Étagères · à formules");

  // Two whole cases: 246,4 cm high, 6 shelves each.
  await page.mouse.click(cases[1]!.x, middle);
  await expect(preview).toHaveText(/^Sur la niche de 57 × 246,4 × 50 cm : Étagères — nombre d'étagères 6\.$/);
  await page.mouse.click(cases[2]!.x, middle);
  await expect(page.getByText("2 niches équipées : étagères à formules.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // The lower half of the first case, 122,3 cm: 2 shelves. Its niche is in the fixed module: « this niche alone ».
  await action("module");
  await page.mouse.click(cases[0]!.x, middle + (box.height / 2 + box.y - middle) / 2 + 30);
  await expect(panel).toContainText("Modifier : Étagères");
  await panel.getByRole("button", { name: "Poser un module dans cette niche seule" }).click();
  await panel.getByRole("list", { name: "Mes modules" }).getByRole("button", { name: "Une étagère tous les 35 cm" }).click();
  await expect(preview).toHaveText(/^Sur la niche de 57 × 122,3 × 50 cm : Étagères — nombre d'étagères 2\.$/);
  await expect(page.getByText("Niche équipée : étagères à formules.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Kept by the server: each module with its program and its own count.
  await expect
    .poll(() => divisions(page, api), { timeout: 20_000 })
    .toEqual([
      { niche: "0", count: 1, formula: false },
      { niche: "0.0", count: 2, formula: true },
      { niche: "1", count: 6, formula: true },
      { niche: "2", count: 6, formula: true },
    ]);

  // A module with formulas clicked: it comes back with them.
  await action("module");
  await page.mouse.click(cases[2]!.x, middle);
  await expect(panel).toContainText("Modifier : Étagères");
  await expect(panel.getByLabel("Formule : Nombre d'étagères")).toHaveValue("max(plancher(hauteur / pas) - 1; 1)");
  await expect(preview).toHaveText(/nombre d'étagères 6\.$/);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "test-results/module-formulas.png" });
  expect(errors).toEqual([]);
});
