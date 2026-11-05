/** « Mes modules » : les modules réglés à sa façon, gardés dans ce navigateur et repris d'un projet à l'autre. */
import { MODULES, type ModuleKind, type ModuleSizes } from "../document/dressing-modules";

const KEY = "cao.my-dressing-modules";

export interface MyModule {
  name: string;
  kind: ModuleKind;
  sizes: ModuleSizes;
  thickness: number;
}

export function myModules(): MyModule[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? (list as MyModule[]).filter((m) => m && typeof m.name === "string" && m.kind in MODULES && typeof m.sizes === "object") : [];
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
