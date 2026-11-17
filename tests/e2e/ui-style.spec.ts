/** Le style de l'interface (menu « ⋯ » → Style) : « Verre » et « Minimal clair » changent les formes et les matières, et restent au rechargement. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("styles Verre et Minimal clair : verre flou et coins arrondis, puis panneaux bord à bord en clair ; gardés au rechargement ; « Classique » y revient", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-style");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const look = () => page.evaluate(() => {
    const ribbon = getComputedStyle(document.querySelector("#editor [data-ribbon]")!);
    const row = getComputedStyle(document.querySelector('#editor [data-ref="main-row"]')!);
    return { style: document.documentElement.className.match(/\bstyle-[a-z]+/)?.[0] ?? "", dark: document.documentElement.classList.contains("dark"), radius: ribbon.borderTopLeftRadius, blur: getComputedStyle(document.querySelector("#editor [data-ribbon]")!, "::before").backdropFilter.includes("blur"), gap: row.columnGap, stored: localStorage.getItem("style") };
  });
  const choose = async (name: string) => {
    await page.getByLabel("Fichier et réglages").click();
    const styles = page.getByRole("group", { name: "Style de l'interface" });
    await styles.getByRole("button", { name, exact: true }).click();
    await expect(styles.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Fichier et réglages").click();
  };
  // By default: square cards, set apart by 8 px.
  expect(await look()).toMatchObject({ style: "", radius: "0px", blur: false, gap: "8px" });

  // Glass: frosted, rounded, further apart; the theme is kept.
  await choose("Verre");
  expect(await look()).toEqual({ style: "style-verre", dark: true, radius: "16px", blur: true, gap: "12px", stored: "style-verre" });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect((await look()).style).toBe("style-verre");
  // Its menus open above the panels: the « ⋯ » menu of the top bar, the « Affichage » menu of the toolbar.
  await page.getByLabel("Fichier et réglages").click();
  await expect(page.getByRole("group", { name: "Style de l'interface" }).getByRole("button", { name: "Classique", exact: true })).toBeVisible();
  const onTop = await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-ui-style="style-minimal"]')!.getBoundingClientRect();
    return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest("[data-ui-style]")?.getAttribute("data-ui-style");
  });
  expect(onTop).toBe("style-minimal");
  await page.getByLabel("Fichier et réglages").click();

  // Minimal light: the light theme, the panels edge to edge (no gap, no radius, no blur).
  await choose("Minimal clair");
  expect(await look()).toEqual({ style: "style-minimal", dark: false, radius: "0px", blur: false, gap: "0px", stored: "style-minimal" });
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");

  await choose("Classique");
  expect(await look()).toMatchObject({ style: "", radius: "0px", gap: "8px", stored: "" });
  expect(errors).toEqual([]);
});
