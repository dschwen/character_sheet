import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

import {
  buildCharacter,
  builderClassIds,
  characterBuilderCatalog,
  defaultBuilderDraft,
  updateBuilderLevel,
  validateBuilderDraft,
  type BuilderCatalog,
  type BuilderClassId,
  type BuildCharacterOptions,
  type CharacterBuilderDraft,
} from "./character-builder";
import { abilities, type Ability } from "./presentation";

export interface LevelUpEligibility {
  eligible: boolean;
  currentLevel: number;
  targetLevel?: number;
  classId?: BuilderClassId;
  className?: string;
  reason?: string;
}

export interface LevelUpPreview {
  character?: CharacterDocument;
  evaluation?: CharacterEvaluation;
  issues: string[];
}

function isBuilderClassId(value: string): value is BuilderClassId {
  return (builderClassIds as readonly string[]).includes(value);
}

function sameAbilityScores(
  left: Readonly<Record<Ability, number>>,
  right: Readonly<Record<Ability, number>>,
): boolean {
  return abilities.every((ability) => left[ability] === right[ability]);
}

function abilityIncreases(
  values: CharacterDocument["build"]["backgroundAbilityScoreIncreases"],
): Partial<Record<Ability, number>> {
  return Object.fromEntries(
    abilities.flatMap((ability) => {
      const value = values[ability];
      return value === undefined ? [] : [[ability, value]];
    }),
  );
}

function choiceSelections(character: CharacterDocument): Readonly<Record<string, string[]>> {
  return Object.fromEntries(
    character.build.levels.flatMap((level) =>
      level.selectedFeatureChoices.map((choice) => [choice.choiceId, [...choice.optionIds]]),
    ),
  );
}

function chosenAsiAbility(character: CharacterDocument, fallback: Ability): Ability {
  return (
    abilities.find((ability) => character.build.featAbilityScoreIncreases[ability] === 2) ??
    fallback
  );
}

function uniqueBySourceAndSkill<T extends { sourceId: string; skillId: string }>(values: T[]): T[] {
  return values.filter(
    (value, index) =>
      values.findIndex(
        (candidate) => candidate.sourceId === value.sourceId && candidate.skillId === value.skillId,
      ) === index,
  );
}

export function levelUpEligibility(
  character: CharacterDocument,
  catalog: BuilderCatalog,
): LevelUpEligibility {
  const currentLevel = character.build.levels.length;
  if (currentLevel === 0) {
    return { eligible: false, currentLevel, reason: "The character has no starting class level." };
  }
  const classIds = new Set(character.build.levels.map((level) => level.classId));
  const classId = character.build.levels[0]?.classId;
  if (classId === undefined || classIds.size !== 1) {
    return {
      eligible: false,
      currentLevel,
      reason: "This phase supports same-class characters only; multiclass advancement comes later.",
    };
  }
  if (!isBuilderClassId(classId)) {
    return {
      eligible: false,
      currentLevel,
      reason: "Level-up support currently covers Barbarian, Cleric, Druid, Fighter, and Wizard.",
    };
  }
  const selectedClass = catalog.classes[classId];
  if (currentLevel < selectedClass.builder.supportedLevelMinimum) {
    return {
      eligible: false,
      currentLevel,
      classId,
      className: selectedClass.name,
      reason: `${selectedClass.name} advancement starts at level ${String(selectedClass.builder.supportedLevelMinimum)}.`,
    };
  }
  if (currentLevel >= selectedClass.builder.supportedLevelMaximum) {
    return {
      eligible: false,
      currentLevel,
      classId,
      className: selectedClass.name,
      reason: `${selectedClass.name} advancement is currently reviewed through level ${String(selectedClass.builder.supportedLevelMaximum)}.`,
    };
  }
  return {
    eligible: true,
    currentLevel,
    targetLevel: currentLevel + 1,
    classId,
    className: selectedClass.name,
  };
}

