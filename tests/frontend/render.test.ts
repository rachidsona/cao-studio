/** Mode Rendu : réglages vérifiés, environnements calculés, attrape-ombres du moteur. */
import { describe, expect, it } from "vitest";
import * as pathtracer from "three-gpu-pathtracer";
import { ShaderMaterial } from "three";
import { environmentNorm, environmentPixels, radiance } from "../../frontend/src/render/environments";
import { DEFAULT_SETTINGS, focalToFov, normalizeSettings, sunPosition } from "../../frontend/src/render/settings";
import { installShadowCatcher } from "../../frontend/src/render/shadow-catcher";

/** Exported by the package but missing from its type declarations. */
const { PhysicalPathTracingMaterial } = pathtracer as unknown as { PhysicalPathTracingMaterial: new () => ShaderMaterial };
const luminance = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

describe("réglages du rendu", () => {
  it("reprennent les valeurs par défaut pour ce qui manque ou ne va pas", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({ environment: "lune", brightness: 99, hour: "midi", backgroundColor: "red", bounces: 4.6, focusDistance: -3, finishes: { "lacquer-white": "gloss", "bad id!": "gloss", mdf: "chrome" } });
    expect(s.environment).toBe(DEFAULT_SETTINGS.environment);
    expect(s.brightness).toBe(4);
    expect(s.hour).toBe(DEFAULT_SETTINGS.hour);
    expect(s.backgroundColor).toBe(DEFAULT_SETTINGS.backgroundColor);
    expect(s.bounces).toBe(5);
    expect(s.focusDistance).toBe(DEFAULT_SETTINGS.focusDistance);
    expect(s.finishes).toEqual({ "lacquer-white": "gloss", mdf: "auto" });
  });

  it("donnent l'angle de champ d'une focale et la course du soleil", () => {
    expect(focalToFov(50)).toBeCloseTo(26.99, 1);
    expect(focalToFov(24)).toBeGreaterThan(focalToFov(35));
    expect(sunPosition(6).elevation).toBeCloseTo(0);
    expect(sunPosition(6).azimuth).toBe(90); // levant à l'est
    expect(sunPosition(13).azimuth).toBe(180); // plein sud
    expect(sunPosition(13).elevation).toBeCloseTo(58);
    expect(sunPosition(20).azimuth).toBe(270);
  });
});

describe("environnements", () => {
  it("éclairent davantage d'en haut que d'en bas, et le soleil plus que le ciel", () => {
    for (const env of ["studio-light", "studio-dark", "interior", "overcast", "outdoor"] as const) {
      expect(luminance(radiance(env, 10, 60, 13))).toBeGreaterThan(luminance(radiance(env, 10, -60, 13)));
    }
    const sun = sunPosition(15);
    expect(luminance(radiance("outdoor", sun.azimuth, sun.elevation, 15))).toBeGreaterThan(100 * luminance(radiance("outdoor", sun.azimuth + 90, 40, 15)));
  });

  it("placent le soleil au bon endroit dans l'image équirectangulaire (+Z du modèle vers le haut)", () => {
    const width = 256;
    const data = environmentPixels("outdoor", width, 0, 13);
    let best = 0;
    let at = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > best) [best, at] = [data[i]!, i / 4];
    }
    const row = Math.floor(at / width);
    const col = at % width;
    const lat = ((row + 0.5) / (width / 2) - 0.5) * Math.PI;
    const lon = ((col + 0.5) / width - 0.5) * 2 * Math.PI;
    // Texture direction → model direction (x, −z, y): the sun is high in the south (−Y).
    const model = [Math.cos(lat) * Math.cos(lon), -Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    expect(model[2]).toBeGreaterThan(0.75);
    expect(model[1]).toBeLessThan(-0.4);
    expect(Math.abs(model[0]!)).toBeLessThan(0.1);
  });

  it("mesurent la lumière d'un sol blanc sans rien autour (1 sous un ciel uniforme)", () => {
    const width = 128;
    const uniform = new Float32Array(width * (width / 2) * 4).fill(1);
    expect(environmentNorm(uniform, width)).toBeCloseTo(1, 2);
    expect(environmentNorm(environmentPixels("overcast", width, 0, 12), width)).toBeGreaterThan(0.5);
  });
});

describe("attrape-ombres", () => {
  it("s'installe dans le shader du moteur (version figée)", () => {
    const material = new PhysicalPathTracingMaterial();
    expect(installShadowCatcher(material)).toBe(true);
    expect(material.fragmentShader).toContain("uniform float catcherNorm;");
    expect(material.fragmentShader).toContain("catcherBackground * catcherRatio");
    expect(material.fragmentShader).not.toMatch(/material\.matte && state\.firstRay \) \{\s*gl_FragColor = vec4\( 0\.0 \)/);
    expect(material.uniforms.catcherNorm?.value).toBe(1);
  });

  it("ne touche à rien si le shader n'est pas celui attendu", () => {
    const material = new ShaderMaterial({ fragmentShader: "void main() { gl_FragColor = vec4( 1.0 ); }" });
    expect(installShadowCatcher(material)).toBe(false);
    expect(material.fragmentShader).toBe("void main() { gl_FragColor = vec4( 1.0 ); }");
  });
});
