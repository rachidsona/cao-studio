/** Contrôle d'implantation : pièce, plan de travail, hotte, évier et plaque, dégagements, tringle. */
import { describe, expect, it } from "vitest";
import { cabinetBox, fromKitchenLayout, inferFront, inPolygon, layoutProblems, roleOf, type PlacedItem } from "../../frontend/src/document/layout-check";
import { KITCHEN, kitchenLayout } from "../../frontend/src/features/kitchen-layout";

const item = (name: string, box: PlacedItem["box"], kind: PlacedItem["kind"], role?: PlacedItem["role"], front?: PlacedItem["front"]): PlacedItem => ({ ids: [name], name, box, kind, ...(role ? { role } : {}), ...(front ? { front } : {}) });
const messages = (items: PlacedItem[], room?: [number, number][]) => layoutProblems({ items, ...(room ? { room } : {}) }).map((p) => p.message);

describe("géométrie", () => {
  it("sait si un point est dans la pièce, bord compris", () => {
    const square: [number, number][] = [[0, 0], [4000, 0], [4000, -3000], [0, -3000]];
    expect(inPolygon([2000, -1500], square)).toBe(true);
    expect(inPolygon([0, -1500], square)).toBe(true);
    expect(inPolygon([4001.5, -1500], square)).toBe(false);
  });
  it("trouve le devant d'un appareil : à l'opposé du mur qui l'adosse", () => {
    const wall = item("Mur A", [[0, 0, 0], [4000, 100, 2500]], "wall");
    expect(inferFront([[600, -560, 0], [1200, 0, 870]], [wall])).toEqual([0, -1]);
    expect(inferFront([[600, -1560, 0], [1200, -1000, 870]], [wall])).toBeNull();
  });
  it("pose un caisson tourné sur son coin avant gauche", () => {
    expect(cabinetBox([0, 0, 0], 0, 600, 870, 560)).toEqual([[0, 0, 0], [600, 560, 870]]);
    expect(cabinetBox([560, -1000, 0], 90, 600, 870, 560)).toEqual([[0, -1000, 0], [560, -400, 870]]);
    expect(roleOf("Colonne réfrigérateur")).toBe("fridge");
    expect(roleOf("Four (colonne)")).toBe("oven");
  });
});

