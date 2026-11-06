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

  it("sets every design aspect, so a look is a full mix", () => {
    const machined = applyLook(createDefaultUserProfile().appearance, byId("machined"));
    expect(machined).toMatchObject({
      colorTheme: "machined",
      fontSet: "machined",
      shape: "pill",
      surface: "soft-inset",
      buttons: "lipped",
      lip: "gold",
      inputs: "sunk",
      toggles: "pill",
    });
    // Going back to Teamflow puts every aspect back on auto.
    const teamflow = applyLook(machined, byId("teamflow"));
    expect(teamflow).toMatchObject({ colorTheme: "teamflow", fontSet: "auto", buttons: "auto" });
    expect(activeLook(teamflow)?.id).toBe("teamflow");
  });

  it("includes the design library presets", () => {
    expect(LOOKS.map((look) => look.name)).toEqual(
      expect.arrayContaining(["Machined", "Paper desk", "Retro 95", "Synth night"]),
    );
    for (const id of ["paper-desk", "retro-95", "synth-night"]) {
      expect(activeLook(applyLook(createDefaultUserProfile().appearance, byId(id)))?.id).toBe(id);
    }
  });

  it("ignores lip metal unless the look has lipped buttons", () => {
    const paper = applyLook(createDefaultUserProfile().appearance, byId("paper-desk"));
    expect(activeLook({ ...paper, lip: "silver" })?.id).toBe("paper-desk");
    const machined = applyLook(createDefaultUserProfile().appearance, byId("machined"));
    expect(activeLook({ ...machined, lip: "silver" })).toBeNull();
    expect(nearestLook({ ...machined, lip: "silver" })?.id).toBe("machined");
  });

  it("stops offering a look once most of it has changed", () => {
    const machined = applyLook(createDefaultUserProfile().appearance, byId("machined"));
    const own = {
      ...machined,
      fontSet: "pixel" as const,
      surface: "bevel" as const,
      buttons: "neon" as const,
      inputs: "underline" as const,
    };
    expect(nearestLook(own)?.id).not.toBe("machined");
  });
});
