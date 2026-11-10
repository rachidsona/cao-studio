/**
 * Non-régression de sécurité (skill secure-application-guardian) : le HTML que l'éditeur génère échappe ce qui vient
 * des autres comptes (catalogue commun, profil de l'atelier) et des fichiers (noms de pièces, de matières). Une charge
 * <img onerror> ou <script> ne doit jamais ressortir telle quelle.
 */
import { describe, expect, it } from "vitest";
import { companyHeaderHtml, toMaterial } from "../../frontend/src/document/catalog";
import { applyExpressions, evaluate } from "../../frontend/src/document/expressions";
import { openedVariant } from "../../frontend/src/document/variants";
import { DEFAULT_RATES, makeQuote, quoteCsv } from "../../frontend/src/document/quote";
import { purchaseCsv } from "../../frontend/src/document/purchase";
import { DEFAULT_LABEL, labelHtml } from "../../frontend/src/document/label-template";
import { cutListCsv, type CutRow, type CutTotals } from "../../frontend/src/document/cut-list";
import { escapeHtml, pageHtml } from "../../frontend/src/app/workshop/workshop-ui";
import { withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { quoteHtml } from "../../frontend/src/app/workshop/quote-html";
import { cutSheetHtml } from "../../frontend/src/app/workshop/cut-list-view";
import { GCODE, gcodeComment, partsGcode } from "../../frontend/src/io/gcode";
import type { FlatEdge } from "../../frontend/src/io/dxf";
import { parseDxf, shapesBox } from "../../frontend/src/io/dxf-import";

const XSS = '<img src=x onerror="alert(1)">';
const raw = (html: string) => html.includes("<img src=x") || html.includes("<script");

describe("échappement du HTML généré", () => {
  it("escapeHtml neutralise les caractères du HTML", () => {
    expect(escapeHtml(`${XSS}&`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;");
  });

  it("l'en-tête des documents (profil de l'atelier commun) est échappé, et un logo n'est qu'une image en data URL", () => {
    const profile = { name: XSS, slogan: XSS, address: XSS, phone: XSS, email: XSS, website: XSS, logo: "javascript:alert(1)" };
    const html = companyHeaderHtml(profile);
    expect(raw(html)).toBe(false);
    expect(html).not.toContain("javascript:");
    expect(companyHeaderHtml({ ...profile, logo: "https://pirate.example/x.png" })).not.toContain("pirate.example");
    expect(companyHeaderHtml({ ...profile, logo: "data:image/png;base64,AAAA" })).toContain('src="data:image/png;base64,AAAA"');
  });

  it("le devis échappe les noms et les unités de la quincaillerie du catalogue (audit du 10/11/2026, constat 1)", () => {
    const html = quoteHtml(makeQuote([{ material: XSS, thickness: 19, area: 1, bandLength: 0, parts: 1 }], DEFAULT_RATES, [{ name: XSS, quantity: 2, unit: XSS, price: 1 }]));
    expect(raw(html)).toBe(false);
  });

  it("la liste de débit échappe les noms des pièces et des matières", () => {
    const row = { names: [XSS], quantity: 1, length: 1000, width: 400, thickness: 18, material: XSS, grain: "length", tag: XSS, edges: { length1: true, length2: false, width1: false, width2: false } } as unknown as CutRow;
    const totals: CutTotals[] = [{ material: XSS, thickness: 18, area: 0.4, bandLength: 1, parts: 1 }];
    expect(raw(cutSheetHtml([row], totals, "cm"))).toBe(false);
  });

  it("une étiquette échappe ses champs et son logo", () => {
    const html = labelHtml({ ...DEFAULT_LABEL, logo: `"><script>alert(1)</script>` }, { name: XSS, project: XSS, material: XSS, size: XSS, qr: "" } as never, escapeHtml);
    expect(raw(html)).toBe(false);
  });
});

describe("G-code : un nom ne devient jamais une commande (audit du 10/11/2026, H1)", () => {
  const line = (a: [number, number], b: [number, number]): FlatEdge => ({ kind: "line", a, b });
  const edges = [line([0, 0], [600, 0]), line([600, 0], [600, 400]), line([600, 400], [0, 400]), line([0, 400], [0, 0])];

  it("une parenthèse, un retour à la ligne ou un % dans un nom de pièce ou de matière restent dans le commentaire", () => {
    const name = "Côté) G0 X0 Y0 G1 Z-90 F9000 (\nG1 Z-200 F9000\r\n%";
    const { code } = partsGcode([{ label: "Mélaminé) M3 S1 (", size: [2800, 2070], parts: [{ name, thickness: 18, edges, width: 600, height: 400 }] }], GCODE);
    const lines = code.split("\n");
    expect(lines.some((l) => /Z-200|Z-90|M3 S1/.test(l) && !l.startsWith("("))).toBe(false);
    // Each comment is one comment: no « ( » or « ) » inside.
    for (const l of lines.filter((l) => l.startsWith("("))) expect(l).toMatch(/^\([^()]*\)$/);
    expect(lines.filter((l) => l === "%")).toHaveLength(2);
  });

  it("garde les accents et le nom lisible", () => {
    expect(gcodeComment("Côté gauche (A)")).toBe("Côté gauche A");
    expect(gcodeComment("x".repeat(200))).toHaveLength(80);
  });
});

describe("projet importé : rien ne passe du texte là où un nombre ou un nom est attendu (audit du 10/11/2026, M1, M2, L1)", () => {
  const withRun = (items: unknown[]) => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    return JSON.parse(JSON.stringify({ ...made.doc, features: made.doc.features.map((f) => (f.type === "sketch" && f.kitchenPlan ? { ...f, kitchenPlan: { ...f.kitchenPlan, runs: { A: items } } } : f)) }));
  };

  it("un plan de cuisine fait par l'éditeur s'ouvre ; un meuble au nom ou aux cotes trafiqués est refusé", () => {
    const own = { id: "mes-1", kind: "base", name: "Mon caisson", width: 600, layout: "door", shelves: 1 };
    expect(() => parseDocument(withRun([{ id: "i1", model: "base-bas-1-porte", width: 600 }, { id: "i2", model: "own", width: 450, own }]))).not.toThrow();
    expect(() => parseDocument(withRun([{ id: "i1", model: "own", width: 600, own: { ...own, name: { toString: XSS } } }]))).toThrow(/meuble/);
    expect(() => parseDocument(withRun([{ id: "i1", model: "own", width: 600, own: { ...own, height: XSS } }]))).toThrow(/meuble/);
    expect(() => parseDocument(withRun([{ id: "i1", model: "base", width: XSS }]))).toThrow(/meuble/);
  });

  it("une annotation de mise en plan à la taille trafiquée est refusée", () => {
    const sheet = { id: "d1", name: "Plan", views: [], annotations: [{ id: "a1", kind: "text", at: [10, 10], text: "Cote", size: `3"><img src=x>` }], sketch: { items: [] }, title: {} };
    expect(() => parseDocument({ ...createReferencePlate(), drawings: [sheet] })).toThrow(/drawings/);
    expect(() => parseDocument({ ...createReferencePlate(), drawings: [{ ...sheet, annotations: [{ ...sheet.annotations[0], size: 3.5 }] }] })).not.toThrow();
  });

  it("le titre d'un document imprimé est échappé", () => {
    expect(pageHtml({ title: "</title><script>alert(1)</script>", html: "" }, false)).not.toContain("<script>alert(1)");
  });
});

describe("formules, variantes et couleurs venues d'un fichier ou du catalogue (audit du 10/11/2026, M3, M4, L2)", () => {
  it("une formule ne touche jamais Object.prototype, et seuls les noms propres sont des paramètres", () => {
    const doc = createReferencePlate();
    const feature = { ...doc.features[0]!, expressions: { "__proto__.pollue": "1", "constructor.prototype.aussi": "2", "prototype.x": "3" } };
    const { errors } = applyExpressions({ ...doc, features: [feature, ...doc.features.slice(1)] } as never);
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
    expect(({} as Record<string, unknown>).aussi).toBeUndefined();
    expect(errors).toHaveLength(3);
    expect(() => evaluate("constructor(5)", {})).toThrow();
    expect(() => evaluate("toString", {})).toThrow();
    expect(evaluate("a * 2", { a: 21 })).toBe(42);
  });

  it("une variante trafiquée ne s'ouvre pas, et son image ne peut être qu'une image du projet", () => {
    const base = createReferencePlate();
    const variant = (patch: Record<string, unknown>) => ({ id: "v1", name: "A", total: null, parts: 1, image: "", doc: { ...base }, ...patch });
    expect(() => parseDocument({ ...base, variants: [variant({})] })).not.toThrow();
    expect(() => parseDocument({ ...base, variants: [variant({ image: "https://pisteur.example/t.png" })] })).toThrow();
    expect(() => parseDocument({ ...base, variants: [variant({ image: 'data:image/png;base64,x" onerror="alert(1)' })] })).toThrow();
    // Opening it reads it as a project from a file: an array copied a billion times is refused.
    const bomb = { ...base, features: [...base.features, { id: "ar1", type: "array", name: "Réseau", targets: [], count: 1e9, spacing: [10, 0, 0] }] };
    const opened = openedVariant({ ...base, variants: [variant({ doc: bomb })] } as never, "v1");
    expect(typeof opened).toBe("object");
    expect(() => parseDocument(opened)).toThrow();
  });

  it("une couleur de matière du catalogue qui n'est pas #rrggbb devient blanche", () => {
    const m = { id: "catalog-1", name: "Chêne", thickness: 19, price: 1, color: "red;position:fixed", category: "wood", sheet: [2800, 2070], default: false } as const;
    expect(toMaterial(m as never).color).toBe("#ffffff");
    expect(toMaterial({ ...m, color: "#A0b1C2" } as never).color).toBe("#A0b1C2");
  });
});

describe("exports CSV : une cellule ne devient jamais une formule (audit du 10/11/2026, M5)", () => {
  const formula = '=HYPERLINK("http://x.example";"x")';
  it("liste de débit, devis et liste d'achat gardent une formule comme texte, les nombres restent des nombres", () => {
    const row = { names: [formula], quantity: 2, length: 1000, width: 400, thickness: 18, material: "@SUM(1+1)", grain: "length", tag: "A", cutLength: 1000, cutWidth: 400, band: 1, edges: { length1: true, length2: false, width1: false, width2: false } } as unknown as CutRow;
    const cut = cutListCsv([row]);
    expect(cut).toContain(`"'=HYPERLINK(""http://x.example"";""x"")"`);
    expect(cut).toContain(`"'@SUM(1+1)"`);
    const quote = quoteCsv({ ...makeQuote([{ material: "-1+1", thickness: 19, area: 1, bandLength: 0, parts: 1 }], DEFAULT_RATES, [{ name: "+33 6 00", quantity: 1, unit: "u", price: 1 }]), discount: 12.5, discountRate: 5 });
    expect(quote).toContain(`"'+33 6 00"`);
    expect(quote).toMatch(/;-12,5(\r\n|$)/);
    expect(quote).not.toMatch(/(^|;)"[=+\-@]/m);
    const buy = purchaseCsv([{ label: formula, quantity: 3, unit: "-u" }, { label: "Vis", quantity: 4, unit: "pièce" }]);
    expect(buy).toContain(`"'=HYPERLINK(""http://x.example"";""x"")";3;"'-u"`);
    expect(buy).toContain("Vis;4;pièce;");
  });
});

describe("DXF reçu d'un tiers : borné (audit du 10/11/2026, L3)", () => {
  const dxf = (entities: string) => `0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
  it("une ELLIPSE de 86 octets ne demande plus un milliard de points", () => {
    const start = performance.now();
    const read = parseDxf(dxf("0\nELLIPSE\n10\n0\n20\n0\n11\n100\n21\n0\n40\n0.5\n41\n0\n42\n100000000\n"));
    expect(read.shapes.length).toBeLessThanOrEqual(64);
    expect(performance.now() - start).toBeLessThan(500);
  });
  it("une valeur qui n'est pas un nombre ou infinie est écartée et comptée", () => {
    const read = parseDxf(dxf("0\nLINE\n10\nabc\n20\n0\n11\n10\n21\n10\n0\nLINE\n10\n0\n20\n0\n11\n1e999\n21\n0\n0\nLINE\n10\n0\n20\n0\n11\n100\n21\n0\n"));
    expect(read.shapes).toHaveLength(1);
    expect(read.skipped["valeurs invalides"]).toBe(2);
  });
  it("la boîte de 300 000 traits se calcule sans dépasser la pile", () => {
    const shapes = Array.from({ length: 300_000 }, (_, k) => ({ kind: "line" as const, a: [k, 0] as [number, number], b: [k, 1] as [number, number] }));
    expect(shapesBox(shapes)).toEqual([[0, 0], [299_999, 1]]);
  });
});
