/** La conception guidée du dressing dans un vrai navigateur : besoins, prix, coulissantes, pièce et accord du client. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const action = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const planTool = (page: Page) => page.getByRole("dialog", { name: "Plan de dressing" });
const zones = (page: Page) => planTool(page).getByRole("list", { name: "Zones du plan" });

test("besoins du client : modules posés d'un coup, prix en direct, portes coulissantes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Besoins e2e");
  await action(page, '[data-workshop="dressing-plan"]');
  const tool = planTool(page);
  await tool.getByRole("button", { name: "Droit", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await expect(zones(page)).toBeVisible();
  const price = tool.locator("[data-live-total]");
  await expect(price).toContainText("€");
  const before = await price.innerText();

  await tool.getByRole("button", { name: "Remplir selon les besoins" }).click();
  await tool.getByLabel("Penderie longue (m)").fill("0,9");
  await tool.getByLabel("Penderie courte (m)").fill("0");
  await tool.getByLabel("Chaussures (paires)").fill("0");
  await tool.getByLabel("Tiroirs", { exact: true }).fill("3");
  await tool.getByLabel("Étagères (m)").fill("0");
  await expect(tool.getByRole("list", { name: "Bilan des besoins" })).toContainText("Tiroirs");
  await tool.getByRole("button", { name: "Poser les modules" }).click();
  await expect(page.getByText("Modules posés sur 1 zone.")).toBeVisible();
  await expect(zones(page).getByRole("listitem").first()).toContainText("Modifier");
  await expect(page.getByText("Penderie 1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Tiroirs 1", { exact: true }).first()).toBeVisible();
  await expect(price).not.toHaveText(before);
  await expect(page.locator("[data-live-price]")).toBeVisible();

  await tool.getByLabel("Portes coulissantes, Mur A").selectOption("3");
  await expect(page.getByText("Porte coulissante A3", { exact: true }).first()).toBeVisible();
  await page.locator("[data-live-price]").click();
  await expect(page.getByRole("dialog", { name: "Devis" })).toContainText("Rail de porte coulissante");
  expect(errors).toEqual([]);
});

test("plan posé sur la pièce : longueurs reprises, panneaux sur le mur, et le contrôle voit ce qui gêne", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Pièce e2e");
  await action(page, '[data-action="room"]');
  const room = page.getByRole("dialog", { name: /Pièce/ });
  await room.getByRole("button", { name: "+ Fenêtre" }).click();
  await room.getByRole("button", { name: "OK", exact: true }).click();
  await expect(room).toHaveCount(0);
  await page.waitForTimeout(800);

  await action(page, '[data-workshop="dressing-plan"]');
  const tool = planTool(page);
  await tool.getByRole("button", { name: "Droit", exact: true }).click();
  const walls = tool.getByLabel("Mur A dans la pièce");
  await walls.selectOption({ index: 2 });
  await expect(tool.locator("[data-obstacle]")).toHaveCount(0);
  await walls.selectOption({ index: 1 });
  await expect(tool.locator('[data-obstacle="window"]')).toHaveCount(1);
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await expect(tool.locator("[data-plan-checks]")).toContainText("La fenêtre du mur A est derrière Mur A.");
  await zones(page).getByRole("listitem").first().getByRole("button").last().click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "OK", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await expect(page.getByText("Plan — mur a", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("accord du client : il accepte sur son lien, l'atelier le voit", async ({ page }) => {
  await newProject(page, "Accord e2e");
  await action(page, '[data-workshop="share"]');
  const dialog = page.getByRole("dialog", { name: "Lien client" });
  await dialog.getByRole("button", { name: "Créer un lien client" }).click();
  const address = dialog.getByRole("textbox", { name: /^Adresse du lien/ });
  await expect(address).toHaveCount(1);
  const url = await address.inputValue();

  const client = await page.context().newPage();
  await client.goto(url);
  await client.getByLabel("Votre nom").first().fill("Mme Martin");
  await client.getByRole("button", { name: "J'accepte ce projet" }).click();
  await expect(client.locator("[data-share-accept-text]")).toContainText("Projet accepté par Mme Martin");
  await client.reload();
  await expect(client.locator("[data-share-accept-text]")).toContainText("Projet accepté par Mme Martin");
  await client.close();

  await page.getByRole("button", { name: "Fermer" }).last().click();
  await action(page, '[data-workshop="share"]');
  await expect(page.getByRole("dialog", { name: "Lien client" })).toContainText("Accepté par Mme Martin");
});
