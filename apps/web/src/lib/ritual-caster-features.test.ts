import { describe, expect, it } from "vitest";
import { evaluateCharacter } from "@dnd/rules-core";
import type { CharacterDocument } from "@dnd/character-model";

import {
  advancementOptions,
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  proficiencyBonusAtLevel,
  reconcileRitualCasterChoices,
  ritualCasterFeatIds,
  ritualCasterInitialCandidates,
  updateRitualCasterSelection,
  validateBuilderDraft,
  wizardId,
  type CharacterBuilderDraft,
} from "./character-builder";
import { featAllocationOptions } from "./advancement-feats";
import { createLevelUpDraft, levelUpCharacter, previewLevelUp } from "./character-level-up";
import { loadWebData } from "./server-data";

const ritual2014Id = "dnd2014.feat.general.ritual-caster";
const ritual2024Id = "dnd2024.feat.general.ritual-caster";
const options = { id: "ritual-caster", now: new Date("2026-11-01T18:00:00Z") };

const selection2014 = { featId: ritual2014Id, abilityScoreIncreases: {} };
const selection2024 = { featId: ritual2024Id, abilityScoreIncreases: { intelligence: 1 } };

function setup(level: number) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(wizardId, catalog, level, "Ritual Caster");
  draft.abilityScores.intelligence = 15;
  return { rulesPackage, catalog, draft };
}

function withRitualFeat(level: number, selection: typeof selection2014 | typeof selection2024) {
  const context = setup(level);
  context.draft.advancementFeats[0] = selection;
  context.draft = reconcileRitualCasterChoices(context.draft, context.catalog);
  const character = buildCharacter(context.draft, context.rulesPackage, options);
  return { ...context, character };
}

function errors(
  character: CharacterDocument,
  rulesPackage: ReturnType<typeof loadWebData>["rulesPackage"],
) {
  return evaluateCharacter({ character, packages: [rulesPackage] }).validations.filter(
    ({ severity }) => severity === "error",
  );
}

function finalIntelligence(draft: CharacterBuilderDraft, featIncrease: number) {
  return (
    draft.abilityScores.intelligence +
    (draft.backgroundAbilityScoreIncreases.intelligence ?? 0) +
    featIncrease
  );
}

