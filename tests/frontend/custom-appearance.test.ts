/** Les vrais bois en photo, et les images qu'on importe soi-même comme apparences (« Mes motifs »). */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bodyAppearance, setBodyAppearance } from "../../frontend/src/appearance/assign";
import { addCustomAppearance, removeCustomAppearance } from "../../frontend/src/appearance/custom";
import { APPEARANCES, appearanceById, appearanceKey, searchAppearances } from "../../frontend/src/appearance/library";
import { createReferencePlate } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

describe("motifs en photo", () => {
  it("chaque bois en photo a son image dans static/textures/bois", () => {
    const photos = APPEARANCES.filter((a) => a.image);
    expect(photos.length).toBe(10);
    for (const a of photos) expect(existsSync(`.${a.image}`)).toBe(true);
    expect(searchAppearances("photo noyer", "wood").map((a) => a.id)).toEqual(["photo-walnut", "photo-walnut-straight", "photo-walnut-crown"]);
    // The walnut veneers: straight grain on a 1 m tile, the crown figure on a leaf of 600 × 450 mm.
    expect(searchAppearances("noyer ramage", "wood").map((a) => [a.id, a.tile])).toEqual([["photo-walnut-crown", [600, 450]]]);
    expect(searchAppearances("noyer fil", "wood").map((a) => a.id)).toEqual(["photo-walnut-straight"]);
  });

  it("une image importée devient une apparence du projet, appliquée aux corps et gardée avec le document", () => {
    const base = createReferencePlate();
    const a = addCustomAppearance(base, "Chêne de la cuisine", IMAGE, [600, 600]);
    const b = addCustomAppearance(a.doc, "Chêne de la cuisine", IMAGE, [600, 600]);
    expect(b.doc.appearances?.map((x) => [x.id, x.name])).toEqual([["img1", "Chêne de la cuisine"], ["img2", "Chêne de la cuisine 2"]]);
    expect(appearanceById("img2")).toMatchObject({ category: "custom", image: IMAGE, tile: [600, 600] });
    expect(searchAppearances("", "custom")).toHaveLength(2);
    const body = base.features[0]!.id;
    const painted = setBodyAppearance(b.doc, [body], "img1");
    expect(bodyAppearance(painted, body, undefined)?.appearance.name).toBe("Chêne de la cuisine");
    expect(() => parseDocument(JSON.parse(JSON.stringify(painted)))).not.toThrow();
    expect(() => parseDocument({ ...painted, appearances: [{ id: "img9", name: "X", image: "https://ailleurs.example/x.jpg", tile: [500, 500] }] })).toThrow(/appearances/);
  });

  it("retirer un motif rend aux corps l'apparence de leur matière ; deux images de même id ne se confondent pas", () => {
    const a = addCustomAppearance(createReferencePlate(), "Pierre", IMAGE, [500, 500]);
    const key = appearanceKey(appearanceById(a.id)!);
    const gone = removeCustomAppearance(a.doc, a.id);
    expect(gone.appearances).toBeUndefined();
    expect(appearanceById(a.id)).toBeUndefined();
    const other = addCustomAppearance(createReferencePlate(), "Pierre", `${IMAGE}AAAA`, [500, 500]);
    expect(appearanceKey(appearanceById(other.id)!)).not.toBe(key);
  });
});
