import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

import { abilities, type Ability, shortEntityName } from "./presentation";

export const fighterId = "srd521.class.fighter";
export const wizardId = "srd521.class.wizard";
const humanId = "srd521.species.human";
const soldierId = "srd521.background.soldier";
const skilledId = "srd521.feat.origin.skilled";
const savageAttackerId = "srd521.feat.origin.savage-attacker";
const defenseStyleId = "srd521.feat.fighting-style.defense";
const abilityScoreImprovementId = "srd521.feat.general.ability-score-improvement";
const scholarId = "srd521.class-feature.wizard.scholar";
const skillPrefix = "srd521.skill.";
const scholarSkillIds = [
  "arcana",
  "history",
  "investigation",
  "medicine",
  "nature",
  "religion",
].map((skill) => `${skillPrefix}${skill}`);

const subclassIds = {
  [fighterId]: "srd521.subclass.fighter.champion",
  [wizardId]: "srd521.subclass.wizard.evoker",
} as const;

export type BuilderClassId = keyof typeof subclassIds;

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

const fighterWeaponIds = [
  "srd521.equipment.weapon.greatsword",
  "srd521.equipment.weapon.flail",
  "srd521.equipment.weapon.javelin",
  "srd521.equipment.weapon.longbow",
];

const preferredWizardSpellIds = [
  "srd521.spell.acid-splash",
  "srd521.spell.light",
  "srd521.spell.mage-hand",
  "srd521.spell.ray-of-frost",
  "srd521.spell.detect-magic",
  "srd521.spell.mage-armor",
  "srd521.spell.magic-missile",
  "srd521.spell.shield",
  "srd521.spell.burning-hands",
  "srd521.spell.feather-fall",
  "srd521.spell.chromatic-orb",
  "srd521.spell.sleep",
  "srd521.spell.thunderwave",
  "srd521.spell.misty-step",
  "srd521.spell.scorching-ray",
  "srd521.spell.shatter",
  "srd521.spell.web",
  "srd521.spell.fireball",
];

const preferredPreparedSpellIds = [
  "srd521.spell.detect-magic",
  "srd521.spell.mage-armor",
  "srd521.spell.magic-missile",
  "srd521.spell.shield",
  "srd521.spell.thunderwave",
  "srd521.spell.misty-step",
  "srd521.spell.scorching-ray",
  "srd521.spell.web",
  "srd521.spell.fireball",
];

export interface CharacterBuilderDraft {
  classId: BuilderClassId;
  name: string;
  level: number;
  abilityScores: Record<Ability, number>;
  asiAbility: Ability;
  classSkillIds: string[];
  speciesSkillId: string;
  skilledSkillIds: string[];
  scholarSkillId: string;
  weaponMasteryIds: string[];
  learnedSpellIds: string[];
  preparedSpellIds: string[];
}

export interface WizardSpellOption {
  id: string;
  name: string;
  level: number;
  school: string;
}

export interface ClassBuilderCatalog {
  id: BuilderClassId;
  name: string;
  subclassId: string;
  subclassName: string;
  skillIds: string[];
  description: string;
}

export interface WizardSpellCounts {
  cantrips: number;
  spellbookSpells: number;
  preparedSpells: number;
  maximumSpellLevel: number;
}

