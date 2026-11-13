/** « Vider un corps » : un corps vidé à l'épaisseur saisie, ses côtés joints ou chacun à part. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("un corps se vide à l'épaisseur saisie, côtés joints puis chaque côté seul, et se rouvre depuis l'historique", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-vider-un-corps");
  const tree = page.getByLabel(/^Navigateur : corps/);
  const status = page.locator('[data-ref="status-recompute"]');
  const shell = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    return page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string }[] } }).document.features.find((f) => f.type === "shell"), api);
  };

  // The plate of the project (80 × 50 × 10 mm, a hole through it), chosen in the browser, then the tool.
  await tree.getByText("Corps 1", { exact: true }).first().click();
  await click(page, '[data-action="hollow"]');
  const tool = page.getByRole("dialog", { name: "Vider un corps" });
  await expect(tool).toBeVisible();
  // As a caisson at first: each side on its own, butted, front and back open once its front is clicked.
  await expect(tool.getByRole("combobox", { name: "Côtés" })).toHaveValue("separate");
  await expect(tool.getByRole("combobox", { name: "Assemblage" })).toHaveValue("butt");
  await expect(tool.getByRole("combobox", { name: "Ouvertures" })).toHaveValue("through");
  // Sides 2 mm thick (the project counts in cm), joined: one hollow body, nothing open yet.
  const thickness = tool.getByRole("textbox", { name: "Épaisseur des côtés" });
  await thickness.fill("0,2");
  await thickness.press("Tab");
  await tool.getByRole("combobox", { name: "Côtés" }).selectOption("joined");
  await expect(tool.getByRole("combobox", { name: "Assemblage" })).toHaveCount(0);
  await expect(tool.getByRole("alert")).toHaveCount(0);
  await expect(status).not.toContainText("erreur");
  // Stored a moment after the setting is valid.
  await expect.poll(shell, { timeout: 30_000 }).toMatchObject({ name: "Corps vidé 1", target: "h1", faces: [], thickness: 2, sides: "joined" });

  // Each side on its own: its six flat sides boards, the wall of its hole one body more.
  await tool.getByRole("combobox", { name: "Côtés" }).selectOption("separate");
  await expect(tree.getByText("Corps vidé 1", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("côté 7", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("côté 8", { exact: true })).toHaveCount(0);
  await expect(status).not.toContainText("erreur");
  await expect.poll(shell, { timeout: 30_000 }).toMatchObject({ sides: "separate", joint: "butt", thickness: 2 });

  // Its top clicked, seen from above: its front — it and the face behind it open, the four sides around left (and
  // the wall of the hole): a caisson.
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width * 0.5 + 120, view.y + view.height * 0.5);
  await expect(tool).toContainText("2 face(s) ouverte(s)");
  await expect(tree.getByText("côté 5", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("côté 6", { exact: true })).toHaveCount(0);
  await expect.poll(async () => ((await shell()) as { faces?: unknown[] } | undefined)?.faces?.length, { timeout: 30_000 }).toBe(2);
  // « Le devant seul »: the face behind is closed again.
  await tool.getByRole("combobox", { name: "Ouvertures" }).selectOption("face");
  await expect(tool).toContainText("1 face(s) ouverte(s)");
  await expect(tree.getByText("côté 6", { exact: true }).first()).toBeVisible();
  await tool.getByRole("combobox", { name: "Ouvertures" }).selectOption("through");
  await expect(tool).toContainText("2 face(s) ouverte(s)");
  await expect(tree.getByText("côté 6", { exact: true })).toHaveCount(0);
  await expect(status).not.toContainText("erreur");
  // « Fond »: a back of its own closes the opening behind — inset between the sides, then screwed on behind.
  await tool.getByRole("combobox", { name: "Fond" }).selectOption("inset");
  await expect(tool.getByRole("textbox", { name: "Épaisseur du fond" })).toHaveValue("0,8");
  await expect(tree.getByText("fond", { exact: true }).first()).toBeVisible();
  await expect(status).not.toContainText("erreur");
  await expect.poll(async () => ((await shell()) as { back?: { mount: string; thickness: number } } | undefined)?.back, { timeout: 30_000 }).toMatchObject({ mount: "inset", thickness: 8 });
  await tool.getByRole("combobox", { name: "Fond" }).selectOption("applied");
  await expect.poll(async () => ((await shell()) as { back?: { mount: string } } | undefined)?.back?.mount, { timeout: 30_000 }).toBe("applied");
  await expect(status).not.toContainText("erreur");
  await click(page, '[data-action="view"][data-view="iso"]');
  await page.waitForTimeout(900);
  await shot(page, "vider-un-corps");
  // Without it again, for what follows.
  await tool.getByRole("combobox", { name: "Fond" }).selectOption("none");
  await expect(tree.getByText("fond", { exact: true })).toHaveCount(0);
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);

  // A side of it is not emptied in its turn: the tool says where to change it, and waits for another body.
  await tree.getByText("côté 1", { exact: true }).first().click();
  await click(page, '[data-action="hollow"]');
  await expect(page.getByText(/est un côté de « Corps vidé 1 », déjà vidé/).first()).toBeVisible();
  await expect(tool).toContainText("Cliquez le corps à vider");
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(tool).toHaveCount(0);

  // From the history, it is the same tool again, as it was set.
  await page.getByRole("toolbar", { name: "Historique des opérations" }).locator('[data-op="sh1"]').click();
  await page.getByRole("dialog", { name: "Coque Corps vidé 1" }).getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(tool).toBeVisible();
  await expect(tool.getByRole("combobox", { name: "Côtés" })).toHaveValue("separate");
  await expect(tool).toContainText("2 face(s) ouverte(s)");
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();
  expect(errors).toEqual([]);
});
