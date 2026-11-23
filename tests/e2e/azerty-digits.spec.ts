/** Sans Maj ni Verr. Maj, la rangée des chiffres d'un clavier AZERTY tape des chiffres partout où l'on saisit un nombre. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
/** The keys of the digit row as an AZERTY keyboard gives them without Maj: & é " ' ( § è ! ç à. */
const AZERTY: Record<string, string> = { "1": "&", "2": "é", "3": '"', "4": "'", "5": "(", "6": "§", "7": "è", "8": "!", "9": "ç", "0": "à" };
/** Types digits as those keys, at the element focused (or the window): what an AZERTY keyboard sends. */
async function typeAzerty(page: Page, digits: string): Promise<void> {
  await page.evaluate(
    ({ digits, azerty }) => {
      for (const d of digits) {
        const target = (document.activeElement as HTMLElement | null) ?? document.body;
        const event = new KeyboardEvent("keydown", { key: azerty[d] ?? d, code: /[0-9]/.test(d) ? `Digit${d}` : "", bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        // What the browser would type when nothing took the key: its sign, not its digit.
        if (!event.defaultPrevented && target instanceof HTMLInputElement) target.value += azerty[d] ?? d;
      }
    },
    { digits, azerty: AZERTY },
  );
}

test("la rangée des chiffres sans Maj tape des chiffres : dans un champ, dans la case des mesures, sur toute page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-chiffres-azerty");

  // Magie extrude, the distance typed without a field: in the value box.
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1000);
  await click(page, '[data-action="face-strip"]');
  const values = page.getByRole("status", { name: "Mesures" });
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  let started = false;
  for (const fx of [0.044, 0.047, 0.041, 0.05, 0.038]) {
    await page.mouse.move(view.x + view.width * fx, view.y + view.height * 0.42);
    await page.waitForTimeout(400);
    await page.mouse.move(view.x + view.width * fx + 1, view.y + view.height * 0.42);
    if ((await values.textContent())?.includes("part de cette arête")) {
      await page.mouse.click(view.x + view.width * fx + 1, view.y + view.height * 0.42);
      started = true;
      break;
    }
  }
  expect(started).toBe(true);
  await page.mouse.move(view.x + view.width * 0.4, view.y + view.height * 0.45);
  await page.locator("canvas.cad-view").focus().catch(() => {});
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await typeAzerty(page, "25");
  await expect(values).toContainText("25▏");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");


  // A field of a tool: « & é » are 1 2 (the plate seen first: the cabinet made here would change the view).
  await click(page, '[data-action="cabinet"]');
  const tool = page.getByRole("dialog", { name: "Caisson" });
  const width = tool.getByRole("textbox", { name: /^Largeur/ });
  await width.click();
  await width.fill("");
  await typeAzerty(page, "12");
  await expect(width).toHaveValue("12");
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();

  // Any page: a number field there takes them too (the rule of the base page).
  await page.goto("/projects/");
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.id = "zz-number";
    document.body.append(input);
    input.focus();
  });
  await typeAzerty(page, "3");
  await expect(page.locator("#zz-number")).toHaveValue("3");
  expect(errors).toEqual([]);
});

test("Extrusion après la Magie extrusion : un menu du panneau choisi, les chiffres tapés vont quand même à la distance", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-chiffres-menu");
  await click(page, '[data-action="view"][data-view="top"]');
  await page.waitForTimeout(1200);
  const v = (await page.locator("canvas.cad-view").boundingBox())!;
  // A rectangle on the grid, pulled: the Extrusion opens.
  await click(page, '[data-action="face-strip"]');
  const magic = page.getByRole("dialog", { name: "Magie extrusion" });
  await magic.getByRole("combobox", { name: "Tracé" }).selectOption("rectangle");
  await magic.getByRole("checkbox", { name: "Puis tirer / pousser" }).check();
  const [x0, y0] = [v.x + v.width * 0.15, v.y + v.height * 0.2];
  await page.mouse.move(x0, y0);
  await page.mouse.move(x0 + 1, y0);
  await page.mouse.click(x0 + 1, y0);
  await page.mouse.move(x0 + 120, y0 + 80);
  await page.mouse.click(x0 + 120, y0 + 80);
  await expect(page.locator("#editor")).toHaveAttribute("data-tool", "extrude", { timeout: 30_000 });
  // « Opération » just chosen keeps the focus: « é ( » still go to the distance (25), without Maj.
  await page.getByRole("combobox", { name: /Opération/ }).first().focus();
  await typeAzerty(page, "25");
  await expect(page.getByLabel(/^Distance/).first()).toHaveValue("25");
  expect(errors).toEqual([]);
});
