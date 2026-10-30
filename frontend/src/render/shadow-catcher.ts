/**
 * Sol « ombres seules » (attrape-ombres, comme dans KeyShot) : la surface marquée `matte` est tracée comme un sol
 * blanc, puis l'image y montre le fond (l'environnement derrière) assombri par ses ombres et éclairci par ses reflets :
 * fond × lumière reçue ÷ lumière d'un sol sans rien autour. Sur un fond transparent, seule l'ombre reste (alpha).
 *
 * Le moteur (three-gpu-pathtracer, version figée) rend une surface `matte` transparente ; on remplace ce passage de
 * son shader. Si le texte attendu n'y est plus, rien n'est changé et le sol reste transparent.
 */
import type { ShaderMaterial } from "three";

const EARLY_OUT = /if \( material\.matte && state\.firstRay \) \{\s*gl_FragColor = vec4\( 0\.0 \);\s*break;\s*\}/;
const START = "gl_FragColor = vec4( 0, 0, 0, 1 );";
const END = "gl_FragColor.a *= opacity;";

/** Turns the path tracing material's `matte` surfaces into shadow catchers; false when its shader was not as expected. */
export function installShadowCatcher(material: ShaderMaterial): boolean {
  const shader = material.fragmentShader;
  if (!EARLY_OUT.test(shader) || shader.split(START).length !== 2 || shader.split(END).length !== 2 || !shader.includes("void main()")) return false;
  material.fragmentShader = shader
    .replace("void main()", "uniform float catcherNorm;\n\nvoid main()")
    .replace(START, `${START}\nbool catcherHit = false;\nvec3 catcherBackground = vec3( 0.0 );`)
    .replace(EARLY_OUT, "if ( material.matte && state.firstRay ) {\ncatcherHit = true;\ncatcherBackground = sampleBackground( ray.direction, rand2( 2 ) );\n}")
    .replace(
      END,
      "if ( catcherHit ) {\n" +
        "float catcherRatio = clamp( luminance( gl_FragColor.rgb ) / max( catcherNorm, 1e-4 ), 0.0, 4.0 );\n" +
        "gl_FragColor = backgroundAlpha < 1.0 ? vec4( 0.0, 0.0, 0.0, clamp( 1.0 - catcherRatio, 0.0, 1.0 ) ) : vec4( catcherBackground * catcherRatio, 1.0 );\n" +
        `}\n${END}`,
    );
  material.uniforms.catcherNorm = { value: 1 };
  material.needsUpdate = true;
  return true;
}

/** Light of a white ground with nothing around it (see `environmentNorm`), times the environment's brightness. */
export function setCatcherNorm(material: ShaderMaterial, norm: number): void {
  if (material.uniforms.catcherNorm) material.uniforms.catcherNorm.value = norm;
}
