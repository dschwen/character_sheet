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

export const builderClassIds = [fighterId, wizardId] as const;
export type BuilderClassId = (typeof builderClassIds)[number];

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

export interface SpellOption {
  id: string;
  name: string;
  level: number;
  school: string;
}

export interface ClassBuilderCatalog {
  id: BuilderClassId;
  name: string;
  subclassId?: string;
  subclassName?: string;
  subclassLevel?: number;
  skillIds: string[];
  skillMinimum: number;
  skillMaximum: number;
  description: string;
  weaponMasteryCountByLevel: Readonly<Record<number, number>>;
  spellcasting?: ClassSpellcastingCatalog;
}

export type SpellPreparationMode = "spellbook" | "full-list";

export interface SpellSelectionCounts {
  cantrips: number;
  learnedLeveledSpells: number;
  preparedSpells: number;
  maximumSpellLevel: number;
  alwaysPreparedSpellIds: string[];
}

export interface ClassSpellcastingCatalog {
  ability: Ability;
  preparation: SpellPreparationMode;
  spells: SpellOption[];
  countsByLevel: Readonly<Record<number, SpellSelectionCounts>>;
}

export interface BuilderCatalog {
  classes: Readonly<Record<BuilderClassId, ClassBuilderCatalog>>;
  speciesName: string;
  backgroundName: string;
  backgroundSkillIds: string[];
  weaponIds: string[];
  weaponNames: Readonly<Record<string, string>>;
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function spellsGrantedThroughLevel(value: unknown, level: number): string[] {
  const record = objectValue(value);
  if (record === undefined) return [];
  return Object.entries(record).flatMap(([grantLevel, spellIds]) =>
    Number(grantLevel) <= level ? stringArray(spellIds) : [],
  );
}

function classCatalog(
  classId: BuilderClassId,
  rulesPackage: LoadedRulesPackage,
): ClassBuilderCatalog {
  const classEntity = rulesPackage.entities.find((entity) => entity.id === classId);
  const classBody = objectValue(classEntity?.body);
  const skillChoice = objectValue(classBody?.skillProficiencyChoice);
  const options = skillChoice?.options;
  const progression = Array.isArray(classBody?.progression) ? classBody.progression : undefined;
  if (!Array.isArray(options) || progression === undefined) {
    throw new Error(`${shortEntityName(classId)} builder metadata is missing.`);
  }
  const subclassEntity = rulesPackage.entities.find((candidate) => {
    if (candidate.kind !== "subclass") return false;
    return objectValue(candidate.body)?.parentClassId === classId;
  });
  const subclassProgression = objectValue(subclassEntity?.body)?.progression;
  const subclassLevel = Array.isArray(subclassProgression)
    ? Math.min(
        ...subclassProgression
          .map((row) => numericValue(objectValue(row)?.level, Number.POSITIVE_INFINITY))
          .filter(Number.isFinite),
      )
    : undefined;
  const weaponMasteryCountByLevel = Object.fromEntries(
    progression
      .map((row) => objectValue(row))
      .filter((row): row is Readonly<Record<string, unknown>> => row !== undefined)
      .filter((row) => typeof row.level === "number" && row.level <= 5)
      .map((row) => [row.level as number, numericValue(row.weaponMastery)]),
  ) as Record<number, number>;

  const preparation = classBody?.spellPreparation;
  const spellList = classBody?.spellList;
  const spellcastingAbility = classBody?.spellcastingAbility;
  let spellcasting: ClassSpellcastingCatalog | undefined;
  if (
    (preparation === "spellbook" || preparation === "full-list") &&
    Array.isArray(spellList) &&
    abilities.some((ability) => ability === spellcastingAbility)
  ) {
    const spellbookStartingSpells = numericValue(classBody?.spellbookStartingSpells);
    const spellbookSpellsPerLevel = numericValue(classBody?.spellbookSpellsPerLevel);
    const subclassAlwaysPrepared = objectValue(subclassEntity?.body)?.alwaysPreparedSpells;
    const countsByLevel = Object.fromEntries(
      progression
        .map((row) => objectValue(row))
        .filter((row): row is Readonly<Record<string, unknown>> => row !== undefined)
        .filter((row) => typeof row.level === "number" && row.level <= 5)
        .map((row) => {
          const level = row.level as number;
          const slots = objectValue(row.spellSlots);
          return [
            level,
            {
              cantrips: numericValue(row.cantrips),
              learnedLeveledSpells:
                preparation === "spellbook"
                  ? spellbookStartingSpells + spellbookSpellsPerLevel * Math.max(0, level - 1)
                  : 0,
              preparedSpells: numericValue(row.preparedSpells),
              maximumSpellLevel: Math.max(0, ...Object.keys(slots ?? {}).map(Number)),
              alwaysPreparedSpellIds: [
                ...spellsGrantedThroughLevel(classBody?.alwaysPreparedSpells, level),
                ...spellsGrantedThroughLevel(subclassAlwaysPrepared, level),
              ],
            },
          ];
        }),
    ) as Record<number, SpellSelectionCounts>;
    const maximumSupportedSpellLevel = Math.max(
      0,
      ...Object.values(countsByLevel).map((counts) => counts.maximumSpellLevel),
    );
    const allowedSpells = new Set(stringArray(spellList));
    const spells = rulesPackage.entities
      .filter((candidate) => candidate.kind === "spell" && allowedSpells.has(candidate.id))
      .map((spell) => {
        const body = objectValue(spell.body);
        return {
          id: spell.id,
          name: localizedName(spell),
          level: numericValue(body?.level, 99),
          school: typeof body?.school === "string" ? body.school : "unknown",
        };
      })
      .filter((spell) => spell.level <= maximumSupportedSpellLevel)
      .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
    spellcasting = {
      ability: spellcastingAbility as Ability,
      preparation,
      spells,
      countsByLevel,
    };
  }

  const primaryAbilities = stringArray(classBody?.primaryAbilities)
    .map((ability) => shortEntityName(ability))
    .join(" or ");
  const hitPointDie = numericValue(classBody?.hitPointDie);
  const focus = spellcasting
    ? spellcasting.preparation === "spellbook"
      ? "a growing spellbook"
      : "prepared magic"
    : Math.max(0, ...Object.values(weaponMasteryCountByLevel)) > 0
      ? "Weapon Mastery"
      : "martial training";
  return {
    id: classId,
    name: localizedName(classEntity),
    ...(subclassEntity === undefined
      ? {}
      : {
          subclassId: subclassEntity.id,
          subclassName: localizedName(subclassEntity),
          ...(subclassLevel === undefined ? {} : { subclassLevel }),
        }),
    skillIds: options
      .filter((option): option is string => typeof option === "string")
      .map(normalizedSkillId),
    skillMinimum: numericValue(skillChoice?.minimum),
    skillMaximum: numericValue(skillChoice?.maximum),
    description: `${primaryAbilities || "Adventuring"} specialist with a d${String(hitPointDie)} Hit Die and ${focus}.`,
    weaponMasteryCountByLevel,
    ...(spellcasting === undefined ? {} : { spellcasting }),
  };
}

export function characterBuilderCatalog(rulesPackage: LoadedRulesPackage): BuilderCatalog {
  const entity = (id: string) => rulesPackage.entities.find((candidate) => candidate.id === id);
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
  };
}

