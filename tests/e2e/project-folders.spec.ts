/** Les dossiers de « Mes projets » : en créer un, y ranger des projets cochés, ne montrer que lui, le supprimer. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("ranger des projets dans un dossier, ne montrer que lui, puis le supprimer sans perdre les projets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Cuisine Dupont");
  await page.goto("/projects/");
  await page.getByRole("button", { name: "Créer et ouvrir" }).waitFor();
  // A second project, from the home page.
  await page.fill("#id_name", "Meuble télé");
  await page.getByRole("button", { name: "Créer et ouvrir" }).click();
  await page.waitForURL("**/editor/");
  await page.goto("/projects/");
  const folders = page.getByRole("navigation", { name: "Dossiers de projets" });
  await folders.getByText("+ Nouveau dossier").click();
  await folders.getByRole("textbox", { name: "Nom du nouveau dossier" }).fill("Clients 2026");
  await folders.getByRole("button", { name: "Créer" }).click();
  await expect(folders.getByRole("link", { name: /Clients 2026/ })).toHaveAttribute("aria-current", "true");
  // Back to all, tick one, put it in the folder.
  await folders.getByRole("link", { name: "Tous les dossiers" }).click();
  await page.getByRole("checkbox", { name: "Sélectionner Cuisine Dupont" }).check();
  await page.getByRole("combobox", { name: "Ranger dans le dossier" }).selectOption({ label: "Clients 2026" });
  await page.getByRole("button", { name: "Ranger", exact: true }).click();
  await expect(page.getByText("1 projet rangé dans « Clients 2026 ».")).toBeVisible();
  const rows = page.locator("[data-project-row]");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Cuisine Dupont");
  // Deleted: the project stays, out of any folder.
  await page.locator("[data-folder-tools]").getByRole("button", { name: "Supprimer le dossier" }).click();
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByText(/Dossier « Clients 2026 » supprimé/)).toBeVisible();
  await expect(page.locator("[data-project-row]")).toHaveCount(2);
  expect(errors).toEqual([]);
});
