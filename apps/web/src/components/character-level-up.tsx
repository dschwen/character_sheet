"use client";

import { useMemo, useState } from "react";

import type { CharacterDocument } from "@dnd/character-model";
import type { LoadedRulesPackage } from "@dnd/rules-api";
import { featIncreaseLabel } from "../lib/advancement-feats";
import { AdvancementFeatSelect } from "./advancement-feat-select";

import {
  createLevelUpDraft,
  levelUpCharacter,
  magicInitiateSelections,
  previewLevelUp,
} from "../lib/character-level-up";
import {
  characterBuilderCatalog,
  classSkillCount,
  expertiseCount,
  expertiseSelectionSources,
  expertiseSkillCandidates,
  featureChoiceCount,
  featureChoiceOptionsForLevel,
  featureSpellbookChoices,
  featureFeatOptionAlreadySelected,
  magicInitiateFeatIds,
  masteryCount,
  spellSelectionCounts,
  updateBuilderFeatureChoice,
  updateMagicInitiateSelection,
  type CharacterBuilderDraft,
} from "../lib/character-builder";
import { numericFact, shortEntityName, signed, titleCase } from "../lib/presentation";

interface CharacterLevelUpProps {
  character: CharacterDocument;
  rulesPackage: LoadedRulesPackage;
  onCancel: () => void;
  onComplete: (character: CharacterDocument) => void;
}

interface InitialLevelUpState {
  draft?: CharacterBuilderDraft;
  error?: string;
}