export function createLevelUpDraft(
  character: CharacterDocument,
  catalog: BuilderCatalog,
): CharacterBuilderDraft {
  const eligibility = levelUpEligibility(character, catalog);
  if (
    !eligibility.eligible ||
    eligibility.classId === undefined ||
    eligibility.targetLevel === undefined
  ) {
    throw new Error(eligibility.reason ?? "This character cannot level up.");
  }
  const selectedClass = catalog.classes[eligibility.classId];
  const speciesId = character.build.speciesId;
  const backgroundId = character.build.backgroundId;
  const speciesSize = character.build.speciesSize;
  const species = speciesId === undefined ? undefined : catalog.species[speciesId];
  const background = backgroundId === undefined ? undefined : catalog.backgrounds[backgroundId];
  if (species === undefined || background === undefined || speciesSize === undefined) {
    throw new Error("Level up requires an origin supported by the guided builder.");
  }
  const originFeatId = character.build.featIds.find((featId) => {
    const feat = catalog.feats[featId];
    return feat?.category === "origin" && (featId !== background.featId || feat.repeatable);
  });
  if (originFeatId === undefined) {
    throw new Error("The character's species-granted Origin feat could not be identified.");
  }
  const startingEquipmentOptionId =
    character.loadout.choices
      .find((choice) => choice.choiceId === selectedClass.startingEquipment.id)
      ?.optionIds.find((optionId) =>
        selectedClass.startingEquipment.options.some((option) => option.id === optionId),
      ) ?? selectedClass.startingEquipment.options[0]?.id;
  if (startingEquipmentOptionId === undefined) {
    throw new Error(`${selectedClass.name} has no supported starting-equipment package.`);
  }
  const skills = character.build.proficiencyChoices.skills;
  const expertiseSource = selectedClass.builder.expertiseChoice?.sourceId;
  const currentDraft: CharacterBuilderDraft = {
    ...defaultBuilderDraft(eligibility.classId, catalog, eligibility.currentLevel, character.name),
    speciesId: species.id,
    speciesSize,
    backgroundId: background.id,
    backgroundAbilityScoreIncreases: abilityIncreases(
      character.build.backgroundAbilityScoreIncreases,
    ),
    originFeatId,
    abilityScores: { ...character.build.abilityScores },
    asiAbility: chosenAsiAbility(
      character,
      selectedClass.builder.defaultAbilityScoreImprovementAbility,
    ),
    classSkillIds: skills
      .filter((choice) => choice.sourceId === eligibility.classId)
      .map((choice) => choice.skillId),
    speciesSkillIds: skills
      .filter((choice) => choice.sourceId === speciesId)
      .map((choice) => choice.skillId),
    originFeatSkillIds: skills
      .filter((choice) => choice.sourceId === originFeatId)
      .map((choice) => choice.skillId),
    expertiseSkillId:
      character.build.proficiencyChoices.expertise.find(
        (choice) => choice.sourceId === expertiseSource,
      )?.skillId ?? "",
    featureChoiceSelections: choiceSelections(character),
    startingEquipmentOptionId,
    weaponMasteryIds: [...character.loadout.selectedWeaponMasteryIds],
    learnedSpellIds: [...character.build.learnedSpellIds],
    preparedSpellIds: [...character.loadout.preparedSpellIds],
  };
  return updateBuilderLevel(currentDraft, catalog, eligibility.targetLevel);
}

function advancementIssues(
  character: CharacterDocument,
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): string[] {
  const eligibility = levelUpEligibility(character, catalog);
  if (
    !eligibility.eligible ||
    eligibility.classId === undefined ||
    eligibility.targetLevel === undefined
  ) {
    return [eligibility.reason ?? "This character cannot level up."];
  }
  const issues = validateBuilderDraft(draft, catalog);
  if (draft.classId !== eligibility.classId || draft.level !== eligibility.targetLevel) {
    issues.unshift("Level up must add exactly one level in the character's current class.");
  }
  if (
    draft.name !== character.name ||
    draft.speciesId !== character.build.speciesId ||
    draft.speciesSize !== character.build.speciesSize ||
    draft.backgroundId !== character.build.backgroundId ||
    !sameAbilityScores(draft.abilityScores, character.build.abilityScores)
  ) {
    issues.unshift("Identity and base ability scores cannot change during level up.");
  }
  return issues;
}

function mergeAdvancement(
  character: CharacterDocument,
  target: CharacterDocument,
  now: Date,
): CharacterDocument {
  const newLevel = target.build.levels[character.build.levels.length];
  if (newLevel === undefined) throw new Error("The new class level is missing.");
  return characterDocumentSchema.parse({
    ...character,
    build: {
      ...character.build,
      levels: [...character.build.levels, newLevel],
      subclassId: target.build.subclassId,
      featAbilityScoreIncreases: target.build.featAbilityScoreIncreases,
      featIds: [...new Set([...character.build.featIds, ...target.build.featIds])],
      learnedSpellIds: target.build.learnedSpellIds,
      proficiencyChoices: {
        skills: uniqueBySourceAndSkill([
          ...target.build.proficiencyChoices.skills,
          ...character.build.proficiencyChoices.skills,
        ]),
        expertise: uniqueBySourceAndSkill([
          ...target.build.proficiencyChoices.expertise,
          ...character.build.proficiencyChoices.expertise,
        ]),
      },
    },
    loadout: {
      ...character.loadout,
      selectedWeaponMasteryIds: target.loadout.selectedWeaponMasteryIds,
      preparedSpellIds: target.loadout.preparedSpellIds,
    },
    metadata: {
      ...character.metadata,
      updatedAt: now.toISOString(),
      revision: character.metadata.revision + 1,
    },
  });
}

export function previewLevelUp(
  character: CharacterDocument,
  draft: CharacterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): LevelUpPreview {
  const builderCatalog = characterBuilderCatalog(rulesPackage);
  const issues = advancementIssues(character, draft, builderCatalog);
  if (issues.length > 0) return { issues };
  try {
    const target = buildCharacter(draft, rulesPackage, options);
    const nextCharacter = mergeAdvancement(character, target, options.now);
    const evaluation = evaluateCharacter({ character: nextCharacter, packages: [rulesPackage] });
    return {
      character: nextCharacter,
      evaluation,
      issues: evaluation.validations
        .filter((validation) => validation.severity === "error")
        .map(
          (validation) =>
            validation.message.en ?? Object.values(validation.message)[0] ?? validation.code,
        ),
    };
  } catch (error) {
    return { issues: [error instanceof Error ? error.message : "Level-up preview failed."] };
  }
}

export function levelUpCharacter(
  character: CharacterDocument,
  draft: CharacterBuilderDraft,
  rulesPackage: LoadedRulesPackage,
  options: BuildCharacterOptions,
): CharacterDocument {
  const preview = previewLevelUp(character, draft, rulesPackage, options);
  if (preview.character === undefined || preview.issues.length > 0) {
    throw new Error(preview.issues[0] ?? "The level-up choices are incomplete.");
  }
  return preview.character;
}
