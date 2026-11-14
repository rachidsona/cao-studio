/** Plan technique : une cuisine proposée, son plan pour le plombier et l'électricien, mur par mur, en PDF. */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("la cuisine proposée donne son plan technique : l'eau sous l'évier, la plaque, les prises, et le PDF", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-plan-technique");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.locator("[data-propose]").click();
  // Asked to confirm only when a run already has units.
  const confirm = page.getByRole("button", { name: "Proposer", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByText("Plan de travail B").first()).toBeVisible({ timeout: 60_000 });

  await click(page, '[data-workshop="tech-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan technique" });
  await expect(plan).toBeVisible();
  await expect(plan.locator("[data-tech-wall]").first()).toBeVisible();
  const text = (await plan.innerText()).replace(/\s+/g, " ");
  for (const label of ["Eau chaude", "Eau froide", "Évacuation Ø40", "Sortie de câble plaque 32 A", "Prise plan de travail 16 A"]) expect(text).toContain(label);
  expect(text).not.toContain("Aucun évier");
  // One sink: its hot water once.
  expect(await plan.evaluate((e) => [...e.querySelectorAll("text")].filter((t) => t.textContent === "Eau chaude").length)).toBe(1);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/plan-technique.png` });
  const [download] = await Promise.all([page.waitForEvent("download"), plan.getByRole("button", { name: "Fichier PDF" }).click()]);
  expect(download.suggestedFilename()).toMatch(/plan technique\.pdf$/);
  const pdf = readFileSync((await download.path())!, "latin1");
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(Number(/\/Count (\d+)/.exec(pdf)![1])).toBe(await plan.locator("[data-tech-wall]").count());
  expect(errors).toEqual([]);
});
