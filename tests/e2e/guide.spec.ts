/**
 * Les captures du guide utilisateur (templates/guide.html, page /guide/) : le parcours réel d'une cuisine et d'un
 * dressing, de l'accueil au devis. Seulement sur demande, pour les refaire après un changement de l'interface :
 *   GUIDE=1 npx playwright test tests/e2e/guide.spec.ts
 * Les images vont dans static/guide/.
 */
import { expect, test, type Page } from "@playwright/test";
import { joinStaff, newProject } from "./helpers";

const OUT = "static/guide";
const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
const ready = (page: Page) => expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });

test.skip(!process.env.GUIDE, "Les captures du guide se refont sur demande (GUIDE=1).");
test.setTimeout(240_000);

test("guide : une cuisine et un dressing, de l'accueil au devis", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await newProject(page, "Buffet du salon");
  // The workshop's settings, as its staff sees them.
  joinStaff();
  // As a new user: the steps, not the whole ribbon.
  await page.evaluate(() => localStorage.setItem("cao.steps-ribbon", "0"));

  // 1. A kitchen from the home page.
  await page.goto("/projects/");
  await page.fill("#space-name", "Cuisine Dupont");
  await page.getByRole("button", { name: "Créer une cuisine" }).click();
  await page.waitForURL("**/editor/**");
  await ready(page);
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, "02-plan-de-cuisine");
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator("[data-propose]").click();
  await expect(page.getByText("Plan de travail A").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot(page, "03-cuisine-proposee");

  // 2. A run, unit by unit.
  await plan.locator('[data-open-run="A"]').click();
  await page.waitForTimeout(800);
  await shot(page, "04-lineaire");
  await plan.getByRole("button", { name: "Annuler" }).click();

  // 3. The steps: the appliances.
  const steps = page.locator("[data-steps]");
  await steps.locator('[data-step="appliances"]').click();
  await steps.getByRole("button", { name: "Électroménager", exact: true }).click();
  await page.waitForTimeout(800);
  await shot(page, "05-electromenager");
  await page.getByRole("dialog", { name: "Électroménager" }).getByRole("button", { name: "Fermer" }).click();

  // 4. For the workshop: the cut list.
  await steps.locator('[data-step="check"]').click();
  await steps.getByRole("button", { name: "Liste de débit", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Liste de débit" })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "06-liste-de-debit");
  await page.getByRole("dialog", { name: "Liste de débit" }).getByRole("button", { name: "Fermer" }).first().click();

  // 5. For the client: the quote.
  await steps.locator('[data-step="quote"]').click();
  await steps.getByRole("button", { name: "Devis", exact: true }).click();
  await page.waitForTimeout(800);
  await shot(page, "07-devis");
  await page.keyboard.press("Escape");

  // 6. The project's sheet, the dashboard.
  await page.locator("[data-project-menu] summary").click();
  await page.getByRole("menuitem", { name: "Fiche du projet" }).click();
  await page.fill("#id_client_name", "M. et Mme Dupont");
  await page.fill("#id_client_phone", "06 12 34 56 78");
  await page.fill("#id_client_address", "12 rue des Tilleuls, Lyon");
  await page.selectOption("#id_status", "quoted");
  await page.fill("#id_install_date", "2027-01-18");
  await page.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await shot(page, "08-fiche-projet");

  // 7. A dressing from the home page, its plan filled.
  await page.goto("/projects/");
  await page.fill("#space-name", "Dressing Martin");
  await page.getByRole("button", { name: "Créer un dressing" }).click();
  await page.waitForURL("**/editor/**");
  await ready(page);
  const dressing = page.getByRole("dialog", { name: "Plan de dressing" });
  await dressing.getByRole("button", { name: "Droit", exact: true }).click();
  await dressing.getByLabel(/^Longueur mur A/).fill("240");
  await dressing.getByLabel(/^Longueur mur A/).press("Enter");
  await dressing.getByRole("button", { name: "Créer le plan" }).click();
  await dressing.getByRole("button", { name: "Remplir", exact: true }).click();
  await dressing.getByRole("button", { name: /^4 caissons égaux/ }).click();
  await expect(page.getByText(/Mur A remplie/)).toBeVisible();
  // Seen from the front, the whole of it.
  await page.waitForTimeout(1500);
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  // The messages gone.
  await page.waitForTimeout(6000);
  await shot(page, "09-dressing");

  // 8. The home page, its dashboard; the workshop's settings.
  await page.goto("/projects/");
  await page.screenshot({ path: `${OUT}/01-accueil.png`, fullPage: true });
  await page.goto("/catalogue/tarifs/");
  await shot(page, "10-parametres");
});
