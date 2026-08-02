"use client";

import { useMemo, useState } from "react";

import type { CharacterDocument } from "@dnd/character-model";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import {
  buildFighterCharacter,
  defaultFighterDraft,
  fighterBuilderCatalog,
  masteryCount,
  previewFighterCharacter,
  skillIds,
  type FighterBuilderDraft,
} from "../lib/character-builder";
import {
  abilities,
  type Ability,
  numericFact,
  shortEntityName,
  signed,
  titleCase,
} from "../lib/presentation";

const steps = ["Identity", "Abilities", "Proficiencies", "Equipment", "Review"] as const;

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
  const [draft, setDraft] = useState<FighterBuilderDraft>(defaultFighterDraft);
  const catalog = useMemo(() => fighterBuilderCatalog(rulesPackage), [rulesPackage]);
  const previewOptions = useMemo(
    () => ({ id: "builder-preview-fighter", now: new Date("2026-08-02T00:00:00.000Z") }),
    [],
  );
  const preview = useMemo(
    () => previewFighterCharacter(draft, rulesPackage, previewOptions),
    [draft, previewOptions, rulesPackage],
  );
  const requiredMasteries = masteryCount(draft, catalog);
  const allSelectedSkills = new Set([
    ...catalog.backgroundSkillIds,
    ...draft.classSkillIds,
    draft.speciesSkillId,
    ...draft.skilledSkillIds,
  ]);

  function updateLevel(level: number): void {
    const required = catalog.masteryCountByLevel[level] ?? 0;
    const current = draft.weaponMasteryIds.filter((id) => catalog.weaponIds.includes(id));
    const additions = catalog.weaponIds.filter((id) => !current.includes(id));
    setDraft((value) => ({
      ...value,
      level,
      weaponMasteryIds: [...current, ...additions].slice(0, required),
    }));
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

  function createCharacter(): void {
    try {
      onComplete(
        buildFighterCharacter(draft, rulesPackage, {
          id: `character-${crypto.randomUUID()}`,
          now: new Date(),
        }),
      );
    } catch {
      setStep(4);
    }
  }

  return (
    <div className="builder-shell" role="dialog" aria-modal="true" aria-label="Create a character">
      <header className="builder-header">
        <div>
          <span className="builder-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>Create an adventurer</strong>
            <small>Fighter vertical slice · levels 1–5</small>
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
                              ? "Ready your gear"
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
              <div className="builder-choice-grid">
                <article className="builder-choice selected">
                  <span>Starting class</span>
                  <h2>{catalog.className}</h2>
                  <p>Martial specialist with broad weapon training and durable defenses.</p>
                  <small>Builder-ready</small>
                </article>
                <article className="builder-choice selected">
                  <span>Species</span>
                  <h2>{catalog.speciesName}</h2>
                  <p>Resourceful, Skillful, and Versatile. Walking speed 30 feet.</p>
                  <small>Only reviewed species available</small>
                </article>
                <article className="builder-choice selected">
                  <span>Background</span>
                  <h2>{catalog.backgroundName}</h2>
                  <p>
                    Grants Athletics, Intimidation, Savage Attacker, and three ability increases.
                  </p>
                  <small>Only reviewed background available</small>
                </article>
              </div>
              <label className="builder-field compact-field">
                Starting level
                <select
                  value={draft.level}
                  onChange={(event) => {
                    updateLevel(Number(event.target.value));
                  }}
                >
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      Level {String(level)}
                      {level >= 3 ? ` · ${catalog.subclassName}` : ""}
                    </option>
                  ))}
                </select>
                <small>
                  Levels 3–5 use the reviewed Champion subclass. Level 4 applies a +2 Ability Score
                  Improvement.
                </small>
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="builder-section">
              <div className="builder-callout">
                <strong>Assign base scores</strong>
                <p>
                  Enter scores before the Soldier background adds +1 Strength, Dexterity, and
                  Constitution.
                </p>
              </div>
              <div className="ability-editor">
                {abilities.map((ability) => {
                  const backgroundIncrease = ["strength", "dexterity", "constitution"].includes(
                    ability,
                  )
                    ? 1
                    : 0;
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
                  Soldier already grants Athletics and Intimidation. Choose unique skills for every
                  other source.
                </p>
              </div>
              <div className="skill-choice-section">
                <div>
                  <span>Fighter</span>
                  <h2>Choose 2 class skills</h2>
                  <small>{String(draft.classSkillIds.length)} / 2 selected</small>
                </div>
                <div className="choice-pills">
                  {catalog.classSkillIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      disabled={skillDisabled(id, draft.classSkillIds)}
                      className={draft.classSkillIds.includes(id) ? "selected" : undefined}
                      onClick={() => {
                        setDraft((value) => ({
                          ...value,
                          classSkillIds: toggleList(value.classSkillIds, id, 2),
                        }));
                      }}
                    >
                      {skillName(id)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="skill-choice-section">
                <div>
                  <span>Human · Skillful</span>
                  <h2>Choose 1 skill</h2>
                  <small>1 / 1 selected</small>
                </div>
                <div className="choice-pills">
                  {skillIds.map((skill) => {
                    const id = `srd521.skill.${skill}`;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={skillDisabled(id, [draft.speciesSkillId])}
                        className={draft.speciesSkillId === id ? "selected" : undefined}
                        onClick={() => {
                          setDraft((value) => ({ ...value, speciesSkillId: id }));
                        }}
                      >
                        {skillName(id)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="skill-choice-section">
                <div>
                  <span>Skilled feat</span>
                  <h2>Choose 3 skills</h2>
                  <small>{String(draft.skilledSkillIds.length)} / 3 selected</small>
                </div>
                <div className="choice-pills">
                  {skillIds.map((skill) => {
                    const id = `srd521.skill.${skill}`;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={skillDisabled(id, draft.skilledSkillIds)}
                        className={draft.skilledSkillIds.includes(id) ? "selected" : undefined}
                        onClick={() => {
                          setDraft((value) => ({
                            ...value,
                            skilledSkillIds: toggleList(value.skilledSkillIds, id, 3),
                          }));
                        }}
                      >
                        {skillName(id)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="builder-section">
              <div className="builder-callout">
                <strong>Ready-to-play equipment package</strong>
                <p>
                  The reviewed Fighter package equips Chain Mail and a Greatsword and carries a
                  Flail, eight Javelins, and a Longbow.
                </p>
              </div>
              <div className="equipment-preview">
                <div>
                  <span>Equipped armor</span>
                  <strong>Chain Mail</strong>
                  <small>Heavy armor · AC 16</small>
                </div>
                <div>
                  <span>Equipped weapon</span>
                  <strong>Greatsword</strong>
                  <small>Martial melee · 2d6 Slashing</small>
                </div>
                <div>
                  <span>Carried weapons</span>
                  <strong>Flail, Javelins, Longbow</strong>
                  <small>Included in inventory</small>
                </div>
              </div>
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
                {catalog.weaponIds.map((id) => (
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

          {step === 4 ? (
            <div className="builder-section review-section">
              <div className="review-identity">
                <span>Ready to adventure</span>
                <h2>{draft.name.trim() || "Unnamed Fighter"}</h2>
                <p>
                  Level {String(draft.level)} {draft.level >= 3 ? `${catalog.subclassName} ` : ""}
                  {catalog.className} · {catalog.speciesName} · {catalog.backgroundName}
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
                      draft.speciesSkillId,
                      ...draft.skilledSkillIds,
                      ...catalog.backgroundSkillIds,
                    ]
                      .map(skillName)
                      .sort()
                      .join(", ")}
                  </p>
                </article>
                <article>
                  <span>Weapon Masteries</span>
                  <p>
                    {draft.weaponMasteryIds
                      .map((id) => catalog.weaponNames[id] ?? shortEntityName(id))
                      .join(", ")}
                  </p>
                </article>
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
