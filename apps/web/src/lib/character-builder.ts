import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import {
  classBuilderMetadataSchema,
  classFeatureChoiceSchema,
  startingEquipmentChoiceSchema,
  type ClassBuilderMetadata,
  type ClassFeatureChoice,
  type StartingEquipmentChoice,
  type StartingEquipmentOption,
} from "@dnd/content-schema";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

import { abilities, type Ability, shortEntityName, titleCase } from "./presentation";

export const fighterId = "srd521.class.fighter";
export const wizardId = "srd521.class.wizard";
export const barbarianId = "srd521.class.barbarian";
export const bardId = "srd521.class.bard";
export const clericId = "srd521.class.cleric";
export const druidId = "srd521.class.druid";
export const monkId = "srd521.class.monk";
export const paladinId = "srd521.class.paladin";
export const rangerId = "srd521.class.ranger";
export const rogueId = "srd521.class.rogue";
export const sorcererId = "srd521.class.sorcerer";
export const warlockId = "srd521.class.warlock";
const abilityScoreImprovementId = "srd521.feat.general.ability-score-improvement";
const skillPrefix = "srd521.skill.";

export const builderClassIds = [
  barbarianId,
  bardId,
  clericId,
  druidId,
  fighterId,
  monkId,
  paladinId,
  rangerId,
  rogueId,
  sorcererId,
  warlockId,
  wizardId,
] as const;
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

export interface CharacterBuilderDraft {
  classId: BuilderClassId;
  speciesId: string;
  speciesSize: SpeciesSize;
  backgroundId: string;
  backgroundAbilityScoreIncreases: Partial<Record<Ability, number>>;
  originFeatId: string;
  name: string;
  level: number;
  abilityScores: Record<Ability, number>;
  asiAbilities: Ability[];
  classSkillIds: string[];
  speciesSkillIds: string[];
  speciesChoiceSelections: Readonly<Record<string, string[]>>;
  originFeatSkillIds: string[];
  magicInitiateChoices: Readonly<Record<string, MagicInitiateSelection>>;
  expertiseSkillIds: string[];
  featureChoiceSelections: Readonly<Record<string, string[]>>;
  startingEquipmentOptionId: string;
  weaponMasteryIds: string[];
  learnedSpellIds: string[];
  preparedSpellIds: string[];
}

export interface MagicInitiateSelection {
  ability: Ability;
  cantripIds: string[];
  levelOneSpellId: string;
}

export type SpeciesSize = NonNullable<CharacterDocument["build"]["speciesSize"]>;

export interface BuilderChoiceOption {
  id: string;
  label: string;
  description?: string;
  disabledReason?: string;
  abilityIncreases?: Partial<Record<Ability, number>>;
}

export interface BuilderChoiceDefinition {
  id: string;
  sourceId: string;
  selection:
    | "speciesId"
    | "speciesSize"
    | "backgroundId"
    | "backgroundAbilityScoreIncreases"
    | "originFeatId"
    | "speciesSkillIds"
    | "originFeatSkillIds";
  kind: "single" | "multiple" | "ability-allocation";
  prompt: string;
  minimum: number;
  maximum: number;
  options: BuilderChoiceOption[];
}

export interface SpeciesBuilderCatalog {
  id: string;
  name: string;
  description: string;
  walkingSpeed: number;
  sizeOptions: SpeciesSize[];
  recommendedOriginFeatId?: string;
  skillMinimum: number;
  skillMaximum: number;
  skillIds: string[];
  originFeatMinimum: number;
  originFeatMaximum: number;
  traitNames: string[];
  choices: SpeciesChoiceCatalog[];
}

export interface SpeciesChoiceCatalog {
  id: string;
  prompt: string;
  minimum: number;
  maximum: number;
  options: BuilderChoiceOption[];
  requiredWhen?: { choiceId: string; optionId: string };
  changeOn: string[];
}

export interface BackgroundBuilderCatalog {
  id: string;
  name: string;
  description: string;
  abilityIds: Ability[];
  abilityIncreaseOptions: BuilderChoiceOption[];
  skillIds: string[];
  featId: string;
}

export interface FeatBuilderCatalog {
  id: string;
  name: string;
  description: string;
  category: string;
  repeatable: boolean;
  skillMinimum: number;
  skillMaximum: number;
  magicInitiate?: MagicInitiateCatalog;
}

export interface MagicInitiateCatalog {
  spellListClassId: string;
  abilityIds: Ability[];
  cantripMinimum: number;
  cantripMaximum: number;
  levelOneSpellMinimum: number;
  levelOneSpellMaximum: number;
  cantrips: SpellOption[];
  levelOneSpells: SpellOption[];
  replacementMaximum: number;
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
  skillCountByLevel: Readonly<Record<number, number>>;
  abilityScoreImprovementLevels: number[];
  description: string;
  builder: ClassBuilderMetadata;
  featureChoices: ClassFeatureChoiceCatalog[];
  weaponMasteryIds: string[];
  weaponMasteryCountByLevel: Readonly<Record<number, number>>;
  startingEquipment: StartingEquipmentChoice;
  spellcasting?: ClassSpellcastingCatalog;
}

export interface ClassFeatureChoiceOptionCatalog {
  id: string;
  name: string;
  description: string;
  additionalCantrips: number;
  alwaysPreparedSpellsByLevel: Readonly<Record<string, string[]>>;
  minimumClassLevel: number;
  prerequisiteOptionIds: string[];
  repeatable: boolean;
  grantedFeatId?: string;
}

export interface ClassFeatureChoiceCatalog extends Omit<ClassFeatureChoice, "options"> {
  options: ClassFeatureChoiceOptionCatalog[];
  changeOn?: ("level-up" | "short-rest" | "long-rest")[] | undefined;
}

export function featureChoiceOptionsForLevel(
  choice: ClassFeatureChoiceCatalog,
  level: number,
  search = "",
): ClassFeatureChoiceOptionCatalog[] {
  if (choice.spellSelection === undefined) return choice.options;
  const query = search.trim().toLocaleLowerCase();
  return choice.options.filter(
    (option) =>
      option.minimumClassLevel <= level && option.name.toLocaleLowerCase().includes(query),
  );
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
  preparationChange?: {
    event: "level-up";
    replacementMaximum: number;
  };
  cantripChange?: {
    event: "level-up";
    replacementMaximum: number;
  };
  spells: SpellOption[];
  countsByLevel: Readonly<Record<number, SpellSelectionCounts>>;
}

