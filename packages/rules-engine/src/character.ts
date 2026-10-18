export const ATTRIBUTES = ["agility", "brawn", "coordination", "insight", "reason", "will"] as const;
export const SKILLS = ["combat", "command", "engineering", "exploration", "flight", "medical"] as const;

export type Attribute = (typeof ATTRIBUTES)[number];
export type Skill = (typeof SKILLS)[number];

export type AttributeScores = Record<Attribute, number>;
export type SkillScores = Record<Skill, number>;

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  agility: "Agility",
  brawn: "Brawn",
  coordination: "Coordination",
  insight: "Insight",
  reason: "Reason",
  will: "Will",
};

export const SKILL_LABELS: Record<Skill, string> = {
  combat: "Combat",
  command: "Command",
  engineering: "Engineering",
  exploration: "Exploration",
  flight: "Flight",
  medical: "Medical",
};

/** Lifepath totals and caps for a finished player character (Corebook ch. 3, step 7). */
export const CHARACTER_LIMITS = {
  attributeTotal: 54,
  skillTotal: 14,
  attributeMax: 12,
  skillMax: 5,
  attributeMaxFontOfPotential: 11,
  skillMaxFontOfPotential: 4,
} as const;

export function maxStress(attributes: AttributeScores, skills: SkillScores, bonus = 0): number {
  return attributes.brawn + skills.combat + bonus;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Checks a finished lifepath character against the step 7 rules. */
export function validateFinishedCharacter(
  attributes: AttributeScores,
  skills: SkillScores,
  fontOfPotential = false,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const attrMax = fontOfPotential ? CHARACTER_LIMITS.attributeMaxFontOfPotential : CHARACTER_LIMITS.attributeMax;
  const skillMax = fontOfPotential ? CHARACTER_LIMITS.skillMaxFontOfPotential : CHARACTER_LIMITS.skillMax;

  const attrValues = ATTRIBUTES.map((a) => attributes[a]);
  const attrTotal = attrValues.reduce((s, v) => s + v, 0);
  if (attrTotal !== CHARACTER_LIMITS.attributeTotal) {
    issues.push({ field: "attributes", message: `attributes total ${attrTotal}; they must total ${CHARACTER_LIMITS.attributeTotal}` });
  }
  for (const a of ATTRIBUTES) {
    if (attributes[a] > attrMax) issues.push({ field: a, message: `${ATTRIBUTE_LABELS[a]} is above ${attrMax}` });
    if (attributes[a] < 7) issues.push({ field: a, message: `${ATTRIBUTE_LABELS[a]} is below 7` });
  }
  if (attrValues.filter((v) => v === CHARACTER_LIMITS.attributeMax).length > 1) {
    issues.push({ field: "attributes", message: "only one attribute may be 12" });
  }

  const skillValues = SKILLS.map((s) => skills[s]);
  const skillTotal = skillValues.reduce((s, v) => s + v, 0);
  if (skillTotal !== CHARACTER_LIMITS.skillTotal) {
    issues.push({ field: "skills", message: `skills total ${skillTotal}; they must total ${CHARACTER_LIMITS.skillTotal}` });
  }
  for (const s of SKILLS) {
    if (skills[s] > skillMax) issues.push({ field: s, message: `${SKILL_LABELS[s]} is above ${skillMax}` });
    if (skills[s] < 1) issues.push({ field: s, message: `${SKILL_LABELS[s]} is below 1` });
  }
  if (skillValues.filter((v) => v === CHARACTER_LIMITS.skillMax).length > 1) {
    issues.push({ field: "skills", message: "only one skill may be 5" });
  }
  return issues;
}
