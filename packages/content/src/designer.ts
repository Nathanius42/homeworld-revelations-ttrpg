import type { CharacterSheet, CustomCharacterInput, DesignerOptions } from "@hwr/protocol";
import {
  ATTRIBUTES,
  ATTRIBUTE_LABELS,
  SKILLS,
  maxStress,
  validateFinishedCharacter,
  type AttributeScores,
  type SkillScores,
} from "@hwr/rules-engine";
import { CREW } from "./crew.js";

export type { CustomCharacterInput };

export interface Kiith {
  name: string;
  blurb: string;
}

/**
 * Kiithid a character can belong to, with the outlook each is known for. All come from the games'
 * lore of the Mothership era (see Encyclopedia Hiigara's Kiith page).
 */
export const KIITHID: Kiith[] = [
  { name: "Paktu", blurb: "Resilient and stubborn; finds a way through whatever stands in the road." },
  { name: "Manaan", blurb: "Traders and showmen who thrive on the new and the bold." },
  { name: "S'jet", blurb: "Keepers of the record, bound to research and exploration." },
  { name: "Somtaaw", blurb: "Miners of faith; the work is the prayer." },
  { name: "Soban", blurb: "Soldiers for hire who honour a contract to the minute." },
  { name: "Naabal", blurb: "Builders of Kushan society, wary of violence unless the future depends on it." },
  { name: "Kaalel", blurb: "A warrior kiith with a gift for military intelligence." },
  { name: "Sagald", blurb: "Vehicle builders and diggers into the past; a Sagald unearthed the Guidestone." },
  { name: "Hraal", blurb: "Manufacturers who build the fleet's engines and airframes alongside Liir." },
  { name: "Jaraci", blurb: "Sensor specialists who hear what everyone else misses." },
  { name: "Tambuur", blurb: "Surgeons of the very small, with steady hands and few words." },
  { name: "Siidim", blurb: "Once mighty, now disgraced for betraying the Coalition; their soldiers still fight well." },
  { name: "Gaalsien", blurb: "Desert zealots and pariahs; few admit to the name aboard the Mothership." },
];

export interface RoleTemplate {
  crewRole: string;
  rank: string;
  /** Focuses players often take in this role, offered as suggestions. */
  focusSuggestions: string[];
  /** Talents, weapons, armour and kit come from the pregenerated crew member in the same role. */
  template: CharacterSheet;
}

/** The six crew roles, built from the pregenerated crew so every role has sensible gear. */
export const ROLES: RoleTemplate[] = CREW.map((c) => ({
  crewRole: c.crewRole,
  rank: c.rank === "Captain" ? "Captain" : "Lieutenant",
  focusSuggestions: c.focuses,
  template: c,
}));

/** Portraits a custom character can use: the crew's own plus a generated gallery. */
/**
 * Who each stock gallery portrait shows, so family portraits can take over the matching slots.
 * Slot 8 is a non-binary officer and can be anyone.
 */
export const GALLERY_SEX: ("man" | "woman" | "any")[] = ["man", "woman", "man", "man", "woman", "woman", "man", "any"];

export const PORTRAIT_GALLERY: string[] = [
  ...Array.from({ length: 8 }, (_, i) => `/art/portraits/gallery-${i + 1}.webp`),
  ...CREW.map((c) => c.portrait),
];

/** A balanced starting point for the designer: legal totals, no 12s or 5s. */
export function blankAttributes(): AttributeScores {
  return { agility: 9, brawn: 9, coordination: 9, insight: 9, reason: 9, will: 9 };
}

export function blankSkills(): SkillScores {
  return { combat: 2, command: 2, engineering: 3, exploration: 3, flight: 2, medical: 2 };
}

/** Everything the designer UI needs, without exposing mission content to the browser. */
export function designerOptions(): DesignerOptions {
  return {
    kiithid: KIITHID,
    roles: ROLES.map((r) => ({
      crewRole: r.crewRole,
      rank: r.rank,
      focusSuggestions: r.focusSuggestions,
      talents: r.template.talents,
      weapons: r.template.weapons,
      armour: r.template.armour,
    })),
    portraits: PORTRAIT_GALLERY,
    attributes: blankAttributes(),
    skills: blankSkills(),
  };
}

export class DesignError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("; "));
  }
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Checks a design and builds the full character sheet. Throws DesignError listing every problem. */
export function buildCustomSheet(input: CustomCharacterInput, id: string, extraPortraits: readonly string[] = []): CharacterSheet {
  const issues: string[] = [];
  const name = clean(input.name, 40);
  if (name.length < 2) issues.push("Give your character a name.");
  const kiith = KIITHID.find((k) => k.name === input.kiith);
  if (!kiith) issues.push("Choose a kiith.");
  const role = ROLES.find((r) => r.crewRole === input.crewRole);
  if (!role) issues.push("Choose a crew role.");
  if (!PORTRAIT_GALLERY.includes(input.portrait) && !extraPortraits.includes(input.portrait)) issues.push("Choose a portrait.");

  const attributes = Object.fromEntries(ATTRIBUTES.map((a) => [a, Math.trunc(Number(input.attributes?.[a]) || 0)])) as AttributeScores;
  const skills = Object.fromEntries(SKILLS.map((s) => [s, Math.trunc(Number(input.skills?.[s]) || 0)])) as SkillScores;
  for (const issue of validateFinishedCharacter(attributes, skills)) {
    issues.push(issue.message.charAt(0).toUpperCase() + issue.message.slice(1) + ".");
  }

  const focuses = [...new Set((input.focuses ?? []).map((f) => clean(f, 32)).filter(Boolean))];
  if (focuses.length < 3) issues.push("Pick at least three focuses.");
  if (focuses.length > 6) issues.push("At most six focuses.");
  if (issues.length || !role || !kiith) throw new DesignError(issues);

  const t = role.template;
  const survivor = t.talents.some((x) => x.name === "Survivor") ? 3 : 0;
  const best = [...ATTRIBUTES].sort((a, b) => attributes[b] - attributes[a])[0]!;
  return {
    id,
    name,
    kiith: kiith.name,
    crewRole: role.crewRole,
    rank: role.rank,
    portrait: input.portrait,
    tagline: clean(input.tagline, 120) || `A ${role.crewRole.toLowerCase()} of Kiith ${kiith.name}, known for ${ATTRIBUTE_LABELS[best].toLowerCase()}.`,
    attributes,
    skills,
    focuses,
    talents: structuredClone(t.talents),
    truths: [`Kiith ${kiith.name}: ${kiith.blurb.charAt(0).toLowerCase()}${kiith.blurb.slice(1)}`],
    aspects: (input.aspects ?? []).map((a) => clean(a, 60)).filter(Boolean).slice(0, 3),
    weapons: structuredClone(t.weapons),
    armour: t.armour,
    maxStress: maxStress(attributes, skills, survivor),
    equipment: [...t.equipment],
  };
}