export interface BuilderCatalog {
  classes: Readonly<Record<BuilderClassId, ClassBuilderCatalog>>;
  species: Readonly<Record<string, SpeciesBuilderCatalog>>;
  backgrounds: Readonly<Record<string, BackgroundBuilderCatalog>>;
  feats: Readonly<Record<string, FeatBuilderCatalog>>;
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

function abilityValue(value: unknown): Ability | undefined {
  return abilities.find((ability) => ability === value);
}

function speciesSizeValue(value: unknown): SpeciesSize | undefined {
  return ["small", "medium", "large"].find((size): size is SpeciesSize => size === value);
}

function entityDescription(entity: LoadedRulesPackage["entities"][number]): string {
  const body = objectValue(entity.body);
  if (typeof body?.description === "string") return body.description;
  if (typeof body?.traitsText === "string") return body.traitsText;
  if (typeof body?.equipmentText === "string") return body.equipmentText;
  if (typeof body?.text === "string") return body.text;
  const text = objectValue(body?.text);
  const nodes = text?.nodes;
  if (Array.isArray(nodes)) {
    const paragraph = nodes
      .map((node) => objectValue(node)?.text)
      .find((value): value is string => typeof value === "string");
    if (paragraph !== undefined) return paragraph;
  }
  return "Reviewed SRD character option.";
}

function classOptionDescription(entity: LoadedRulesPackage["entities"][number]): string {
  const body = objectValue(entity.body);
  const extraDamage = objectValue(body?.extraDamage);
  const extraDamageDice =
    numericValue(extraDamage?.diceCount) > 0 && numericValue(extraDamage?.diceSize) > 0
      ? `${String(numericValue(extraDamage?.diceCount))}d${String(numericValue(extraDamage?.diceSize))} extra damage`
      : undefined;
  const benefits = [
    ...stringArray(body?.armorTraining).map((training) => `${shortEntityName(training)} armor`),
    ...stringArray(body?.weaponProficiencies).map(
      (proficiency) => `${shortEntityName(proficiency)} weapons`,
    ),
    ...(numericValue(body?.additionalCantrips) > 0
      ? [`+${String(numericValue(body?.additionalCantrips))} cantrip`]
      : []),
    ...(typeof body?.knowledgeCheckBonusAbility === "string"
      ? [
          `${shortEntityName(body.knowledgeCheckBonusAbility)} for ${stringArray(body.knowledgeChecks).map(shortEntityName).join(" and ")} checks`,
        ]
      : []),
    ...(objectValue(body?.alwaysPreparedSpells) === undefined
      ? []
      : ["Always-prepared Circle spells"]),
    ...(extraDamageDice === undefined ? [] : [extraDamageDice]),
    ...(numericValue(body?.grantsAttack) > 0
      ? [`+${String(numericValue(body?.grantsAttack))} attack`]
      : []),
    ...(typeof body?.frequency === "string" ? [shortEntityName(body.frequency)] : []),
  ];
  return benefits.length > 0 ? benefits.join(" · ") : entityDescription(entity);
}

function abilityIncreaseOptions(abilityIds: Ability[], value: unknown): BuilderChoiceOption[] {
  if (!Array.isArray(value)) return [];
  const results = new Map<string, BuilderChoiceOption>();
  for (const unparsedPattern of value) {
    if (!Array.isArray(unparsedPattern)) continue;
    const pattern = unparsedPattern.filter(
      (amount): amount is number => typeof amount === "number",
    );
    function assign(
      position: number,
      remaining: Ability[],
      increases: Partial<Record<Ability, number>>,
    ): void {
      if (position >= pattern.length) {
        const entries = abilities
          .filter((ability) => increases[ability] !== undefined)
          .map((ability) => [ability, increases[ability] ?? 0] as const);
        const id = entries.map(([ability, amount]) => `${ability}:${String(amount)}`).join("|");
        results.set(id, {
          id,
          label: entries
            .map(([ability, amount]) => `+${String(amount)} ${shortEntityName(ability)}`)
            .join(", "),
          abilityIncreases: { ...increases },
        });
        return;
      }
      const amount = pattern[position];
      if (amount === undefined) return;
      for (const ability of remaining) {
        assign(
          position + 1,
          remaining.filter((candidate) => candidate !== ability),
          { ...increases, [ability]: amount },
        );
      }
    }
    assign(0, abilityIds, {});
  }
  return [...results.values()].sort((left, right) => left.label.localeCompare(right.label));
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
  const startingEquipment = startingEquipmentChoiceSchema.safeParse(classBody?.startingEquipment);
  if (!startingEquipment.success) {
    throw new Error(`${shortEntityName(classId)} starting-equipment metadata is missing.`);
  }
  const builder = classBuilderMetadataSchema.safeParse(classBody?.builder);
  if (!builder.success) {
    throw new Error(`${shortEntityName(classId)} character-builder metadata is missing.`);
  }
  const subclassEntity = rulesPackage.entities.find((candidate) => {
    if (candidate.kind !== "subclass") return false;
    return objectValue(candidate.body)?.parentClassId === classId;
  });
  const subclassBody = objectValue(subclassEntity?.body);
  const featureChoices = [classBody, subclassBody]
    .flatMap((container) => Object.values(container ?? {}))
    .flatMap((value) => {
      const parsed = classFeatureChoiceSchema.safeParse(value);
      if (!parsed.success) return [];
      const choiceOptions = parsed.data.options.map((optionId) => {
        const option = rulesPackage.entities.find((candidate) => candidate.id === optionId);
        if (option === undefined) {
          throw new Error(
            `${shortEntityName(classId)} feature-choice option ${optionId} is missing.`,
          );
        }
        const optionBody = objectValue(option.body);
        const alwaysPreparedSpells = objectValue(optionBody?.alwaysPreparedSpells);
        return {
          id: option.id,
          name: localizedName(option),
          description: classOptionDescription(option),
          additionalCantrips: numericValue(optionBody?.additionalCantrips),
          minimumClassLevel: numericValue(optionBody?.minimumWarlockLevel, 1),
          prerequisiteOptionIds: stringArray(optionBody?.prerequisiteInvocationIds),
          repeatable: optionBody?.repeatable === true,
          alwaysPreparedSpellsByLevel: Object.fromEntries(
            Object.entries(alwaysPreparedSpells ?? {}).map(([level, spellIds]) => [
              level,
              stringArray(spellIds),
            ]),
          ),
          ...(option.kind === "feat" ? { grantedFeatId: option.id } : {}),
        };
      });
      if (parsed.data.spellSelection !== undefined) {
        for (const option of choiceOptions) {
          const spell = rulesPackage.entities.find((entity) => entity.id === option.id);
          const spellLevel = numericValue(objectValue(spell?.body)?.level, 99);
          const school = objectValue(spell?.body)?.school;
          option.minimumClassLevel =
            spellLevel === 0
              ? parsed.data.spellSelection.allowCantrips
                ? parsed.data.level
                : 99
              : Math.max(
                  parsed.data.level,
                  Math.min(
                    ...progression.flatMap((row) => {
                      const body = objectValue(row);
                      const slots = objectValue(body?.spellSlots);
                      return Object.keys(slots ?? {}).some((level) => Number(level) >= spellLevel)
                        ? [numericValue(body?.level, 99)]
                        : [];
                    }),
                  ),
                );
          if (
            spellLevel > (parsed.data.spellSelection.maximumSpellLevel ?? 9) ||
            (parsed.data.spellSelection.school !== undefined &&
              school !== parsed.data.spellSelection.school)
          )
            option.minimumClassLevel = 99;
          option.description = `${spellLevel === 0 ? "Cantrip" : `Level ${String(spellLevel)}`} · ${parsed.data.spellSelection.alwaysPrepared ? "Always prepared" : "Added to spellbook; prepare normally"} · ${parsed.data.spellSelection.sourceClassIds.map(shortEntityName).join(" / ")}`;
        }
      }
      return [{ ...parsed.data, options: choiceOptions }];
    })
    .sort((left, right) => left.level - right.level || left.id.localeCompare(right.id));
  const subclassProgression = subclassBody?.progression;
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
      .filter(
        (row) => typeof row.level === "number" && row.level <= builder.data.supportedLevelMaximum,
      )
      .map((row) => [row.level as number, numericValue(row.weaponMastery)]),
  ) as Record<number, number>;
  const abilityScoreImprovementLevels = progression
    .map((row) => objectValue(row))
    .filter((row): row is Readonly<Record<string, unknown>> => row !== undefined)
    .filter(
      (row) =>
        typeof row.level === "number" &&
        row.level <= builder.data.supportedLevelMaximum &&
        Array.isArray(row.features) &&
        row.features.some((feature) => objectValue(feature)?.name === "Ability Score Improvement"),
    )
    .map((row) => row.level as number);
  const masteryChoice = objectValue(classBody?.weaponMasteryChoice);
  const masteryCategories = stringArray(masteryChoice?.categories);
  const masteryAttackTypes = stringArray(masteryChoice?.attackTypes);
  const masteryConditions = Array.isArray(masteryChoice?.conditionalCategories)
    ? masteryChoice.conditionalCategories
        .map(objectValue)
        .filter(
          (condition): condition is Readonly<Record<string, unknown>> => condition !== undefined,
        )
    : [];
  const weaponMasteryIds = rulesPackage.entities
    .filter((candidate) => candidate.kind === "equipment-weapon")
    .filter((candidate) => {
      const body = objectValue(candidate.body);
      const baseEligible =
        (masteryCategories.length === 0 ||
          (typeof body?.category === "string" && masteryCategories.includes(body.category))) &&
        (masteryAttackTypes.length === 0 ||
          (typeof body?.attackType === "string" && masteryAttackTypes.includes(body.attackType)));
      const conditionalEligible = masteryConditions.some(
        (condition) =>
          condition.category === body?.category &&
          condition.attackType === body?.attackType &&
          stringArray(condition.requiredProperties).every((property) =>
            stringArray(body?.properties).includes(property),
          ),
      );
      return baseEligible || conditionalEligible;
    })
    .map((candidate) => candidate.id);
  const authoredSkillCountByLevel = objectValue(skillChoice?.countByLevel);
  const skillCountByLevel = Object.fromEntries(
    Array.from(
      {
        length: builder.data.supportedLevelMaximum - builder.data.supportedLevelMinimum + 1,
      },
      (_, index) => builder.data.supportedLevelMinimum + index,
    ).map((level) => [
      level,
      numericValue(authoredSkillCountByLevel?.[String(level)], numericValue(skillChoice?.maximum)),
    ]),
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
    const preparationChange = objectValue(classBody?.spellPreparationChange);
    const cantripChange = objectValue(classBody?.cantripChange);
    const subclassAlwaysPrepared = subclassBody?.alwaysPreparedSpells;
    const countsByLevel = Object.fromEntries(
      progression
        .map((row) => objectValue(row))
        .filter((row): row is Readonly<Record<string, unknown>> => row !== undefined)
        .filter(
          (row) => typeof row.level === "number" && row.level <= builder.data.supportedLevelMaximum,
        )
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
      ...(preparationChange?.event === "level-up" &&
      numericValue(preparationChange.replacementMaximum) > 0
        ? {
            preparationChange: {
              event: "level-up" as const,
              replacementMaximum: numericValue(preparationChange.replacementMaximum),
            },
          }
        : {}),
      ...(cantripChange?.event === "level-up" && numericValue(cantripChange.replacementMaximum) > 0
        ? {
            cantripChange: {
              event: "level-up" as const,
              replacementMaximum: numericValue(cantripChange.replacementMaximum),
            },
          }
        : {}),
      spells,
      countsByLevel,
    };
  }

  const primaryAbilities = stringArray(classBody?.primaryAbilities)
    .map((ability) => shortEntityName(ability))
    .join(" or ");
  const hitPointDie = numericValue(classBody?.hitPointDie);
  const progressionResource = progression
    .flatMap((row) => {
      const body = objectValue(row);
      if (body === undefined) return [];
      return Object.entries(body).flatMap(([key, value]) =>
        key !== "level" &&
        key !== "proficiencyBonus" &&
        key !== "features" &&
        numericValue(value) > 0
          ? [key]
          : [],
      );
    })
    .find((key) => key.toLowerCase().endsWith("points"));
  const focus = spellcasting
    ? spellcasting.preparation === "spellbook"
      ? "a growing spellbook"
      : "prepared magic"
    : progressionResource !== undefined
      ? titleCase(progressionResource.replace(/([a-z])([A-Z])/gu, "$1-$2"))
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
    skillCountByLevel,
    abilityScoreImprovementLevels,
    description: `${primaryAbilities || "Adventuring"} specialist with a d${String(hitPointDie)} Hit Die and ${focus}.`,
    builder: builder.data,
    featureChoices,
    weaponMasteryIds,
    weaponMasteryCountByLevel,
    startingEquipment: startingEquipment.data,
    ...(spellcasting === undefined ? {} : { spellcasting }),
  };
}

