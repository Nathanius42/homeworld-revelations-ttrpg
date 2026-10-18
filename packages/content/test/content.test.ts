import { describe, expect, it } from "vitest";
import { maxStress, validateFinishedCharacter } from "@hwr/rules-engine";
import { CREW, MISSIONS } from "../src/index.js";

describe("crew", () => {
  it.each(CREW.map((c) => [c.name, c] as const))("%s is a legal finished character", (_name, sheet) => {
    expect(validateFinishedCharacter(sheet.attributes, sheet.skills)).toEqual([]);
  });

  it("derives maximum stress from Brawn + Combat (+3 for Survivor)", () => {
    for (const sheet of CREW) {
      const bonus = sheet.talents.some((t) => t.name === "Survivor") ? 3 : 0;
      expect(sheet.maxStress).toBe(maxStress(sheet.attributes, sheet.skills, bonus));
    }
  });

  it("has unique ids and enough crew for a full table", () => {
    expect(new Set(CREW.map((c) => c.id)).size).toBe(CREW.length);
    expect(CREW.length).toBeGreaterThanOrEqual(6);
  });
});

describe("missions", () => {
  it.each(Object.values(MISSIONS).map((m) => [m.title, m] as const))("%s has a valid graph", async (_t, mission) => {
    const { validateMission } = await import("../src/mission.js");
    expect(validateMission(mission)).toEqual([]);
  });
});

describe("character designer", () => {
  const base = async () => {
    const d = await import("../src/designer.js");
    return {
      d,
      input: {
        name: "  Arin   Kaalel ",
        kiith: "Kaalel",
        crewRole: "Pilot",
        tagline: "",
        portrait: d.PORTRAIT_GALLERY[0]!,
        attributes: d.blankAttributes(),
        skills: d.blankSkills(),
        focuses: ["Small Craft", "Navigation", "Small Craft", "Gunnery"],
        aspects: ["Never looks back"],
      },
    };
  };

  it("builds a legal sheet with the role's gear", async () => {
    const { d, input } = await base();
    const sheet = d.buildCustomSheet(input, "custom-1");
    expect(sheet.name).toBe("Arin Kaalel");
    expect(sheet.focuses).toEqual(["Small Craft", "Navigation", "Gunnery"]);
    expect(sheet.weapons.length).toBeGreaterThan(0);
    expect(sheet.maxStress).toBe(sheet.attributes.brawn + sheet.skills.combat);
    expect(validateFinishedCharacter(sheet.attributes, sheet.skills)).toEqual([]);
  });

  it("lists every problem with an illegal design", async () => {
    const { d, input } = await base();
    const bad = { ...input, name: "", attributes: { ...input.attributes, brawn: 12, will: 12 }, focuses: [] };
    try {
      d.buildCustomSheet(bad, "x");
      throw new Error("should have failed");
    } catch (err) {
      expect(err).toBeInstanceOf(d.DesignError);
      const issues = (err as InstanceType<typeof d.DesignError>).issues;
      expect(issues.some((i) => /name/.test(i))).toBe(true);
      expect(issues.some((i) => /total/.test(i))).toBe(true);
      expect(issues.some((i) => /only one attribute/i.test(i))).toBe(true);
      expect(issues.some((i) => /focuses/.test(i))).toBe(true);
    }
  });

  it("starts the designer from a legal spread", async () => {
    const { d } = await base();
    expect(validateFinishedCharacter(d.blankAttributes(), d.blankSkills())).toEqual([]);
  });
});
