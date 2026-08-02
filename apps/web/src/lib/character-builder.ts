import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

import { abilities, type Ability, shortEntityName } from "./presentation";

const fighterId = "srd521.class.fighter";
const humanId = "srd521.species.human";
const soldierId = "srd521.background.soldier";
const skilledId = "srd521.feat.origin.skilled";
const savageAttackerId = "srd521.feat.origin.savage-attacker";
const defenseStyleId = "srd521.feat.fighting-style.defense";
const abilityScoreImprovementId = "srd521.feat.general.ability-score-improvement";
const championId = "srd521.subclass.fighter.champion";
const skillPrefix = "srd521.skill.";

export const skillIds = [
  "acrobatics",
  "animal-handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight-of-hand",
  "stealth",
  "survival",
] as const;

export interface FighterBuilderDraft {
  name: string;
  level: number;
  abilityScores: Record<Ability, number>;
  asiAbility: Ability;
  classSkillIds: string[];
  speciesSkillId: string;
  skilledSkillIds: string[];
  weaponMasteryIds: string[];
}

export interface BuilderCatalog {
  className: string;
  speciesName: string;
  backgroundName: string;
  subclassName: string;
  classSkillIds: string[];
  backgroundSkillIds: string[];
  weaponIds: string[];
  weaponNames: Readonly<Record<string, string>>;
  masteryCountByLevel: Readonly<Record<number, number>>;
}

export interface BuilderPreview {
  character?: CharacterDocument;
  evaluation?: CharacterEvaluation;
  issues: string[];
}

