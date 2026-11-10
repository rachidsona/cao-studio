/**
 * La Content-Security-Policy (config/settings.py, audit de sécurité du 10/11/2026, constat 7) ne bloque rien de ce que
 * fait l'application : les pages, le noyau OpenCascade et son worker, le solveur d'esquisses, le devis et son
 * impression, le rendu, la page publique d'un lien client avec son modèle 3D, les paramètres de l'atelier et le guide.
 * Chaque page compte ses violations (événement securitypolicyviolation) : il n'y en a aucune.
 */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

/** Every page opened from now on records the CSP violations it meets. */
async function watchCsp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { cspViolations: string[] }).cspViolations = seen;
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ← ${e.blockedURI || "inline"} (${e.sourceFile}:${e.lineNumber})`));
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { cspViolations?: string[] }).cspViolations ?? []);
const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("la CSP est envoyée et ne bloque rien : éditeur, devis, impression, rendu, lien client, atelier, guide", async ({ page, context }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await watchCsp(page);
  const api = await newProject(page, "CSP e2e");
  // The header, with the nonce of the inline scripts.
  const header = (await page.request.get("/projects/")).headers()["content-security-policy"] ?? "";
  expect(header).toContain("script-src 'self' 'nonce-");
  expect(header).toContain("'wasm-unsafe-eval'");
  expect(header).toContain("object-src 'none'");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect(await violations(page)).toEqual([]);

  // The example: the kernel computes six panels; the quote, then its print (a frame written by the page).
  await page.goto("/projects/");
  await page.getByRole("button", { name: "Ouvrir le projet exemple" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await click(page, '[data-workshop="quote"]');
  const quote = page.getByRole("dialog", { name: "Devis" });
  await expect(quote).toBeVisible();
  await page.evaluate(() => (window.print = () => undefined));
  await quote.getByRole("button", { name: "Imprimer / PDF" }).click();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  // The render mode (path tracing).
  await click(page, '[data-action="render-mode"]');
  await expect(page.locator("[data-render-status]")).toContainText("échantillons", { timeout: 60_000 });
  await click(page, '[data-action="render-mode"]');
  expect(await violations(page)).toEqual([]);

  // A client link: its public page shows the model (GLB), anonymous.
  await click(page, '[data-workshop="share"]');
  const share = page.getByRole("dialog", { name: "Lien client" });
  await share.getByRole("button", { name: "Créer un lien client" }).click();
  const shares = page.url().replace(/\/projects\/([^/]+)\/editor.*/, "/api/projects/$1/shares/");
  const firstLink = async () => ((await (await page.request.get(shares)).json()) as { shares: { url: string }[] }).shares[0]?.url ?? "";
  await expect.poll(firstLink, { timeout: 30_000 }).not.toBe("");
  const link = await firstLink();
  const visitor = await context.browser()!.newContext();
  const client = await visitor.newPage();
  await watchCsp(client);
  const clientErrors: string[] = [];
  client.on("pageerror", (error) => clientErrors.push(error.message));
  const model = client.waitForResponse((r) => r.url().endsWith("/model.glb"));
  await client.goto(link);
  expect((await model).status()).toBe(200);
  await client.waitForTimeout(2000);
  expect(await violations(client)).toEqual([]);
  expect(clientErrors).toEqual([]);
  await visitor.close();

  // The workshop's settings and the guide.
  for (const path of ["/catalogue/materiaux/", "/catalogue/tarifs/", "/guide/", "/accounts/login/"]) {
    await page.goto(path);
    await page.waitForTimeout(500);
    expect(await violations(page), path).toEqual([]);
  }
  expect(api).toContain("/api/projects/");
  expect(errors).toEqual([]);
});
