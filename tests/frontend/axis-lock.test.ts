/** Direction gardée d'un déplacement : Ctrl horizontale, ⌘ verticale. */
import { describe, expect, it } from "vitest";
import { lockMove, lockPoint } from "../../frontend/src/app/axis-lock";

describe("direction gardée", () => {
  it("horizontale : la hauteur ne change pas ; verticale : seulement elle", () => {
    expect(lockMove([300, -250, 125], "level")).toEqual([300, -250, 0]);
    expect(lockMove([300, -250, 125], "vertical")).toEqual([0, 0, 125]);
    expect(lockMove([300, -250, 125], "free")).toEqual([300, -250, 125]);
  });

  it("le point visé ramené au niveau du point déplacé, ou à sa verticale", () => {
    expect(lockPoint([0, 0, 800], [400, 20, 830], "level")).toEqual([400, 20, 800]);
    expect(lockPoint([0, 0, 800], [400, 20, 830], "vertical")).toEqual([0, 0, 830]);
  });
});
