/** Une face d'étagère du coin d'un dressing en L, extrudée dans la zone isolée : l'étagère reste en vue, aperçu compris. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("coin isolé : une face d'étagère extrudée de 3 cm, jointe puis en nouveau corps, l'étagère ne disparaît pas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Coin extrudé e2e");
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En L à droite, pan coupé" }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  const zones = tool.getByRole("list", { name: "Zones du plan" });
  const corner = zones.getByRole("listitem").filter({ hasText: "Angle droit" });
  await corner.getByRole("button").last().click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "OK", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1500);

  // The corner alone, seen from the front, two shelves in it.
  await click(page, '[data-workshop="dressing-plan"]');
  await corner.getByRole("button", { name: "Voir" }).click();
  const bar = page.locator("[data-zone-isolated]");
  await expect(bar).toContainText("Angle droit isolé");
  await page.keyboard.press("Escape");
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  const at = (x: number, y: number) => [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.click(...at(0.5, 0.5), { button: "right" });
  await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await shelves.getByRole("combobox").first().selectOption("2");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await expect(bar).toHaveAttribute("data-shown", "7");
  await page.waitForTimeout(1000);

  // A face of the upper shelf, then Extrusion: 3 cm, joined.
  const pullShelf = async (operation: string) => {
    await click(page, '[data-select-filter="face"]');
    await page.mouse.click(...at(0.432, 0.378));
    await expect(page.locator('[data-ref="status-selection"]')).toHaveText("0 arête(s), 1 face(s) sélectionnée(s)");
    await click(page, '[data-action="extrude"]');
    const pull = page.getByRole("dialog", { name: "Extrusion de faces" });
    await expect(pull).toContainText("1 face(s)");
    await pull.getByLabel("Opération").selectOption({ label: operation });
    const distance = pull.getByRole("textbox", { name: "Distance" });
    await distance.fill("3");
    await distance.press("Enter");
    return pull;
  };
  let pull = await pullShelf("Joindre (ajouter)");
  // While the preview shows it, the shelf stays in view (it used to vanish: the preview's body was looked up in the
  // saved document).
  await page.waitForTimeout(1500);
  await expect(bar).toHaveAttribute("data-shown", "7");
  await expect(pull.getByRole("alert")).toHaveCount(0);
  await pull.getByRole("button", { name: "OK", exact: true }).click();
  await expect(pull).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(bar).toHaveAttribute("data-shown", "7");
  await expect(page.getByLabel("Corps cible")).toHaveValue(/.+/);
  await expect(page.getByLabel("Corps cible").locator("option:checked")).toHaveText(/^Étagère/);
  await expect(page.getByLabel("Distance (cm)")).toHaveValue("3");
  await expect(page.locator('[data-state="error"]')).toHaveCount(0);

  // As a new body: it shows with the shelf it is pulled from, in the preview and once made.
  pull = await pullShelf("Nouveau corps");
  await page.waitForTimeout(1500);
  await expect(bar).toHaveAttribute("data-shown", "8");
  await pull.getByRole("button", { name: "OK", exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(bar).toHaveAttribute("data-shown", "8");
  await expect(page.locator('[data-state="error"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
