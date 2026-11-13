/** Une calculatrice à chaque champ d'un nombre, et sur les cotes d'une forme en train d'être tracée. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("un champ sans calculatrice en reçoit une, et une cote du tracé s'ouvre dans la calculatrice", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-calculatrices");
  const calculator = page.getByRole("dialog", { name: /Saisie de cote|Espacement|Diamètre|Largeur|Hauteur/ });

  // « Modules à glisser »: its settings had no calculator; now each has one, and ✓ writes the result in the field.
  await click(page, '[data-workshop="module-palette"]');
  const panel = page.getByRole("dialog", { name: "Modules à glisser" });
  await panel.locator('[data-module="shelves"]').click();
  const spacing = panel.getByRole("textbox", { name: /^Espacement des étagères/ });
  const keypad = panel.getByRole("button", { name: "Calculatrice : Espacement des étagères" });
  await expect(keypad).toBeVisible();
  await keypad.click();
  const calc = page.getByRole("dialog", { name: "Espacement des étagères" });
  await expect(calc).toBeVisible();
  const expression = calc.locator("input[data-expression]");
  await expression.fill("30+5");
  await calc.getByRole("button", { name: "Valider" }).click();
  await expect(calc).toHaveCount(0);
  await expect(spacing).toHaveValue("35");
  // The panel tools' own keypads are not doubled.
  await panel.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="cabinet"]');
  const cabinet = page.getByRole("dialog", { name: "Caisson" });
  await expect(cabinet.locator('[data-field-keypad]')).toHaveCount(0);
  await expect(cabinet.getByRole("button", { name: /^Saisir Largeur/ })).toHaveCount(1);
  await cabinet.getByRole("button", { name: "Terminer", exact: true }).click();

  // In a sketch: a rectangle's first corner, then a click on its width opens the calculator; ✓ keeps it.
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const box = (await page.locator('[data-ref="viewport"] canvas').boundingBox())!;
  await page.locator('[data-sketch-tool="rectangle"]').click();
  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.2);
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.1);
  await page.locator('[data-dim-field="w"]').click();
  const width = page.getByRole("dialog", { name: "Largeur" });
  await expect(width).toBeVisible();
  await width.locator("input[data-expression]").fill("2*1,5");
  await width.getByRole("button", { name: "Valider" }).click();
  await expect(page.locator('[data-dim-field="w"]')).toHaveText("3");
  await expect(page.locator('[data-dim-field="w"]')).toHaveAttribute("data-state", "locked");
  await expect(page.locator('[data-dim-field="h"]')).toHaveAttribute("data-state", "active");
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-dim-field="w"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  void calculator;
});