function initialState(
  character: CharacterDocument,
  rulesPackage: LoadedRulesPackage,
): InitialLevelUpState {
  try {
    return { draft: createLevelUpDraft(character, characterBuilderCatalog(rulesPackage)) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Level up could not be started." };
  }
}

function skillName(id: string): string {
  return titleCase(id.replace("srd521.skill.", ""));
}

function toggleUnlocked(
  values: string[],
  value: string,
  locked: ReadonlySet<string>,
  maximum: number,
): string[] {
  if (locked.has(value)) return values;
  if (values.includes(value)) return values.filter((candidate) => candidate !== value);
  return values.length >= maximum ? values : [...values, value];
}

export function CharacterLevelUp({
  character,
  rulesPackage,
  onCancel,
  onComplete,
}: Readonly<CharacterLevelUpProps>) {
  const catalog = useMemo(() => characterBuilderCatalog(rulesPackage), [rulesPackage]);
  const [step, setStep] = useState(0);
  const [featureSearch, setFeatureSearch] = useState<Record<string, string>>({});
  const [initial] = useState(() => initialState(character, rulesPackage));
  const [draft, setDraft] = useState(initial.draft);
  const previewOptions = useMemo(
    () => ({ id: character.id, now: new Date("2026-08-08T00:00:00.000Z") }),
    [character.id],
  );
  const preview = useMemo(
    () =>
      draft === undefined
        ? { issues: [initial.error ?? "Level up could not be started."] }
        : previewLevelUp(character, draft, rulesPackage, previewOptions),
    [character, draft, initial.error, previewOptions, rulesPackage],
  );

  if (draft === undefined) {
    return (
      <div className="builder-shell" role="dialog" aria-modal="true" aria-label="Level up">
        <header className="builder-header">
          <div>
            <span className="builder-mark" aria-hidden="true">
              ↑
            </span>
            <span>
              <strong>Level up</strong>
              <small>Advancement unavailable</small>
            </span>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close level up">
            ×
          </button>
        </header>
        <section className="builder-content">
          <div className="builder-issues">{initial.error}</div>
        </section>
      </div>
    );
  }

  const selectedClass = catalog.classes[draft.classId];
  const currentLevel = character.build.levels.length;
  const targetLevel = draft.level;
  const currentClassSkillIds = character.build.proficiencyChoices.skills
    .filter((choice) => choice.sourceId === draft.classId)
    .map((choice) => choice.skillId);
  const unavailableClassSkills = new Set([
    ...(catalog.backgrounds[draft.backgroundId]?.skillIds ?? []),
    ...character.build.proficiencyChoices.skills
      .filter((choice) => choice.sourceId !== draft.classId)
      .map((choice) => choice.skillId),
  ]);
  const requiredClassSkills = classSkillCount(draft, catalog);
  const newClassSkillCount = Math.max(0, requiredClassSkills - currentClassSkillIds.length);
  const currentMasteries = new Set(character.loadout.selectedWeaponMasteryIds);
  const requiredMasteries = masteryCount(draft, catalog);
  const newMasteryCount = Math.max(0, requiredMasteries - currentMasteries.size);
  const spellcasting = selectedClass.spellcasting;
  const spellCounts = spellSelectionCounts(draft, catalog);
  const currentLearned = new Set(character.build.learnedSpellIds);
  const spellLevels = new Map(spellcasting?.spells.map((spell) => [spell.id, spell.level]) ?? []);
  const currentCantrips = new Set(
    character.build.learnedSpellIds.filter((spellId) => spellLevels.get(spellId) === 0),
  );
  const cantripReplacementMaximum =
    spellcasting?.cantripChange?.event === "level-up"
      ? spellcasting.cantripChange.replacementMaximum
      : 0;
  const removedCantripCount = [...currentCantrips].filter(
    (spellId) => !draft.learnedSpellIds.includes(spellId),
  ).length;
  const currentPrepared = new Set(character.loadout.preparedSpellIds);
  const preparedReplacementMaximum =
    spellcasting?.preparationChange?.event === "level-up"
      ? spellcasting.preparationChange.replacementMaximum
      : 0;
  const targetAlwaysPrepared = new Set(spellCounts?.alwaysPreparedSpellIds ?? []);
  const removedPreparedCount = [...currentPrepared].filter(
    (spellId) => !draft.preparedSpellIds.includes(spellId) && !targetAlwaysPrepared.has(spellId),
  ).length;
  const targetFeatureChoices = selectedClass.featureChoices.filter(
    (choice) =>
      choice.level === targetLevel ||
      (choice.level < targetLevel && choice.changeOn?.includes("level-up")),
  );
  const expertiseSources = expertiseSelectionSources(draft, catalog);
  const eligibleExpertiseSkills = expertiseSkillCandidates(draft, catalog);
  const requiredExpertise = expertiseCount(draft, catalog);
  const currentExpertiseSkillIds = character.build.proficiencyChoices.expertise
    .filter((choice) => expertiseSources.includes(choice.sourceId))
    .map((choice) => choice.skillId);
  const newExpertiseCount = Math.max(0, requiredExpertise - currentExpertiseSkillIds.length);
  const introducesExpertise = newExpertiseCount > 0;
  const introducesSubclass = selectedClass.subclassLevel === targetLevel;
  const asiIndex = selectedClass.abilityScoreImprovementLevels.indexOf(targetLevel);
  const introducesAsi = asiIndex >= 0;
  const magicInitiateIds = magicInitiateFeatIds(draft, catalog);
  const hasChoiceSections =
    newClassSkillCount > 0 ||
    newMasteryCount > 0 ||
    targetFeatureChoices.length > 0 ||
    introducesExpertise ||
    introducesAsi ||
    magicInitiateIds.length > 0 ||
    spellcasting !== undefined;

  function toggleClassSkill(skillId: string): void {
    setDraft((value) => {
      if (value === undefined) return value;
      return {
        ...value,
        classSkillIds: toggleUnlocked(
          value.classSkillIds,
          skillId,
          new Set(currentClassSkillIds),
          requiredClassSkills,
        ),
      };
    });
  }

  function toggleMastery(weaponId: string): void {
    setDraft((value) =>
      value === undefined
        ? value
        : {
            ...value,
            weaponMasteryIds: toggleUnlocked(
              value.weaponMasteryIds,
              weaponId,
              currentMasteries,
              requiredMasteries,
            ),
          },
    );
  }

  function toggleLearnedSpell(
    spellId: string,
    groupIds: string[],
    maximum: number,
    replacementMaximum = 0,
  ): void {
    setDraft((value) => {
      if (value === undefined) return value;
      const groupSelections = value.learnedSpellIds.filter((id) => groupIds.includes(id));
      const currentGroup = new Set([...currentLearned].filter((id) => groupIds.includes(id)));
      let nextGroup: string[];
      if (currentGroup.has(spellId) && replacementMaximum > 0) {
        if (groupSelections.includes(spellId)) {
          const removed = [...currentGroup].filter((id) => !groupSelections.includes(id)).length;
          nextGroup =
            removed >= replacementMaximum
              ? groupSelections
              : groupSelections.filter((id) => id !== spellId);
        } else {
          nextGroup =
            groupSelections.length >= maximum ? groupSelections : [...groupSelections, spellId];
        }
      } else {
        nextGroup = toggleUnlocked(groupSelections, spellId, currentLearned, maximum);
      }
      const learnedSpellIds = [
        ...value.learnedSpellIds.filter((id) => !groupIds.includes(id)),
        ...nextGroup,
      ];
      return {
        ...value,
        learnedSpellIds,
        preparedSpellIds: value.preparedSpellIds.filter((id) => learnedSpellIds.includes(id)),
      };
    });
  }

  function togglePreparedSpell(spellId: string): void {
    if (spellCounts === undefined) return;
    setDraft((value) => {
      if (value === undefined) return value;
      const selected = value.preparedSpellIds.includes(spellId);
      if (currentPrepared.has(spellId)) {
        if (!selected) {
          return value.preparedSpellIds.length >= spellCounts.preparedSpells
            ? value
            : { ...value, preparedSpellIds: [...value.preparedSpellIds, spellId] };
        }
        const removed = [...currentPrepared].filter(
          (id) => !value.preparedSpellIds.includes(id) && !targetAlwaysPrepared.has(id),
        ).length;
        return preparedReplacementMaximum === 0 || removed >= preparedReplacementMaximum
          ? value
          : {
              ...value,
              preparedSpellIds: value.preparedSpellIds.filter((id) => id !== spellId),
            };
      }
      return {
        ...value,
        preparedSpellIds: toggleUnlocked(
          value.preparedSpellIds,
          spellId,
          new Set(),
          spellCounts.preparedSpells,
        ),
      };
    });
  }

  function applyLevelUp(): void {
    if (draft === undefined) return;
    try {
      onComplete(
        levelUpCharacter(character, draft, rulesPackage, {
          id: character.id,
          now: new Date(),
        }),
      );
    } catch {
      setStep(1);
    }
  }

  return (
    <div className="builder-shell" role="dialog" aria-modal="true" aria-label="Level up character">
      <header className="builder-header">
        <div>
          <span className="builder-mark" aria-hidden="true">
            ↑
          </span>
          <span>
            <strong>Advance {character.name}</strong>
            <small>
              {selectedClass.name} {String(currentLevel)} → {String(targetLevel)}
            </small>
          </span>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close level up">
          ×
        </button>
      </header>

      <div className="builder-layout level-up-layout">
        <aside className="builder-steps" aria-label="Level-up progress">
          <p>Class advancement</p>
          <ol>
            {["New choices", "Review"].map((label, index) => (
              <li
                key={label}
                className={index === step ? "active" : index < step ? "complete" : undefined}
              >
                <button
                  type="button"
                  onClick={() => {
                    setStep(index);
                  }}
                >
                  <i>{index < step ? "✓" : String(index + 1)}</i>
                  <span>
                    <strong>{label}</strong>
                    <small>{index === 0 ? "Choose advancement" : "Confirm changes"}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="builder-package">
            <span>Preserved</span>
            <strong>Play state</strong>
            <small>Inventory · HP · conditions</small>
          </div>
        </aside>

        <section className="builder-content">
          <div className="builder-content-heading">
            <span>Level {String(targetLevel)}</span>
            <h1>{step === 0 ? "Choose advancement" : "Review level up"}</h1>
          </div>

          {step === 0 ? (
            <div className="builder-section">
              <div className="review-identity">
                <span>Next class level</span>
                <h2>
                  {selectedClass.name} {String(targetLevel)}
                </h2>
                <p>
                  Adds one fixed Hit Die. Existing equipment, currency, damage, conditions, and
                  expended resources will not change.
                </p>
              </div>

              {selectedClass.abilityScoreImprovementLevels.some(
                (level) =>
                  level <= currentLevel &&
                  character.build.levels[level - 1]?.featSelections === undefined,
              ) ? (
                <div className="builder-callout">
                  <strong>Earlier ability increases are stored as combined totals</strong>
                  <p>
                    Those totals are preserved. The older sheet does not record which allocation was
                    taken at each level; this advancement records only the new choice.
                  </p>
                </div>
              ) : null}

              {introducesSubclass ? (
                <div className="builder-callout">
                  <strong>{selectedClass.subclassName} begins at this level</strong>
                  <p>The reviewed subclass is applied automatically for this vertical slice.</p>
                </div>
              ) : null}

              {!hasChoiceSections ? (
                <div className="builder-callout">
                  <strong>No selections are required at this level</strong>
                  <p>Review the derived changes, then confirm the advancement.</p>
                </div>
              ) : null}

              {newClassSkillCount > 0 ? (
                <div className="skill-choice-section">
                  <div>
                    <span>{selectedClass.name} feature</span>
                    <h2>New skill proficiency</h2>
                    <small>
                      {String(draft.classSkillIds.length - currentClassSkillIds.length)} /{" "}
                      {String(newClassSkillCount)} new
                    </small>
                  </div>
                  <div className="choice-pills">
                    {selectedClass.skillIds
                      .filter(
                        (id) =>
                          !currentClassSkillIds.includes(id) && !unavailableClassSkills.has(id),
                      )
                      .map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={draft.classSkillIds.includes(id) ? "selected" : undefined}
                          disabled={
                            !draft.classSkillIds.includes(id) &&
                            draft.classSkillIds.length >= requiredClassSkills
                          }
                          onClick={() => {
                            toggleClassSkill(id);
                          }}
                        >
                          {skillName(id)}
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}

              {introducesExpertise ? (
                <div className="skill-choice-section">
                  <div>
                    <span>Additional Expertise</span>
                    <h2>
                      Choose {String(newExpertiseCount)} new skill
                      {newExpertiseCount === 1 ? "" : "s"}
                    </h2>
                    <small>
                      {String(draft.expertiseSkillIds.length - currentExpertiseSkillIds.length)} /{" "}
                      {String(newExpertiseCount)} new
                    </small>
                  </div>
                  <div className="choice-pills">
                    {eligibleExpertiseSkills.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={draft.expertiseSkillIds.includes(id) ? "selected" : undefined}
                        disabled={currentExpertiseSkillIds.includes(id)}
                        onClick={() => {
                          setDraft((value) =>
                            value === undefined
                              ? value
                              : {
                                  ...value,
                                  expertiseSkillIds: toggleUnlocked(
                                    value.expertiseSkillIds,
                                    id,
                                    new Set(currentExpertiseSkillIds),
                                    requiredExpertise,
                                  ),
                                },
                          );
                        }}
                      >
                        {skillName(id)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {targetFeatureChoices.map((choice) => (
                <div className="skill-choice-section" key={choice.id}>
                  <div>
                    <span>{selectedClass.name} feature</span>
                    <h2>{shortEntityName(choice.id)}</h2>
                    <small>
                      {choice.level < targetLevel
                        ? `${String((draft.featureChoiceSelections[choice.id] ?? []).length)} / ${String(featureChoiceCount(choice, targetLevel))} selected · replace up to ${String(choice.replacementMaximum ?? 1)}`
                        : `${String((draft.featureChoiceSelections[choice.id] ?? []).length)} / ${String(featureChoiceCount(choice, targetLevel))} selected`}
                    </small>
                    {choice.spellSelection === undefined ? null : (
                      <label>
                        Search eligible spells
                        <input
                          type="search"
                          value={featureSearch[choice.id] ?? ""}
                          onChange={(event) => {
                            setFeatureSearch((current) => ({
                              ...current,
                              [choice.id]: event.target.value,
                            }));
                          }}
                        />
                        <small>
                          {choice.spellSelection.alwaysPrepared
                            ? "Always prepared; these do not use your normal spell selections."
                            : "Added to your spellbook in addition to normal growth; prepare them normally."}{" "}
                          Selected:{" "}
                          {(draft.featureChoiceSelections[choice.id] ?? [])
                            .map(
                              (id) => choice.options.find((option) => option.id === id)?.name ?? id,
                            )
                            .join(", ") || "None"}
                        </small>
                      </label>
                    )}
                  </div>
                  <div className="builder-choice-grid">
                    {featureChoiceOptionsForLevel(
                      choice,
                      targetLevel,
                      featureSearch[choice.id],
                    ).map((option) => {
                      const selected = (draft.featureChoiceSelections[choice.id] ?? []).includes(
                        option.id,
                      );
                      const currentOptions = new Set(
                        character.build.levels
                          .flatMap((level) => level.selectedFeatureChoices)
                          .filter((selection) => selection.choiceId === choice.id)
                          .flatMap((selection) => selection.optionIds),
                      );
                      const removedOptions = [...currentOptions].filter(
                        (optionId) =>
                          !(draft.featureChoiceSelections[choice.id] ?? []).includes(optionId),
                      ).length;
                      const replacementBlocked =
                        choice.level < targetLevel &&
                        selected &&
                        currentOptions.has(option.id) &&
                        removedOptions >= (choice.replacementMaximum ?? 1);
                      const selectedIds = draft.featureChoiceSelections[choice.id] ?? [];
                      const missingPrerequisite = option.prerequisiteOptionIds.find(
                        (optionId) => !selectedIds.includes(optionId),
                      );
                      const unavailable = option.minimumClassLevel > targetLevel;
                      const alreadyGranted =
                        featureFeatOptionAlreadySelected(draft, catalog, choice.id, option.id) ||
                        (!selected &&
                          choice.spellSelection?.spellbookAddition === true &&
                          featureSpellbookChoices(draft, catalog).includes(option.id));
                      const maximumReached =
                        !selected && selectedIds.length >= featureChoiceCount(choice, targetLevel);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={selected ? "builder-choice selected" : "builder-choice"}
                          disabled={
                            replacementBlocked ||
                            alreadyGranted ||
                            unavailable ||
                            missingPrerequisite !== undefined ||
                            maximumReached
                          }
                          onClick={() => {
                            setDraft((value) =>
                              value === undefined
                                ? value
                                : updateBuilderFeatureChoice(value, catalog, choice.id, option.id),
                            );
                          }}
                        >
                          <span>Class option</span>
                          <h2>{option.name}</h2>
                          <p>{option.description}</p>
                          <small>
                            {selected
                              ? "Selected"
                              : alreadyGranted
                                ? "Already selected for another feature grant"
                                : unavailable
                                  ? `Requires level ${String(option.minimumClassLevel)}`
                                  : missingPrerequisite === undefined
                                    ? "Choose option"
                                    : `Requires ${choice.options.find((candidate) => candidate.id === missingPrerequisite)?.name ?? shortEntityName(missingPrerequisite)}`}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {introducesAsi ? (
                <AdvancementFeatSelect
                  draft={draft}
                  catalog={catalog}
                  index={asiIndex}
                  onChange={(selection) => {
                    setDraft((value) =>
                      value === undefined
                        ? value
                        : {
                            ...value,
                            advancementFeats: value.advancementFeats.map((allocation, index) =>
                              index === asiIndex ? selection : allocation,
                            ),
                          },
                    );
                  }}
                />
              ) : null}

              {newMasteryCount > 0 ? (
                <div className="spell-choice-section">
                  <div className="spell-choice-heading">
                    <div>
                      <span>Weapon Mastery</span>
                      <h2>Choose new mastered weapons</h2>
                    </div>
                    <small>
                      {String(draft.weaponMasteryIds.length - currentMasteries.size)} /{" "}
                      {String(newMasteryCount)} new
                    </small>
                  </div>
                  <div className="mastery-grid">
                    {selectedClass.weaponMasteryIds
                      .filter((id) => !currentMasteries.has(id))
                      .map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={draft.weaponMasteryIds.includes(id) ? "selected" : undefined}
                          disabled={
                            !draft.weaponMasteryIds.includes(id) &&
                            draft.weaponMasteryIds.length >= requiredMasteries
                          }
                          onClick={() => {
                            toggleMastery(id);
                          }}
                        >
                          <i>{draft.weaponMasteryIds.includes(id) ? "✓" : ""}</i>
                          <span>
                            <strong>{catalog.weaponNames[id]}</strong>
                            <small>Available weapon</small>
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}

              {magicInitiateIds.map((featId) => {
                const feat = catalog.feats[featId];
                const definition = feat?.magicInitiate;
                const selection = draft.magicInitiateChoices[featId];
                if (definition === undefined || selection === undefined) return null;
                const original = magicInitiateSelections(character, draft, catalog)[featId];
                const replaced =
                  original === undefined
                    ? 0
                    : original.cantripIds.filter(
                        (spellId) => !selection.cantripIds.includes(spellId),
                      ).length + (original.levelOneSpellId === selection.levelOneSpellId ? 0 : 1);
                return (
                  <div className="spell-choice-section" key={featId}>
                    <div className="spell-choice-heading">
                      <div>
                        <span>Origin feat</span>
                        <h2>{feat?.name ?? featId}</h2>
                      </div>
                      <small>
                        {String(replaced)} / {String(definition.replacementMaximum)} spell replaced
                      </small>
                    </div>
                    <label className="builder-field compact-field">
                      Spellcasting ability
                      <select value={selection.ability} disabled>
                        <option value={selection.ability}>{titleCase(selection.ability)}</option>
                      </select>
                      <small>This choice is fixed when you gain the feat.</small>
                    </label>
                    <div className="spell-choice-heading">
                      <div>
                        <span>Magic Initiate</span>
                        <h2>Cantrips</h2>
                      </div>
                      <small>
                        {String(selection.cantripIds.length)} / {String(definition.cantripMaximum)}
                      </small>
                    </div>
                    <div className="spell-choice-grid">
                      {definition.cantrips.map((spell) => {
                        const selected = selection.cantripIds.includes(spell.id);
                        return (
                          <button
                            key={spell.id}
                            type="button"
                            className={selected ? "selected" : undefined}
                            disabled={
                              (!selected &&
                                selection.cantripIds.length >= definition.cantripMaximum) ||
                              (selected &&
                                original?.cantripIds.includes(spell.id) === true &&
                                replaced >= definition.replacementMaximum)
                            }
                            onClick={() => {
                              setDraft((value) =>
                                value === undefined
                                  ? value
                                  : updateMagicInitiateSelection(value, catalog, featId, {
                                      cantripIds: selected
                                        ? selection.cantripIds.filter((id) => id !== spell.id)
                                        : [...selection.cantripIds, spell.id],
                                    }),
                              );
                            }}
                          >
                            <i>{selected ? "✓" : ""}</i>
                            <span>
                              <strong>{spell.name}</strong>
                              <small>{titleCase(spell.school)} cantrip</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <label className="builder-field compact-field">
                      Level 1 spell
                      <select
                        value={selection.levelOneSpellId}
                        onChange={(event) => {
                          setDraft((value) =>
                            value === undefined
                              ? value
                              : updateMagicInitiateSelection(value, catalog, featId, {
                                  levelOneSpellId: event.target.value,
                                }),
                          );
                        }}
                      >
                        {definition.levelOneSpells.map((spell) => (
                          <option
                            key={spell.id}
                            value={spell.id}
                            disabled={
                              selection.levelOneSpellId === original?.levelOneSpellId &&
                              spell.id !== original.levelOneSpellId &&
                              replaced >= definition.replacementMaximum
                            }
                          >
                            {spell.name} · {titleCase(spell.school)}
                          </option>
                        ))}
                      </select>
                      <small>Replace at most one feat spell each level.</small>
                    </label>
                  </div>
                );
              })}

              {spellcasting === undefined || spellCounts === undefined ? null : (
                <>
                  {[
                    {
                      label: "Cantrips",
                      count: spellCounts.cantrips,
                      replacementMaximum: cantripReplacementMaximum,
                      spells: spellcasting.spells.filter((spell) => spell.level === 0),
                    },
                    ...(spellcasting.preparation === "spellbook"
                      ? [
                          {
                            label: "New spellbook spells",
                            count: spellCounts.learnedLeveledSpells,
                            replacementMaximum: 0,
                            spells: spellcasting.spells.filter(
                              (spell) =>
                                spell.level > 0 && spell.level <= spellCounts.maximumSpellLevel,
                            ),
                          },
                        ]
                      : []),
                  ].map((group) => {
                    const groupIds = group.spells.map((spell) => spell.id);
                    const selectedCount = draft.learnedSpellIds.filter((id) =>
                      groupIds.includes(id),
                    ).length;
                    const existingCount = character.build.learnedSpellIds.filter((id) =>
                      groupIds.includes(id),
                    ).length;
                    if (group.count <= existingCount && group.replacementMaximum === 0) return null;
                    return (
                      <div className="spell-choice-section" key={group.label}>
                        <div className="spell-choice-heading">
                          <div>
                            <span>{selectedClass.name} spellcasting</span>
                            <h2>{group.label}</h2>
                          </div>
                          <small>
                            {String(selectedCount - existingCount)} /{" "}
                            {String(group.count - existingCount)} new
                            {group.replacementMaximum > 0
                              ? ` · ${String(removedCantripCount)} / ${String(group.replacementMaximum)} replaced`
                              : ""}
                          </small>
                        </div>
                        <div className="spell-choice-grid">
                          {group.spells.map((spell) => {
                            const selected = draft.learnedSpellIds.includes(spell.id);
                            const current = currentLearned.has(spell.id);
                            const locked = current && group.replacementMaximum === 0;
                            const replacementBlocked =
                              current &&
                              selected &&
                              removedCantripCount >= group.replacementMaximum;
                            return (
                              <button
                                key={spell.id}
                                type="button"
                                className={selected ? "selected" : undefined}
                                disabled={
                                  featureSpellbookChoices(draft, catalog).includes(spell.id) ||
                                  locked ||
                                  (group.replacementMaximum > 0 && replacementBlocked) ||
                                  (!selected && selectedCount >= group.count)
                                }
                                onClick={() => {
                                  toggleLearnedSpell(
                                    spell.id,
                                    groupIds,
                                    group.count,
                                    group.replacementMaximum,
                                  );
                                }}
                              >
                                <i>{selected ? "✓" : ""}</i>
                                <span>
                                  <strong>{spell.name}</strong>
                                  <small>
                                    {current
                                      ? group.replacementMaximum > 0
                                        ? selected
                                          ? "Currently known · may replace"
                                          : "Replacing this cantrip"
                                        : "Already known"
                                      : spell.level === 0
                                        ? "New cantrip"
                                        : `Level ${String(spell.level)} · ${titleCase(spell.school)}`}
                                  </small>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {spellCounts.preparedSpells > currentPrepared.size ||
                  preparedReplacementMaximum > 0 ? (
                    <div className="spell-choice-section prepared-choice-section">
                      <div className="spell-choice-heading">
                        <div>
                          <span>
                            {preparedReplacementMaximum > 0 ? "Level-up choices" : "Daily loadout"}
                          </span>
                          <h2>Prepared spells</h2>
                        </div>
                        <small>
                          {String(draft.preparedSpellIds.length - currentPrepared.size)} /{" "}
                          {String(spellCounts.preparedSpells - currentPrepared.size)} new
                          {preparedReplacementMaximum > 0
                            ? ` · ${String(removedPreparedCount)} / ${String(preparedReplacementMaximum)} replaced`
                            : ""}
                        </small>
                      </div>
                      <div className="spell-choice-grid">
                        {spellcasting.spells
                          .filter(
                            (spell) =>
                              spell.level > 0 &&
                              spell.level <= spellCounts.maximumSpellLevel &&
                              !spellCounts.alwaysPreparedSpellIds.includes(spell.id) &&
                              (spellcasting.preparation === "full-list" ||
                                draft.learnedSpellIds.includes(spell.id)),
                          )
                          .map((spell) => {
                            const selected = draft.preparedSpellIds.includes(spell.id);
                            const current = currentPrepared.has(spell.id);
                            const locked = current && preparedReplacementMaximum === 0;
                            return (
                              <button
                                key={spell.id}
                                type="button"
                                className={selected ? "selected" : undefined}
                                disabled={
                                  locked ||
                                  (current &&
                                    selected &&
                                    removedPreparedCount >= preparedReplacementMaximum) ||
                                  (!selected &&
                                    draft.preparedSpellIds.length >= spellCounts.preparedSpells)
                                }
                                onClick={() => {
                                  togglePreparedSpell(spell.id);
                                }}
                              >
                                <i>{selected ? "✓" : ""}</i>
                                <span>
                                  <strong>{spell.name}</strong>
                                  <small>
                                    {current
                                      ? selected
                                        ? "Currently prepared · may replace"
                                        : "Replacing this spell"
                                      : `Level ${String(spell.level)}`}
                                  </small>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="builder-section review-section">
              <div className="review-identity">
                <span>Ready to advance</span>
                <h2>{character.name}</h2>
                <p>
                  Level {String(currentLevel)} {selectedClass.name} → Level {String(targetLevel)}{" "}
                  {introducesSubclass ? selectedClass.subclassName : selectedClass.name}
                </p>
              </div>
              {preview.evaluation === undefined ? null : (
                <div className="review-metrics">
                  <div>
                    <span>Maximum HP</span>
                    <strong>{String(numericFact(preview.evaluation, "hitPoints.maximum"))}</strong>
                  </div>
                  <div>
                    <span>Current HP</span>
                    <strong>{String(character.state.currentHitPoints)}</strong>
                  </div>
                  <div>
                    <span>Proficiency</span>
                    <strong>{signed(numericFact(preview.evaluation, "proficiencyBonus"))}</strong>
                  </div>
                  <div>
                    <span>Revision</span>
                    <strong>{String(character.metadata.revision + 1)}</strong>
                  </div>
                </div>
              )}
              <div className="review-columns">
                <article>
                  <span>Advancement</span>
                  <p>One class level using the fixed Hit Point value</p>
                  {introducesSubclass ? <small>{selectedClass.subclassName} added</small> : null}
                  {introducesAsi ? (
                    <small>
                      {catalog.feats[draft.advancementFeats[asiIndex]?.featId ?? ""]?.name}:{" "}
                      {draft.advancementFeats[asiIndex] === undefined
                        ? ""
                        : featIncreaseLabel(draft.advancementFeats[asiIndex])}
                    </small>
                  ) : null}
                </article>
                <article>
                  <span>Preserved</span>
                  <p>Inventory, currency, equipment, current HP, temporary HP, and conditions</p>
                </article>
                <article>
                  <span>Choices</span>
                  <p>
                    {spellcasting === undefined
                      ? `${String(draft.weaponMasteryIds.length)} Weapon Masteries`
                      : `${String(draft.learnedSpellIds.length)} known spells · ${String(draft.preparedSpellIds.length)} prepared`}
                  </p>
                </article>
              </div>
              {preview.issues.length === 0 ? (
                <p className="builder-success">
                  ✓ The advanced character is valid and ready to save.
                </p>
              ) : (
                <div className="builder-issues">
                  <strong>Resolve these choices</strong>
                  <ul>
                    {preview.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="builder-footer">
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              if (step === 0) onCancel();
              else setStep(0);
            }}
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <span>
            {step === 0
              ? "Only the new class level and its advancement choices will be added."
              : "Saving this advancement can be undone once from the Play tab."}
          </span>
          {step === 0 ? (
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setStep(1);
              }}
            >
              Review level up
            </button>
          ) : (
            <button
              className="button primary"
              type="button"
              disabled={preview.issues.length > 0}
              onClick={applyLevelUp}
            >
              Apply level {String(targetLevel)}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
