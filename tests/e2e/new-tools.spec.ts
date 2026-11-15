/** Un petit point orange sur les outils nouveaux, jusqu'à ce qu'on s'en serve une fois. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("les outils nouveaux ont un point ; utilisé une fois, il s'en va et ne revient pas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-outils-nouveaux");
  const selectAll = page.locator("[data-side-tools] [data-select-all]");
  await expect(selectAll).toHaveAttribute("data-new", "");
  await expect(page.locator("[data-side-tools] [data-open-all]")).toHaveAttribute("data-new", "");
  // « Séparer les côtés » is put away in the menu of Modifier: the name of the group has the dot, and its line.
  const modifier = page.locator('[data-ribbon="model"] .ribbon-group[aria-label="Modifier"] .ribbon-caption-menu');
  await expect(modifier).toHaveAttribute("data-new-inside", "");
  await modifier.click();
  await expect(page.locator('.ribbon-menu [data-new-tool="data-action:split-sides"]')).toHaveAttribute("data-new", "");
  await page.keyboard.press("Escape");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/outils-nouveaux.png` });

  await selectAll.click();
  await expect(selectAll).not.toHaveAttribute("data-new", "");
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(selectAll).not.toHaveAttribute("data-new", "");
  await expect(page.locator("[data-side-tools] [data-open-all]")).toHaveAttribute("data-new", "");
  expect(errors).toEqual([]);
});