describe("alertes", () => {
  const wall = item("Mur A", [[0, 0, 0], [4000, 100, 2500]], "wall");
  const worktop = item("Plan de travail A", [[0, -600, 870], [3000, 0, 908]], "worktop");
  const hob = item("Plaque de cuisson", [[1500, -560, 908], [2100, -40, 913]], "appliance", "hob");
  const room: [number, number][] = [[0, 0], [4000, 0], [4000, -3000], [0, -3000]];

  it("ne dit rien d'une cuisine bien faite", () => {
    const hood = item("Hotte", [[1500, -500, 1600], [2100, 0, 1700]], "appliance", "hood");
    const sink = item("Évier", [[400, -500, 908], [900, -100, 913]], "appliance", "sink");
    const oven = item("Four", [[2100, -560, 0], [2700, 0, 600]], "appliance", "oven");
    expect(messages([wall, worktop, hob, hood, sink, oven], room)).toEqual([]);
  });
  it("signale ce qui sort de la pièce", () => {
    expect(messages([item("Bas A1", [[3800, -560, 0], [4400, 0, 870]], "cabinet")], room)).toEqual(["« Bas A1 » sort de la pièce."]);
  });
  it("veut la plaque sur un plan de travail, la hotte au-dessus d'elle, ni trop bas ni trop haut", () => {
    expect(messages([worktop, item("Plaque de cuisson", [[3200, -560, 908], [3800, -40, 913]], "appliance", "hob")])).toEqual(["« Plaque de cuisson » n'est pas posée sur un plan de travail."]);
    expect(messages([hob, item("Hotte", [[1500, -500, 1400], [2100, 0, 1500]], "appliance", "hood")])).toEqual(["La hotte « Hotte » est trop basse au-dessus de la plaque (49 cm, 60 cm au moins)."]);
    expect(messages([hob, item("Hotte", [[1500, -500, 1800], [2100, 0, 1900]], "appliance", "hood")])).toEqual(["La hotte « Hotte » est trop haute au-dessus de la plaque (89 cm ; 65 à 75 cm conseillés)."]);
    expect(messages([item("Hotte", [[100, -500, 1600], [700, 0, 1700]], "appliance", "hood")])).toEqual(["La hotte « Hotte » n'est au-dessus d'aucune plaque de cuisson."]);
  });
  it("veut 60 cm entre l'évier et la plaque", () => {
    const sink = item("Évier", [[1000, -500, 908], [1400, -100, 913]], "appliance", "sink");
    expect(messages([hob, sink])).toEqual(["La plaque « Plaque de cuisson » est à 10 cm de l'évier (60 cm au moins)."]);
  });
  it("veut 80 cm devant un four, un réfrigérateur ou un lave-vaisselle", () => {
    const oven = item("Four", [[2100, -560, 0], [2700, 0, 600]], "appliance", "oven");
    const island = item("Îlot 1", [[2000, -1300, 0], [2600, -700, 870]], "cabinet");
    expect(messages([wall, oven, island])).toEqual(["Moins de 80 cm devant « Four » : « Îlot 1 » est dans le passage."]);
    // Without a wall behind it (nor a known front), nothing is said.
    expect(messages([oven, island])).toEqual([]);
    const fridge = item("Colonne réfrigérateur", [[3400, -560, 0], [4000, 0, 2100]], "cabinet", "fridge", [0, -1]);
    expect(messages([fridge, item("Îlot 2", [[3400, -1300, 0], [4000, -700, 870]], "cabinet")])).toEqual(["Moins de 80 cm devant « Colonne réfrigérateur » : « Îlot 2 » est dans le passage."]);
  });
  it("veut 45 cm entre la plaque et un meuble haut", () => {
    expect(messages([hob, item("Haut A3", [[1500, -350, 1250], [2100, 0, 1970]], "cabinet")])).toEqual(["Le meuble haut « Haut A3 » est à 34 cm au-dessus de la plaque (45 cm au moins)."]);
    expect(messages([hob, item("Haut A3", [[1500, -350, 1400], [2100, 0, 2100]], "cabinet")])).toEqual([]);
  });
  it("veut la tringle entre 170 et 190 cm", () => {
    expect(messages([item("Penderie", [[20, -300, 1487], [980, -300, 1513]], "cabinet", "rail")])).toEqual(["La tringle « Penderie » est à 150 cm du sol (170 à 190 cm conseillés)."]);
    expect(messages([item("Penderie", [[20, -300, 1787], [980, -300, 1813]], "cabinet", "rail")])).toEqual([]);
    // A double hanging: its low rod at 106 cm is not too low; its high rod is judged as any.
    const low = item("Penderie basse", [[20, -300, 1047], [980, -300, 1073]], "cabinet", "rail");
    expect(messages([low, item("Penderie haute", [[20, -300, 1787], [980, -300, 1813]], "cabinet", "rail")])).toEqual([]);
    expect(messages([low])).toEqual(["La tringle « Penderie basse » est à 106 cm du sol (170 à 190 cm conseillés)."]);
  });
});

describe("depuis une implantation de cuisine", () => {
  it("lit les meubles, les murs, les plans, la plaque, la hotte, le four, l'évier, et la trouve bien faite", () => {
    const layout = kitchenLayout({ ...KITCHEN, lengthA: 4000, appliances: true, fridge: true, splashback: true, kick: true });
    const input = fromKitchenLayout(layout);
    const roles = input.items.filter((i) => i.role).map((i) => i.role);
    expect(roles).toEqual(expect.arrayContaining(["hob", "hood", "oven", "sink", "fridge"]));
    expect(input.items.some((i) => i.kind === "wall")).toBe(true);
    expect(input.items.filter((i) => i.kind === "cabinet").every((i) => i.front)).toBe(true);
    expect(layoutProblems(input)).toEqual([]);
  });
});
