/** L'Historique montre les esquisses à leur place : un clic l'ouvre, « Modifier » l'édite. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("l'esquisse est dans l'Historique avant son extrusion, et s'y modifie", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-historique-esquisse");
  await expect(page.locator('[data-ref="status-recompute"]')).toContainText("Recalcul", { timeout: 60_000 });
  const timeline = page.getByRole("toolbar", { name: "Historique des opérations" });
  // The plate's sketch, then its extrusion.
  const ops = await timeline.locator("[data-op]").evaluateAll((all) => all.map((e) => e.getAttribute("data-op")));
  expect(ops.slice(0, 2)).toEqual(["sk1", "ex1"]);
  await timeline.locator('[data-op="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  expect(errors).toEqual([]);
});
