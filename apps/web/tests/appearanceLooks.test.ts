import { createDefaultUserProfile } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { activeLook, applyLook, LOOKS, nearestLook } from "../src/lib/appearanceLooks";

const byId = (id: string) => LOOKS.find((look) => look.id === id)!;

describe("appearance looks", () => {
  it("recognises the default profile as the Teamflow look", () => {
    expect(activeLook(createDefaultUserProfile().appearance)?.id).toBe("teamflow");
  });

  it("applies every setting of a look and keeps text contrast and team colours", () => {
    const base = { ...createDefaultUserProfile().appearance, textContrast: "high" as const };
    const next = applyLook(base, byId("neon"));
    expect(next).toMatchObject({
      theme: "dark",
      colorPreset: "custom",
      chromeStyle: "neon",
      shape: "round",
      textContrast: "high",
      semanticContrast: base.semanticContrast,
    });
    expect(next.customColors).toMatchObject({ primary: "#ec4899", accent: "#a855f7" });
    expect(activeLook(next)?.id).toBe("neon");
  });

  it("calls a changed look customised and offers the nearest one", () => {
    const calm = applyLook(createDefaultUserProfile().appearance, byId("calm"));
    const changed = { ...calm, shape: "sharp" as const };
    expect(activeLook(changed)).toBeNull();
    expect(nearestLook(changed)?.id).toBe("calm");
  });
});
