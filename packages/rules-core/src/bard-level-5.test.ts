import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { proposeAction } from "./action-transition.js";
import { evaluateCharacter } from "./character-evaluator.js";
import { proposeRest } from "./rest.js";

const packageRoot = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
const fixturesRoot = new URL("../../test-fixtures/", import.meta.url);
const authoringIrFiles = [
  "bard.bardic-inspiration.json",
  "bard.jack-of-all-trades.json",
  "college-of-lore.cutting-words.json",
] as const;

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

function loadRulesPackage(): LoadedRulesPackage {
  return {
    manifest: packageManifestSchema.parse(readJson(new URL("manifest.json", packageRoot))),
    entities: contentEntitySchema.array().parse(readJson(new URL("entities.json", packageRoot))),
    authoringIr: authoringIrFiles.map((file) =>
      authoringIrSchema.parse(readJson(new URL(`authoring-ir/${file}`, packageRoot))),
    ),
  };
}

function loadCharacter(): CharacterDocument {
  return characterDocumentSchema.parse(readJson(new URL("characters/bard-5.json", fixturesRoot)));
}

describe("evaluateCharacter Bard level-5 vertical slice", () => {
  it("evaluates Lore Bard spellcasting, Expertise, Jack of All Trades, and Inspiration", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(38);
    expect(evaluation.values.armorClass?.value).toBe(13);
    expect(evaluation.d20Tests["skill.performance"]).toMatchObject({
      modifier: 9,
      proficiency: { level: "expertise", bonus: 6 },
    });
    expect(evaluation.d20Tests["skill.medicine"]).toMatchObject({
      modifier: 1,
      proficiency: { level: "none", bonus: 0 },
    });
    expect(evaluation.spellcasting).toMatchObject({
      classId: "srd521.class.bard",
      model: "standard",
      slotRecharge: "long-rest",
      ability: "charisma",
      abilityModifier: 3,
      attackBonus: 6,
      saveDifficultyClass: 14,
      cantripsKnown: 3,
      preparedSpellLimit: 9,
      slots: [
        { level: 1, maximum: 4, expended: 1, current: 3 },
        { level: 2, maximum: 3, expended: 1, current: 2 },
        { level: 3, maximum: 2, expended: 1, current: 1 },
      ],
    });
    expect(evaluation.spells).toHaveLength(12);
    expect(evaluation.attacks.find((attack) => attack.id === "attack.dagger-1")).toMatchObject({
      attackBonus: 5,
      damage: { diceCount: 1, diceSize: 4, bonus: 2, type: "piercing" },
    });
    const inspiration = evaluation.resources.find(
      (resource) => resource.id === "srd521.resource.bard.bardic-inspiration",
    );
    expect(inspiration).toMatchObject({ maximum: 3, expended: 1, current: 2 });
    expect(inspiration?.recharge).toEqual(
      expect.arrayContaining([
        { event: "short-rest", amount: "all" },
        { event: "long-rest", amount: "all" },
      ]),
    );
    expect(
      evaluation.actions.find((action) => action.id === "action.bardic-inspiration"),
    ).toMatchObject({
      available: true,
      actionEconomy: "bonus-action",
      parameters: {
        checkBonus: { diceCount: 1, diceSize: 8, mode: "add", appliesTo: ["d20-test"] },
      },
    });
    expect(evaluation.actions.find((action) => action.id === "action.cutting-words")).toMatchObject(
      {
        available: true,
        actionEconomy: "reaction",
        parameters: {
          checkBonus: {
            diceCount: 1,
            diceSize: 8,
            mode: "subtract",
            appliesTo: ["ability-check", "attack-roll", "damage-roll"],
          },
        },
      },
    );
    const checkBonusTrace = evaluation.traces["action.bardic-inspiration.checkBonus.diceSize"];
    expect(checkBonusTrace).toMatchObject({ result: 8 });
    expect(checkBonusTrace?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "srd521.class-feature.bard.bardic-inspiration" }),
      ]),
    );
  });

  it("spends Bardic Inspiration without mutating the source character", () => {
    const character = loadCharacter();
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.bardic-inspiration" },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedResources["srd521.resource.bard.bardic-inspiration"]).toBe(2);
    expect(character.state.expendedResources["srd521.resource.bard.bardic-inspiration"]).toBe(1);
  });

  it("adds Short Rest recharge at level 5 but not level 4", () => {
    const levelFive = loadCharacter();
    const levelFour = loadCharacter();
    levelFour.build.levels = levelFour.build.levels.slice(0, 4);
    levelFour.build.featIds = levelFour.build.featIds.filter(
      (id) => id !== "srd521.feat.general.ability-score-improvement",
    );
    levelFour.build.featAbilityScoreIncreases = {};
    levelFour.loadout.preparedSpellIds = levelFour.loadout.preparedSpellIds.slice(0, 7);
    levelFour.state.expendedSpellSlots = { "1": 1, "2": 1 };

    const fifthLevelRest = proposeRest(
      { character: levelFive, packages: [loadRulesPackage()] },
      { event: "short-rest" },
    );
    const fourthLevelRest = proposeRest(
      { character: levelFour, packages: [loadRulesPackage()] },
      { event: "short-rest" },
    );

    expect(
      fifthLevelRest.nextState.expendedResources["srd521.resource.bard.bardic-inspiration"],
    ).toBe(0);
    expect(
      fourthLevelRest.nextState.expendedResources["srd521.resource.bard.bardic-inspiration"],
    ).toBe(1);
  });

  it("validates the College of Lore and both Expertise selections", () => {
    const character = loadCharacter();
    delete character.build.subclassId;
    character.build.proficiencyChoices.expertise =
      character.build.proficiencyChoices.expertise.slice(0, 1);

    const evaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining(["BARD_SUBCLASS_REQUIRED", "BARD_EXPERTISE_CHOICE_COUNT"]),
    );
  });
});