function fillSelections(current: string[], candidates: string[], count: number): string[] {
  const valid = current.filter(
    (id, index) => candidates.includes(id) && current.indexOf(id) === index,
  );
  return [...valid, ...candidates.filter((id) => !valid.includes(id))].slice(0, count);
}

function spellSelections(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  level: number,
): Pick<CharacterBuilderDraft, "learnedSpellIds" | "preparedSpellIds"> {
  const spellcasting = catalog.classes[draft.classId].spellcasting;
  const counts = spellcasting?.countsByLevel[level];
  if (spellcasting === undefined || counts === undefined) {
    return { learnedSpellIds: [], preparedSpellIds: [] };
  }
  const cantripCandidates = spellcasting.spells
    .filter((spell) => spell.level === 0)
    .map((spell) => spell.id);
  const leveledCandidates = spellcasting.spells
    .filter((spell) => spell.level > 0 && spell.level <= counts.maximumSpellLevel)
    .map((spell) => spell.id);
  const cantrips = fillSelections(
    draft.learnedSpellIds.filter((id) => cantripCandidates.includes(id)),
    cantripCandidates,
    counts.cantrips,
  );
  const leveled =
    spellcasting.preparation === "spellbook"
      ? fillSelections(
          draft.learnedSpellIds.filter((id) => leveledCandidates.includes(id)),
          leveledCandidates,
          counts.learnedLeveledSpells,
        )
      : [];
  const learnedSpellIds = [...cantrips, ...leveled];
  const preparedCandidates = (
    spellcasting.preparation === "spellbook" ? leveled : leveledCandidates
  ).filter((id) => !counts.alwaysPreparedSpellIds.includes(id));
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
  const selectedClass = catalog.classes[classId];
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
    weaponMasteryIds: fighterWeaponIds.slice(
      0,
      selectedClass.weaponMasteryCountByLevel[level] ?? 0,
    ),
    learnedSpellIds: [],
    preparedSpellIds: [],
  };
  return selectedClass.spellcasting === undefined
    ? draft
    : { ...draft, ...spellSelections(draft, catalog, level) };
}

