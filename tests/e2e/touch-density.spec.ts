import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test.describe("au doigt", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1180, height: 820 } });

  test("une tablette donne des cibles de 44 px et des champs de 16 px", async ({ page }) => {
    await newProject(page, "Tactile");
    await expect(page.locator('[data-ref="status-kernel"]')).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    for (const selector of ["[data-side-tools] .icon-btn", "[data-select-filter]", '[data-ref="timeline"] button']) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box?.height, selector).toBeGreaterThanOrEqual(44);
      expect(box?.width, selector).toBeGreaterThanOrEqual(44);
    }
    const search = page.locator('[data-ref="panel-tree"] input').first();
    expect(await search.evaluate((input) => getComputedStyle(input).fontSize)).toBe("16px");
  });
});

test("à la souris, la colonne de sélection reste compacte", async ({ page }) => {
  await newProject(page, "Souris");
  await expect(page.locator('[data-ref="status-kernel"]')).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  const box = await page.locator("[data-side-tools] .icon-btn").first().boundingBox();
  expect(box?.height).toBeLessThan(44);
});
