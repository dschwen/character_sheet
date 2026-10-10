import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

import {
  activeSpeciesChoices,
  buildCharacter,
  builderClassIds,
  characterBuilderCatalog,
  defaultBuilderDraft,
  featureChoiceCount,
  magicInitiateFeatIds,
  spellSelectionCounts,
  updateBuilderLevel,
  validateBuilderDraft,
  type BuilderCatalog,
  type BuilderClassId,
  type BuildCharacterOptions,
  type CharacterBuilderDraft,
  type MagicInitiateSelection,
} from "./character-builder";
import { abilities, type Ability } from "./presentation";
import { asiIncreases, savedAsiAllocations } from "./ability-score-improvements";

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
  const selections: Record<string, string[]> = {};
  for (const choice of character.build.levels.flatMap((level) => level.selectedFeatureChoices)) {
    selections[choice.choiceId] = [...(selections[choice.choiceId] ?? []), ...choice.optionIds];
  }
  return selections;
}

export function magicInitiateSelections(
  character: CharacterDocument,
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): Readonly<Record<string, MagicInitiateSelection>> {
  return Object.fromEntries(
    magicInitiateFeatIds(draft, catalog).flatMap((featId) => {
      const definition = catalog.feats[featId]?.magicInitiate;
      const abilityId = character.build.choices.find(
        (choice) => choice.choiceId === `${featId}.choice.spellcasting-ability`,
      )?.optionIds[0];
      const ability = abilities.find((candidate) => abilityId === `srd521.ability.${candidate}`);
      const cantripIds = character.build.choices.find(
        (choice) => choice.choiceId === `${featId}.choice.cantrips`,
      )?.optionIds;
      const levelOneSpellId = character.build.choices.find(
        (choice) => choice.choiceId === `${featId}.choice.level-one-spell`,
      )?.optionIds[0];
      return definition !== undefined &&
        ability !== undefined &&
        cantripIds !== undefined &&
        levelOneSpellId !== undefined
        ? [[featId, { ability, cantripIds: [...cantripIds], levelOneSpellId }]]
        : [];
    }),
  );
}

