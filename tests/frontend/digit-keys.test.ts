/** Chiffres sans Maj dans les champs de nombres : la rangée des chiffres d'un clavier AZERTY. */
import { describe, expect, it } from "vitest";
import { digitOfKey, keyChar } from "../../frontend/src/ui/digit-keys";

const key = (code: string, k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey", boolean>> = {}) => ({ code, key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe("chiffre d'une touche de la rangée des chiffres", () => {
  it("AZERTY Mac sans Maj : & é \" ' ( § è ! ç à donnent 1 à 0", () => {
    const row = ["&", "é", '"', "'", "(", "§", "è", "!", "ç", "à"];
    const digits = row.map((k, i) => digitOfKey(key(`Digit${(i + 1) % 10}`, k), false));
    expect(digits).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
  });

  it("avec Maj, Verr. Maj ou un clavier QWERTY, la touche donne déjà son chiffre : rien à faire", () => {
    expect(digitOfKey(key("Digit5", "5"), false)).toBeNull();
  });

  it("le « - » reste un signe (le 6 d'un clavier PC), pour les valeurs négatives", () => {
    expect(digitOfKey(key("Digit6", "-"), false)).toBeNull();
  });

  it("dans un champ de calcul, la « ( » reste une parenthèse ; dans un champ simple, elle donne 5", () => {
    expect(digitOfKey(key("Digit5", "("), true)).toBeNull();
    expect(digitOfKey(key("Digit5", "("), false)).toBe("5");
    expect(digitOfKey(key("Digit2", "é"), true)).toBe("2");
  });

  it("les raccourcis (Cmd, Ctrl, Alt) et les autres touches ne changent pas", () => {
    expect(digitOfKey(key("Digit1", "&", { metaKey: true }), false)).toBeNull();
    expect(digitOfKey(key("Digit1", "&", { ctrlKey: true }), false)).toBeNull();
    expect(digitOfKey(key("Digit1", "&", { altKey: true }), false)).toBeNull();
    expect(digitOfKey(key("KeyA", "a"), false)).toBeNull();
    expect(digitOfKey(key("Numpad3", "3"), false)).toBeNull();
  });
});

describe("touche tapée hors d'un champ (case des mesures, distance tapée sur la vue)", () => {
  it("la rangée des chiffres sans Maj donne ses chiffres ; « - », « ; », « , » et les lettres restent elles-mêmes", () => {
    const row = ["&", "é", '"', "'", "(", "§", "è", "!", "ç", "à"];
    expect(row.map((k, i) => keyChar(key(`Digit${(i + 1) % 10}`, k))).join("")).toBe("1234567890");
    expect(keyChar(key("Digit6", "-"))).toBe("-");
    expect(keyChar(key("Comma", ";"))).toBe(";");
    expect(keyChar(key("Semicolon", ","))).toBe(",");
    expect(keyChar(key("Digit3", "3"))).toBe("3");
    expect(keyChar(key("KeyA", "a"))).toBe("a");
    expect(keyChar(key("Digit1", "&", { ctrlKey: true }))).toBe("&");
  });
});
