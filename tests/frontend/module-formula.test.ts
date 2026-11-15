/** The formulas of a module programmed: read and worked out without running any code, the same text giving the same number. */
import { describe, expect, it } from "vitest";
import { evaluateFormula, parseFormula, type Formula } from "../../frontend/src/document/module-formula";

const NAMES = ["largeur", "hauteur", "profondeur", "epaisseur", "pas"];
const NICHE = { largeur: 900, hauteur: 2100, profondeur: 600, epaisseur: 18, pas: 32 };

const read = (text: string): Formula => {
  const f = parseFormula(text, NAMES);
  if (typeof f === "string") throw new Error(f);
  return f;
};
const calc = (text: string, values: Record<string, number> = NICHE) => evaluateFormula(read(text), values);

describe("formules d'un module", () => {
  it("calculent : priorités, parenthèses, signes, puissance", () => {
    expect(calc("2 + 3 * 4")).toBe(14);
    expect(calc("(2 + 3) * 4")).toBe(20);
    expect(calc("-2 ^ 2")).toBe(-4);
    expect(calc("10 − 4 × 2 ÷ 4")).toBe(8);
    expect(calc("hauteur / 2 - epaisseur")).toBe(1032);
  });

  it("lisent les décimales à la virgule ou au point, et les unités métriques", () => {
    expect(calc("35 cm")).toBe(350);
    expect(calc("0,6 m")).toBe(600);
    expect(calc("1.5cm")).toBe(15);
    expect(calc("350 mm + 2")).toBe(352);
  });

  it("ont min, max, arrondi, plancher, plafond, avec un pas", () => {
    expect(calc("plancher(hauteur / 350)")).toBe(6);
    expect(calc("plancher(2099 / 350)")).toBe(5);
    expect(calc("plancher(0,7 / 0,1)")).toBe(7);
    expect(calc("plafond(1,2)")).toBe(2);
    expect(calc("arrondi(437; pas)")).toBe(448);
    expect(calc("plancher(437; 32)")).toBe(416);
    expect(calc("min(3; 5; 1)")).toBe(1);
    expect(calc("max(3, 5)")).toBe(5);
    expect(calc("abs(-4)")).toBe(4);
  });

  it("décident : comparaisons, si, et, ou, non", () => {
    expect(calc("si(largeur > 45 cm; 3; 0)")).toBe(3);
    expect(calc("si(largeur > 45 cm; 3; 0)", { ...NICHE, largeur: 400 })).toBe(0);
    expect(calc("largeur >= 900")).toBe(1);
    expect(calc("largeur <> 900")).toBe(0);
    expect(calc("et(largeur > 500; hauteur < 2000)")).toBe(0);
    expect(calc("ou(largeur > 500; hauteur < 2000)")).toBe(1);
    expect(calc("non(0)")).toBe(1);
    // Only the branch taken is worked out.
    expect(calc("si(1; 5; 1 / 0)")).toBe(5);
  });

  it("ne tiennent compte ni des accents ni des majuscules", () => {
    expect(calc("Épaisseur * 2")).toBe(36);
    expect(calc("HAUTEUR - 100")).toBe(2000);
  });

  it("donnent toujours le même résultat", () => {
    const f = read("plancher((hauteur - 2 * epaisseur) / 35 cm) - 1");
    expect(new Set(Array.from({ length: 5 }, () => evaluateFormula(f, NICHE)))).toEqual(new Set([4]));
  });

  it("disent en français ce qui ne va pas, la formule citée", () => {
    expect(parseFormula("plancher(hauteur / 350", NAMES)).toBe("formule « plancher(hauteur / 350 » : une parenthèse fermante manque pour « plancher( ».");
    expect(parseFormula("hauteurr / 2", NAMES)).toMatch(/^formule « hauteurr \/ 2 » : « hauteurr » n'est ni une variable de la niche ni un paramètre du module\.$/);
    expect(parseFormula("min(3,5)", NAMES)).toMatch(/min demande au moins deux valeurs, séparées par « ; »/);
    expect(parseFormula("", NAMES)).toMatch(/la formule est vide/);
    expect(parseFormula("2 +", NAMES)).toMatch(/une valeur manque à la fin/);
    expect(parseFormula("3 4", NAMES)).toMatch(/« 4 » est de trop/);
    expect(parseFormula("2)", NAMES)).toMatch(/parenthèse fermante est en trop/);
    expect(parseFormula("racine(4)", NAMES)).toMatch(/« racine » n'est pas une fonction connue/);
    expect(parseFormula("2 # 3", NAMES)).toMatch(/le caractère « # »/);
    expect(parseFormula("si(1; 2)", NAMES)).toMatch(/si demande trois valeurs/);
    expect(parseFormula("plancher + 1", NAMES)).toMatch(/plancher est une fonction/);
    expect(calc("2 / (largeur - largeur)")).toBe("formule « 2 / (largeur - largeur) » : division par zéro.");
    expect(calc("plancher(3; 0)")).toMatch(/le pas de plancher doit être positif/);
    expect(calc("10 ^ 400")).toMatch(/pas un nombre fini/);
  });

  it("n'exécutent aucun code", () => {
    for (const text of ["alert(1)", "constructor", "__proto__", "this.x", "process.exit()", "`x`", "a => a"]) expect(parseFormula(text, NAMES)).toEqual(expect.any(String));
  });
});

describe("la calculatrice d'une formule écrit sa cote avec son unité", () => {
  it("en cm, en m, en mm ; en pouces, en mm (les formules ne lisent pas les pouces) — et la formule relit la même cote", async () => {
    const { lengthText } = await import("../../frontend/src/app/dressing/module-formulas");
    expect(lengthText(300, "cm")).toBe("30 cm");
    expect(lengthText(18, "cm")).toBe("1,8 cm");
    expect(lengthText(1250, "m")).toBe("1,25 m");
    expect(lengthText(18, "mm")).toBe("18 mm");
    expect(lengthText(25.4, "in")).toBe("25,4 mm");
    for (const text of ["30 cm", "1,8 cm", "1,25 m", "25,4 mm"]) expect(evaluateFormula(read(text), NICHE)).toBeCloseTo({ "30 cm": 300, "1,8 cm": 18, "1,25 m": 1250, "25,4 mm": 25.4 }[text]!, 6);
  });
});
