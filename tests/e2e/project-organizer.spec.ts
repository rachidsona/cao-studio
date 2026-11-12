/** La colonne « Projets » de l'éditeur : un dossier créé, un projet glissé dedans, un autre ouvert en onglet, la colonne repliée. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("la colonne Projets range les projets dans des dossiers et se replie", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1500, height: 900 });
  const api = await newProject(page, "zz-colonne-projets");
  // A second project of the same account, by the API.
  const other = await page.evaluate(async () => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const response = await fetch("/api/projects/", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ name: "zz-autre-projet" }) });
    return ((await response.json()) as { id: string }).id;
  });
  // The column (switched off for the older tests, which click the view by its coordinates).
  await page.evaluate(() => localStorage.removeItem("cao.tool-columns-off"));
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const column = page.locator("[data-project-organizer]");
  await expect(column).toBeVisible();
  const unfiled = column.locator('[data-folder-group="none"]');
  await expect(unfiled.locator("[data-organizer-project]")).toHaveCount(2);
  await expect(column.locator('[aria-current="page"]')).toHaveText("zz-colonne-projets");

  // A folder, named in place.
  await column.locator("[data-organizer-new-folder]").click();
  await column.locator("[data-organizer-name]").fill("Clients 2026");
  await column.locator("[data-organizer-name]").press("Enter");
  const folder = column.locator("[data-folder-group]").filter({ hasText: "Clients 2026" });
  await expect(folder).toBeVisible();
  // Its icon drawn in orange.
  await expect(folder.locator("[data-folder-icon]")).toHaveCSS("color", /^(rgb\(25[0-5], 1[0-4]\d, \d+\)|oklch\(0\.7)/);

  // The other project dragged onto it; the server keeps it there.
  await unfiled.locator(`[data-organizer-project="${other}"]`).dragTo(folder.locator("[data-folder-head]"));
  await expect(folder.locator(`[data-organizer-project="${other}"]`)).toBeVisible();
  await expect
    .poll(async () => page.evaluate(async () => ((await (await fetch("/api/folders/")).json()) as { projects: { name: string; folder: number | null }[] }).projects.find((p) => p.name === "zz-autre-projet")?.folder))
    .not.toBeNull();
  // This project by its ⋯ menu.
  const mine = api.split("/")[3];
  await column.locator(`[data-organizer-move="${mine}"]`).click();
  await page.getByRole("menuitem", { name: "Ranger dans « Clients 2026 »" }).click();
  await expect(folder.locator("[data-organizer-project]")).toHaveCount(2);
  await expect(unfiled).toContainText("Aucun");
  await shot(page, "colonne-projets");

  // A click on the other project opens it in a tab.
  await folder.locator(`[data-organizer-open="${other}"]`).click();
  await expect(page.locator('[data-ref="project-tabs"] [role="tab"]')).toHaveCount(2);
  await expect(page).toHaveURL(new RegExp(`${other}/editor/`));
  // Its editor, in its frame, has the column too, with that project in blue; back to the first tab from there.
  const frame = page.frameLocator(`[data-project-frame="${other}"]`);
  await expect(frame.locator('[data-project-organizer] [aria-current="page"]')).toHaveText("zz-autre-projet", { timeout: 60_000 });
  await frame.locator('[data-ref="project-tabs"] [role="tab"]').first().click();
  await expect(page.locator(`[data-project-frame="${other}"]`)).toBeHidden();

  // Folded away, the tab « Projets » brings it back; kept on reload.
  await column.locator("[data-organizer-fold]").click();
  await expect(column).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator("[data-project-organizer]")).toBeHidden();
  await page.locator("[data-organizer-unfold]").click();
  await expect(page.locator("[data-project-organizer]")).toBeVisible();
  expect(errors).toEqual([]);
});

test("la colonne Projets supprime un projet (⋯ ou Suppr), vide un dossier, et quitte la page dont le projet est supprimé", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1500, height: 900 });
  await newProject(page, "zz-page-supprimee");
  const made = await page.evaluate(async () => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const send = (url: string, method: string, body: unknown) =>
      fetch(url, { method, headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify(body) }).then((r) => r.json());
    const ids: string[] = [];
    for (const name of ["zz-a-vider-1", "zz-a-vider-2", "zz-par-menu", "zz-par-suppr"]) ids.push(((await send("/api/projects/", "POST", { name })) as { id: string }).id);
    const folder = (await send("/api/folders/", "POST", { name: "Vieux" })) as { id: number };
    for (const id of ids.slice(0, 2)) await send(`/api/projects/${id}/folder/`, "PUT", { folder: folder.id });
    return ids;
  });
  await page.evaluate(() => localStorage.removeItem("cao.tool-columns-off"));
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const column = page.locator("[data-project-organizer]");
  await expect(column.locator("[data-organizer-project]")).toHaveCount(5);
  const confirm = (label: string) => page.getByRole("button", { name: label, exact: true }).click();

  // Emptied: its two projects gone for good, the folder stays.
  const old = column.locator("[data-folder-group]").filter({ hasText: "Vieux" });
  await old.locator("[data-folder-more]").click();
  await page.getByRole("menuitem", { name: /Vider le dossier/ }).click();
  await confirm("Vider le dossier");
  await expect(old.locator("[data-organizer-project]")).toHaveCount(0);
  await expect(old).toBeVisible();

  // One by its ⋯ menu, one by the Suppr key; the editor's own selection is not touched.
  await column.locator(`[data-organizer-move="${made[2]}"]`).click();
  await page.getByRole("menuitem", { name: "Supprimer le projet…" }).click();
  await confirm("Supprimer le projet");
  await expect(column.locator(`[data-organizer-project="${made[2]}"]`)).toHaveCount(0);
  await column.locator(`[data-organizer-open="${made[3]}"]`).focus();
  await page.keyboard.press("Delete");
  await confirm("Supprimer le projet");
  await expect(column.locator(`[data-organizer-project="${made[3]}"]`)).toHaveCount(0);
  const left = await page.evaluate(async () => ((await (await fetch("/api/folders/")).json()) as { projects: { name: string }[] }).projects.map((p) => p.name));
  expect(left).toEqual(["zz-page-supprimee"]);

  // The page's own project: deleted, the editor goes back to « Mes projets ».
  await column.locator('[aria-current="page"]').focus();
  await page.keyboard.press("Delete");
  await confirm("Supprimer le projet");
  await page.waitForURL("**/projects/");
  expect(errors).toEqual([]);
});
