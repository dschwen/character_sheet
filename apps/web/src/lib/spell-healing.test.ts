import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeSpellCast } from "@dnd/rules-core";

import { buildCharacter, characterBuilderCatalog, clericId } from "./character-builder";
import { defaultBuilderDraft, updateBuilderBackground } from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { spellHealingRequests } from "./spell-healing";
import { loadWebData } from "./server-data";

const options = { id: "healing-cleric", now: new Date("2026-10-09T12:00:00Z") };

describe("content-driven healing spells and Cleric advancement", () => {
  it("advances a Life Cleric to level 6 while preserving current HP", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const original = buildCharacter(
      defaultBuilderDraft(clericId, catalog, 5, "Healing Cleric"),
      rulesPackage,
      options,
    );
    original.state.currentHitPoints = 10;
    const advanced = levelUpCharacter(
      original,
      createLevelUpDraft(original, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(advanced.state.currentHitPoints).toBe(10);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(45);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.cleric.channel-divinity")
        ?.maximum,
    ).toBe(3);
    expect(evaluation.spellHealingEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "caster-after-healing-other", base: 2, perSlotLevel: 1 }),
      ]),
    );
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({
      eligible: true,
      currentLevel: 6,
    });
  });

  it("scales healing dice with slot level and adds Disciple of Life only for slotted casts", () => {
    const { rulesPackage } = loadWebData();
    const character = buildCharacter(
      defaultBuilderDraft(clericId, characterBuilderCatalog(rulesPackage), 6, "Healing Cleric"),
      rulesPackage,
      options,
    );
    if (!character.loadout.preparedSpellIds.includes("srd521.spell.prayer-of-healing"))
      character.loadout.preparedSpellIds[0] = "srd521.spell.prayer-of-healing";
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const cure = evaluation.spells.find(({ id }) => id === "srd521.spell.cure-wounds");
    if (cure === undefined) throw new Error("Missing Cure Wounds.");
    expect(spellHealingRequests(cure, evaluation, 3)[0]).toMatchObject({
      diceCount: 6,
      diceSize: 8,
      modifier: 8,
    });
    expect(spellHealingRequests(cure, evaluation)[0]).toMatchObject({
      diceCount: 2,
      diceSize: 8,
      modifier: 3,
    });
    const prayer = evaluation.spells.find(({ id }) => id === "srd521.spell.prayer-of-healing");
    if (prayer === undefined) throw new Error("Missing Prayer of Healing.");
    expect(spellHealingRequests(prayer, evaluation, 3)[0]).toMatchObject({
      diceCount: 3,
      diceSize: 8,
      modifier: 5,
    });
  });

  it("does not trigger Blessed Healer or Disciple of Life on a Magic Initiate free cast", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = updateBuilderBackground(
      defaultBuilderDraft(clericId, catalog, 6, "Initiate Cleric"),
      catalog,
      "srd521.background.acolyte",
    );
    const featId = "srd521.feat.origin.magic-initiate.cleric";
    const selection = draft.magicInitiateChoices[featId];
    if (selection === undefined) throw new Error("Missing Magic Initiate.");
    selection.levelOneSpellId = "srd521.spell.cure-wounds";
    selection.ability = "charisma";
    const character = buildCharacter(draft, rulesPackage, options);
    character.state.currentHitPoints = 10;
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    const cure = evaluation.spells.find(({ id }) => id === "srd521.spell.cure-wounds");
    if (cure === undefined) throw new Error("Missing Cure Wounds.");
    expect(spellHealingRequests(cure, evaluation, undefined, featId)[0]).toMatchObject({
      diceCount: 2,
      diceSize: 8,
      modifier: 1,
    });
    const cast = proposeSpellCast(
      { character, packages: [rulesPackage] },
      {
        spellId: cure.id,
        useFreeCast: true,
        castingSourceId: featId,
        restoresHitPointsToOther: true,
      },
    );
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.currentHitPoints).toBe(10);
    expect(cast.nextState.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
  });
});
