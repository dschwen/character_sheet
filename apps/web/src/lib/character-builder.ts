import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

import { abilities, type Ability, shortEntityName } from "./presentation";

export const fighterId = "srd521.class.fighter";
export const wizardId = "srd521.class.wizard";
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
  speciesId: string;
  speciesSize: SpeciesSize;
  backgroundId: string;
  backgroundAbilityScoreIncreases: Partial<Record<Ability, number>>;
  originFeatId: string;
  name: string;
  level: number;
  abilityScores: Record<Ability, number>;
  asiAbility: Ability;
  classSkillIds: string[];
  speciesSkillIds: string[];
  originFeatSkillIds: string[];
  scholarSkillId: string;
  weaponMasteryIds: string[];
  learnedSpellIds: string[];
  preparedSpellIds: string[];
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
  originFeatMinimum: number;
  originFeatMaximum: number;
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
        return [
          candidate.id,
          {
            id: candidate.id,
            name: localizedName(candidate),
            description: `${shortEntityName(typeof body?.creatureType === "string" ? body.creatureType : "creature")} · ${String(walkingSpeed)}-foot speed · ${sizeOptions.map(shortEntityName).join(" or ")} size.`,
            walkingSpeed,
            sizeOptions,
            ...(typeof body?.recommendedOriginFeatId === "string"
              ? { recommendedOriginFeatId: body.recommendedOriginFeatId }
              : {}),
            skillMinimum: numericValue(skillChoice?.minimum),
            skillMaximum: numericValue(skillChoice?.maximum),
            originFeatMinimum: numericValue(originFeatChoice?.minimum),
            originFeatMaximum: numericValue(originFeatChoice?.maximum),
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
          },
        ];
      }),
  ) as Record<string, FeatBuilderCatalog>;
  if (Object.keys(species).length === 0 || Object.keys(backgrounds).length === 0) {
    throw new Error("Builder origin metadata is missing from the loaded rules package.");
  }

  return {
    classes: {
      [fighterId]: classCatalog(fighterId, rulesPackage),
      [wizardId]: classCatalog(wizardId, rulesPackage),
    },
    species,
    backgrounds,
    feats,
    weaponIds: fighterWeaponIds,
    weaponNames: Object.fromEntries(fighterWeaponIds.map((id) => [id, localizedName(entity(id))])),
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
      options: Object.values(catalog.backgrounds).map((background) => ({
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
      options: allSkills,
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
  const draft: CharacterBuilderDraft = {
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
    speciesSkillIds: [fighter ? `${skillPrefix}persuasion` : `${skillPrefix}perception`].slice(
      0,
      species.skillMaximum,
    ),
    originFeatSkillIds: (fighter
      ? [`${skillPrefix}arcana`, `${skillPrefix}insight`, `${skillPrefix}stealth`]
      : [`${skillPrefix}persuasion`, `${skillPrefix}stealth`, `${skillPrefix}survival`]
    ).slice(0, originFeat.skillMaximum),
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
  const selectedSpecies = catalog.species[draft.speciesId];
  const selectedBackground = catalog.backgrounds[draft.backgroundId];
  const selectedOriginFeat = catalog.feats[draft.originFeatId];
  const originChoices = builderOriginChoiceDefinitions(draft, catalog);
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
    selectedOriginFeat?.category !== "origin" ||
    selectedOriginFeatOption?.disabledReason !== undefined
  ) {
    issues.push("Choose an eligible Origin feat granted by your species.");
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
  if (
    selectedSpecies !== undefined &&
    (draft.speciesSkillIds.length < selectedSpecies.skillMinimum ||
      draft.speciesSkillIds.length > selectedSpecies.skillMaximum ||
      new Set(draft.speciesSkillIds).size !== draft.speciesSkillIds.length ||
      draft.speciesSkillIds.some((id) => !allSkillOptions.includes(id)))
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
  const catalog = characterBuilderCatalog(rulesPackage);
  const selectedClass = catalog.classes[draft.classId];
  const selectedSpecies = catalog.species[draft.speciesId];
  const selectedBackground = catalog.backgrounds[draft.backgroundId];
  const selectedOriginFeat = catalog.feats[draft.originFeatId];
  if (
    selectedSpecies === undefined ||
    selectedBackground === undefined ||
    selectedOriginFeat === undefined
  ) {
    throw new Error("Selected origin metadata is missing.");
  }
  const levels = Array.from({ length: draft.level }, (_, index) => ({
    characterLevel: index + 1,
    classId: draft.classId,
    hitPointChoice: "fixed" as const,
  }));
  const featIds = [selectedBackground.featId, selectedOriginFeat.id];
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
      speciesId: selectedSpecies.id,
      speciesSize: draft.speciesSize,
      backgroundId: selectedBackground.id,
      backgroundAbilityScoreIncreases: draft.backgroundAbilityScoreIncreases,
      ...(hasSubclass ? { subclassId: selectedClass.subclassId } : {}),
      featAbilityScoreIncreases: draft.level >= 4 ? { [draft.asiAbility]: 2 } : {},
      featIds,
      learnedSpellIds: spellcaster ? draft.learnedSpellIds : [],
      choices: [],
      proficiencyChoices: {
        skills: [
          ...draft.classSkillIds.map((skillId) => ({ skillId, sourceId: draft.classId })),
          ...draft.speciesSkillIds.map((skillId) => ({
            skillId,
            sourceId: selectedSpecies.id,
          })),
          ...draft.originFeatSkillIds.map((skillId) => ({
            skillId,
            sourceId: selectedOriginFeat.id,
          })),
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
