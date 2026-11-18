/** Les murs du dressing en haut du panneau d'une Répartition, comme les linéaires de la cuisine : passer d'un mur à l'autre, voir un mur isolé. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const action = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const planTool = (page: Page) => page.getByRole("dialog", { name: "Plan de dressing" });

test("panneau Répartition : un bouton par mur, un autre mur ouvert d'un clic (fait d'abord s'il ne l'est pas), voir le mur isolé puis tout montrer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Murs du dressing e2e");
  await action(page, '[data-workshop="dressing-plan"]');
  const tool = planTool(page);
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  const zones = tool.getByRole("list", { name: "Zones du plan" });
  await expect(zones).toBeVisible();
  const count = await zones.getByRole("listitem").count();
  expect(count).toBeGreaterThanOrEqual(2);
  // The first wall made and opened in its Répartition.
  await zones.getByRole("listitem").first().getByRole("button", { name: /^(Modifier|Répartition)$/ }).click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await expect(partition).toBeVisible();
  const walls = partition.getByRole("group", { name: "Murs du dressing" });
  await expect(walls.getByRole("button")).toHaveCount(count);
  await expect(walls.getByRole("button", { pressed: true })).toHaveCount(1);
  const first = (await walls.getByRole("button", { pressed: true }).textContent())!;
  await expect(partition.getByRole("heading", { level: 2 })).toContainText(first.toLowerCase());

  // Seen alone, then everything again.
  const see = partition.locator("[data-see-wall]");
  await expect(see).toHaveText(`Voir ${first.charAt(0).toLowerCase()}${first.slice(1)} isolé`);
  await see.click();
  await expect(see).toHaveText("Tout montrer");

  // Another wall, not made yet: made, opened, and the one seen alone now.
  const other = walls.getByRole("button", { pressed: false }).first();
  const name = (await other.textContent())!;
  await other.click();
  await expect(partition.getByRole("heading", { level: 2 })).toContainText(name.toLowerCase());
  await expect(walls.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(partition.locator("[data-see-wall]")).toHaveText("Tout montrer");
  await partition.screenshot({ path: "test-results/dressing-walls.png" });
  await partition.locator("[data-see-wall]").click();
  await expect(partition.locator("[data-see-wall]")).toHaveText(`Voir ${name.charAt(0).toLowerCase()}${name.slice(1)} isolé`);

  // Back to the first one.
  await walls.getByRole("button", { name: first, exact: true }).click();
  await expect(partition.getByRole("heading", { level: 2 })).toContainText(first.toLowerCase());
  expect(errors).toEqual([]);
});
