/** Planche de présentation : un meuble posé, la planche remplie pour le client, imprimée avec ses trois vues et son prix. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("la planche de présentation : client, mot, vues, matières, rangements et prix, imprimée", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-planche-client");
  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("bookcase");
  await tool.getByRole("combobox", { name: "Matière" }).selectOption("melamine-oak");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bibliothèque 1 » posé")).toBeVisible();
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await click(page, '[data-action="view"][data-view="iso"]');
  await page.waitForTimeout(800);

  await click(page, '[data-workshop="board"]');
  const board = page.getByRole("dialog", { name: "Planche de présentation" });
  await expect(board.locator("[data-board-facts]")).toContainText("Mélaminé chêne");
  await expect(board.locator("[data-board-facts]")).toContainText("Composition : Bibliothèque 1");
  await board.getByRole("textbox", { name: "Client", exact: true }).fill("M. et Mme Martin");
  await board.getByRole("textbox", { name: "Mot pour le client" }).fill("Une bibliothèque en chêne, à vos cotes.");
  await page.evaluate(() => (window.print = () => undefined));
  await page.evaluate(() => {
    // The printed page, kept before its frame goes.
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n instanceof HTMLIFrameElement) setTimeout(() => ((window as unknown as { board: string }).board = n.contentDocument?.documentElement.outerHTML ?? ""), 50);
    }).observe(document.body, { childList: true });
  });
  await board.getByRole("button", { name: "Imprimer / PDF" }).click();
  const html = await expect.poll(() => page.evaluate(() => (window as unknown as { board?: string }).board ?? ""), { timeout: 10_000 }).not.toBe("").then(() => page.evaluate(() => (window as unknown as { board: string }).board));
  expect(html).toContain("Pour M. et Mme Martin");
  expect(html).toContain("Une bibliothèque en chêne, à vos cotes.");
  expect(html.match(/<img [^>]*src="data:image\/png/g)?.length).toBe(3);
  expect(html).toContain("Mélaminé chêne");
  expect(html).toContain("Prix TTC");
  expect(html).toContain("Bibliothèque 1");
  if (process.env.SHOTS) {
    const sheet = await context.newPage();
    await sheet.setViewportSize({ width: 1587, height: 1123 });
    await sheet.setContent(html);
    await sheet.waitForTimeout(300);
    await sheet.screenshot({ path: `${process.env.SHOTS}/planche.png` });
  }
  expect(errors).toEqual([]);
});