describe("Ritual Caster variants in the builder", () => {
  it("mirrors the shared Proficiency Bonus progression at the documented boundaries", () => {
    expect(
      [1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map((level) => proficiencyBonusAtLevel(level)),
    ).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });

  it("offers the 2014 record as exactly one no-increase allocation", () => {
    const { catalog } = setup(4);
    const feat = catalog.feats[ritual2014Id];
    if (feat === undefined) throw new Error("Missing 2014 Ritual Caster");
    const allocations = featAllocationOptions(feat);
    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.selection).toEqual(selection2014);
    expect(allocations[0]?.label).toContain("no ability score increase");
  });

  it("offers the 2024 record as one +1 per allowed ability", () => {
    const { catalog } = setup(4);
    const feat = catalog.feats[ritual2024Id];
    if (feat === undefined) throw new Error("Missing 2024 Ritual Caster");
    const abilities = featAllocationOptions(feat).map(({ selection }) =>
      Object.keys(selection.abilityScoreIncreases),
    );
    expect(abilities).toEqual([["intelligence"], ["wisdom"], ["charisma"]]);
  });

  it("gates both variants on the Intelligence/Wisdom prerequisite", () => {
    const { draft, catalog } = setup(4);
    const offered = () =>
      advancementOptions(draft, catalog, 0).filter(
        ({ selection }) => selection.featId === ritual2014Id || selection.featId === ritual2024Id,
      );
    for (const ability of ["intelligence", "wisdom", "charisma"] as const)
      draft.abilityScores[ability] = 12 - (draft.backgroundAbilityScoreIncreases[ability] ?? 0);
    expect(offered()).toEqual([]);
    draft.abilityScores.intelligence = 13;
    expect(offered().map(({ selection }) => selection.featId)).toEqual(
      expect.arrayContaining([ritual2014Id, ritual2024Id]),
    );
    // The 2014 record states no level floor; the 2024 record states Level 4+. Both are only ever
    // offered at an ASI grant, which is how this app acquires General feats.
    expect(
      catalog.feats[ritual2014Id]?.advancement?.prerequisite?.minimumCharacterLevel,
    ).toBeUndefined();
    expect(catalog.feats[ritual2024Id]?.advancement?.prerequisite?.minimumCharacterLevel).toBe(4);
  });

  it("auto-fills the 2014 book to exactly two class-list rituals, defaulting to the character's own class", () => {
    const { draft, catalog } = withRitualFeat(4, selection2014);
    expect(ritualCasterFeatIds(draft, catalog)).toEqual([ritual2014Id]);
    const autoFilled = draft.ritualCasterChoices[ritual2014Id];
    if (autoFilled === undefined) throw new Error("Missing ritual selection");
    expect(autoFilled.listClassId).toBe(wizardId);
    const candidates = ritualCasterInitialCandidates(draft, catalog, ritual2014Id);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.every((spell) => spell.level === 1)).toBe(true);
    expect(autoFilled.spellIds).toEqual(candidates.slice(0, 2).map((spell) => spell.id));
    expect(autoFilled.researchSpellIds).toEqual([]);
  });

  it("emits the 2014 choice records and evaluates the book as unprepared Intelligence casting", () => {
    const { draft, catalog, rulesPackage } = withRitualFeat(4, selection2014);
    const autoFilled = draft.ritualCasterChoices[ritual2014Id];
    if (autoFilled === undefined) throw new Error("Missing ritual selection");
    // Choose two book rituals the class flow has not prepared, so the evaluation can show the
    // 2014 grants as never prepared and castable only through a ritual request.
    const unprepared = ritualCasterInitialCandidates(draft, catalog, ritual2014Id)
      .filter((spell) => !draft.preparedSpellIds.includes(spell.id))
      .slice(0, 2);
    draft.ritualCasterChoices = {
      ...draft.ritualCasterChoices,
      [ritual2014Id]: { ...autoFilled, spellIds: unprepared.map((spell) => spell.id) },
    };
    expect(
      validateBuilderDraft(draft, catalog).filter((issue) => issue.includes("ritual")),
    ).toEqual([]);

    const character = buildCharacter(draft, rulesPackage, options);
    expect(character.build.levels[3]?.featSelections).toEqual([selection2014]);
    expect(character.build.choices).toEqual(
      expect.arrayContaining([
        { choiceId: `${ritual2014Id}.choice.spell-list-class`, optionIds: [wizardId] },
        {
          choiceId: `${ritual2014Id}.choice.ritual-spells`,
          optionIds: unprepared.map((spell) => spell.id),
        },
      ]),
    );
    expect(
      character.build.choices.some(
        (choice) => choice.choiceId === `${ritual2014Id}.choice.ritual-book-research`,
      ),
    ).toBe(false);
    expect(errors(character, rulesPackage)).toEqual([]);

    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(Object.keys(evaluation.traces)).toEqual(
      expect.arrayContaining([
        `spellcasting.${ritual2014Id}.attackBonus`,
        `spellcasting.${ritual2014Id}.saveDifficultyClass`,
      ]),
    );
    const granted = evaluation.spells.filter((spell) =>
      spell.castingOptions?.some((option) => option.sourceId === ritual2014Id),
    );
    expect(granted.map((spell) => spell.id).sort()).toEqual(
      unprepared.map((spell) => spell.id).sort(),
    );
    for (const spell of granted) {
      expect(spell.prepared).toBe(false);
      const option = spell.castingOptions?.find((candidate) => candidate.sourceId === ritual2014Id);
      expect(option?.ability).toBe("intelligence");
      expect(option?.freeCastResourceId).toBeUndefined();
      expect(option?.freeCastAtWill).toBeUndefined();
      const modifier = Math.floor((finalIntelligence(draft, 0) - 10) / 2);
      expect(option?.attackBonus).toBe(2 + modifier);
      expect(option?.saveDifficultyClass).toBe(8 + 2 + modifier);
    }
  });

  it("bounds the 2024 selection at the Proficiency Bonus and ties casting to the increased ability", () => {
    const { draft, catalog, rulesPackage } = withRitualFeat(4, selection2024);
    const selection = draft.ritualCasterChoices[ritual2024Id];
    if (selection === undefined) throw new Error("Missing ritual selection");
    const candidates = ritualCasterInitialCandidates(draft, catalog, ritual2024Id);
    // A new selection auto-fills exactly to the Proficiency Bonus at acquisition (2 at level 4).
    expect(selection.spellIds).toEqual(candidates.slice(0, 2).map((spell) => spell.id));

    const character = buildCharacter(draft, rulesPackage, options);
    expect(character.build.choices).toEqual(
      expect.arrayContaining([
        { choiceId: `${ritual2024Id}.choice.ritual-spells`, optionIds: selection.spellIds },
      ]),
    );
    expect(
      character.build.choices.some(
        (choice) => choice.choiceId === `${ritual2024Id}.choice.spell-list-class`,
      ),
    ).toBe(false);
    expect(errors(character, rulesPackage)).toEqual([]);

    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(Object.keys(evaluation.traces)).toContain(`spellcasting.${ritual2024Id}.attackBonus`);
    const granted = evaluation.spells.filter((spell) =>
      spell.castingOptions?.some((option) => option.sourceId === ritual2024Id),
    );
    expect(granted).toHaveLength(2);
    for (const spell of granted) {
      expect(spell.prepared).toBe(true);
      const option = spell.castingOptions?.find((candidate) => candidate.sourceId === ritual2024Id);
      expect(option?.ability).toBe("intelligence");
      expect(option?.attackBonus).toBe(2 + Math.floor((finalIntelligence(draft, 1) - 10) / 2));
    }
    expect(
      evaluation.resources.some((resource) => resource.id === `${ritual2024Id}.free-cast`),
    ).toBe(true);
  });

  it("blocks character creation until the ritual spell choices are complete", () => {
    const { draft, catalog } = withRitualFeat(4, selection2014);
    const selection = draft.ritualCasterChoices[ritual2014Id];
    if (selection === undefined) throw new Error("Missing ritual selection");
    draft.ritualCasterChoices = {
      ...draft.ritualCasterChoices,
      [ritual2014Id]: { ...selection, spellIds: selection.spellIds.slice(0, 1) },
    };
    expect(validateBuilderDraft(draft, catalog)).toContain(
      "Complete the Ritual Caster (2014 PHB variant) ritual spell choices.",
    );
    draft.ritualCasterChoices = {
      ...draft.ritualCasterChoices,
      "srd521.feat.general.grappler": { listClassId: "", spellIds: [], researchSpellIds: [] },
    };
    expect(validateBuilderDraft(draft, catalog)).toContain(
      "Remove ritual spell choices for feats this character does not have.",
    );
  });

  it("preserves the 2014 book and its researched spells through a level up", () => {
    const saved = withRitualFeat(5, selection2014);
    const { catalog, rulesPackage } = saved;
    const selection = saved.draft.ritualCasterChoices[ritual2014Id];
    if (selection === undefined) throw new Error("Missing ritual selection");
    const researchSpell = ritualCasterInitialCandidates(saved.draft, catalog, ritual2014Id).find(
      (spell) => !selection.spellIds.includes(spell.id),
    );
    if (researchSpell === undefined) throw new Error("Missing research candidate");
    saved.character.build.choices.push({
      choiceId: `${ritual2014Id}.choice.ritual-book-research`,
      optionIds: [researchSpell.id],
    });
    // A researched level 1 spell is legal at level 5 (the engine cap is ceil(5 / 2) = 3).
    expect(errors(saved.character, rulesPackage)).toEqual([]);

    const advancement = createLevelUpDraft(saved.character, catalog);
    expect(advancement.ritualCasterChoices[ritual2014Id]).toEqual({
      listClassId: wizardId,
      spellIds: selection.spellIds,
      researchSpellIds: [researchSpell.id],
    });
    const next = levelUpCharacter(saved.character, advancement, rulesPackage, options);
    expect(next.build.choices).toEqual(
      expect.arrayContaining([
        { choiceId: `${ritual2014Id}.choice.spell-list-class`, optionIds: [wizardId] },
        { choiceId: `${ritual2014Id}.choice.ritual-spells`, optionIds: selection.spellIds },
        {
          choiceId: `${ritual2014Id}.choice.ritual-book-research`,
          optionIds: [researchSpell.id],
        },
      ]),
    );
    expect(errors(next, rulesPackage)).toEqual([]);

    const tampered = createLevelUpDraft(saved.character, catalog);
    const current = tampered.ritualCasterChoices[ritual2014Id];
    if (current === undefined) throw new Error("Missing ritual selection");
    tampered.ritualCasterChoices = {
      ...tampered.ritualCasterChoices,
      [ritual2014Id]: { ...current, spellIds: [researchSpell.id, current.spellIds[0] ?? ""] },
    };
    expect(
      previewLevelUp(saved.character, tampered, rulesPackage, options).issues.some((issue) =>
        issue.includes("ritual book selections cannot change during level up"),
      ),
    ).toBe(true);
  });

  it("lets the 2024 book grow exactly with Proficiency Bonus growth, and no further", () => {
    const saved = withRitualFeat(4, selection2024);
    const { catalog, rulesPackage } = saved;
    const selection = saved.draft.ritualCasterChoices[ritual2024Id];
    if (selection === undefined) throw new Error("Missing ritual selection");

    // Level 4 to 5 raises the Proficiency Bonus, so exactly one addition is legal.
    const grown = createLevelUpDraft(saved.character, catalog);
    const extra = ritualCasterInitialCandidates(grown, catalog, ritual2024Id).find(
      (spell) => !selection.spellIds.includes(spell.id),
    );
    if (extra === undefined) throw new Error("Missing additional ritual");
    const grownLevel = levelUpCharacter(
      saved.character,
      updateRitualCasterSelection(grown, catalog, ritual2024Id, {
        spellIds: [...selection.spellIds, extra.id],
      }),
      rulesPackage,
      options,
    );
    const grownChoice = grownLevel.build.choices.find(
      (choice) => choice.choiceId === `${ritual2024Id}.choice.ritual-spells`,
    );
    expect(grownChoice?.optionIds).toEqual([...selection.spellIds, extra.id]);
    expect(errors(grownLevel, rulesPackage)).toEqual([]);

    // Level 5 to 6 adds no Proficiency Bonus growth, so no addition is allowed there.
    const atSix = createLevelUpDraft(grownLevel, catalog);
    const current = atSix.ritualCasterChoices[ritual2024Id];
    if (current === undefined) throw new Error("Missing ritual selection");
    const secondExtra = ritualCasterInitialCandidates(atSix, catalog, ritual2024Id).find(
      (spell) => !current.spellIds.includes(spell.id),
    );
    if (secondExtra === undefined) throw new Error("Missing second additional ritual");
    atSix.ritualCasterChoices = {
      ...atSix.ritualCasterChoices,
      [ritual2024Id]: {
        ...current,
        spellIds: [...current.spellIds, secondExtra.id],
      },
    };
    expect(
      previewLevelUp(grownLevel, atSix, rulesPackage, options).issues.some((issue) =>
        issue.includes("additions are limited to the 0 slots opened by Proficiency Bonus growth"),
      ),
    ).toBe(true);

    const removed = createLevelUpDraft(saved.character, catalog);
    const kept = removed.ritualCasterChoices[ritual2024Id];
    if (kept === undefined) throw new Error("Missing ritual selection");
    removed.ritualCasterChoices = {
      ...removed.ritualCasterChoices,
      [ritual2024Id]: { ...kept, spellIds: kept.spellIds.slice(0, 1) },
    };
    expect(
      previewLevelUp(saved.character, removed, rulesPackage, options).issues.some((issue) =>
        issue.includes("ritual spells cannot be removed"),
      ),
    ).toBe(true);
  });
});
