/** Le style de l'interface (menu « ⋯ » → Style) : « Élégant » change les formes et les matières, pas la palette, et reste au rechargement. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("style Élégant : coins arrondis, barre d'outils unie, boutons pleins ; gardé au rechargement ; « Classique » y revient", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-style");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const look = () => page.evaluate(() => {
    const ribbon = getComputedStyle(document.querySelector("#editor [data-ribbon]")!);
    const save = getComputedStyle(document.querySelector(".tool-btn-primary, .btn-accent")!);
    return { style: document.documentElement.className.match(/\bstyle-[a-z]+/)?.[0] ?? "", radius: ribbon.borderTopLeftRadius, gradient: ribbon.backgroundImage.includes("gradient"), button: save.backgroundImage, stored: localStorage.getItem("style") };
  });
  // By default: square, the toolbar a card in the palette's gradient, the primary button a gradient too.
  expect(await look()).toMatchObject({ style: "", radius: "0px", gradient: true });
  expect((await look()).button).toContain("gradient");

  await page.getByLabel("Fichier et réglages").click();
  const styles = page.getByRole("group", { name: "Style de l'interface" });
  await styles.getByRole("button", { name: "Élégant" }).click();
  await expect(styles.getByRole("button", { name: "Élégant" })).toHaveAttribute("aria-pressed", "true");
  expect(await look()).toEqual({ style: "style-elegant", radius: "14px", gradient: false, button: "none", stored: "style-elegant" });

  // Kept in the browser, and put on before the first paint of the next page.
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.classList.contains("style-elegant"))).toBe(true);

  await page.getByLabel("Fichier et réglages").click();
  await page.getByRole("group", { name: "Style de l'interface" }).getByRole("button", { name: "Classique" }).click();
  expect(await page.evaluate(() => [document.documentElement.classList.contains("style-elegant"), localStorage.getItem("style"), getComputedStyle(document.querySelector("#editor [data-ribbon]")!).borderTopLeftRadius])).toEqual([false, "", "0px"]);
  expect(errors).toEqual([]);
});
