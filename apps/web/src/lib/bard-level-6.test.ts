import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeSpellCast, spellPreparationEditor } from "@dnd/rules-core";
import type { CharacterDocument } from "@dnd/character-model";
import {
  bardId,
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  featureChoiceOptionsForLevel,
  fighterId,
  spellSelectionCounts,
  updateBuilderFeatureChoice,
  validateBuilderDraft,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, previewLevelUp } from "./character-level-up";
import { loadWebData } from "./server-data";

const choiceId = "srd521.choice.bard.magical-discoveries";
const featureId = "srd521.subclass-feature.bard.lore.magical-discoveries";
const options = { id: "discovering-bard", now: new Date("2026-10-09T12:00:00Z") };
function levelEntry(character: CharacterDocument, index: number) {
  const entry = character.build.levels[index];
  if (entry === undefined) throw new Error("Missing test level.");
  return entry;
}
function setup(level = 6) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(bardId, catalog, level, "Discovering Bard");
  const character = buildCharacter(draft, rulesPackage, options);
  return {
    rulesPackage,
    catalog,
    draft,
    character,
    input: { character, packages: [rulesPackage] },
  };
}

describe("Bard level 6 Magical Discoveries", () => {
  it("rejects the spell choice on a character without its casting class", () => {
    const { rulesPackage, catalog } = setup();
    const character = buildCharacter(
      defaultBuilderDraft(fighterId, catalog, 6, "Not a Bard"),
      rulesPackage,
      options,
    );
    levelEntry(character, 5).selectedFeatureChoices.push({
      choiceId,
      optionIds: ["srd521.spell.guidance", "srd521.spell.spiritual-weapon"],
    });
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEATURE_SPELL_CHOICE_INVALID");
  });
  it("advances with two source-linked always-prepared spells outside the regular limit", () => {
    const { character, catalog, rulesPackage } = setup(5);
    character.state.currentHitPoints = 13;
    character.state.expendedSpellSlots["2"] = 1;
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(45);
    expect(advanced.state.currentHitPoints).toBe(13);
    expect(advanced.state.expendedSpellSlots["2"]).toBe(1);
    expect(advanced.loadout.inventory).toEqual(character.loadout.inventory);
    expect(advanced.build.levels.slice(0, 5)).toEqual(character.build.levels);
    expect(advanced.build.levels[5]?.selectedFeatureChoices).toEqual([
      { choiceId, optionIds: ["srd521.spell.counterspell", "srd521.spell.spiritual-weapon"] },
    ]);
    expect(advanced.loadout.preparedSpellIds).toHaveLength(10);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 10,
      alwaysPreparedSpells: 2,
      cantripsKnown: 3,
    });
    expect(evaluation.traces[choiceId]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: featureId })]),
    );
    const editor = spellPreparationEditor(advanced, rulesPackage);
    expect(editor?.alwaysPreparedSpellIds).toContain("srd521.spell.counterspell");
    expect(editor?.options.find(({ id }) => id === "srd521.spell.counterspell")).toMatchObject({
      alwaysPrepared: true,
      selected: false,
    });
  });

  it.each(["srd521.spell.acid-arrow", "srd521.spell.guidance", "srd521.spell.call-lightning"])(
    "casts discovered %s using Bard Charisma, slots and concentration rules",
    (spellId) => {
      const { draft, catalog, rulesPackage } = setup();
      draft.featureChoiceSelections = { [choiceId]: [spellId, "srd521.spell.spiritual-weapon"] };
      const character = buildCharacter(draft, rulesPackage, options);
      const input = { character, packages: [rulesPackage] };
      const evaluation = evaluateCharacter(input);
      expect(evaluation.validations).toEqual([]);
      const spell = evaluation.spells.find(({ id }) => id === spellId);
      if (spellId === "srd521.spell.acid-arrow") expect(spell?.effectsRequireReview).toBe(true);
      expect(spell).toMatchObject({
        prepared: true,
        castingOptions: [
          expect.objectContaining({
            sourceId: bardId,
            ability: "charisma",
            saveDifficultyClass: 14,
            attackBonus: 6,
          }),
        ],
      });
      expect(spellSelectionCounts(draft, catalog)?.alwaysPreparedSpellIds).toContain(spellId);
      const cast = proposeSpellCast(input, {
        spellId,
        ...(spell?.level === 0 ? {} : { slotLevel: spell?.level ?? 1 }),
      });
      expect(cast.applicable).toBe(true);
      if (spell?.concentration) expect(cast.nextState.concentrationSpellId).toBe(spellId);
      if (spell?.level === 0)
        expect(cast.nextState.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
      else expect(cast.nextState.expendedSpellSlots[String(spell?.level)]).toBe(1);
    },
  );

  it("projects searchable, level-eligible choices from the complete three-list union", () => {
    const { catalog } = setup();
    const choice = catalog.classes[bardId].featureChoices.find(({ id }) => id === choiceId);
    if (choice === undefined) throw new Error("Missing spell choice.");
    expect(featureChoiceOptionsForLevel(choice, 6, " ACID ARROW ").map(({ id }) => id)).toEqual([
      "srd521.spell.acid-arrow",
    ]);
    expect(
      featureChoiceOptionsForLevel(choice, 6).some(({ id }) => id === "srd521.spell.guidance"),
    ).toBe(true);
    expect(
      featureChoiceOptionsForLevel(choice, 6).some(({ id }) => id === "srd521.spell.ice-storm"),
    ).toBe(false);
    expect(
      featureChoiceOptionsForLevel(choice, 7).some(({ id }) => id === "srd521.spell.ice-storm"),
    ).toBe(true);
    expect(choice.options.some(({ id }) => id === "srd521.spell.eldritch-blast")).toBe(false);
  });

  it.each(
    [
      [],
      ["srd521.spell.guidance"],
      ["srd521.spell.guidance", "srd521.spell.guidance"],
      ["srd521.spell.guidance", "srd521.spell.eldritch-blast"],
      ["srd521.spell.guidance", "srd521.spell.ice-storm"],
      ["srd521.spell.guidance", "srd521.spell.fake"],
    ].map((ids) => ({ ids })),
  )(
    "rejects incomplete, duplicate, wrong-list, high-level, and unknown selections: $ids",
    ({ ids }) => {
      const { draft, catalog, input, character } = setup();
      draft.featureChoiceSelections = { [choiceId]: ids };
      expect(validateBuilderDraft(draft, catalog).length).toBeGreaterThan(0);
      levelEntry(character, 5).selectedFeatureChoices = [{ choiceId, optionIds: ids }];
      expect(
        evaluateCharacter(input).validations.some(({ code }) =>
          code.startsWith("FEATURE_SPELL_CHOICE"),
        ),
      ).toBe(true);
    },
  );

  it("rejects choices before the feature is granted, including forged history", () => {
    const { character, input } = setup(5);
    levelEntry(character, 4).selectedFeatureChoices.push({
      choiceId,
      optionIds: ["srd521.spell.guidance", "srd521.spell.spiritual-weapon"],
    });
    expect(
      evaluateCharacter(input).validations.some(
        ({ code }) => code === "FEATURE_SPELL_CHOICE_INVALID",
      ),
    ).toBe(true);
    const sixth = setup();
    const selections = levelEntry(sixth.character, 5).selectedFeatureChoices;
    levelEntry(sixth.character, 5).selectedFeatureChoices = [];
    levelEntry(sixth.character, 0).selectedFeatureChoices = selections;
    expect(
      evaluateCharacter(sixth.input).validations.some(
        ({ code }) => code === "FEATURE_SPELL_CHOICE_INVALID",
      ),
    ).toBe(true);
  });

  it("does not consume normal preparation for a discovered spell also on the Bard list", () => {
    const { draft, rulesPackage, catalog } = setup();
    let changed = updateBuilderFeatureChoice(draft, catalog, choiceId, "srd521.spell.counterspell");
    changed = updateBuilderFeatureChoice(changed, catalog, choiceId, "srd521.spell.healing-word");
    const character = buildCharacter(changed, rulesPackage, options);
    expect(character.loadout.preparedSpellIds).not.toContain("srd521.spell.healing-word");
    expect(character.loadout.preparedSpellIds).toHaveLength(10);
    expect(evaluateCharacter({ character, packages: [rulesPackage] }).validations).toEqual([]);
    character.loadout.preparedSpellIds[0] = "srd521.spell.healing-word";
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("ALWAYS_PREPARED_SPELL_SELECTED");
  });

  it("limits later replacements to one while allowing spells from newly available slot levels", () => {
    const { character, rulesPackage } = setup();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = createLevelUpDraft(character, catalog);
    draft.featureChoiceSelections = {
      [choiceId]: ["srd521.spell.ice-storm", "srd521.spell.spiritual-weapon"],
    };
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toEqual([]);
    const advanced = levelUpCharacter(character, draft, rulesPackage, options);
    expect(
      evaluateCharacter({ character: advanced, packages: [rulesPackage] }).validations.filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
    expect(spellPreparationEditor(advanced, rulesPackage)?.alwaysPreparedSpellIds).toContain(
      "srd521.spell.ice-storm",
    );
    draft.featureChoiceSelections = {
      [choiceId]: ["srd521.spell.ice-storm", "srd521.spell.guidance"],
    };
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toContain(
      "Replace no more than 1 Bard feature option during level up.",
    );
  });
});