export interface BuildCharacterOptions {
  id: string;
  now: Date;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function localizedName(entity: LoadedRulesPackage["entities"][number] | undefined): string {
  return (
    entity?.name.en ??
    (entity === undefined
      ? "Unknown"
      : (Object.values(entity.name)[0] ?? shortEntityName(entity.id)))
  );
}

function normalizedSkillId(value: string): string {
  return `${skillPrefix}${value.toLowerCase().replaceAll(" ", "-")}`;
}

export function fighterBuilderCatalog(rulesPackage: LoadedRulesPackage): BuilderCatalog {
  const entity = (id: string) => rulesPackage.entities.find((candidate) => candidate.id === id);
  const fighter = entity(fighterId);
  const fighterBody = objectValue(fighter?.body);
  const skillChoice = objectValue(fighterBody?.skillProficiencyChoice);
  const skillOptions = skillChoice?.options;
  const progression = fighterBody?.progression;
  if (!Array.isArray(skillOptions) || !Array.isArray(progression)) {
    throw new Error("Fighter builder metadata is missing from the loaded rules package.");
  }
  const classSkillIds = skillOptions
    .filter((option): option is string => typeof option === "string")
    .map(normalizedSkillId);
  const backgroundBody = objectValue(entity(soldierId)?.body);
  const backgroundSkills = backgroundBody?.skillProficiencies;
  const backgroundSkillIds = Array.isArray(backgroundSkills)
    ? backgroundSkills.filter((skill): skill is string => typeof skill === "string")
    : [];
  const weaponIds = [
    "srd521.equipment.weapon.greatsword",
    "srd521.equipment.weapon.flail",
    "srd521.equipment.weapon.javelin",
    "srd521.equipment.weapon.longbow",
  ];
  const progressionValues: unknown[] = progression;
  const masteryCountEntries: [number, number][] = progressionValues
    .map((row) => objectValue(row))
    .filter((row): row is Readonly<Record<string, unknown>> => row !== undefined)
    .filter((row) => typeof row.level === "number" && row.level <= 5)
    .map((row) => [
      row.level as number,
      typeof row.weaponMastery === "number" ? row.weaponMastery : 0,
    ]);
  const masteryCountByLevel: Record<number, number> = Object.fromEntries(masteryCountEntries);

  return {
    className: localizedName(fighter),
    speciesName: localizedName(entity(humanId)),
    backgroundName: localizedName(entity(soldierId)),
    subclassName: localizedName(entity(championId)),
    classSkillIds,
    backgroundSkillIds,
    weaponIds,
    weaponNames: Object.fromEntries(weaponIds.map((id) => [id, localizedName(entity(id))])),
    masteryCountByLevel,
  };
}

export function defaultFighterDraft(): FighterBuilderDraft {
  return {
    name: "",
    level: 1,
    abilityScores: {
      strength: 15,
      dexterity: 13,
      constitution: 13,
      intelligence: 10,
      wisdom: 12,
      charisma: 8,
    },
    asiAbility: "strength",
    classSkillIds: [`${skillPrefix}perception`, `${skillPrefix}survival`],
    speciesSkillId: `${skillPrefix}persuasion`,
    skilledSkillIds: [`${skillPrefix}arcana`, `${skillPrefix}insight`, `${skillPrefix}stealth`],
    weaponMasteryIds: [
      "srd521.equipment.weapon.greatsword",
      "srd521.equipment.weapon.flail",
      "srd521.equipment.weapon.javelin",
    ],
  };
}

export function masteryCount(draft: FighterBuilderDraft, catalog: BuilderCatalog): number {
  return catalog.masteryCountByLevel[draft.level] ?? 0;
}

export function validateFighterDraft(
  draft: FighterBuilderDraft,
  catalog: BuilderCatalog,
): string[] {
  const issues: string[] = [];
  if (draft.name.trim().length === 0) issues.push("Enter a character name.");
  if (!Number.isInteger(draft.level) || draft.level < 1 || draft.level > 5) {
    issues.push("Choose a Fighter level from 1 through 5.");
  }
  for (const ability of abilities) {
    const score = draft.abilityScores[ability];
    if (!Number.isInteger(score) || score < 3 || score > 18) {
      issues.push(`${shortEntityName(ability)} must be a whole number from 3 through 18.`);
    }
  }
  if (
    draft.classSkillIds.length !== 2 ||
    draft.classSkillIds.some((id) => !catalog.classSkillIds.includes(id))
  ) {
    issues.push("Choose exactly two Fighter skill proficiencies.");
  }
  if (!skillIds.map((id) => `${skillPrefix}${id}`).includes(draft.speciesSkillId)) {
    issues.push("Choose one Human skill proficiency.");
  }
  if (draft.skilledSkillIds.length !== 3) {
    issues.push("Choose exactly three skill proficiencies for Skilled.");
  }
  const allSkills = [
    ...catalog.backgroundSkillIds,
    ...draft.classSkillIds,
    draft.speciesSkillId,
    ...draft.skilledSkillIds,
  ];
  if (new Set(allSkills).size !== allSkills.length) {
    issues.push("Each selected skill proficiency must be unique.");
  }
  const requiredMasteries = masteryCount(draft, catalog);
  if (
    draft.weaponMasteryIds.length !== requiredMasteries ||
    draft.weaponMasteryIds.some((id) => !catalog.weaponIds.includes(id))
  ) {
    issues.push(`Choose exactly ${String(requiredMasteries)} Weapon Masteries.`);
  }
  return issues;
}

function assembleCharacter(
  draft: FighterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): CharacterDocument {
  const levels = Array.from({ length: draft.level }, (_, index) => ({
    characterLevel: index + 1,
    classId: fighterId,
    hitPointChoice: "fixed" as const,
  }));
  const featIds = [defenseStyleId, savageAttackerId, skilledId];
  if (draft.level >= 4) featIds.push(abilityScoreImprovementId);
  const timestamp = options.now.toISOString();
  return characterDocumentSchema.parse({
    schemaVersion: "0.1.0",
    id: options.id,
    name: draft.name.trim(),
    ruleset: {
      system: "dnd5e",
      edition: "2024",
      packages: [
        {
          id: rulesPackage.manifest.id,
          version: rulesPackage.manifest.version,
          sha256: rulesPackage.manifest.source.sha256,
        },
      ],
    },
    build: {
      levels,
      abilityScores: draft.abilityScores,
      speciesId: humanId,
      speciesSize: "medium",
      backgroundId: soldierId,
      backgroundAbilityScoreIncreases: { strength: 1, dexterity: 1, constitution: 1 },
      ...(draft.level >= 3 ? { subclassId: championId } : {}),
      featAbilityScoreIncreases: draft.level >= 4 ? { [draft.asiAbility]: 2 } : {},
      featIds,
      learnedSpellIds: [],
      choices: [],
      proficiencyChoices: {
        skills: [
          ...draft.classSkillIds.map((skillId) => ({ skillId, sourceId: fighterId })),
          { skillId: draft.speciesSkillId, sourceId: humanId },
          ...draft.skilledSkillIds.map((skillId) => ({ skillId, sourceId: skilledId })),
        ],
        expertise: [],
      },
    },
    loadout: {
      inventory: [
        { id: "chain-mail-1", entityId: "srd521.equipment.armor.heavy.chain-mail", quantity: 1 },
        { id: "greatsword-1", entityId: "srd521.equipment.weapon.greatsword", quantity: 1 },
        { id: "flail-1", entityId: "srd521.equipment.weapon.flail", quantity: 1 },
        { id: "javelins", entityId: "srd521.equipment.weapon.javelin", quantity: 8 },
        { id: "longbow-1", entityId: "srd521.equipment.weapon.longbow", quantity: 1 },
      ],
      equippedItemIds: ["chain-mail-1", "greatsword-1"],
      attunedItemIds: [],
      selectedWeaponMasteryIds: draft.weaponMasteryIds,
      preparedSpellIds: [],
      choices: [],
    },
    state: {
      currentHitPoints: 1,
      temporaryHitPoints: 0,
      expendedResources: {},
      expendedHitDice: {},
      expendedSpellSlots: {},
      conditionIds: [],
      activeEffectIds: [],
      heroicInspiration: false,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      exhaustion: 0,
    },
    overrides: [],
    metadata: { createdAt: timestamp, updatedAt: timestamp, revision: 0 },
  });
}

export function previewFighterCharacter(
  draft: FighterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): BuilderPreview {
  const catalog = fighterBuilderCatalog(rulesPackage);
  const issues = validateFighterDraft(draft, catalog);
  if (issues.length > 0) return { issues };
  try {
    const character = assembleCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    return {
      character,
      evaluation,
      issues: evaluation.validations
        .filter((validation) => validation.severity === "error")
        .map(
          (validation) =>
            validation.message.en ?? Object.values(validation.message)[0] ?? validation.code,
        ),
    };
  } catch (error) {
    return { issues: [error instanceof Error ? error.message : "Character preview failed."] };
  }
}

export function buildFighterCharacter(
  draft: FighterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): CharacterDocument {
  const preview = previewFighterCharacter(draft, rulesPackage, options);
  if (
    preview.character === undefined ||
    preview.evaluation === undefined ||
    preview.issues.length > 0
  ) {
    throw new Error(preview.issues[0] ?? "The character is not ready to create.");
  }
  const maximumHitPoints = preview.evaluation.facts["hitPoints.maximum"];
  if (typeof maximumHitPoints !== "number") throw new Error("Maximum Hit Points are missing.");
  return characterDocumentSchema.parse({
    ...preview.character,
    state: { ...preview.character.state, currentHitPoints: maximumHitPoints },
  });
}