function speciesChoiceSelections(
  character: CharacterDocument,
  species: BuilderCatalog["species"][string],
): Readonly<Record<string, string[]>> {
  const selections = Object.fromEntries(
    species.choices.map((choice) => [
      choice.id,
      character.build.choices.find((selection) => selection.choiceId === choice.id)?.optionIds ??
        [],
    ]),
  );
  return Object.fromEntries(
    activeSpeciesChoices(species, selections).map((choice) => [
      choice.id,
      selections[choice.id] ?? [],
    ]),
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
      reason:
        "Level-up support currently covers Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, and Wizard.",
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
  if (originFeatId === undefined && species.originFeatMaximum > 0) {
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
    originFeatId: originFeatId ?? "",
    abilityScores: { ...character.build.abilityScores },
    asiAllocations: savedAsiAllocations(
      character,
      selectedClass.abilityScoreImprovementLevels.filter(
        (level) => level <= eligibility.currentLevel,
      ),
    ),
    classSkillIds: skills
      .filter((choice) => choice.sourceId === eligibility.classId)
      .map((choice) => choice.skillId),
    speciesSkillIds: skills
      .filter((choice) => choice.sourceId === speciesId)
      .map((choice) => choice.skillId),
    speciesChoiceSelections: speciesChoiceSelections(character, species),
    originFeatSkillIds: skills
      .filter((choice) => choice.sourceId === originFeatId)
      .map((choice) => choice.skillId),
    magicInitiateChoices: {},
    expertiseSkillIds: character.build.proficiencyChoices.expertise
      .filter((choice) => choice.sourceId === expertiseSource)
      .map((choice) => choice.skillId),
    featureChoiceSelections: choiceSelections(character),
    startingEquipmentOptionId,
    weaponMasteryIds: [...character.loadout.selectedWeaponMasteryIds],
    learnedSpellIds: [...character.build.learnedSpellIds],
    preparedSpellIds: [...character.loadout.preparedSpellIds],
  };
  currentDraft.magicInitiateChoices = magicInitiateSelections(character, currentDraft, catalog);
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
  const selectedClass = catalog.classes[eligibility.classId];
  const targetLevel = eligibility.targetLevel;
  const previousAsiLevels = selectedClass.abilityScoreImprovementLevels.filter(
    (level) => level < targetLevel,
  );
  try {
    const saved = savedAsiAllocations(character, previousAsiLevels);
    if (
      saved.some((allocation, index) => {
        const before = asiIncreases([allocation]);
        const after = asiIncreases(draft.asiAllocations.slice(index, index + 1));
        return abilities.some((ability) => before[ability] !== after[ability]);
      })
    )
      issues.push("Earlier Ability Score Improvement allocations cannot change during level up.");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Existing ASI choices could not be read.");
  }
  const currentChoices = choiceSelections(character);
  for (const choice of selectedClass.featureChoices.filter(
    (candidate) => candidate.level < targetLevel && candidate.changeOn?.includes("level-up"),
  )) {
    const current = new Set(currentChoices[choice.id] ?? []);
    const next = new Set(draft.featureChoiceSelections[choice.id] ?? []);
    const removed = [...current].filter((optionId) => !next.has(optionId)).length;
    const added = [...next].filter((optionId) => !current.has(optionId)).length;
    const replacementMaximum = choice.replacementMaximum ?? 1;
    const selectionGrowth = Math.max(
      0,
      featureChoiceCount(choice, targetLevel) - featureChoiceCount(choice, targetLevel - 1),
    );
    if (removed > replacementMaximum || added > selectionGrowth + replacementMaximum) {
      issues.push(
        `Replace no more than ${String(replacementMaximum)} ${selectedClass.name} feature option during level up.`,
      );
    }
  }
  const cantripChange = selectedClass.spellcasting?.cantripChange;
  if (cantripChange?.event === "level-up") {
    const spellLevels = new Map(
      selectedClass.spellcasting?.spells.map((spell) => [spell.id, spell.level]) ?? [],
    );
    const nextLearned = new Set(draft.learnedSpellIds);
    const removedCantrips = character.build.learnedSpellIds.filter(
      (spellId) => spellLevels.get(spellId) === 0 && !nextLearned.has(spellId),
    ).length;
    if (removedCantrips > cantripChange.replacementMaximum) {
      issues.push(
        `Replace no more than ${String(cantripChange.replacementMaximum)} ${selectedClass.name} cantrip during level up.`,
      );
    }
  }
  const preparationChange = selectedClass.spellcasting?.preparationChange;
  if (preparationChange?.event === "level-up") {
    const nextPrepared = new Set(draft.preparedSpellIds);
    const alwaysPrepared = new Set(
      spellSelectionCounts(draft, catalog)?.alwaysPreparedSpellIds ?? [],
    );
    const removed = character.loadout.preparedSpellIds.filter(
      (spellId) => !nextPrepared.has(spellId) && !alwaysPrepared.has(spellId),
    ).length;
    if (removed > preparationChange.replacementMaximum) {
      issues.push(
        `Replace no more than ${String(preparationChange.replacementMaximum)} ${selectedClass.name} prepared spell during level up.`,
      );
    }
  }
  const currentMagicInitiate = magicInitiateSelections(character, draft, catalog);
  for (const featId of magicInitiateFeatIds(draft, catalog)) {
    const before = currentMagicInitiate[featId];
    const after = draft.magicInitiateChoices[featId];
    if (before === undefined || after === undefined) continue;
    if (before.ability !== after.ability) {
      issues.push(
        `${catalog.feats[featId]?.name ?? featId} cannot change its spellcasting ability.`,
      );
    }
    const removed = [
      ...before.cantripIds.filter((spellId) => !after.cantripIds.includes(spellId)),
      ...(before.levelOneSpellId === after.levelOneSpellId ? [] : [before.levelOneSpellId]),
    ];
    const replacementMaximum = catalog.feats[featId]?.magicInitiate?.replacementMaximum ?? 1;
    if (removed.length > replacementMaximum) {
      issues.push(
        `Replace no more than ${String(replacementMaximum)} ${catalog.feats[featId]?.name ?? featId} spell during level up.`,
      );
    }
  }
  const selectedSpecies = catalog.species[draft.speciesId];
  if (selectedSpecies !== undefined) {
    const currentSpeciesChoices = speciesChoiceSelections(character, selectedSpecies);
    for (const choice of activeSpeciesChoices(selectedSpecies, draft.speciesChoiceSelections)) {
      if (choice.changeOn.includes("level-up")) continue;
      const before = currentSpeciesChoices[choice.id] ?? [];
      const after = draft.speciesChoiceSelections[choice.id] ?? [];
      if (before.length !== after.length || before.some((optionId) => !after.includes(optionId))) {
        issues.push(`${choice.prompt} cannot change during level up.`);
      }
    }
  }
  return issues;
}

function mergeAdvancement(
  character: CharacterDocument,
  target: CharacterDocument,
  now: Date,
  mutableChoiceIds: ReadonlySet<string>,
  replacedFeatIds: ReadonlySet<string>,
): CharacterDocument {
  const newLevel = target.build.levels[character.build.levels.length];
  if (newLevel === undefined) throw new Error("The new class level is missing.");
  const targetLevels = target.build.levels;
  const previousChoices = choiceSelections(character);
  const targetChoices = choiceSelections(target);
  // A builder may sort low-prerequisite options into earlier acquisition slots.
  // When no option was replaced, keep the saved history and put only new grants
  // on the new level rather than rewriting the earlier levels.
  const retainedChoiceIds = new Set(
    [...mutableChoiceIds].filter((id) =>
      (previousChoices[id] ?? []).every((optionId) => targetChoices[id]?.includes(optionId)),
    ),
  );
  const advancedLevel = {
    ...newLevel,
    selectedFeatureChoices: [
      ...newLevel.selectedFeatureChoices.filter(
        (choice) => !retainedChoiceIds.has(choice.choiceId),
      ),
      ...[...retainedChoiceIds].flatMap((choiceId) => {
        const optionIds = (targetChoices[choiceId] ?? []).filter(
          (id) => !previousChoices[choiceId]?.includes(id),
        );
        return optionIds.length === 0 ? [] : [{ choiceId, optionIds }];
      }),
    ],
  };
  const existingLevels = character.build.levels.map((level, levelIndex) => ({
    ...level,
    selectedFeatureChoices: [
      ...level.selectedFeatureChoices.filter(
        (choice) =>
          !mutableChoiceIds.has(choice.choiceId) || retainedChoiceIds.has(choice.choiceId),
      ),
      ...(targetLevels[levelIndex]?.selectedFeatureChoices.filter(
        (choice) =>
          mutableChoiceIds.has(choice.choiceId) && !retainedChoiceIds.has(choice.choiceId),
      ) ?? []),
    ],
  }));
  const featIds = [...target.build.featIds];
  const targetCounts = new Map<string, number>();
  for (const featId of featIds) targetCounts.set(featId, (targetCounts.get(featId) ?? 0) + 1);
  const retainedCounts = new Map<string, number>();
  for (const featId of character.build.featIds) {
    if (replacedFeatIds.has(featId) && !targetCounts.has(featId)) continue;
    const retained = retainedCounts.get(featId) ?? 0;
    if (retained >= (targetCounts.get(featId) ?? 0)) featIds.push(featId);
    retainedCounts.set(featId, retained + 1);
  }
  return characterDocumentSchema.parse({
    ...character,
    build: {
      ...character.build,
      levels: [...existingLevels, advancedLevel],
      subclassId: target.build.subclassId,
      featAbilityScoreIncreases: target.build.featAbilityScoreIncreases,
      featIds,
      choices: [
        ...character.build.choices.filter(
          (choice) =>
            !target.build.choices.some((candidate) => candidate.choiceId === choice.choiceId),
        ),
        ...target.build.choices,
      ],
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
    const mutableChoiceIds = new Set(
      builderCatalog.classes[draft.classId].featureChoices
        .filter((choice) => choice.changeOn?.includes("level-up"))
        .map((choice) => choice.id),
    );
    const replacedFeatIds = new Set(
      builderCatalog.classes[draft.classId].featureChoices
        .filter((choice) => mutableChoiceIds.has(choice.id))
        .flatMap((choice) =>
          choice.options.flatMap((option) =>
            option.grantedFeatId === undefined ? [] : [option.grantedFeatId],
          ),
        ),
    );
    const nextCharacter = mergeAdvancement(
      character,
      target,
      options.now,
      mutableChoiceIds,
      replacedFeatIds,
    );
    // Pact Magic has one pool whose slot level grows. Advancing is not a rest:
    // carry its spent slots into the upgraded pool instead of refilling it.
    const previousCasting = evaluateCharacter({ character, packages: [rulesPackage] }).spellcasting;
    const targetCasting = evaluateCharacter({
      character: target,
      packages: [rulesPackage],
    }).spellcasting;
    if (previousCasting?.model === "pact-magic" && targetCasting?.model === "pact-magic") {
      const previousSlot = previousCasting.slots[0];
      const nextSlot = targetCasting.slots[0];
      if (previousSlot && nextSlot && previousSlot.level !== nextSlot.level) {
        const previousKey = String(previousSlot.level);
        const nextKey = String(nextSlot.level);
        const spent = nextCharacter.state.expendedSpellSlots[previousKey];
        if (spent !== undefined) {
          nextCharacter.state.expendedSpellSlots = {
            ...Object.fromEntries(
              Object.entries(nextCharacter.state.expendedSpellSlots).filter(
                ([key]) => key !== previousKey,
              ),
            ),
            [nextKey]: (nextCharacter.state.expendedSpellSlots[nextKey] ?? 0) + spent,
          };
        }
      }
    }
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
