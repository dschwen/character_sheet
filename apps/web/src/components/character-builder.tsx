"use client";

import { useMemo, useState } from "react";

import type { CharacterDocument } from "@dnd/character-model";
import type { StartingEquipmentItem } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import {
  buildCharacter,
  builderClassIds,
  builderOriginChoiceDefinitions,
  characterBuilderCatalog,
  classSkillCount,
  defaultBuilderDraft,
  fighterId,
  masteryCount,
  previewBuilderCharacter,
  skillIds,
  spellSelectionCounts,
  updateBuilderFeatureChoice,
  updateBuilderLevel,
  type BuilderClassId,
  type CharacterBuilderDraft,
} from "../lib/character-builder";
import {
  abilities,
  type Ability,
  numericFact,
  shortEntityName,
  signed,
  titleCase,
} from "../lib/presentation";

interface CharacterBuilderProps {
  rulesPackage: LoadedRulesPackage;
  onCancel: () => void;
  onComplete: (character: CharacterDocument) => void;
}

function skillName(id: string): string {
  return titleCase(id.replace("srd521.skill.", ""));
}

function toggleList(values: string[], value: string, maximum: number): string[] {
  if (values.includes(value)) return values.filter((candidate) => candidate !== value);
  return values.length >= maximum ? values : [...values, value];
}

