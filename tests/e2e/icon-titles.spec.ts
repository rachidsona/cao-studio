/** Survolée, une icône d'outil montre son nom, au style des cotes ; la recherche d'outils trouve encore ce qui l'explique. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("la bulle d'une icône d'outil dit son nom seulement", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-bulles");
  const hollow = page.locator('[data-ribbon="model"] [data-action="hollow"]');
  await expect(hollow).toHaveAttribute("data-tip", "Vider un corps");
  await expect(hollow).not.toHaveAttribute("title", /.*/);
  // « Coque » is gone from the ribbon (its steps in a project still open).
  await expect(page.locator('[data-action="shell"]')).toHaveCount(0);
  await expect(page.locator('[data-ribbon="model"] [data-action="fillet"]')).toHaveAttribute("data-tip", "Congé");
  // No icon of the model's ribbon keeps the browser's grey tooltip.
  const titled = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>('[data-ribbon="model"] button[title]')].filter((b) => b.querySelector("svg") && !b.textContent?.trim()).map((b) => b.title),
  );
  expect(titled).toEqual([]);
  // Hovered: its name in a pastille of the dimensions' style, under it; gone when the pointer leaves.
  const tip = page.locator("[data-icon-tip]");
  await page.locator('[data-ribbon="model"] [data-action="fillet"]').hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText("Congé");
  await expect(tip).toHaveCSS("color", "rgb(248, 80, 10)");
  await expect(tip).toHaveCSS("border-top-color", "rgb(248, 80, 10)");
  await expect(tip).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.locator('[data-ribbon="model"] [data-action="chamfer"]').hover();
  await expect(tip).toHaveText("Chanfrein");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bulle-icone.png`, clip: { x: 0, y: 0, width: 1000, height: 260 } });
  await page.mouse.move(700, 600);
  await expect(tip).toBeHidden();
  // In a sketch, the drawing tools too.
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  const rectangle = page.locator('[data-ribbon="sketch"] [data-sketch-tool="rectangle"]');
  await expect(rectangle).toHaveAttribute("data-tip", "Rectangle");
  await rectangle.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText("Rectangle");
  await page.locator('[data-ribbon="sketch"] [data-sketch-tool="line"]').hover();
  await expect(tip).toHaveText("Ligne");
  await page.mouse.move(700, 600);
  await expect(tip).toBeHidden();
  await page.getByRole("button", { name: "Terminer l'esquisse" }).click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");

  // The tool search still finds a tool by what it does.
  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "Rechercher un outil" });
  await search.fill("creuser");
  await expect(page.getByRole("listbox", { name: "Commandes" })).toContainText("Coque");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
