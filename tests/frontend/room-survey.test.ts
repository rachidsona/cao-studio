/** Relevé collé d'un télémètre laser : un mur par ligne, sa longueur et l'angle de son coin, quelle que soit la façon de l'écrire. */
import { describe, expect, it } from "vitest";
import { parseSurvey } from "../../frontend/src/features/room-survey";

describe("relevé collé", () => {
  it("lit les mètres, les centimètres et les millimètres, avec ou sans angle", () => {
    expect(parseSurvey("3,452 m\n2,5 m 89,5°\n345,2 cm\n2500")).toEqual([
      { length: 3452, angle: 90 }, { length: 2500, angle: 89.5 }, { length: 3452, angle: 90 }, { length: 2500, angle: 90 },
    ]);
  });

  it("lit un CSV d'application, en-tête et numéro de mur compris, au point-virgule ou à la virgule", () => {
    expect(parseSurvey("Mur;Longueur (m);Angle\n1;3,452;90\n2;2,498;91,5")).toEqual([{ length: 3452, angle: 90 }, { length: 2498, angle: 91.5 }]);
    expect(parseSurvey("wall,length,angle\n1,3.452,90\n2,2.498,88")).toEqual([{ length: 3452, angle: 90 }, { length: 2498, angle: 88 }]);
    expect(parseSurvey("Mur 1  3452 mm\nMur 2  2498 mm  92°")).toEqual([{ length: 3452, angle: 90 }, { length: 2498, angle: 92 }]);
  });

  it("dit ce qui ne va pas", () => {
    expect(parseSurvey("Cuisine de M. X")).toMatch(/Aucune longueur/);
    expect(parseSurvey("0,05 m")).toMatch(/10 cm à 50 m/);
  });
});
