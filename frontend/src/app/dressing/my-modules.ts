/**
 * « Mes modules » : les modules réglés à sa façon, gardés dans ce navigateur et repris d'un projet à l'autre ; un module
 * à formules y garde ses paramètres, ses conditions et ses formules (document/module-program.ts).
 */
import { MODULES, type ModuleKind, type ModuleSizes } from "../../document/dressing-modules";
import { isModuleProgram, type ModuleProgram } from "../../document/module-program";

const KEY = "cao.my-dressing-modules";

export interface MyModule {
  name: string;
  kind: ModuleKind;
  sizes: ModuleSizes;
  thickness: number;
  /** Its formulas: worked out on each niche it is laid in. */
  program?: Pick<ModuleProgram, "params" | "rules" | "formulas">;
}

/** A program kept with a module, checked as the whole program it makes. */
const programOk = (m: MyModule) => m.program === undefined || isModuleProgram({ kind: m.kind, sizes: m.sizes, thickness: m.thickness, ...m.program });

export function myModules(): MyModule[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? (list as MyModule[]).filter((m) => m && typeof m.name === "string" && m.kind in MODULES && typeof m.sizes === "object" && programOk(m)) : [];
  } catch {
    return [];
  }
}

function write(list: MyModule[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Keeps this module (one of the same name is replaced); false when this browser keeps nothing. */
export const saveMyModule = (module: MyModule): boolean => write([...myModules().filter((m) => m.name !== module.name), module]);

export const removeMyModule = (name: string): boolean => write(myModules().filter((m) => m.name !== name));