export function characterBuilderCatalog(rulesPackage: LoadedRulesPackage): BuilderCatalog {
  const entity = (id: string) => rulesPackage.entities.find((candidate) => candidate.id === id);
  const species = Object.fromEntries(
    rulesPackage.entities
      .filter((candidate) => candidate.kind === "species")
      .map((candidate) => {
        const body = objectValue(candidate.body);
        const skillChoice = objectValue(body?.skillProficiencyChoice);
        const originFeatChoice = objectValue(body?.originFeatChoice);
        const sizeOptions = stringArray(body?.sizeOptions)
          .map(speciesSizeValue)
          .filter((size): size is SpeciesSize => size !== undefined);
        const walkingSpeed = numericValue(body?.walkingSpeed);
        const traitNames = stringArray(body?.traitNames);
        const choices: SpeciesChoiceCatalog[] = Array.isArray(body?.choices)
          ? body.choices.flatMap((value) => {
              const choice = objectValue(value);
              if (
                typeof choice?.id !== "string" ||
                typeof choice.prompt !== "string" ||
                !Array.isArray(choice.options)
              ) {
                return [];
              }
              const options = choice.options.flatMap((optionValue) => {
                const option = objectValue(optionValue);
                if (typeof option?.id !== "string" || typeof option.name !== "string") return [];
                const grantedSpellNames = Array.isArray(option.spellGrants)
                  ? option.spellGrants.flatMap((grantValue) => {
                      const grant = objectValue(grantValue);
                      const spell =
                        typeof grant?.spellId === "string" ? entity(grant.spellId) : undefined;
                      return spell?.kind === "spell" ? [localizedName(spell)] : [];
                    })
                  : [];
                const details = [
                  typeof option.summary === "string" ? option.summary : undefined,
                  typeof option.damageType === "string"
                    ? `${titleCase(option.damageType)} damage`
                    : undefined,
                  typeof option.darkvisionRange === "number"
                    ? `${String(option.darkvisionRange)}-foot Darkvision`
                    : undefined,
                  typeof option.walkingSpeed === "number"
                    ? `${String(option.walkingSpeed)}-foot speed`
                    : undefined,
                  typeof option.ability === "string"
                    ? `${titleCase(option.ability)} spellcasting`
                    : undefined,
                  grantedSpellNames.length === 0
                    ? undefined
                    : `Magic: ${grantedSpellNames.join(", ")}`,
                ].filter((detail): detail is string => detail !== undefined);
                return [
                  {
                    id: option.id,
                    label: option.name,
                    ...(details.length === 0 ? {} : { description: details.join(" · ") }),
                  },
                ];
              });
              return [
                {
                  id: choice.id,
                  prompt: choice.prompt,
                  minimum: numericValue(choice.minimum),
                  maximum: numericValue(choice.maximum),
                  options,
                  changeOn: [],
                },
              ];
            })
          : [];
        if (Array.isArray(body?.spellChoices)) {
          for (const value of body.spellChoices) {
            const choice = objectValue(value);
            const requiredWhen = objectValue(choice?.requiredWhen);
            const listClass =
              typeof choice?.spellListClassId === "string"
                ? objectValue(entity(choice.spellListClassId)?.body)
                : undefined;
            const spellLevel = numericValue(choice?.spellLevel);
            const options = stringArray(listClass?.spellList).flatMap((spellId) => {
              const spell = entity(spellId);
              const spellBody = objectValue(spell?.body);
              return spell?.kind === "spell" && numericValue(spellBody?.level) === spellLevel
                ? [{ id: spell.id, label: localizedName(spell) }]
                : [];
            });
            if (
              typeof choice?.id === "string" &&
              typeof choice.prompt === "string" &&
              typeof requiredWhen?.choiceId === "string" &&
              typeof requiredWhen.optionId === "string"
            ) {
              const defaultSpellId =
                typeof choice.defaultSpellId === "string" ? choice.defaultSpellId : undefined;
              options.sort((left, right) =>
                left.id === defaultSpellId ? -1 : right.id === defaultSpellId ? 1 : 0,
              );
              choices.push({
                id: choice.id,
                prompt: choice.prompt,
                minimum: numericValue(choice.minimum),
                maximum: numericValue(choice.maximum),
                options,
                requiredWhen: {
                  choiceId: requiredWhen.choiceId,
                  optionId: requiredWhen.optionId,
                },
                changeOn: stringArray(choice.changeOn),
              });
            }
          }
        }
        return [
          candidate.id,
          {
            id: candidate.id,
            name: localizedName(candidate),
            description: `${shortEntityName(typeof body?.creatureType === "string" ? body.creatureType : "creature")} · ${String(walkingSpeed)}-foot speed · ${sizeOptions.map(shortEntityName).join(" or ")} size${traitNames.length === 0 ? "." : ` · ${traitNames.join(", ")}.`}`,
            walkingSpeed,
            sizeOptions,
            ...(typeof body?.recommendedOriginFeatId === "string"
              ? { recommendedOriginFeatId: body.recommendedOriginFeatId }
              : {}),
            skillMinimum: numericValue(skillChoice?.minimum),
            skillMaximum: numericValue(skillChoice?.maximum),
            skillIds:
              skillChoice?.options === "any-skill"
                ? skillIds.map((skill) => `${skillPrefix}${skill}`)
                : stringArray(skillChoice?.options),
            originFeatMinimum: numericValue(originFeatChoice?.minimum),
            originFeatMaximum: numericValue(originFeatChoice?.maximum),
            traitNames,
            choices,
          },
        ];
      }),
  ) as Record<string, SpeciesBuilderCatalog>;
  const backgrounds = Object.fromEntries(
    rulesPackage.entities
      .filter((candidate) => candidate.kind === "background")
      .map((candidate) => {
        const body = objectValue(candidate.body);
        const abilityIds = stringArray(body?.abilityScoreOptions)
          .map(abilityValue)
          .filter((ability): ability is Ability => ability !== undefined);
        const backgroundSkillIds = stringArray(body?.skillProficiencies);
        const featId = typeof body?.featId === "string" ? body.featId : "";
        return [
          candidate.id,
          {
            id: candidate.id,
            name: localizedName(candidate),
            description: `Grants ${[...backgroundSkillIds.map(shortEntityName), localizedName(entity(featId))].join(", ")}, and background ability increases.`,
            abilityIds,
            abilityIncreaseOptions: abilityIncreaseOptions(
              abilityIds,
              body?.abilityScoreIncreasePatterns,
            ),
            skillIds: backgroundSkillIds,
            featId,
          },
        ];
      }),
  ) as Record<string, BackgroundBuilderCatalog>;
  const feats = Object.fromEntries(
    rulesPackage.entities
      .filter((candidate) => candidate.kind === "feat")
      .map((candidate) => {
        const body = objectValue(candidate.body);
        const proficiencyChoice = objectValue(body?.proficiencyChoice);
        const categories = stringArray(proficiencyChoice?.categories);
        const spellListClassId =
          typeof body?.spellListClassId === "string" ? body.spellListClassId : undefined;
        const spellListClass =
          spellListClassId === undefined ? undefined : objectValue(entity(spellListClassId)?.body);
        const spellListIds = stringArray(spellListClass?.spellList);
        const featSpells = spellListIds.flatMap((spellId) => {
          const spell = entity(spellId);
          const spellBody = objectValue(spell?.body);
          const level = numericValue(spellBody?.level, -1);
          return spell?.kind === "spell" && level >= 0
            ? [
                {
                  id: spell.id,
                  name: localizedName(spell),
                  level,
                  school: typeof spellBody?.school === "string" ? spellBody.school : "unknown",
                },
              ]
            : [];
        });
        const cantripChoice = objectValue(body?.cantripChoice);
        const levelOneSpellChoice = objectValue(body?.levelOneSpellChoice);
        const spellChange = objectValue(body?.spellChange);
        const abilityIds = stringArray(body?.spellcastingAbilityChoice)
          .map(abilityValue)
          .filter((ability): ability is Ability => ability !== undefined);
        return [
          candidate.id,
          {
            id: candidate.id,
            name: localizedName(candidate),
            description: entityDescription(candidate),
            category: typeof body?.category === "string" ? body.category : "unknown",
            repeatable: body?.repeatable === true,
            skillMinimum: categories.includes("skill")
              ? numericValue(proficiencyChoice?.minimum)
              : 0,
            skillMaximum: categories.includes("skill")
              ? numericValue(proficiencyChoice?.maximum)
              : 0,
            ...(spellListClassId === undefined
              ? {}
              : {
                  magicInitiate: {
                    spellListClassId,
                    abilityIds,
                    cantripMinimum: numericValue(cantripChoice?.minimum),
                    cantripMaximum: numericValue(cantripChoice?.maximum),
                    levelOneSpellMinimum: numericValue(levelOneSpellChoice?.minimum),
                    levelOneSpellMaximum: numericValue(levelOneSpellChoice?.maximum),
                    cantrips: featSpells.filter((spell) => spell.level === 0),
                    levelOneSpells: featSpells.filter((spell) => spell.level === 1),
                    replacementMaximum: numericValue(spellChange?.replacementMaximum, 1),
                  },
                }),
          },
        ];
      }),
  ) as Record<string, FeatBuilderCatalog>;
  if (Object.keys(species).length === 0 || Object.keys(backgrounds).length === 0) {
    throw new Error("Builder origin metadata is missing from the loaded rules package.");
  }

  const weapons = rulesPackage.entities
    .filter((candidate) => candidate.kind === "equipment-weapon")
    .map((candidate) => ({ id: candidate.id, name: localizedName(candidate) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    classes: {
      [barbarianId]: classCatalog(barbarianId, rulesPackage),
      [bardId]: classCatalog(bardId, rulesPackage),
      [clericId]: classCatalog(clericId, rulesPackage),
      [druidId]: classCatalog(druidId, rulesPackage),
      [fighterId]: classCatalog(fighterId, rulesPackage),
      [monkId]: classCatalog(monkId, rulesPackage),
      [paladinId]: classCatalog(paladinId, rulesPackage),
      [rangerId]: classCatalog(rangerId, rulesPackage),
      [rogueId]: classCatalog(rogueId, rulesPackage),
      [sorcererId]: classCatalog(sorcererId, rulesPackage),
      [warlockId]: classCatalog(warlockId, rulesPackage),
      [wizardId]: classCatalog(wizardId, rulesPackage),
    },
    species,
    backgrounds,
    feats,
    weaponIds: weapons.map((weapon) => weapon.id),
    weaponNames: Object.fromEntries(weapons.map((weapon) => [weapon.id, weapon.name])),
  };
}

export function builderOriginChoiceDefinitions(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): BuilderChoiceDefinition[] {
  const selectedSpecies = catalog.species[draft.speciesId];
  const selectedBackground = catalog.backgrounds[draft.backgroundId];
  const selectedFeat = catalog.feats[draft.originFeatId];
  const allSkills = skillIds.map((skill) => ({
    id: `${skillPrefix}${skill}`,
    label: shortEntityName(skill),
  }));
  const originFeats = Object.values(catalog.feats).filter((feat) => feat.category === "origin");
  return [
    {
      id: "builder.choice.species",
      sourceId: "builder",
      selection: "speciesId",
      kind: "single",
      prompt: "Choose a species",
      minimum: 1,
      maximum: 1,
      options: Object.values(catalog.species).map((species) => ({
        id: species.id,
        label: species.name,
        description: species.description,
      })),
    },
    {
      id: "builder.choice.background",
      sourceId: "builder",
      selection: "backgroundId",
      kind: "single",
      prompt: "Choose a background",
      minimum: 1,
      maximum: 1,
      options: Object.values(catalog.backgrounds)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((background) => ({
          id: background.id,
          label: background.name,
          description: background.description,
        })),
    },
    {
      id: `${draft.speciesId}.choice.size`,
      sourceId: draft.speciesId,
      selection: "speciesSize",
      kind: "single",
      prompt: "Choose a size",
      minimum: 1,
      maximum: 1,
      options: (selectedSpecies?.sizeOptions ?? []).map((size) => ({
        id: size,
        label: shortEntityName(size),
      })),
    },
    {
      id: `${draft.backgroundId}.choice.ability-score-increases`,
      sourceId: draft.backgroundId,
      selection: "backgroundAbilityScoreIncreases",
      kind: "ability-allocation",
      prompt: "Choose background ability increases",
      minimum: 1,
      maximum: 1,
      options: selectedBackground?.abilityIncreaseOptions ?? [],
    },
    {
      id: `${draft.speciesId}.choice.origin-feat`,
      sourceId: draft.speciesId,
      selection: "originFeatId",
      kind: "single",
      prompt: "Choose an Origin feat",
      minimum: selectedSpecies?.originFeatMinimum ?? 0,
      maximum: selectedSpecies?.originFeatMaximum ?? 0,
      options: originFeats.map((feat) => ({
        id: feat.id,
        label: feat.name,
        description: feat.description,
        ...(feat.id === selectedBackground?.featId && !feat.repeatable
          ? { disabledReason: `Already granted by ${selectedBackground.name}.` }
          : {}),
      })),
    },
    {
      id: `${draft.speciesId}.choice.skill`,
      sourceId: draft.speciesId,
      selection: "speciesSkillIds",
      kind: "multiple",
      prompt: `Choose ${String(selectedSpecies?.skillMaximum ?? 0)} species skill`,
      minimum: selectedSpecies?.skillMinimum ?? 0,
      maximum: selectedSpecies?.skillMaximum ?? 0,
      options: allSkills.filter((option) => selectedSpecies?.skillIds.includes(option.id) === true),
    },
    {
      id: `${draft.originFeatId}.choice.skill`,
      sourceId: draft.originFeatId,
      selection: "originFeatSkillIds",
      kind: "multiple",
      prompt: `Choose ${String(selectedFeat?.skillMaximum ?? 0)} feat skills`,
      minimum: selectedFeat?.skillMinimum ?? 0,
      maximum: selectedFeat?.skillMaximum ?? 0,
      options: allSkills,
    },
  ];
}

function fillSelections(current: string[], candidates: string[], count: number): string[] {
  const valid = current.filter(
    (id, index) => candidates.includes(id) && current.indexOf(id) === index,
  );
  return [...valid, ...candidates.filter((id) => !valid.includes(id))].slice(0, count);
}

function reconciledOriginSkills(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  species: SpeciesBuilderCatalog,
  background: BackgroundBuilderCatalog,
): { classSkillIds: string[]; speciesSkillIds: string[] } {
  const selectedClass = catalog.classes[draft.classId];
  const requiredClassSkills = classSkillCount(draft, catalog);
  const classCandidates = selectedClass.skillIds.filter((id) => !background.skillIds.includes(id));
  const reservedSpeciesSkill = species.skillIds.find(
    (id) =>
      !background.skillIds.includes(id) &&
      classCandidates.filter((candidate) => candidate !== id).length >= requiredClassSkills,
  );
  const orderedClassCandidates = [
    ...classCandidates.filter((id) => id !== reservedSpeciesSkill),
    ...classCandidates.filter((id) => id === reservedSpeciesSkill),
  ];
  const classSkillIds = fillSelections(
    draft.classSkillIds.filter((id) => id !== reservedSpeciesSkill),
    orderedClassCandidates,
    requiredClassSkills,
  );
  const preferredSpeciesSkills = species.skillIds.filter(
    (id) => !background.skillIds.includes(id) && !classSkillIds.includes(id),
  );
  const speciesSkillIds = fillSelections(
    draft.speciesSkillIds,
    [
      ...preferredSpeciesSkills,
      ...species.skillIds.filter((id) => !preferredSpeciesSkills.includes(id)),
    ],
    species.skillMaximum,
  );
  return { classSkillIds, speciesSkillIds };
}

export function activeSpeciesChoices(
  species: SpeciesBuilderCatalog,
  selections: Readonly<Record<string, string[]>>,
): SpeciesChoiceCatalog[] {
  return species.choices.filter(
    (choice) =>
      choice.requiredWhen === undefined ||
      selections[choice.requiredWhen.choiceId]?.includes(choice.requiredWhen.optionId) === true,
  );
}

function reconcileSpeciesChoiceSelections(
  species: SpeciesBuilderCatalog,
  current: Readonly<Record<string, string[]>>,
): Readonly<Record<string, string[]>> {
  const next: Record<string, string[]> = {};
  for (const choice of species.choices) {
    const context = { ...current, ...next };
    if (!activeSpeciesChoices(species, context).includes(choice)) continue;
    next[choice.id] = fillSelections(
      current[choice.id] ?? [],
      choice.options.map((option) => option.id),
      choice.maximum,
    );
  }
  return next;
}

export function updateBuilderSpeciesChoice(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  choiceId: string,
  optionIds: string[],
): CharacterBuilderDraft {
  const species = catalog.species[draft.speciesId];
  if (species?.choices.some((choice) => choice.id === choiceId) !== true) {
    return draft;
  }
  return {
    ...draft,
    speciesChoiceSelections: reconcileSpeciesChoiceSelections(species, {
      ...draft.speciesChoiceSelections,
      [choiceId]: optionIds,
    }),
  };
}

export function magicInitiateFeatIds(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): string[] {
  const backgroundFeatId = catalog.backgrounds[draft.backgroundId]?.featId;
  return [...new Set([backgroundFeatId, draft.originFeatId])].filter(
    (featId): featId is string =>
      featId !== undefined && catalog.feats[featId]?.magicInitiate !== undefined,
  );
}

export function reconcileMagicInitiateChoices(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): CharacterBuilderDraft {
  const selectedClass = catalog.classes[draft.classId];
  const choices = Object.fromEntries(
    magicInitiateFeatIds(draft, catalog).flatMap((featId) => {
      const definition = catalog.feats[featId]?.magicInitiate;
      if (definition === undefined) return [];
      const current = draft.magicInitiateChoices[featId];
      const ability = definition.abilityIds.includes(current?.ability ?? "strength")
        ? (current?.ability ?? definition.abilityIds[0])
        : definition.abilityIds.includes(selectedClass.spellcasting?.ability ?? "strength")
          ? (selectedClass.spellcasting?.ability ?? definition.abilityIds[0])
          : definition.abilityIds.includes(
                selectedClass.builder.defaultAbilityScoreImprovementAbility,
              )
            ? selectedClass.builder.defaultAbilityScoreImprovementAbility
            : definition.abilityIds[0];
      const cantripIds = fillSelections(
        current?.cantripIds ?? [],
        definition.cantrips.map((spell) => spell.id),
        definition.cantripMaximum,
      );
      const levelOneSpellId = definition.levelOneSpells.some(
        (spell) => spell.id === current?.levelOneSpellId,
      )
        ? (current?.levelOneSpellId ?? "")
        : (definition.levelOneSpells[0]?.id ?? "");
      if (ability === undefined) return [];
      return [[featId, { ability, cantripIds, levelOneSpellId }]];
    }),
  );
  return { ...draft, magicInitiateChoices: choices };
}

export function updateMagicInitiateSelection(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  featId: string,
  selection: Partial<MagicInitiateSelection>,
): CharacterBuilderDraft {
  if (!magicInitiateFeatIds(draft, catalog).includes(featId)) return draft;
  const current = draft.magicInitiateChoices[featId];
  if (current === undefined) return reconcileMagicInitiateChoices(draft, catalog);
  const definition = catalog.feats[featId]?.magicInitiate;
  if (definition === undefined) return draft;
  const requested = { ...current, ...selection };
  const ability = definition.abilityIds.includes(requested.ability)
    ? requested.ability
    : current.ability;
  const cantripIds = requested.cantripIds.filter(
    (spellId, index) =>
      definition.cantrips.some((spell) => spell.id === spellId) &&
      requested.cantripIds.indexOf(spellId) === index,
  );
  const levelOneSpellId = definition.levelOneSpells.some(
    (spell) => spell.id === requested.levelOneSpellId,
  )
    ? requested.levelOneSpellId
    : current.levelOneSpellId;
  return {
    ...draft,
    magicInitiateChoices: {
      ...draft.magicInitiateChoices,
      [featId]: { ability, cantripIds, levelOneSpellId },
    },
  };
}

export function migrateMagicInitiateChoices(
  character: CharacterDocument,
  catalog: BuilderCatalog,
): CharacterDocument {
  const existingChoiceIds = new Set(character.build.choices.map((choice) => choice.choiceId));
  const classId = character.build.levels[0]?.classId;
  const selectedClass =
    classId === undefined ? undefined : catalog.classes[classId as BuilderClassId];
  const additions = character.build.featIds.flatMap((featId) => {
    const definition = catalog.feats[featId]?.magicInitiate;
    if (definition === undefined) return [];
    const ability =
      definition.abilityIds.find(
        (candidate) => candidate === selectedClass?.spellcasting?.ability,
      ) ??
      [...definition.abilityIds].sort(
        (left, right) => character.build.abilityScores[right] - character.build.abilityScores[left],
      )[0];
    const cantripIds = definition.cantrips
      .slice(0, definition.cantripMaximum)
      .map((spell) => spell.id);
    const levelOneSpellId = definition.levelOneSpells[0]?.id;
    if (ability === undefined || levelOneSpellId === undefined) return [];
    return [
      {
        choiceId: `${featId}.choice.spellcasting-ability`,
        optionIds: [`srd521.ability.${ability}`],
      },
      { choiceId: `${featId}.choice.cantrips`, optionIds: cantripIds },
      {
        choiceId: `${featId}.choice.level-one-spell`,
        optionIds: [levelOneSpellId],
      },
    ].filter((choice) => !existingChoiceIds.has(choice.choiceId));
  });
  if (additions.length === 0) return character;
  return characterDocumentSchema.parse({
    ...character,
    build: {
      ...character.build,
      choices: [...character.build.choices, ...additions],
    },
  });
}

export function migrateFeatureSpellbookChoices(
  character: CharacterDocument,
  catalog: BuilderCatalog,
): CharacterDocument {
  const classId = character.build.levels[0]?.classId;
  if (classId === undefined || character.build.levels.some((level) => level.classId !== classId))
    return character;
  const selectedClass = Object.values(catalog.classes).find(
    (candidate) => candidate.id === classId,
  );
  if (selectedClass === undefined || character.build.subclassId !== selectedClass.subclassId)
    return character;
  const existingIds = new Set(
    character.build.levels
      .flatMap((level) => level.selectedFeatureChoices)
      .map((choice) => choice.choiceId),
  );
  const learned = new Set(character.build.learnedSpellIds);
  const used = new Set(
    character.build.levels
      .flatMap((level) => level.selectedFeatureChoices)
      .flatMap((choice) => choice.optionIds),
  );
  const levels = character.build.levels.map((level) => ({
    ...level,
    selectedFeatureChoices: [...level.selectedFeatureChoices],
  }));
  let changed = false;
  for (const choice of selectedClass.featureChoices) {
    if (
      choice.spellSelection?.spellbookAddition !== true ||
      choice.level > levels.length ||
      existingIds.has(choice.id)
    )
      continue;
    const candidates = featureChoiceOptionsForLevel(choice, choice.level)
      .map((option) => option.id)
      .filter((id) => !used.has(id));
    const selected = fillSelections(
      [],
      candidates.filter((id) => !learned.has(id)),
      choice.minimum,
    );
    if (selected.length !== choice.minimum) continue;
    const entry = levels[choice.level - 1];
    if (entry === undefined) continue;
    entry.selectedFeatureChoices.push({ choiceId: choice.id, optionIds: selected });
    selected.forEach((id) => {
      learned.add(id);
      used.add(id);
    });
    changed = true;
  }
  return changed
    ? characterDocumentSchema.parse({
        ...character,
        build: { ...character.build, levels, learnedSpellIds: [...learned] },
      })
    : character;
}

export function updateBuilderBackground(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  backgroundId: string,
): CharacterBuilderDraft {
  const background = catalog.backgrounds[backgroundId];
  if (background === undefined) return draft;
  const species = catalog.species[draft.speciesId];
  if (species === undefined) return draft;
  const abilityOption = background.abilityIncreaseOptions[0]?.abilityIncreases;
  if (abilityOption === undefined) return draft;
  const originFeats = Object.values(catalog.feats).filter((feat) => feat.category === "origin");
  const currentOriginFeat = catalog.feats[draft.originFeatId];
  const currentOriginFeatIsEligible =
    currentOriginFeat !== undefined &&
    (currentOriginFeat.id !== background.featId || currentOriginFeat.repeatable);
  const originFeat =
    species.originFeatMaximum === 0
      ? undefined
      : currentOriginFeatIsEligible
        ? currentOriginFeat
        : (originFeats.find(
            (feat) =>
              feat.id === species.recommendedOriginFeatId &&
              (feat.id !== background.featId || feat.repeatable),
          ) ?? originFeats.find((feat) => feat.id !== background.featId || feat.repeatable));
  if (species.originFeatMaximum > 0 && originFeat === undefined) return draft;

  const { classSkillIds, speciesSkillIds } = reconciledOriginSkills(
    draft,
    catalog,
    species,
    background,
  );
  const allSkillCandidates = skillIds.map((skill) => `${skillPrefix}${skill}`);
  const originFeatSkillIds = fillSelections(
    originFeat?.id === draft.originFeatId ? draft.originFeatSkillIds : [],
    allSkillCandidates.filter(
      (id) =>
        !background.skillIds.includes(id) &&
        !classSkillIds.includes(id) &&
        !speciesSkillIds.includes(id),
    ),
    originFeat?.skillMaximum ?? 0,
  );
  const reconciled = {
    ...draft,
    backgroundId: background.id,
    backgroundAbilityScoreIncreases: { ...abilityOption },
    originFeatId: originFeat?.id ?? "",
    classSkillIds,
    speciesSkillIds,
    originFeatSkillIds,
    magicInitiateChoices: {},
  };
  return reconcileMagicInitiateChoices(
    {
      ...reconciled,
      expertiseSkillIds: fillSelections(
        draft.expertiseSkillIds,
        expertiseSkillCandidates(reconciled, catalog),
        expertiseCount(reconciled, catalog),
      ),
    },
    catalog,
  );
}

export function updateBuilderSpecies(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  speciesId: string,
): CharacterBuilderDraft {
  const species = catalog.species[speciesId];
  const background = catalog.backgrounds[draft.backgroundId];
  if (species === undefined || background === undefined) return draft;
  const allSkillCandidates = skillIds.map((skill) => `${skillPrefix}${skill}`);
  const { classSkillIds, speciesSkillIds } = reconciledOriginSkills(
    draft,
    catalog,
    species,
    background,
  );
  const originFeats = Object.values(catalog.feats).filter(
    (feat) => feat.category === "origin" && (feat.id !== background.featId || feat.repeatable),
  );
  const currentOriginFeat = catalog.feats[draft.originFeatId];
  const originFeat =
    species.originFeatMaximum === 0
      ? undefined
      : currentOriginFeat !== undefined && originFeats.includes(currentOriginFeat)
        ? currentOriginFeat
        : (originFeats.find((feat) => feat.id === species.recommendedOriginFeatId) ??
          originFeats[0]);
  const originFeatSkillIds = fillSelections(
    originFeat?.id === draft.originFeatId ? draft.originFeatSkillIds : [],
    allSkillCandidates.filter(
      (id) =>
        !background.skillIds.includes(id) &&
        !classSkillIds.includes(id) &&
        !speciesSkillIds.includes(id),
    ),
    originFeat?.skillMaximum ?? 0,
  );
  const reconciled = {
    ...draft,
    speciesId: species.id,
    speciesSize: species.sizeOptions.includes(draft.speciesSize)
      ? draft.speciesSize
      : (species.sizeOptions[0] ?? "medium"),
    classSkillIds,
    speciesSkillIds,
    speciesChoiceSelections: reconcileSpeciesChoiceSelections(
      species,
      draft.speciesId === species.id ? draft.speciesChoiceSelections : {},
    ),
    originFeatId: originFeat?.id ?? "",
    originFeatSkillIds,
    magicInitiateChoices: {},
  };
  return reconcileMagicInitiateChoices(
    {
      ...reconciled,
      expertiseSkillIds: fillSelections(
        draft.expertiseSkillIds,
        expertiseSkillCandidates(reconciled, catalog),
        expertiseCount(reconciled, catalog),
      ),
    },
    catalog,
  );
}

export function featureChoiceCount(choice: ClassFeatureChoiceCatalog, level: number): number {
  if (level < choice.level) return 0;
  return choice.countByLevel?.[String(level)] ?? choice.maximum;
}

function featureChoiceSelectionLevels(
  choice: ClassFeatureChoiceCatalog,
  selectedIds: string[],
  targetLevel: number,
): ReadonlyMap<string, number> | undefined {
  const selected = new Set(selectedIds);
  const options = new Map(choice.options.map((option) => [option.id, option]));
  if (selectedIds.some((optionId) => !options.has(optionId))) return undefined;

  if (choice.countByLevel === undefined) {
    const levels = new Map(
      selectedIds.map((optionId) => [
        optionId,
        choice.spellSelection === undefined
          ? choice.level
          : Math.max(choice.level, options.get(optionId)?.minimumClassLevel ?? 1),
      ]),
    );
    return selectedIds.some((optionId) => {
      const option = options.get(optionId);
      return (
        option === undefined ||
        option.minimumClassLevel >
          (choice.spellSelection === undefined ? choice.level : targetLevel) ||
        option.prerequisiteOptionIds.some((prerequisiteId) => !selected.has(prerequisiteId))
      );
    })
      ? undefined
      : levels;
  }

  const slots: number[] = [];
  let previousCount = 0;
  for (let level = choice.level; level <= targetLevel; level += 1) {
    const count = featureChoiceCount(choice, level);
    for (let index = previousCount; index < count; index += 1) slots.push(level);
    previousCount = count;
  }
  if (slots.length !== selectedIds.length) return undefined;

  const remaining = [...selectedIds];
  const ordered: string[] = [];
  while (remaining.length > 0) {
    const available = remaining
      .filter((optionId) => {
        const option = options.get(optionId);
        return option?.prerequisiteOptionIds.every(
          (prerequisiteId) => !selected.has(prerequisiteId) || ordered.includes(prerequisiteId),
        );
      })
      .sort((left, right) => {
        const levelDifference =
          (options.get(left)?.minimumClassLevel ?? 1) -
          (options.get(right)?.minimumClassLevel ?? 1);
        return levelDifference || selectedIds.indexOf(left) - selectedIds.indexOf(right);
      });
    const next = available[0];
    if (next === undefined) return undefined;
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }

  const levels = new Map(ordered.map((optionId, index) => [optionId, slots[index] ?? 0]));
  for (const optionId of ordered) {
    const option = options.get(optionId);
    const selectionLevel = levels.get(optionId) ?? 0;
    if (
      option === undefined ||
      option.minimumClassLevel > selectionLevel ||
      option.prerequisiteOptionIds.some(
        (prerequisiteId) =>
          !selected.has(prerequisiteId) || (levels.get(prerequisiteId) ?? 21) > selectionLevel,
      )
    ) {
      return undefined;
    }
  }
  return levels;
}

export function expertiseSkillCandidates(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): string[] {
  const selectedClass = catalog.classes[draft.classId];
  const choice = selectedClass.builder.expertiseChoice;
  if (choice === undefined || draft.level < choice.minimumLevel) return [];
  const proficientSkills = choice.requireClassProficiency
    ? draft.classSkillIds
    : [
        ...draft.classSkillIds,
        ...(catalog.backgrounds[draft.backgroundId]?.skillIds ?? []),
        ...draft.speciesSkillIds,
        ...draft.originFeatSkillIds,
      ];
  return [...new Set(proficientSkills)].filter((id) => choice.eligibleSkillIds.includes(id));
}

export function expertiseCount(draft: CharacterBuilderDraft, catalog: BuilderCatalog): number {
  const choice = catalog.classes[draft.classId].builder.expertiseChoice;
  if (choice === undefined || draft.level < choice.minimumLevel) return 0;
  const countByLevel = objectValue(objectValue(choice)?.countByLevel);
  return numericValue(countByLevel?.[String(draft.level)], 1);
}

function selectedEquipmentOption(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): StartingEquipmentOption | undefined {
  return catalog.classes[draft.classId].startingEquipment.options.find(
    (option) => option.id === draft.startingEquipmentOptionId,
  );
}

function masteryCandidates(
  selectedClass: ClassBuilderCatalog,
  equipmentOptionId: string,
  catalog: BuilderCatalog,
): string[] {
  const packageWeapons = selectedClass.startingEquipment.options
    .find((option) => option.id === equipmentOptionId)
    ?.items.flatMap((item) =>
      item.kind === "entity" && catalog.weaponIds.includes(item.entityId) ? [item.entityId] : [],
    );
  return [
    ...new Set([
      ...(packageWeapons ?? []).filter((id) => selectedClass.weaponMasteryIds.includes(id)),
      ...selectedClass.weaponMasteryIds,
    ]),
  ];
}

function reconciledFeatureChoiceSelections(
  selectedClass: ClassBuilderCatalog,
  current: Readonly<Record<string, string[]>>,
  level: number,
): Readonly<Record<string, string[]>> {
  const usedBookSpells = new Set<string>();
  return Object.fromEntries(
    selectedClass.featureChoices
      .filter((choice) => choice.level <= level)
      .map((choice) => {
        const selected = fillSelections(
          current[choice.id] ?? [],
          [...(choice.defaultOptionIds ?? []), ...choice.options.map((option) => option.id)].filter(
            (optionId, index, optionIds) =>
              optionIds.indexOf(optionId) === index &&
              (choice.spellSelection?.spellbookAddition !== true ||
                !usedBookSpells.has(optionId)) &&
              (choice.options.find((option) => option.id === optionId)?.minimumClassLevel ?? 1) <=
                level,
          ),
          choice.countByLevel === undefined ? choice.minimum : featureChoiceCount(choice, level),
        );
        if (choice.spellSelection?.spellbookAddition === true)
          selected.forEach((id) => usedBookSpells.add(id));
        return [choice.id, selected];
      }),
  );
}

function reconciledAsiAbilities(
  selectedClass: ClassBuilderCatalog,
  current: readonly Ability[],
  level: number,
): Ability[] {
  const count = selectedClass.abilityScoreImprovementLevels.filter(
    (grantLevel) => grantLevel <= level,
  ).length;
  return Array.from(
    { length: count },
    (_, index) => current[index] ?? selectedClass.builder.defaultAbilityScoreImprovementAbility,
  );
}

function featAbilityScoreIncreases(
  asiAbilities: readonly Ability[],
): Partial<Record<Ability, number>> {
  return asiAbilities.reduce<Partial<Record<Ability, number>>>((increases, ability) => {
    increases[ability] = (increases[ability] ?? 0) + 2;
    return increases;
  }, {});
}

export function spellSelectionCounts(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): SpellSelectionCounts | undefined {
  const selectedClass = catalog.classes[draft.classId];
  const counts = selectedClass.spellcasting?.countsByLevel[draft.level];
  if (counts === undefined) return undefined;
  const selectedOptions = new Set(Object.values(draft.featureChoiceSelections).flat());
  const additionalCantrips = selectedClass.featureChoices
    .flatMap((choice) => choice.options)
    .filter((option) => selectedOptions.has(option.id))
    .reduce((total, option) => total + option.additionalCantrips, 0);
  const choiceGrantedSpells = selectedClass.featureChoices
    .flatMap((choice) => choice.options)
    .filter((option) => selectedOptions.has(option.id))
    .flatMap((option) =>
      spellsGrantedThroughLevel(option.alwaysPreparedSpellsByLevel, draft.level),
    );
  const chosenSpells = selectedClass.featureChoices
    .filter(
      (choice) => choice.spellSelection?.alwaysPrepared === true && choice.level <= draft.level,
    )
    .flatMap((choice) => draft.featureChoiceSelections[choice.id] ?? []);
  return {
    ...counts,
    learnedLeveledSpells:
      counts.learnedLeveledSpells +
      selectedClass.featureChoices
        .filter(
          (choice) =>
            choice.spellSelection?.spellbookAddition === true && choice.level <= draft.level,
        )
        .reduce((total, choice) => total + choice.minimum, 0),
    cantrips: counts.cantrips + additionalCantrips,
    alwaysPreparedSpellIds: [
      ...new Set([...counts.alwaysPreparedSpellIds, ...choiceGrantedSpells, ...chosenSpells]),
    ],
  };
}

export function featureSpellbookChoices(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): string[] {
  return catalog.classes[draft.classId].featureChoices
    .filter(
      (choice) => choice.spellSelection?.spellbookAddition === true && choice.level <= draft.level,
    )
    .flatMap((choice) => draft.featureChoiceSelections[choice.id] ?? []);
}

function spellSelections(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  level: number,
): Pick<CharacterBuilderDraft, "learnedSpellIds" | "preparedSpellIds"> {
  const spellcasting = catalog.classes[draft.classId].spellcasting;
  const counts = spellSelectionCounts({ ...draft, level }, catalog);
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
          [
            ...new Set([
              ...featureSpellbookChoices(draft, catalog),
              ...draft.learnedSpellIds.filter((id) => leveledCandidates.includes(id)),
            ]),
          ],
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
  const selectedClass = catalog.classes[classId];
  if (
    level < selectedClass.builder.supportedLevelMinimum ||
    level > selectedClass.builder.supportedLevelMaximum
  ) {
    throw new Error(
      `${selectedClass.name} supports levels ${String(selectedClass.builder.supportedLevelMinimum)} through ${String(selectedClass.builder.supportedLevelMaximum)}.`,
    );
  }
  const species = Object.values(catalog.species)[0];
  const background = Object.values(catalog.backgrounds)[0];
  if (species === undefined || background === undefined) {
    throw new Error("Builder origin metadata is missing.");
  }
  const originFeats = Object.values(catalog.feats).filter(
    (feat) => feat.category === "origin" && (feat.id !== background.featId || feat.repeatable),
  );
  const originFeat =
    originFeats.find((feat) => feat.id === species.recommendedOriginFeatId) ?? originFeats[0];
  if (originFeat === undefined) throw new Error("No eligible Origin feat is available.");
  const backgroundAbilityOption = [...background.abilityIncreaseOptions].sort(
    (left, right) =>
      Object.keys(right.abilityIncreases ?? {}).length -
      Object.keys(left.abilityIncreases ?? {}).length,
  )[0];
  if (backgroundAbilityOption?.abilityIncreases === undefined) {
    throw new Error("No background ability allocation is available.");
  }
  const startingEquipmentOption = selectedClass.startingEquipment.options[0];
  if (startingEquipmentOption === undefined) {
    throw new Error(`${selectedClass.name} has no starting-equipment option.`);
  }
  const classSkillCount = selectedClass.skillCountByLevel[level] ?? selectedClass.skillMaximum;
  const classSkillIds = fillSelections(
    selectedClass.builder.defaultClassSkillIds,
    selectedClass.skillIds.filter((id) => !background.skillIds.includes(id)),
    classSkillCount,
  );
  const allSkillCandidates = skillIds.map((skill) => `${skillPrefix}${skill}`);
  const preferredSpeciesSkills = species.skillIds.filter(
    (id) => !background.skillIds.includes(id) && !classSkillIds.includes(id),
  );
  const speciesSkillIds = [
    ...preferredSpeciesSkills,
    ...species.skillIds.filter((id) => !preferredSpeciesSkills.includes(id)),
  ].slice(0, species.skillMaximum);
  const originFeatSkillIds = allSkillCandidates
    .filter(
      (id) =>
        !background.skillIds.includes(id) &&
        !classSkillIds.includes(id) &&
        !speciesSkillIds.includes(id),
    )
    .slice(0, originFeat.skillMaximum);
  const featureChoiceSelections = reconciledFeatureChoiceSelections(selectedClass, {}, level);
  const initialDraft: CharacterBuilderDraft = {
    classId,
    speciesId: species.id,
    speciesSize: species.sizeOptions.includes("medium")
      ? "medium"
      : (species.sizeOptions[0] ?? "medium"),
    backgroundId: background.id,
    backgroundAbilityScoreIncreases: { ...backgroundAbilityOption.abilityIncreases },
    originFeatId: originFeat.id,
    name,
    level,
    abilityScores: { ...selectedClass.builder.defaultAbilityScores },
    asiAbilities: reconciledAsiAbilities(selectedClass, [], level),
    classSkillIds,
    speciesSkillIds,
    speciesChoiceSelections: reconcileSpeciesChoiceSelections(species, {}),
    originFeatSkillIds,
    magicInitiateChoices: {},
    expertiseSkillIds: [],
    featureChoiceSelections,
    startingEquipmentOptionId: startingEquipmentOption.id,
    weaponMasteryIds: masteryCandidates(selectedClass, startingEquipmentOption.id, catalog).slice(
      0,
      selectedClass.weaponMasteryCountByLevel[level] ?? 0,
    ),
    learnedSpellIds: [],
    preparedSpellIds: [],
  };
  const draft = {
    ...initialDraft,
    expertiseSkillIds: fillSelections(
      [],
      expertiseSkillCandidates(initialDraft, catalog),
      expertiseCount(initialDraft, catalog),
    ),
  };
  const completedDraft =
    selectedClass.spellcasting === undefined
      ? draft
      : { ...draft, ...spellSelections(draft, catalog, level) };
  return reconcileMagicInitiateChoices(completedDraft, catalog);
}

export function updateBuilderLevel(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  level: number,
): CharacterBuilderDraft {
  const selectedClass = catalog.classes[draft.classId];
  const unavailableSkills = new Set([
    ...(catalog.backgrounds[draft.backgroundId]?.skillIds ?? []),
    ...draft.speciesSkillIds,
    ...draft.originFeatSkillIds,
  ]);
  const classSkillCandidates = selectedClass.skillIds.filter(
    (id) => draft.classSkillIds.includes(id) || !unavailableSkills.has(id),
  );
  const classSkillIds = fillSelections(
    draft.classSkillIds,
    classSkillCandidates,
    selectedClass.skillCountByLevel[level] ?? selectedClass.skillMaximum,
  );
  const featureChoiceSelections = reconciledFeatureChoiceSelections(
    selectedClass,
    draft.featureChoiceSelections,
    level,
  );
  const initialNext = {
    ...draft,
    level,
    classSkillIds,
    asiAbilities: reconciledAsiAbilities(selectedClass, draft.asiAbilities, level),
    featureChoiceSelections,
    weaponMasteryIds: fillSelections(
      draft.weaponMasteryIds,
      masteryCandidates(selectedClass, draft.startingEquipmentOptionId, catalog),
      selectedClass.weaponMasteryCountByLevel[level] ?? 0,
    ),
    expertiseSkillIds: draft.expertiseSkillIds,
  };
  const expertiseCandidates = expertiseSkillCandidates(initialNext, catalog);
  const requiredExpertise = expertiseCount(initialNext, catalog);
  const next = {
    ...initialNext,
    expertiseSkillIds: fillSelections(
      draft.expertiseSkillIds,
      expertiseCandidates,
      requiredExpertise,
    ),
  };
  return reconcileMagicInitiateChoices(
    selectedClass.spellcasting === undefined
      ? next
      : { ...next, ...spellSelections(next, catalog, level) },
    catalog,
  );
}

export function updateBuilderFeatureChoice(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  choiceId: string,
  optionId: string,
): CharacterBuilderDraft {
  const selectedClass = catalog.classes[draft.classId];
  const choice = selectedClass.featureChoices.find((candidate) => candidate.id === choiceId);
  if (choice === undefined || choice.level > draft.level) return draft;
  const optionIds = choice.options.map((option) => option.id);
  if (!optionIds.includes(optionId)) return draft;
  const option = choice.options.find((candidate) => candidate.id === optionId);
  const current = draft.featureChoiceSelections[choiceId] ?? [];
  if (
    option === undefined ||
    option.minimumClassLevel > draft.level ||
    (!current.includes(optionId) &&
      option.prerequisiteOptionIds.some((prerequisiteId) => !current.includes(prerequisiteId)))
  ) {
    return draft;
  }
  const maximum = featureChoiceCount(choice, draft.level);
  if (
    choice.spellSelection?.spellbookAddition === true &&
    !current.includes(optionId) &&
    featureSpellbookChoices(draft, catalog).includes(optionId)
  )
    return draft;
  const withoutOptionAndDependents = (removedId: string): string[] => {
    const removed = new Set([removedId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of choice.options) {
        if (
          current.includes(candidate.id) &&
          !removed.has(candidate.id) &&
          candidate.prerequisiteOptionIds.some((prerequisiteId) => removed.has(prerequisiteId))
        ) {
          removed.add(candidate.id);
          changed = true;
        }
      }
    }
    return current.filter((id) => !removed.has(id));
  };
  const selected =
    maximum === 1
      ? [optionId]
      : current.includes(optionId)
        ? withoutOptionAndDependents(optionId)
        : [...current, optionId].slice(0, maximum);
  const next = {
    ...draft,
    featureChoiceSelections: {
      ...draft.featureChoiceSelections,
      [choiceId]: selected,
    },
  };
  return selectedClass.spellcasting === undefined
    ? next
    : { ...next, ...spellSelections(next, catalog, draft.level) };
}

export function masteryCount(draft: CharacterBuilderDraft, catalog: BuilderCatalog): number {
  return catalog.classes[draft.classId].weaponMasteryCountByLevel[draft.level] ?? 0;
}

export function classSkillCount(draft: CharacterBuilderDraft, catalog: BuilderCatalog): number {
  const selectedClass = catalog.classes[draft.classId];
  return selectedClass.skillCountByLevel[draft.level] ?? selectedClass.skillMaximum;
}

export function validateBuilderDraft(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): string[] {
  const issues: string[] = [];
  const selectedClass = catalog.classes[draft.classId];
  const selectedSpecies = catalog.species[draft.speciesId];
  const selectedBackground = catalog.backgrounds[draft.backgroundId];
  const selectedOriginFeat = catalog.feats[draft.originFeatId];
  const originChoices = builderOriginChoiceDefinitions(draft, catalog);
  const equipmentOption = selectedEquipmentOption(draft, catalog);
  if (draft.name.trim().length === 0) issues.push("Enter a character name.");
  if (
    !Number.isInteger(draft.level) ||
    draft.level < selectedClass.builder.supportedLevelMinimum ||
    draft.level > selectedClass.builder.supportedLevelMaximum
  ) {
    issues.push(
      `Choose a ${selectedClass.name} level from ${String(selectedClass.builder.supportedLevelMinimum)} through ${String(selectedClass.builder.supportedLevelMaximum)}.`,
    );
  }
  if (equipmentOption === undefined) {
    issues.push(`Choose a ${selectedClass.name} starting-equipment package.`);
  }
  const requiredAsiCount = selectedClass.abilityScoreImprovementLevels.filter(
    (level) => level <= draft.level,
  ).length;
  if (draft.asiAbilities.length !== requiredAsiCount) {
    issues.push(`Choose ${String(requiredAsiCount)} Ability Score Improvement allocation(s).`);
  }
  for (const ability of abilities) {
    const score = draft.abilityScores[ability];
    if (!Number.isInteger(score) || score < 3 || score > 18) {
      issues.push(`${shortEntityName(ability)} must be a whole number from 3 through 18.`);
    }
  }
  if (selectedSpecies === undefined) {
    issues.push("Choose a reviewed species.");
  } else if (!selectedSpecies.sizeOptions.includes(draft.speciesSize)) {
    issues.push(`Choose a valid size for ${selectedSpecies.name}.`);
  }
  if (selectedBackground === undefined) {
    issues.push("Choose a reviewed background.");
  } else if (
    !selectedBackground.abilityIncreaseOptions.some((option) =>
      abilities.every(
        (ability) =>
          (option.abilityIncreases?.[ability] ?? 0) ===
          (draft.backgroundAbilityScoreIncreases[ability] ?? 0),
      ),
    )
  ) {
    issues.push(`Choose a valid ability-score allocation for ${selectedBackground.name}.`);
  }
  const originFeatChoice = originChoices.find((choice) => choice.selection === "originFeatId");
  const selectedOriginFeatOption = originFeatChoice?.options.find(
    (option) => option.id === draft.originFeatId,
  );
  if (
    selectedSpecies !== undefined &&
    selectedSpecies.originFeatMaximum > 0 &&
    (selectedOriginFeat?.category !== "origin" ||
      selectedOriginFeatOption?.disabledReason !== undefined)
  ) {
    issues.push("Choose an eligible Origin feat granted by your species.");
  }
  const activeChoices =
    selectedSpecies === undefined
      ? []
      : activeSpeciesChoices(selectedSpecies, draft.speciesChoiceSelections);
  for (const choice of activeChoices) {
    const selections = draft.speciesChoiceSelections[choice.id] ?? [];
    if (
      selections.length < choice.minimum ||
      selections.length > choice.maximum ||
      new Set(selections).size !== selections.length ||
      selections.some((optionId) => !choice.options.some((option) => option.id === optionId))
    ) {
      issues.push(`Complete the ${choice.prompt} species choice.`);
    }
  }
  if (
    Object.keys(draft.speciesChoiceSelections).some(
      (choiceId) => !activeChoices.some((choice) => choice.id === choiceId),
    )
  ) {
    issues.push("Remove choices belonging to a different species.");
  }
  if (
    selectedSpecies?.originFeatMaximum === 0 &&
    (draft.originFeatId.length > 0 || draft.originFeatSkillIds.length > 0)
  ) {
    issues.push(`${selectedSpecies.name} does not grant an additional Origin feat.`);
  }
  const requiredClassSkills = classSkillCount(draft, catalog);
  if (
    draft.classSkillIds.length !== requiredClassSkills ||
    new Set(draft.classSkillIds).size !== draft.classSkillIds.length ||
    draft.classSkillIds.some((id) => !selectedClass.skillIds.includes(id))
  ) {
    issues.push(
      `Choose exactly ${String(requiredClassSkills)} ${selectedClass.name} skill proficiencies.`,
    );
  }
  const allSkillOptions = skillIds.map((id) => `${skillPrefix}${id}`);
  if (
    selectedSpecies !== undefined &&
    (draft.speciesSkillIds.length < selectedSpecies.skillMinimum ||
      draft.speciesSkillIds.length > selectedSpecies.skillMaximum ||
      new Set(draft.speciesSkillIds).size !== draft.speciesSkillIds.length ||
      draft.speciesSkillIds.some((id) => !selectedSpecies.skillIds.includes(id)))
  ) {
    issues.push(
      `Choose exactly ${String(selectedSpecies.skillMaximum)} ${selectedSpecies.name} skill proficiency.`,
    );
  }
  if (
    selectedOriginFeat !== undefined &&
    (draft.originFeatSkillIds.length < selectedOriginFeat.skillMinimum ||
      draft.originFeatSkillIds.length > selectedOriginFeat.skillMaximum ||
      new Set(draft.originFeatSkillIds).size !== draft.originFeatSkillIds.length ||
      draft.originFeatSkillIds.some((id) => !allSkillOptions.includes(id)))
  ) {
    issues.push(
      `Choose exactly ${String(selectedOriginFeat.skillMaximum)} skill proficiencies for ${selectedOriginFeat.name}.`,
    );
  }
  const allSkills = [
    ...(selectedBackground?.skillIds ?? []),
    ...draft.classSkillIds,
    ...draft.speciesSkillIds,
    ...draft.originFeatSkillIds,
  ];
  if (new Set(allSkills).size !== allSkills.length) {
    issues.push("Each selected skill proficiency must be unique.");
  }
  for (const featId of magicInitiateFeatIds(draft, catalog)) {
    const feat = catalog.feats[featId];
    const definition = feat?.magicInitiate;
    const selection = draft.magicInitiateChoices[featId];
    if (
      definition === undefined ||
      selection === undefined ||
      !definition.abilityIds.includes(selection.ability) ||
      selection.cantripIds.length !== definition.cantripMaximum ||
      new Set(selection.cantripIds).size !== selection.cantripIds.length ||
      selection.cantripIds.some(
        (spellId) => !definition.cantrips.some((spell) => spell.id === spellId),
      ) ||
      !definition.levelOneSpells.some((spell) => spell.id === selection.levelOneSpellId)
    ) {
      issues.push(`Complete the ${feat?.name ?? featId} spell choices.`);
    }
  }
  if (
    Object.keys(draft.magicInitiateChoices).some(
      (featId) => !magicInitiateFeatIds(draft, catalog).includes(featId),
    )
  ) {
    issues.push("Remove Magic Initiate choices for feats this character does not have.");
  }

  for (const choice of selectedClass.featureChoices) {
    const selected = draft.featureChoiceSelections[choice.id] ?? [];
    const optionIds = choice.options.map((option) => option.id);
    const requiredCount = featureChoiceCount(choice, draft.level);
    const selectionLevels =
      choice.level <= draft.level
        ? featureChoiceSelectionLevels(choice, selected, draft.level)
        : undefined;
    if (
      (choice.level <= draft.level &&
        (choice.countByLevel === undefined
          ? selected.length < choice.minimum || selected.length > choice.maximum
          : selected.length !== requiredCount)) ||
      (choice.level > draft.level && selected.length > 0) ||
      new Set(selected).size !== selected.length ||
      selected.some((id) => !optionIds.includes(id)) ||
      (choice.level <= draft.level && selectionLevels === undefined)
    ) {
      const range =
        choice.countByLevel === undefined
          ? `${String(choice.minimum)}–${String(choice.maximum)}`
          : `exactly ${String(requiredCount)}`;
      issues.push(
        `Choose ${range} valid ${selectedClass.name} feature option${requiredCount === 1 ? "" : "s"}.`,
      );
    }
  }
  if (
    Object.keys(draft.featureChoiceSelections).some(
      (choiceId) => !selectedClass.featureChoices.some((choice) => choice.id === choiceId),
    )
  ) {
    issues.push(`Remove unsupported ${selectedClass.name} feature choices.`);
  }

  const requiredMasteries = masteryCount(draft, catalog);
  if (
    draft.weaponMasteryIds.length !== requiredMasteries ||
    new Set(draft.weaponMasteryIds).size !== requiredMasteries ||
    draft.weaponMasteryIds.some((id) => !selectedClass.weaponMasteryIds.includes(id))
  ) {
    issues.push(`Choose exactly ${String(requiredMasteries)} Weapon Masteries.`);
  }
  const expertiseChoice = selectedClass.builder.expertiseChoice;
  const expertiseCandidates = expertiseSkillCandidates(draft, catalog);
  const requiredExpertise = expertiseCount(draft, catalog);
  if (
    expertiseChoice !== undefined &&
    draft.level >= expertiseChoice.minimumLevel &&
    (draft.expertiseSkillIds.length !== requiredExpertise ||
      new Set(draft.expertiseSkillIds).size !== draft.expertiseSkillIds.length ||
      draft.expertiseSkillIds.some((id) => !expertiseCandidates.includes(id)))
  ) {
    issues.push(
      `Choose exactly ${String(requiredExpertise)} eligible ${selectedClass.name} skill${requiredExpertise === 1 ? "" : "s"} for Expertise.`,
    );
  }
  const spellcasting = selectedClass.spellcasting;
  const counts = spellSelectionCounts(draft, catalog);
  const bookChoices = featureSpellbookChoices(draft, catalog);
  if (
    new Set(bookChoices).size !== bookChoices.length ||
    bookChoices.some((id) => !draft.learnedSpellIds.includes(id))
  )
    issues.push("Keep distinct feature-granted spells in the spellbook.");
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
  const catalog = characterBuilderCatalog(rulesPackage);
  const selectedClass = catalog.classes[draft.classId];
  const selectedSpecies = catalog.species[draft.speciesId];
  const selectedBackground = catalog.backgrounds[draft.backgroundId];
  const selectedOriginFeat = catalog.feats[draft.originFeatId];
  const equipmentOption = selectedEquipmentOption(draft, catalog);
  if (
    selectedSpecies === undefined ||
    selectedBackground === undefined ||
    (selectedSpecies.originFeatMaximum > 0 && selectedOriginFeat === undefined) ||
    equipmentOption === undefined
  ) {
    throw new Error("Selected builder metadata is missing.");
  }
  const selectedFeatureChoicesByLevel = new Map<
    number,
    { choiceId: string; optionIds: string[] }[]
  >();
  for (const choice of selectedClass.featureChoices.filter(
    (candidate) => candidate.level <= draft.level,
  )) {
    const optionIds = draft.featureChoiceSelections[choice.id] ?? [];
    const selectionLevels = featureChoiceSelectionLevels(choice, optionIds, draft.level);
    if (selectionLevels === undefined) {
      throw new Error(`${selectedClass.name} feature choices cannot be assigned to valid levels.`);
    }
    for (const optionId of optionIds) {
      const level = selectionLevels.get(optionId);
      if (level === undefined) continue;
      const choices = selectedFeatureChoicesByLevel.get(level) ?? [];
      const selection = choices.find((candidate) => candidate.choiceId === choice.id);
      if (selection === undefined) choices.push({ choiceId: choice.id, optionIds: [optionId] });
      else selection.optionIds.push(optionId);
      selectedFeatureChoicesByLevel.set(level, choices);
    }
  }
  const levels = Array.from({ length: draft.level }, (_, index) => ({
    characterLevel: index + 1,
    classId: draft.classId,
    hitPointChoice: "fixed" as const,
    selectedFeatureChoices: selectedFeatureChoicesByLevel.get(index + 1) ?? [],
  }));
  const selectedFeatureFeatIds = selectedClass.featureChoices.flatMap((choice) => {
    const selectedOptions = new Set(draft.featureChoiceSelections[choice.id] ?? []);
    return choice.options.flatMap((option) =>
      option.grantedFeatId !== undefined && selectedOptions.has(option.id)
        ? [option.grantedFeatId]
        : [],
    );
  });
  const featIds = [
    ...new Set([
      ...selectedClass.builder.defaultGrantedFeatIds,
      ...selectedFeatureFeatIds,
      selectedBackground.featId,
      ...(selectedOriginFeat === undefined ? [] : [selectedOriginFeat.id]),
    ]),
  ];
  featIds.push(...draft.asiAbilities.map(() => abilityScoreImprovementId));
  const timestamp = options.now.toISOString();
  const spellcaster = selectedClass.spellcasting !== undefined;
  const hasSubclass =
    selectedClass.subclassId !== undefined &&
    selectedClass.subclassLevel !== undefined &&
    draft.level >= selectedClass.subclassLevel;
  const instanceCounts = new Map<string, number>();
  const equipmentKinds = new Map(
    rulesPackage.entities.map((entity) => [entity.id, entity.kind] as const),
  );
  const inventory: { id: string; entityId: string; quantity: number }[] = [];
  const equippedItemIds: string[] = [];
  for (const item of equipmentOption.items) {
    if (item.kind !== "entity") continue;
    const stem = shortEntityName(item.entityId).toLowerCase().replaceAll(" ", "-");
    const equipmentKind = equipmentKinds.get(item.entityId);
    const separateInstances = ["equipment-weapon", "equipment-armor", "equipment-shield"].includes(
      equipmentKind ?? "",
    );
    const instanceTotal = separateInstances ? item.quantity : 1;
    for (let index = 0; index < instanceTotal; index += 1) {
      const sequence = (instanceCounts.get(stem) ?? 0) + 1;
      instanceCounts.set(stem, sequence);
      const instanceId = `${stem}-${String(sequence)}`;
      inventory.push({
        id: instanceId,
        entityId: item.entityId,
        quantity: separateInstances ? 1 : item.quantity,
      });
      if (item.equipped && index === 0) equippedItemIds.push(instanceId);
    }
  }
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
      speciesId: selectedSpecies.id,
      speciesSize: draft.speciesSize,
      backgroundId: selectedBackground.id,
      backgroundAbilityScoreIncreases: draft.backgroundAbilityScoreIncreases,
      ...(hasSubclass ? { subclassId: selectedClass.subclassId } : {}),
      featAbilityScoreIncreases: featAbilityScoreIncreases(draft.asiAbilities),
      featIds,
      learnedSpellIds: spellcaster ? draft.learnedSpellIds : [],
      choices: [
        ...activeSpeciesChoices(selectedSpecies, draft.speciesChoiceSelections).map((choice) => ({
          choiceId: choice.id,
          optionIds: draft.speciesChoiceSelections[choice.id] ?? [],
        })),
        ...magicInitiateFeatIds(draft, catalog).flatMap((featId) => {
          const selection = draft.magicInitiateChoices[featId];
          if (selection === undefined) return [];
          return [
            {
              choiceId: `${featId}.choice.spellcasting-ability`,
              optionIds: [`srd521.ability.${selection.ability}`],
            },
            { choiceId: `${featId}.choice.cantrips`, optionIds: selection.cantripIds },
            {
              choiceId: `${featId}.choice.level-one-spell`,
              optionIds: [selection.levelOneSpellId],
            },
          ];
        }),
      ],
      proficiencyChoices: {
        skills: [
          ...draft.classSkillIds.map((skillId) => ({ skillId, sourceId: draft.classId })),
          ...draft.speciesSkillIds.map((skillId) => ({
            skillId,
            sourceId: selectedSpecies.id,
          })),
          ...(selectedOriginFeat === undefined
            ? []
            : draft.originFeatSkillIds.map((skillId) => ({
                skillId,
                sourceId: selectedOriginFeat.id,
              }))),
        ],
        expertise:
          selectedClass.builder.expertiseChoice !== undefined &&
          draft.level >= selectedClass.builder.expertiseChoice.minimumLevel
            ? draft.expertiseSkillIds.map((skillId) => ({
                skillId,
                sourceId: selectedClass.builder.expertiseChoice?.sourceId ?? "",
              }))
            : [],
      },
    },
    loadout: {
      inventory,
      currency: { gp: equipmentOption.currencyGp },
      equippedItemIds,
      attunedItemIds: [],
      selectedWeaponMasteryIds: draft.weaponMasteryIds,
      preparedSpellIds: spellcaster ? draft.preparedSpellIds : [],
      choices: [
        {
          choiceId: selectedClass.startingEquipment.id,
          optionIds: [equipmentOption.id],
        },
      ],
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