export interface BuilderCatalog {
  classes: Readonly<Record<BuilderClassId, ClassBuilderCatalog>>;
  speciesName: string;
  backgroundName: string;
  backgroundSkillIds: string[];
  weaponIds: string[];
  weaponNames: Readonly<Record<string, string>>;
  masteryCountByLevel: Readonly<Record<number, number>>;
  wizardSpells: WizardSpellOption[];
  wizardSpellCountsByLevel: Readonly<Record<number, WizardSpellCounts>>;
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

function numericValue(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function classCatalog(
  classId: BuilderClassId,
  rulesPackage: LoadedRulesPackage,
): ClassBuilderCatalog {
  const classEntity = rulesPackage.entities.find((entity) => entity.id === classId);
  const classBody = objectValue(classEntity?.body);
  const skillChoice = objectValue(classBody?.skillProficiencyChoice);
  const options = skillChoice?.options;
  if (!Array.isArray(options)) {
    throw new Error(`${shortEntityName(classId)} builder metadata is missing.`);
  }
  return {
    id: classId,
    name: localizedName(classEntity),
    subclassId: subclassIds[classId],
    subclassName: localizedName(
      rulesPackage.entities.find((entity) => entity.id === subclassIds[classId]),
    ),
    skillIds: options
      .filter((option): option is string => typeof option === "string")
      .map(normalizedSkillId),
    description:
      classId === fighterId
        ? "Martial specialist with broad weapon training and durable defenses."
        : "Arcane scholar with a growing spellbook, prepared magic, and ritual casting.",
  };
}

export function characterBuilderCatalog(rulesPackage: LoadedRulesPackage): BuilderCatalog {
  const entity = (id: string) => rulesPackage.entities.find((candidate) => candidate.id === id);
  const fighterBody = objectValue(entity(fighterId)?.body);
  const fighterProgression = fighterBody?.progression;
  const wizardBody = objectValue(entity(wizardId)?.body);
  const wizardProgression = wizardBody?.progression;
  const wizardSpellList = wizardBody?.spellList;
  if (
    !Array.isArray(fighterProgression) ||
    !Array.isArray(wizardProgression) ||
    !Array.isArray(wizardSpellList)
  ) {
    throw new Error("Builder progression metadata is missing from the loaded rules package.");
  }

  const masteryCountByLevel = Object.fromEntries(
    fighterProgression
      .map((row) => objectValue(row))
      .filter((row): row is Readonly<Record<string, unknown>> => row !== undefined)
      .filter((row) => typeof row.level === "number" && row.level <= 5)
      .map((row) => [row.level as number, numericValue(row.weaponMastery)]),
  ) as Record<number, number>;

  const wizardSpellCountsByLevel = Object.fromEntries(
    wizardProgression
      .map((row) => objectValue(row))
      .filter((row): row is Readonly<Record<string, unknown>> => row !== undefined)
      .filter((row) => typeof row.level === "number" && row.level <= 5)
      .map((row) => {
        const level = row.level as number;
        const slots = objectValue(row.spellSlots);
        const maximumSpellLevel = Math.max(1, ...Object.keys(slots ?? {}).map(Number));
        return [
          level,
          {
            cantrips: numericValue(row.cantrips),
            spellbookSpells: 6 + 2 * (level - 1),
            preparedSpells: numericValue(row.preparedSpells),
            maximumSpellLevel,
          },
        ];
      }),
  ) as Record<number, WizardSpellCounts>;

  const spellList = new Set(wizardSpellList.filter((id): id is string => typeof id === "string"));
  const preferredOrder = new Map(preferredWizardSpellIds.map((id, index) => [id, index]));
  const wizardSpells = rulesPackage.entities
    .filter((candidate) => candidate.kind === "spell" && spellList.has(candidate.id))
    .map((spell) => {
      const body = objectValue(spell.body);
      return {
        id: spell.id,
        name: localizedName(spell),
        level: numericValue(body?.level, 99),
        school: typeof body?.school === "string" ? body.school : "unknown",
      };
    })
    .filter((spell) => spell.level <= 3)
    .sort((left, right) => {
      const preferred =
        (preferredOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (preferredOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER);
      return preferred !== 0
        ? preferred
        : left.level - right.level || left.name.localeCompare(right.name);
    });

  const backgroundBody = objectValue(entity(soldierId)?.body);
  const backgroundSkills = backgroundBody?.skillProficiencies;
  const backgroundSkillIds = Array.isArray(backgroundSkills)
    ? backgroundSkills.filter((skill): skill is string => typeof skill === "string")
    : [];

  return {
    classes: {
      [fighterId]: classCatalog(fighterId, rulesPackage),
      [wizardId]: classCatalog(wizardId, rulesPackage),
    },
    speciesName: localizedName(entity(humanId)),
    backgroundName: localizedName(entity(soldierId)),
    backgroundSkillIds,
    weaponIds: fighterWeaponIds,
    weaponNames: Object.fromEntries(fighterWeaponIds.map((id) => [id, localizedName(entity(id))])),
    masteryCountByLevel,
    wizardSpells,
    wizardSpellCountsByLevel,
  };
}

function fillSelections(current: string[], candidates: string[], count: number): string[] {
  const valid = current.filter(
    (id, index) => candidates.includes(id) && current.indexOf(id) === index,
  );
  return [...valid, ...candidates.filter((id) => !valid.includes(id))].slice(0, count);
}

function wizardSelections(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  level: number,
): Pick<CharacterBuilderDraft, "learnedSpellIds" | "preparedSpellIds"> {
  const counts = catalog.wizardSpellCountsByLevel[level];
  if (counts === undefined) return { learnedSpellIds: [], preparedSpellIds: [] };
  const cantripCandidates = catalog.wizardSpells
    .filter((spell) => spell.level === 0)
    .map((spell) => spell.id);
  const leveledCandidates = catalog.wizardSpells
    .filter((spell) => spell.level > 0 && spell.level <= counts.maximumSpellLevel)
    .map((spell) => spell.id);
  const cantrips = fillSelections(
    draft.learnedSpellIds.filter((id) => cantripCandidates.includes(id)),
    cantripCandidates,
    counts.cantrips,
  );
  const leveled = fillSelections(
    draft.learnedSpellIds.filter((id) => leveledCandidates.includes(id)),
    leveledCandidates,
    counts.spellbookSpells,
  );
  const learnedSpellIds = [...cantrips, ...leveled];
  const preparedCandidates = [
    ...preferredPreparedSpellIds.filter((id) => leveled.includes(id)),
    ...leveled.filter((id) => !preferredPreparedSpellIds.includes(id)),
  ];
  return {
    learnedSpellIds,
    preparedSpellIds: fillSelections(
      draft.preparedSpellIds,
      preparedCandidates,
      counts.preparedSpells,
    ),
  };
}

export function defaultBuilderDraft(
  classId: BuilderClassId,
  catalog: BuilderCatalog,
  level = 1,
  name = "",
): CharacterBuilderDraft {
  const fighter = classId === fighterId;
  const draft: CharacterBuilderDraft = {
    classId,
    name,
    level,
    abilityScores: fighter
      ? {
          strength: 15,
          dexterity: 13,
          constitution: 13,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        }
      : {
          strength: 8,
          dexterity: 14,
          constitution: 13,
          intelligence: 15,
          wisdom: 12,
          charisma: 10,
        },
    asiAbility: fighter ? "strength" : "intelligence",
    classSkillIds: fighter
      ? [`${skillPrefix}perception`, `${skillPrefix}survival`]
      : [`${skillPrefix}arcana`, `${skillPrefix}investigation`],
    speciesSkillId: fighter ? `${skillPrefix}persuasion` : `${skillPrefix}perception`,
    skilledSkillIds: fighter
      ? [`${skillPrefix}arcana`, `${skillPrefix}insight`, `${skillPrefix}stealth`]
      : [`${skillPrefix}persuasion`, `${skillPrefix}stealth`, `${skillPrefix}survival`],
    scholarSkillId: classId === wizardId && level >= 2 ? `${skillPrefix}arcana` : "",
    weaponMasteryIds: fighterWeaponIds.slice(0, catalog.masteryCountByLevel[level] ?? 0),
    learnedSpellIds: [],
    preparedSpellIds: [],
  };
  return classId === wizardId ? { ...draft, ...wizardSelections(draft, catalog, level) } : draft;
}

export function updateBuilderLevel(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  level: number,
): CharacterBuilderDraft {
  if (draft.classId === fighterId) {
    return {
      ...draft,
      level,
      weaponMasteryIds: fillSelections(
        draft.weaponMasteryIds,
        catalog.weaponIds,
        catalog.masteryCountByLevel[level] ?? 0,
      ),
    };
  }
  const next = {
    ...draft,
    level,
    scholarSkillId:
      level >= 2
        ? draft.classSkillIds.includes(draft.scholarSkillId)
          ? draft.scholarSkillId
          : (draft.classSkillIds.find((id) => id !== `${skillPrefix}insight`) ?? "")
        : "",
  };
  return { ...next, ...wizardSelections(next, catalog, level) };
}

export function masteryCount(draft: CharacterBuilderDraft, catalog: BuilderCatalog): number {
  return draft.classId === fighterId ? (catalog.masteryCountByLevel[draft.level] ?? 0) : 0;
}

export function validateBuilderDraft(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): string[] {
  const issues: string[] = [];
  const selectedClass = catalog.classes[draft.classId];
  if (draft.name.trim().length === 0) issues.push("Enter a character name.");
  if (!Number.isInteger(draft.level) || draft.level < 1 || draft.level > 5) {
    issues.push(`Choose a ${selectedClass.name} level from 1 through 5.`);
  }
  for (const ability of abilities) {
    const score = draft.abilityScores[ability];
    if (!Number.isInteger(score) || score < 3 || score > 18) {
      issues.push(`${shortEntityName(ability)} must be a whole number from 3 through 18.`);
    }
  }
  if (
    draft.classSkillIds.length !== 2 ||
    new Set(draft.classSkillIds).size !== 2 ||
    draft.classSkillIds.some((id) => !selectedClass.skillIds.includes(id))
  ) {
    issues.push(`Choose exactly two ${selectedClass.name} skill proficiencies.`);
  }
  const allSkillOptions = skillIds.map((id) => `${skillPrefix}${id}`);
  if (!allSkillOptions.includes(draft.speciesSkillId)) {
    issues.push("Choose one Human skill proficiency.");
  }
  if (
    draft.skilledSkillIds.length !== 3 ||
    new Set(draft.skilledSkillIds).size !== 3 ||
    draft.skilledSkillIds.some((id) => !allSkillOptions.includes(id))
  ) {
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

  if (draft.classId === fighterId) {
    const requiredMasteries = masteryCount(draft, catalog);
    if (
      draft.weaponMasteryIds.length !== requiredMasteries ||
      new Set(draft.weaponMasteryIds).size !== requiredMasteries ||
      draft.weaponMasteryIds.some((id) => !catalog.weaponIds.includes(id))
    ) {
      issues.push(`Choose exactly ${String(requiredMasteries)} Weapon Masteries.`);
    }
  } else {
    const counts = catalog.wizardSpellCountsByLevel[draft.level];
    if (
      draft.level >= 2 &&
      (!draft.classSkillIds.includes(draft.scholarSkillId) ||
        !scholarSkillIds.includes(draft.scholarSkillId))
    ) {
      issues.push("Choose one proficient Wizard skill for Scholar Expertise.");
    }
    if (counts !== undefined) {
      const spellById = new Map(catalog.wizardSpells.map((spell) => [spell.id, spell]));
      const learned = draft.learnedSpellIds.map((id) => spellById.get(id));
      const cantripCount = learned.filter((spell) => spell?.level === 0).length;
      const leveledCount = learned.filter(
        (spell) =>
          spell !== undefined && spell.level > 0 && spell.level <= counts.maximumSpellLevel,
      ).length;
      if (
        new Set(draft.learnedSpellIds).size !== draft.learnedSpellIds.length ||
        cantripCount !== counts.cantrips ||
        leveledCount !== counts.spellbookSpells ||
        learned.some((spell) => spell === undefined || spell.level > counts.maximumSpellLevel)
      ) {
        issues.push(
          `Choose ${String(counts.cantrips)} cantrips and ${String(counts.spellbookSpells)} spellbook spells available at this level.`,
        );
      }
      if (
        draft.preparedSpellIds.length !== counts.preparedSpells ||
        new Set(draft.preparedSpellIds).size !== draft.preparedSpellIds.length ||
        draft.preparedSpellIds.some(
          (id) => !draft.learnedSpellIds.includes(id) || spellById.get(id)?.level === 0,
        )
      ) {
        issues.push(`Prepare exactly ${String(counts.preparedSpells)} spellbook spells.`);
      }
    }
  }
  return issues;
}

function assembleCharacter(
  draft: CharacterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): CharacterDocument {
  const levels = Array.from({ length: draft.level }, (_, index) => ({
    characterLevel: index + 1,
    classId: draft.classId,
    hitPointChoice: "fixed" as const,
  }));
  const featIds = [savageAttackerId, skilledId];
  if (draft.classId === fighterId) featIds.unshift(defenseStyleId);
  if (draft.level >= 4) featIds.push(abilityScoreImprovementId);
  const timestamp = options.now.toISOString();
  const fighter = draft.classId === fighterId;
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
      ...(draft.level >= 3 ? { subclassId: subclassIds[draft.classId] } : {}),
      featAbilityScoreIncreases: draft.level >= 4 ? { [draft.asiAbility]: 2 } : {},
      featIds,
      learnedSpellIds: fighter ? [] : draft.learnedSpellIds,
      choices: [],
      proficiencyChoices: {
        skills: [
          ...draft.classSkillIds.map((skillId) => ({ skillId, sourceId: draft.classId })),
          { skillId: draft.speciesSkillId, sourceId: humanId },
          ...draft.skilledSkillIds.map((skillId) => ({ skillId, sourceId: skilledId })),
        ],
        expertise:
          draft.classId === wizardId && draft.level >= 2
            ? [{ skillId: draft.scholarSkillId, sourceId: scholarId }]
            : [],
      },
    },
    loadout: {
      inventory: fighter
        ? [
            {
              id: "chain-mail-1",
              entityId: "srd521.equipment.armor.heavy.chain-mail",
              quantity: 1,
            },
            {
              id: "greatsword-1",
              entityId: "srd521.equipment.weapon.greatsword",
              quantity: 1,
            },
            { id: "flail-1", entityId: "srd521.equipment.weapon.flail", quantity: 1 },
            { id: "javelins", entityId: "srd521.equipment.weapon.javelin", quantity: 8 },
            { id: "longbow-1", entityId: "srd521.equipment.weapon.longbow", quantity: 1 },
          ]
        : [],
      equippedItemIds: fighter ? ["chain-mail-1", "greatsword-1"] : [],
      attunedItemIds: [],
      selectedWeaponMasteryIds: fighter ? draft.weaponMasteryIds : [],
      preparedSpellIds: fighter ? [] : draft.preparedSpellIds,
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

export function previewBuilderCharacter(
  draft: CharacterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): BuilderPreview {
  const catalog = characterBuilderCatalog(rulesPackage);
  const issues = validateBuilderDraft(draft, catalog);
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

export function buildCharacter(
  draft: CharacterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): CharacterDocument {
  const preview = previewBuilderCharacter(draft, rulesPackage, options);
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
