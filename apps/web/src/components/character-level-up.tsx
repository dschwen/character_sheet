"use client";

import { useMemo, useState } from "react";

import type { CharacterDocument } from "@dnd/character-model";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { createLevelUpDraft, levelUpCharacter, previewLevelUp } from "../lib/character-level-up";
import {
  characterBuilderCatalog,
  classSkillCount,
  expertiseSkillCandidates,
  masteryCount,
  spellSelectionCounts,
  updateBuilderFeatureChoice,
  type CharacterBuilderDraft,
} from "../lib/character-builder";
import { abilities, numericFact, shortEntityName, signed, titleCase } from "../lib/presentation";

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
  const currentPrepared = new Set(character.loadout.preparedSpellIds);
  const targetFeatureChoices = selectedClass.featureChoices.filter(
    (choice) => choice.level === targetLevel,
  );
  const expertiseChoice = selectedClass.builder.expertiseChoice;
  const eligibleExpertiseSkills = expertiseSkillCandidates(draft, catalog);
  const introducesExpertise = expertiseChoice?.minimumLevel === targetLevel;
  const introducesSubclass = selectedClass.subclassLevel === targetLevel;
  const introducesAsi = targetLevel === 4;
  const hasChoiceSections =
    newClassSkillCount > 0 ||
    newMasteryCount > 0 ||
    targetFeatureChoices.length > 0 ||
    introducesExpertise ||
    introducesAsi ||
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

  function toggleLearnedSpell(spellId: string, groupIds: string[], maximum: number): void {
    setDraft((value) => {
      if (value === undefined) return value;
      const groupSelections = value.learnedSpellIds.filter((id) => groupIds.includes(id));
      const nextGroup = toggleUnlocked(groupSelections, spellId, currentLearned, maximum);
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
    setDraft((value) =>
      value === undefined
        ? value
        : {
            ...value,
            preparedSpellIds: toggleUnlocked(
              value.preparedSpellIds,
              spellId,
              currentPrepared,
              spellCounts.preparedSpells,
            ),
          },
    );
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
                <label className="builder-field compact-field">
                  {shortEntityName(expertiseChoice.sourceId)} Expertise
                  <select
                    value={draft.expertiseSkillId}
                    onChange={(event) => {
                      setDraft((value) =>
                        value === undefined
                          ? value
                          : { ...value, expertiseSkillId: event.target.value },
                      );
                    }}
                  >
                    {eligibleExpertiseSkills.map((id) => (
                      <option key={id} value={id}>
                        {skillName(id)}
                      </option>
                    ))}
                  </select>
                  <small>
                    Choose one eligible existing
                    {expertiseChoice.requireClassProficiency ? " class" : ""} proficiency.
                  </small>
                </label>
              ) : null}

              {targetFeatureChoices.map((choice) => (
                <div className="skill-choice-section" key={choice.id}>
                  <div>
                    <span>{selectedClass.name} feature</span>
                    <h2>{shortEntityName(choice.id)}</h2>
                    <small>
                      {String((draft.featureChoiceSelections[choice.id] ?? []).length)} /{" "}
                      {String(choice.maximum)} selected
                    </small>
                  </div>
                  <div className="builder-choice-grid">
                    {choice.options.map((option) => {
                      const selected = (draft.featureChoiceSelections[choice.id] ?? []).includes(
                        option.id,
                      );
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={selected ? "builder-choice selected" : "builder-choice"}
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
                          <small>{selected ? "Selected" : "Choose option"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {introducesAsi ? (
                <label className="builder-field compact-field">
                  Level 4 Ability Score Improvement
                  <select
                    value={draft.asiAbility}
                    onChange={(event) => {
                      setDraft((value) =>
                        value === undefined
                          ? value
                          : { ...value, asiAbility: event.target.value as typeof value.asiAbility },
                      );
                    }}
                  >
                    {abilities.map((ability) => (
                      <option key={ability} value={ability}>
                        +2 {titleCase(ability)}
                      </option>
                    ))}
                  </select>
                  <small>The resulting score is validated by the rules engine.</small>
                </label>
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

              {spellcasting === undefined || spellCounts === undefined ? null : (
                <>
                  {[
                    {
                      label: "Cantrips",
                      count: spellCounts.cantrips,
                      spells: spellcasting.spells.filter((spell) => spell.level === 0),
                    },
                    ...(spellcasting.preparation === "spellbook"
                      ? [
                          {
                            label: "New spellbook spells",
                            count: spellCounts.learnedLeveledSpells,
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
                    if (group.count <= existingCount) return null;
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
                          </small>
                        </div>
                        <div className="spell-choice-grid">
                          {group.spells.map((spell) => {
                            const selected = draft.learnedSpellIds.includes(spell.id);
                            const locked = currentLearned.has(spell.id);
                            return (
                              <button
                                key={spell.id}
                                type="button"
                                className={selected ? "selected" : undefined}
                                disabled={locked || (!selected && selectedCount >= group.count)}
                                onClick={() => {
                                  toggleLearnedSpell(spell.id, groupIds, group.count);
                                }}
                              >
                                <i>{selected ? "✓" : ""}</i>
                                <span>
                                  <strong>{spell.name}</strong>
                                  <small>
                                    {locked
                                      ? "Already known"
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

                  {spellCounts.preparedSpells > currentPrepared.size ? (
                    <div className="spell-choice-section prepared-choice-section">
                      <div className="spell-choice-heading">
                        <div>
                          <span>Daily loadout</span>
                          <h2>Additional prepared spells</h2>
                        </div>
                        <small>
                          {String(draft.preparedSpellIds.length - currentPrepared.size)} /{" "}
                          {String(spellCounts.preparedSpells - currentPrepared.size)} new
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
                            const locked = currentPrepared.has(spell.id);
                            return (
                              <button
                                key={spell.id}
                                type="button"
                                className={selected ? "selected" : undefined}
                                disabled={
                                  locked ||
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
                                    {locked ? "Already prepared" : `Level ${String(spell.level)}`}
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
                  {introducesAsi ? <small>+2 {titleCase(draft.asiAbility)}</small> : null}
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