export function CharacterBuilder({
  rulesPackage,
  onCancel,
  onComplete,
}: Readonly<CharacterBuilderProps>) {
  const [step, setStep] = useState(0);
  const catalog = useMemo(() => characterBuilderCatalog(rulesPackage), [rulesPackage]);
  const [draft, setDraft] = useState<CharacterBuilderDraft>(() =>
    defaultBuilderDraft(fighterId, catalog),
  );
  const selectedClass = catalog.classes[draft.classId];
  const selectedSpecies = catalog.species[draft.speciesId];
  const selectedBackground = catalog.backgrounds[draft.backgroundId];
  const selectedOriginFeat = catalog.feats[draft.originFeatId];
  if (
    selectedSpecies === undefined ||
    selectedBackground === undefined ||
    selectedOriginFeat === undefined
  ) {
    throw new Error("The selected builder origin is unavailable.");
  }
  const originChoices = builderOriginChoiceDefinitions(draft, catalog);
  const speciesChoice = originChoices.find((choice) => choice.selection === "speciesId");
  const backgroundChoice = originChoices.find((choice) => choice.selection === "backgroundId");
  const sizeChoice = originChoices.find((choice) => choice.selection === "speciesSize");
  const abilityIncreaseChoice = originChoices.find(
    (choice) => choice.selection === "backgroundAbilityScoreIncreases",
  );
  const originFeatChoice = originChoices.find((choice) => choice.selection === "originFeatId");
  const spellcasting = selectedClass.spellcasting;
  const spellCounts = spellSelectionCounts(draft, catalog);
  const activeFeatureChoices = selectedClass.featureChoices.filter(
    (choice) => choice.level <= draft.level,
  );
  const selectedEquipmentOption =
    selectedClass.startingEquipment.options.find(
      (option) => option.id === draft.startingEquipmentOptionId,
    ) ?? selectedClass.startingEquipment.options[0];
  if (selectedEquipmentOption === undefined) {
    throw new Error(`No starting-equipment package is available for ${selectedClass.name}.`);
  }
  const equipmentNames = useMemo(
    () =>
      Object.fromEntries(
        rulesPackage.entities
          .filter((entity) => entity.kind.startsWith("equipment-"))
          .map((entity) => [
            entity.id,
            entity.name.en ?? Object.values(entity.name)[0] ?? shortEntityName(entity.id),
          ]),
      ),
    [rulesPackage],
  );
  const steps = useMemo(
    () =>
      [
        "Identity",
        "Abilities",
        "Proficiencies",
        spellcasting === undefined ? "Equipment" : "Spells & Equipment",
        "Review",
      ] as const,
    [spellcasting],
  );
  const previewOptions = useMemo(
    () => ({ id: "builder-preview-character", now: new Date("2026-08-02T00:00:00.000Z") }),
    [],
  );
  const preview = useMemo(
    () => previewBuilderCharacter(draft, rulesPackage, previewOptions),
    [draft, previewOptions, rulesPackage],
  );
  const requiredMasteries = masteryCount(draft, catalog);
  const requiredClassSkills = classSkillCount(draft, catalog);
  const expertiseChoice = selectedClass.builder.expertiseChoice;
  const supportedLevels = Array.from(
    {
      length:
        selectedClass.builder.supportedLevelMaximum -
        selectedClass.builder.supportedLevelMinimum +
        1,
    },
    (_, index) => selectedClass.builder.supportedLevelMinimum + index,
  );
  const allSelectedSkills = new Set([
    ...selectedBackground.skillIds,
    ...draft.classSkillIds,
    ...draft.speciesSkillIds,
    ...draft.originFeatSkillIds,
  ]);

  function updateLevel(level: number): void {
    setDraft((value) => updateBuilderLevel(value, catalog, level));
  }

  function selectClass(classId: BuilderClassId): void {
    setDraft((value) => defaultBuilderDraft(classId, catalog, value.level, value.name));
  }

  function updateAbility(ability: Ability, score: number): void {
    setDraft((value) => ({
      ...value,
      abilityScores: { ...value.abilityScores, [ability]: score },
    }));
  }

  function skillDisabled(id: string, ownSelections: string[]): boolean {
    return allSelectedSkills.has(id) && !ownSelections.includes(id);
  }

  function toggleLearnedSpell(id: string, candidates: string[], maximum: number): void {
    setDraft((value) => {
      const categorySelections = value.learnedSpellIds.filter((spellId) =>
        candidates.includes(spellId),
      );
      const nextCategory = toggleList(categorySelections, id, maximum);
      const learnedSpellIds = [
        ...value.learnedSpellIds.filter((spellId) => !candidates.includes(spellId)),
        ...nextCategory,
      ];
      return {
        ...value,
        learnedSpellIds,
        preparedSpellIds: value.preparedSpellIds.filter((spellId) =>
          learnedSpellIds.includes(spellId),
        ),
      };
    });
  }

  function togglePreparedSpell(id: string): void {
    setDraft((value) => ({
      ...value,
      preparedSpellIds: toggleList(value.preparedSpellIds, id, spellCounts?.preparedSpells ?? 0),
    }));
  }

  function createCharacter(): void {
    try {
      onComplete(
        buildCharacter(draft, rulesPackage, {
          id: `character-${crypto.randomUUID()}`,
          now: new Date(),
        }),
      );
    } catch {
      setStep(4);
    }
  }

  function equipmentItemLabel(item: StartingEquipmentItem): string {
    const name =
      item.kind === "text"
        ? item.name
        : (item.label ?? equipmentNames[item.entityId] ?? shortEntityName(item.entityId));
    return item.quantity === 1 ? name : `${String(item.quantity)} ${name}`;
  }

  const equipmentChoices = (
    <div className="equipment-choice-section">
      <div className="builder-callout">
        <strong>Choose a source-defined starting package</strong>
        <p>
          Items backed by the equipment catalog become inventory entries. The package selection also
          preserves included gold and named adventuring gear.
        </p>
      </div>
      <div className="builder-choice-grid starting-equipment-grid">
        {selectedClass.startingEquipment.options.map((option) => {
          const selected = draft.startingEquipmentOptionId === option.id;
          const itemSummary = option.items.map(equipmentItemLabel).join(", ");
          return (
            <button
              key={option.id}
              type="button"
              className={selected ? "builder-choice selected" : "builder-choice"}
              aria-pressed={selected}
              onClick={() => {
                setDraft((value) => ({ ...value, startingEquipmentOptionId: option.id }));
              }}
            >
              <span>Starting equipment</span>
              <h2>{option.label}</h2>
              <p>
                {itemSummary.length > 0 ? `${itemSummary} · ` : ""}
                {String(option.currencyGp)} GP
              </p>
              <small>{selected ? "Selected" : "Choose package"}</small>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="builder-shell" role="dialog" aria-modal="true" aria-label="Create a character">
      <header className="builder-header">
        <div>
          <span className="builder-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>Create an adventurer</strong>
            <small>
              {builderClassIds.map((classId) => catalog.classes[classId].name).join(" & ")} · levels
              1–5
            </small>
          </span>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close character builder">
          ×
        </button>
      </header>

      <div className="builder-layout">
        <aside className="builder-steps" aria-label="Builder progress">
          <p>Character creation</p>
          <ol>
            {steps.map((label, index) => (
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
                    <small>
                      {index === 0
                        ? "Who are you?"
                        : index === 1
                          ? "Assign scores"
                          : index === 2
                            ? "Choose skills"
                            : index === 3
                              ? spellcasting === undefined
                                ? "Ready your gear"
                                : "Choose spells and gear"
                              : "Confirm choices"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="builder-package">
            <span>Rules package</span>
            <strong>SRD 5.2.1</strong>
            <small>{rulesPackage.manifest.version}</small>
          </div>
        </aside>

        <section className="builder-content">
          <div className="builder-content-heading">
            <span>
              Step {String(step + 1)} of {String(steps.length)}
            </span>
            <h1>{steps[step]}</h1>
          </div>

          {step === 0 ? (
            <div className="builder-section">
              <label className="builder-field">
                Character name
                <input
                  autoFocus
                  type="text"
                  value={draft.name}
                  placeholder="Enter a name"
                  maxLength={80}
                  onChange={(event) => {
                    setDraft((value) => ({ ...value, name: event.target.value }));
                  }}
                />
              </label>
              <div className="builder-class-grid" aria-label="Choose a starting class">
                {builderClassIds.map((classId) => {
                  const option = catalog.classes[classId];
                  return (
                    <button
                      key={classId}
                      type="button"
                      className={
                        draft.classId === classId ? "builder-choice selected" : "builder-choice"
                      }
                      aria-pressed={draft.classId === classId}
                      onClick={() => {
                        selectClass(classId);
                      }}
                    >
                      <span>Starting class</span>
                      <h2>{option.name}</h2>
                      <p>{option.description}</p>
                      <small>{draft.classId === classId ? "Selected" : "Choose class"}</small>
                    </button>
                  );
                })}
              </div>
              <div className="builder-choice-grid origin-choice-grid">
                {speciesChoice?.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      draft.speciesId === option.id ? "builder-choice selected" : "builder-choice"
                    }
                    onClick={() => {
                      const species = catalog.species[option.id];
                      if (species === undefined) return;
                      setDraft((value) => ({
                        ...value,
                        speciesId: species.id,
                        speciesSize: species.sizeOptions.includes(value.speciesSize)
                          ? value.speciesSize
                          : (species.sizeOptions[0] ?? "medium"),
                        speciesSkillIds: value.speciesSkillIds.slice(0, species.skillMaximum),
                      }));
                    }}
                  >
                    <span>Species</span>
                    <h2>{option.label}</h2>
                    <p>{option.description}</p>
                    <small>{draft.speciesId === option.id ? "Selected" : "Choose species"}</small>
                  </button>
                ))}
                {backgroundChoice?.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      draft.backgroundId === option.id
                        ? "builder-choice selected"
                        : "builder-choice"
                    }
                    onClick={() => {
                      const background = catalog.backgrounds[option.id];
                      const allocation = background?.abilityIncreaseOptions[0]?.abilityIncreases;
                      if (background === undefined || allocation === undefined) return;
                      setDraft((value) => ({
                        ...value,
                        backgroundId: background.id,
                        backgroundAbilityScoreIncreases: { ...allocation },
                      }));
                    }}
                  >
                    <span>Background</span>
                    <h2>{option.label}</h2>
                    <p>{option.description}</p>
                    <small>
                      {draft.backgroundId === option.id ? "Selected" : "Choose background"}
                    </small>
                  </button>
                ))}
              </div>
              <div className="builder-choice-grid origin-detail-grid">
                <label className="builder-field compact-field">
                  {sizeChoice?.prompt ?? "Species size"}
                  <select
                    value={draft.speciesSize}
                    onChange={(event) => {
                      setDraft((value) => ({
                        ...value,
                        speciesSize: event.target.value as typeof value.speciesSize,
                      }));
                    }}
                  >
                    {sizeChoice?.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small>Walking speed {String(selectedSpecies.walkingSpeed)} feet.</small>
                </label>
              </div>
              <div className="builder-choice-grid origin-feat-grid">
                {originFeatChoice?.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      draft.originFeatId === option.id
                        ? "builder-choice selected"
                        : "builder-choice"
                    }
                    disabled={option.disabledReason !== undefined}
                    onClick={() => {
                      const feat = catalog.feats[option.id];
                      if (feat === undefined) return;
                      const unavailable = new Set([
                        ...selectedBackground.skillIds,
                        ...draft.classSkillIds,
                        ...draft.speciesSkillIds,
                      ]);
                      const candidates = skillIds
                        .map((skill) => `srd521.skill.${skill}`)
                        .filter((id) => !unavailable.has(id));
                      setDraft((value) => ({
                        ...value,
                        originFeatId: feat.id,
                        originFeatSkillIds: candidates.slice(0, feat.skillMaximum),
                      }));
                    }}
                  >
                    <span>Origin feat</span>
                    <h2>{option.label}</h2>
                    <p>{option.description}</p>
                    <small>
                      {option.disabledReason ??
                        (draft.originFeatId === option.id ? "Selected" : "Choose feat")}
                    </small>
                  </button>
                ))}
              </div>
              <label className="builder-field compact-field">
                Starting level
                <select
                  value={draft.level}
                  onChange={(event) => {
                    updateLevel(Number(event.target.value));
                  }}
                >
                  {supportedLevels.map((level) => (
                    <option key={level} value={level}>
                      Level {String(level)}
                      {selectedClass.subclassLevel !== undefined &&
                      selectedClass.subclassName !== undefined &&
                      level >= selectedClass.subclassLevel
                        ? ` · ${selectedClass.subclassName}`
                        : ""}
                    </option>
                  ))}
                </select>
                {selectedClass.subclassLevel === undefined ||
                selectedClass.subclassName === undefined ? null : (
                  <small>
                    Level {String(selectedClass.subclassLevel)} introduces the reviewed{" "}
                    {selectedClass.subclassName} subclass. Level 4 applies a +2 Ability Score
                    Improvement.
                  </small>
                )}
              </label>
              {activeFeatureChoices.map((choice) => (
                <div className="skill-choice-section" key={choice.id}>
                  <div>
                    <span>
                      {selectedClass.name} · Level {String(choice.level)}
                    </span>
                    <h2>Choose {shortEntityName(choice.id)}</h2>
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
                              updateBuilderFeatureChoice(value, catalog, choice.id, option.id),
                            );
                          }}
                        >
                          <span>{shortEntityName(choice.id)}</span>
                          <h2>{option.name}</h2>
                          <p>{option.description}</p>
                          <small>{selected ? "Selected" : "Choose option"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="builder-section">
              <div className="builder-callout">
                <strong>Assign base scores</strong>
                <p>
                  Enter scores before the {selectedBackground.name} background applies the selected
                  ability increases.
                </p>
              </div>
              <div className="skill-choice-section ability-allocation-choice">
                <div>
                  <span>{selectedBackground.name}</span>
                  <h2>{abilityIncreaseChoice?.prompt ?? "Ability increases"}</h2>
                  <small>Choose one package from the background’s allowed patterns</small>
                </div>
                <div className="choice-pills">
                  {abilityIncreaseChoice?.options.map((option) => {
                    const selected = abilities.every(
                      (ability) =>
                        (option.abilityIncreases?.[ability] ?? 0) ===
                        (draft.backgroundAbilityScoreIncreases[ability] ?? 0),
                    );
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={selected ? "selected" : undefined}
                        onClick={() => {
                          if (option.abilityIncreases === undefined) return;
                          setDraft((value) => ({
                            ...value,
                            backgroundAbilityScoreIncreases: {
                              ...option.abilityIncreases,
                            },
                          }));
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="ability-editor">
                {abilities.map((ability) => {
                  const backgroundIncrease = draft.backgroundAbilityScoreIncreases[ability] ?? 0;
                  const featIncrease = draft.level >= 4 && draft.asiAbility === ability ? 2 : 0;
                  const finalScore =
                    draft.abilityScores[ability] + backgroundIncrease + featIncrease;
                  return (
                    <label key={ability}>
                      <span>{ability.slice(0, 3).toUpperCase()}</span>
                      <strong>{titleCase(ability)}</strong>
                      <input
                        type="number"
                        min="3"
                        max="18"
                        step="1"
                        value={draft.abilityScores[ability]}
                        onChange={(event) => {
                          updateAbility(ability, Number(event.target.value));
                        }}
                      />
                      <small>
                        Final {String(finalScore)} · {signed(Math.floor((finalScore - 10) / 2))}
                      </small>
                    </label>
                  );
                })}
              </div>
              {draft.level >= 4 ? (
                <label className="builder-field compact-field">
                  Level 4 Ability Score Improvement
                  <select
                    value={draft.asiAbility}
                    onChange={(event) => {
                      setDraft((value) => ({
                        ...value,
                        asiAbility: event.target.value as Ability,
                      }));
                    }}
                  >
                    {abilities.map((ability) => (
                      <option key={ability} value={ability}>
                        +2 {titleCase(ability)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="builder-section">
              <div className="builder-callout">
                <strong>No duplicates</strong>
                <p>
                  {selectedBackground.name} already grants{" "}
                  {selectedBackground.skillIds.map(skillName).join(" and ")}. Choose unique skills
                  for every other source.
                </p>
              </div>
              <div className="skill-choice-section">
                <div>
                  <span>{selectedClass.name}</span>
                  <h2>
                    Choose {String(requiredClassSkills)} class skill
                    {requiredClassSkills === 1 ? "" : "s"}
                  </h2>
                  <small>
                    {String(draft.classSkillIds.length)} / {String(requiredClassSkills)} selected
                  </small>
                </div>
                <div className="choice-pills">
                  {selectedClass.skillIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      disabled={skillDisabled(id, draft.classSkillIds)}
                      className={draft.classSkillIds.includes(id) ? "selected" : undefined}
                      onClick={() => {
                        setDraft((value) => ({
                          ...value,
                          classSkillIds: toggleList(value.classSkillIds, id, requiredClassSkills),
                        }));
                      }}
                    >
                      {skillName(id)}
                    </button>
                  ))}
                </div>
              </div>
              {expertiseChoice !== undefined && draft.level >= expertiseChoice.minimumLevel ? (
                <div className="skill-choice-section">
                  <div>
                    <span>
                      {selectedClass.name} · {shortEntityName(expertiseChoice.sourceId)}
                    </span>
                    <h2>Choose 1 Expertise</h2>
                    <small>Must be one of your eligible class skills</small>
                  </div>
                  <div className="choice-pills">
                    {draft.classSkillIds
                      .filter((id) => expertiseChoice.eligibleSkillIds.includes(id))
                      .map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={draft.expertiseSkillId === id ? "selected" : undefined}
                          onClick={() => {
                            setDraft((value) => ({ ...value, expertiseSkillId: id }));
                          }}
                        >
                          {skillName(id)}
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}
              <div className="skill-choice-section">
                <div>
                  <span>{selectedSpecies.name}</span>
                  <h2>
                    Choose {String(selectedSpecies.skillMaximum)} skill
                    {selectedSpecies.skillMaximum === 1 ? "" : "s"}
                  </h2>
                  <small>
                    {String(draft.speciesSkillIds.length)} / {String(selectedSpecies.skillMaximum)}{" "}
                    selected
                  </small>
                </div>
                <div className="choice-pills">
                  {skillIds.map((skill) => {
                    const id = `srd521.skill.${skill}`;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={skillDisabled(id, draft.speciesSkillIds)}
                        className={draft.speciesSkillIds.includes(id) ? "selected" : undefined}
                        onClick={() => {
                          setDraft((value) => ({
                            ...value,
                            speciesSkillIds: toggleList(
                              value.speciesSkillIds,
                              id,
                              selectedSpecies.skillMaximum,
                            ),
                          }));
                        }}
                      >
                        {skillName(id)}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedOriginFeat.skillMaximum === 0 ? null : (
                <div className="skill-choice-section">
                  <div>
                    <span>{selectedOriginFeat.name} feat</span>
                    <h2>
                      Choose {String(selectedOriginFeat.skillMaximum)} skill
                      {selectedOriginFeat.skillMaximum === 1 ? "" : "s"}
                    </h2>
                    <small>
                      {String(draft.originFeatSkillIds.length)} /{" "}
                      {String(selectedOriginFeat.skillMaximum)} selected
                    </small>
                  </div>
                  <div className="choice-pills">
                    {skillIds.map((skill) => {
                      const id = `srd521.skill.${skill}`;
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={skillDisabled(id, draft.originFeatSkillIds)}
                          className={draft.originFeatSkillIds.includes(id) ? "selected" : undefined}
                          onClick={() => {
                            setDraft((value) => ({
                              ...value,
                              originFeatSkillIds: toggleList(
                                value.originFeatSkillIds,
                                id,
                                selectedOriginFeat.skillMaximum,
                              ),
                            }));
                          }}
                        >
                          {skillName(id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {step === 3 && spellcasting === undefined ? (
            <div className="builder-section">
              {equipmentChoices}
              <div className="mastery-heading">
                <div>
                  <span>Weapon Mastery</span>
                  <h2>Choose {String(requiredMasteries)} weapons</h2>
                </div>
                <small>
                  {String(draft.weaponMasteryIds.length)} / {String(requiredMasteries)} selected
                </small>
              </div>
              <div className="mastery-grid">
                {selectedClass.weaponMasteryIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={draft.weaponMasteryIds.includes(id) ? "selected" : undefined}
                    onClick={() => {
                      setDraft((value) => ({
                        ...value,
                        weaponMasteryIds: toggleList(value.weaponMasteryIds, id, requiredMasteries),
                      }));
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

          {step === 3 && spellcasting !== undefined && spellCounts !== undefined ? (
            <div className="builder-section">
              {equipmentChoices}
              <div className="builder-callout">
                <strong>
                  {spellcasting.preparation === "spellbook"
                    ? "Build your spellbook"
                    : `Choose your ${selectedClass.name} spells`}
                </strong>
                <p>
                  Choose spells from the reviewed SRD set available to a level {String(draft.level)}
                  {` ${selectedClass.name}`}, then decide which leveled spells are prepared.
                </p>
              </div>
              {[
                {
                  label: "Cantrips",
                  count: spellCounts.cantrips,
                  spells: spellcasting.spells.filter((spell) => spell.level === 0),
                },
                ...(spellcasting.preparation === "spellbook"
                  ? [
                      {
                        label: "Spellbook",
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
                return (
                  <div key={group.label} className="spell-choice-section">
                    <div className="spell-choice-heading">
                      <div>
                        <span>{selectedClass.name} spellcasting</span>
                        <h2>{group.label}</h2>
                      </div>
                      <small>
                        {String(selectedCount)} / {String(group.count)} selected
                      </small>
                    </div>
                    <div className="spell-choice-grid">
                      {group.spells.map((spell) => {
                        const selected = draft.learnedSpellIds.includes(spell.id);
                        return (
                          <button
                            key={spell.id}
                            type="button"
                            className={selected ? "selected" : undefined}
                            disabled={!selected && selectedCount >= group.count}
                            onClick={() => {
                              toggleLearnedSpell(spell.id, groupIds, group.count);
                            }}
                          >
                            <i>{selected ? "✓" : ""}</i>
                            <span>
                              <strong>{spell.name}</strong>
                              <small>
                                {spell.level === 0 ? "Cantrip" : `Level ${String(spell.level)}`} ·{" "}
                                {titleCase(spell.school)}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="spell-choice-section prepared-choice-section">
                <div className="spell-choice-heading">
                  <div>
                    <span>Daily loadout</span>
                    <h2>Prepared spells</h2>
                  </div>
                  <small>
                    {String(draft.preparedSpellIds.length)} / {String(spellCounts.preparedSpells)}{" "}
                    prepared
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
                      return (
                        <button
                          key={spell.id}
                          type="button"
                          className={selected ? "selected" : undefined}
                          disabled={
                            !selected && draft.preparedSpellIds.length >= spellCounts.preparedSpells
                          }
                          onClick={() => {
                            togglePreparedSpell(spell.id);
                          }}
                        >
                          <i>{selected ? "✓" : ""}</i>
                          <span>
                            <strong>{spell.name}</strong>
                            <small>Level {String(spell.level)}</small>
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="builder-section review-section">
              <div className="review-identity">
                <span>Ready to adventure</span>
                <h2>{draft.name.trim() || `Unnamed ${selectedClass.name}`}</h2>
                <p>
                  Level {String(draft.level)}{" "}
                  {selectedClass.subclassLevel !== undefined &&
                  selectedClass.subclassName !== undefined &&
                  draft.level >= selectedClass.subclassLevel
                    ? `${selectedClass.subclassName} `
                    : ""}
                  {selectedClass.name} · {selectedSpecies.name} ({titleCase(draft.speciesSize)}) ·{" "}
                  {selectedBackground.name}
                </p>
              </div>
              {preview.evaluation === undefined ? null : (
                <div className="review-metrics">
                  <div>
                    <span>Hit Points</span>
                    <strong>{String(numericFact(preview.evaluation, "hitPoints.maximum"))}</strong>
                  </div>
                  <div>
                    <span>Armor Class</span>
                    <strong>{String(numericFact(preview.evaluation, "armorClass"))}</strong>
                  </div>
                  <div>
                    <span>Speed</span>
                    <strong>
                      {String(numericFact(preview.evaluation, "speed.walking"))}
                      <small> ft.</small>
                    </strong>
                  </div>
                  <div>
                    <span>Proficiency</span>
                    <strong>{signed(numericFact(preview.evaluation, "proficiencyBonus"))}</strong>
                  </div>
                </div>
              )}
              <div className="review-columns">
                <article>
                  <span>Abilities</span>
                  {abilities.map((ability) => {
                    const evaluatedScore = preview.evaluation?.facts[`ability.${ability}.score`];
                    return (
                      <p key={ability}>
                        <strong>{ability.slice(0, 3).toUpperCase()}</strong>
                        <b>
                          {String(
                            typeof evaluatedScore === "number"
                              ? evaluatedScore
                              : draft.abilityScores[ability],
                          )}
                        </b>
                      </p>
                    );
                  })}
                </article>
                <article>
                  <span>Proficiencies</span>
                  <p>
                    {[
                      ...draft.classSkillIds,
                      ...draft.speciesSkillIds,
                      ...draft.originFeatSkillIds,
                      ...selectedBackground.skillIds,
                    ]
                      .map(skillName)
                      .sort()
                      .join(", ")}
                  </p>
                  {expertiseChoice !== undefined && draft.level >= expertiseChoice.minimumLevel ? (
                    <small>
                      {shortEntityName(expertiseChoice.sourceId)} Expertise:{" "}
                      {skillName(draft.expertiseSkillId)}
                    </small>
                  ) : null}
                </article>
                {activeFeatureChoices.length === 0 ? null : (
                  <article>
                    <span>Class Choices</span>
                    {activeFeatureChoices.map((choice) => (
                      <p key={choice.id}>
                        <strong>{shortEntityName(choice.id)}</strong>{" "}
                        {(draft.featureChoiceSelections[choice.id] ?? [])
                          .map(
                            (id) =>
                              choice.options.find((option) => option.id === id)?.name ??
                              shortEntityName(id),
                          )
                          .join(", ")}
                      </p>
                    ))}
                  </article>
                )}
                <article>
                  <span>Starting Equipment</span>
                  <p>
                    {selectedEquipmentOption.label}:{" "}
                    {selectedEquipmentOption.items.map(equipmentItemLabel).join(", ") || "No items"}
                  </p>
                  <small>{String(selectedEquipmentOption.currencyGp)} GP included</small>
                </article>
                {spellcasting === undefined ? (
                  <article>
                    <span>Weapon Masteries</span>
                    <p>
                      {draft.weaponMasteryIds
                        .map((id) => catalog.weaponNames[id] ?? shortEntityName(id))
                        .join(", ")}
                    </p>
                  </article>
                ) : (
                  <article>
                    <span>Spellcasting</span>
                    <p>
                      {spellcasting.preparation === "spellbook"
                        ? `${String(draft.learnedSpellIds.length)} spells in spellbook · `
                        : `${String(spellCounts?.cantrips ?? 0)} cantrips · `}
                      {String(draft.preparedSpellIds.length)} prepared
                    </p>
                    <small>
                      {draft.preparedSpellIds
                        .map(
                          (id) =>
                            spellcasting.spells.find((spell) => spell.id === id)?.name ??
                            shortEntityName(id),
                        )
                        .join(", ")}
                    </small>
                  </article>
                )}
              </div>
              {preview.issues.length === 0 ? (
                <p className="builder-success">
                  ✓ Every supported choice is complete and the rules engine reports no errors.
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
          ) : null}
        </section>

        <footer className="builder-footer">
          <button
            className="button secondary"
            type="button"
            disabled={step === 0}
            onClick={() => {
              setStep((value) => Math.max(0, value - 1));
            }}
          >
            Back
          </button>
          <span>
            {step < 4
              ? "Changes are previewed locally and are not saved until creation."
              : "The new character will open in the character sheet."}
          </span>
          {step < 4 ? (
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setStep((value) => Math.min(4, value + 1));
              }}
            >
              Continue
            </button>
          ) : (
            <button
              className="button primary create-button"
              type="button"
              disabled={preview.issues.length > 0}
              onClick={createCharacter}
            >
              Create character
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
