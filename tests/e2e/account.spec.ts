/**
 * « Mon compte » (audit de sécurité du 10/11/2026, constat L10) : on y arrive par son nom dans l'en-tête, on change
 * son mot de passe, on télécharge le ZIP de ses données, puis on supprime son compte, qui ne se connecte plus.
 */
import { expect, test } from "@playwright/test";

test("mon compte : mot de passe, export de mes données, suppression", async ({ page }) => {
  const user = `compte${Date.now()}`;
  const first = `Copeau-${Math.random().toString(36).slice(2, 10)}-Chene`;
  const second = `Rabot-${Math.random().toString(36).slice(2, 10)}-Frene`;
  await page.goto("/accounts/signup/");
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password1"]', first);
  await page.fill('input[name="password2"]', first);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL("**/projects/");

  await page.getByRole("link", { name: user }).click();
  await expect(page.getByRole("heading", { name: "Mon compte", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Changer mon mot de passe" }).click();
  await page.fill('input[name="old_password"]', first);
  await page.fill('input[name="new_password1"]', second);
  await page.fill('input[name="new_password2"]', second);
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(page.getByText("Mot de passe changé.")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Télécharger le ZIP" }).click();
  expect((await download).suggestedFilename()).toMatch(/^cao-studio-\d{4}-\d{2}-\d{2}\.zip$/);

  await page.fill('input[name="password"]', second);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await page.waitForURL("**/accounts/login/");
  await expect(page.getByText("Votre compte et toutes ses données ont été supprimés.")).toBeVisible();
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password"]', second);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/accounts\/login/);
});
