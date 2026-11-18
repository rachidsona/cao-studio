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

test("style des icônes : Contour, Plein, Deux tons peignent autrement les mêmes dessins, gardés au rechargement ; « Volumes » y revient", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-icones");
  // The dark theme, kept over the reload below.
  await page.evaluate(() => (localStorage.setItem("theme", "dark"), document.documentElement.classList.add("dark")));
  // What the sprite itself shows: the top face of a white volume, its edge, the key under a flat icon.
  const look = () => page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const stop = getComputedStyle(document.querySelector("#kwt stop")!).stopColor;
    return {
      icons: document.documentElement.className.match(/\bicons-[a-z]+/)?.[0] ?? "",
      face: stop,
      edge: root.getPropertyValue("--ic-edge-w").trim(),
      key: getComputedStyle(document.querySelector("symbol .ic-cap > rect")!).opacity,
      stroke: getComputedStyle(document.querySelector("symbol .ic-cap > g")!).strokeWidth,
      stored: localStorage.getItem("icons"),
    };
  });
  const choose = async (name: string) => {
    await page.getByLabel("Fichier et réglages").click();
    const styles = page.getByRole("group", { name: "Style des icônes" });
    await styles.getByRole("button", { name, exact: true }).click();
    await expect(styles.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Fichier et réglages").click();
  };
  // By default: white volumes on their keys.
  const volumes = await look();
  expect(volumes).toMatchObject({ icons: "", face: "rgb(255, 255, 255)", edge: "", key: "1", stroke: "1.35px" });

  // Line icons: the faces the colour of the panel (not white), thick edges in the ink, no key.
  await choose("Contour");
  const contour = await look();
  expect(contour).toMatchObject({ icons: "icons-contour", edge: ".9", key: "0", stroke: "1.6px", stored: "icons-contour" });
  expect(contour.face).not.toBe(volumes.face);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect((await look()).icons).toBe("icons-contour");

  // Solid glyphs: the faces in the ink (light on the dark theme), parted by a hairline.
  await choose("Plein");
  expect(await look()).toMatchObject({ icons: "icons-plein", face: "rgb(238, 242, 247)", edge: ".55", key: "0", stroke: "2.3px" });

  // Two tones: a tint of the accent, neither the panel's colour nor the ink.
  await choose("Deux tons");
  const duo = await look();
  expect(duo).toMatchObject({ icons: "icons-duo", edge: ".5", key: "0" });
  expect([volumes.face, contour.face, "rgb(238, 242, 247)"]).not.toContain(duo.face);

  await choose("Volumes");
  expect(await look()).toMatchObject({ icons: "", face: volumes.face, edge: "", key: "1", stroke: "1.35px", stored: "" });
  expect(errors).toEqual([]);
});
