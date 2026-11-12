/** L'historique : Ctrl/⌘ + clic choisit plusieurs étapes, Maj + clic une plage, et « Supprimer » les efface ensemble (une annulation). */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("plusieurs étapes de l'historique choisies et supprimées d'un coup, puis rendues par une annulation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Historique e2e");
  const strip = page.getByRole("toolbar", { name: "Historique des opérations" });
  const chips = strip.locator("[data-op]");
  const before = await chips.count();
  expect(before).toBeGreaterThanOrEqual(2);
  const last = chips.nth(before - 1);
  const previous = chips.nth(before - 2);
  // Ctrl + click: one, then another; the bar says how many.
  await previous.click({ modifiers: ["ControlOrMeta"] });
  await last.click({ modifiers: ["ControlOrMeta"] });
  await expect(strip.locator("[data-marked]")).toHaveCount(2);
  await expect(strip).toContainText("2 choisies");
  // Ctrl + click again: out; Maj + click: the range back in.
  await last.click({ modifiers: ["ControlOrMeta"] });
  await expect(strip.locator("[data-marked]")).toHaveCount(1);
  await last.click({ modifiers: ["Shift"] });
  await expect(strip.locator("[data-marked]")).toHaveCount(2);
  await strip.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(chips).toHaveCount(before - 2);
  await expect(strip.locator("[data-marked-bar]")).toHaveCount(0);
  // One undo brings both back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chips).toHaveCount(before);
  expect(errors).toEqual([]);
});