export function updateBuilderLevel(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  level: number,
): CharacterBuilderDraft {
  const selectedClass = catalog.classes[draft.classId];
  const next = {
    ...draft,
    level,
    weaponMasteryIds: fillSelections(
      draft.weaponMasteryIds,
      catalog.weaponIds,
      selectedClass.weaponMasteryCountByLevel[level] ?? 0,
    ),
    scholarSkillId:
      draft.classId === wizardId && level >= 2
        ? draft.classSkillIds.includes(draft.scholarSkillId)
          ? draft.scholarSkillId
          : (draft.classSkillIds.find((id) => id !== `${skillPrefix}insight`) ?? "")
        : "",
  };
  return selectedClass.spellcasting === undefined
    ? next
    : { ...next, ...spellSelections(next, catalog, level) };
}

export function masteryCount(draft: CharacterBuilderDraft, catalog: BuilderCatalog): number {
  return catalog.classes[draft.classId].weaponMasteryCountByLevel[draft.level] ?? 0;
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
    draft.classSkillIds.length < selectedClass.skillMinimum ||
    draft.classSkillIds.length > selectedClass.skillMaximum ||
    new Set(draft.classSkillIds).size !== draft.classSkillIds.length ||
    draft.classSkillIds.some((id) => !selectedClass.skillIds.includes(id))
  ) {
    const count =
      selectedClass.skillMinimum === selectedClass.skillMaximum
        ? `exactly ${String(selectedClass.skillMinimum)}`
        : `${String(selectedClass.skillMinimum)}–${String(selectedClass.skillMaximum)}`;
    issues.push(`Choose ${count} ${selectedClass.name} skill proficiencies.`);
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

  const requiredMasteries = masteryCount(draft, catalog);
  if (
    draft.weaponMasteryIds.length !== requiredMasteries ||
    new Set(draft.weaponMasteryIds).size !== requiredMasteries ||
    draft.weaponMasteryIds.some((id) => !catalog.weaponIds.includes(id))
  ) {
    issues.push(`Choose exactly ${String(requiredMasteries)} Weapon Masteries.`);
  }
  if (
    draft.classId === wizardId &&
    draft.level >= 2 &&
    (!draft.classSkillIds.includes(draft.scholarSkillId) ||
      !scholarSkillIds.includes(draft.scholarSkillId))
  ) {
    issues.push("Choose one proficient Wizard skill for Scholar Expertise.");
  }
  const spellcasting = selectedClass.spellcasting;
  const counts = spellcasting?.countsByLevel[draft.level];
  if (spellcasting !== undefined && counts !== undefined) {
    const spellById = new Map(spellcasting.spells.map((spell) => [spell.id, spell]));
    const learned = draft.learnedSpellIds.map((id) => spellById.get(id));
    const cantripCount = learned.filter((spell) => spell?.level === 0).length;
    const leveledCount = learned.filter(
      (spell) => spell !== undefined && spell.level > 0 && spell.level <= counts.maximumSpellLevel,
    ).length;
    if (
      new Set(draft.learnedSpellIds).size !== draft.learnedSpellIds.length ||
      cantripCount !== counts.cantrips ||
      leveledCount !== counts.learnedLeveledSpells ||
      learned.some((spell) => spell === undefined || spell.level > counts.maximumSpellLevel)
    ) {
      const learnedRequirement =
        spellcasting.preparation === "spellbook"
          ? ` and ${String(counts.learnedLeveledSpells)} spellbook spells`
          : "";
      issues.push(
        `Choose ${String(counts.cantrips)} cantrips${learnedRequirement} available at this level.`,
      );
    }
    const preparedCandidates =
      spellcasting.preparation === "spellbook"
        ? new Set(draft.learnedSpellIds)
        : new Set(
            spellcasting.spells
              .filter((spell) => spell.level > 0 && spell.level <= counts.maximumSpellLevel)
              .map((spell) => spell.id),
          );
    if (
      draft.preparedSpellIds.length !== counts.preparedSpells ||
      new Set(draft.preparedSpellIds).size !== draft.preparedSpellIds.length ||
      draft.preparedSpellIds.some(
        (id) =>
          !preparedCandidates.has(id) ||
          spellById.get(id)?.level === 0 ||
          counts.alwaysPreparedSpellIds.includes(id),
      )
    ) {
      issues.push(`Prepare exactly ${String(counts.preparedSpells)} ${selectedClass.name} spells.`);
    }
  }
  return issues;
}

function assembleCharacter(
  draft: CharacterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): CharacterDocument {
  const selectedClass = classCatalog(draft.classId, rulesPackage);
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
  const spellcaster = selectedClass.spellcasting !== undefined;
  const hasSubclass =
    selectedClass.subclassId !== undefined &&
    selectedClass.subclassLevel !== undefined &&
    draft.level >= selectedClass.subclassLevel;
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
      ...(hasSubclass ? { subclassId: selectedClass.subclassId } : {}),
      featAbilityScoreIncreases: draft.level >= 4 ? { [draft.asiAbility]: 2 } : {},
      featIds,
      learnedSpellIds: spellcaster ? draft.learnedSpellIds : [],
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
      preparedSpellIds: spellcaster ? draft.preparedSpellIds : [],
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
