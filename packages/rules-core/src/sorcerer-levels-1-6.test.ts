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
  "sorcerer.innate-sorcery.json",
  "sorcerer.font-of-magic.json",
  "sorcerer.sorcerous-restoration.json",
  "metamagic.quickened.json",
  "metamagic.subtle.json",
  "draconic-sorcery.resilience.json",
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
  return characterDocumentSchema.parse(
    readJson(new URL("characters/sorcerer-5.json", fixturesRoot)),
  );
}

describe("evaluateCharacter Sorcerer levels 1–6 vertical slice", () => {
  it("evaluates Draconic defenses, spellcasting, Metamagic, and resources", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(37);
    expect(evaluation.values.armorClass?.value).toBe(15);
    expect(evaluation.spellcasting).toMatchObject({
      classId: "srd521.class.sorcerer",
      ability: "charisma",
      abilityModifier: 3,
      attackBonus: 6,
      saveDifficultyClass: 14,
      cantripsKnown: 5,
      preparedSpellLimit: 9,
      alwaysPreparedSpells: 6,
      slots: [
        { level: 1, maximum: 4, current: 3 },
        { level: 2, maximum: 3, current: 2 },
        { level: 3, maximum: 2, current: 1 },
      ],
    });
    expect(evaluation.spells).toHaveLength(20);
    expect(evaluation.spells.find((spell) => spell.id === "srd521.spell.command")).toMatchObject({
      prepared: true,
    });
    expect(evaluation.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.resource.sorcerer.sorcery-points",
          maximum: 5,
          current: 3,
        }),
        expect.objectContaining({
          id: "srd521.resource.sorcerer.innate-sorcery",
          maximum: 2,
          current: 1,
        }),
        expect.objectContaining({
          id: "srd521.resource.sorcerer.sorcerous-restoration",
          maximum: 1,
          current: 1,
        }),
      ]),
    );
    expect(evaluation.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "action.innate-sorcery",
        "action.metamagic.quickened",
        "action.metamagic.subtle",
        "action.sorcerous-restoration",
      ]),
    );
    expect(
      evaluation.actions.find((action) => action.id === "action.sorcerous-restoration"),
    ).toMatchObject({ actionEconomy: "after-short-rest" });
  });

  it("validates subclass and Metamagic selections", () => {
    const character = loadCharacter();
    delete character.build.subclassId;
    const levelTwo = character.build.levels[1];
    if (levelTwo === undefined) throw new TypeError("Sorcerer fixture is missing level 2");
    levelTwo.selectedFeatureChoices = [];
    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining(["SORCERER_SUBCLASS_REQUIRED", "SORCERER_METAMAGIC_CHOICE_COUNT"]),
    );
  });

  it("rejects duplicate and unknown Metamagic selections", () => {
    const character = loadCharacter();
    const levelTwo = character.build.levels[1];
    if (levelTwo === undefined) throw new TypeError("Sorcerer fixture is missing level 2");
    const metamagicChoice = levelTwo.selectedFeatureChoices[0];
    if (metamagicChoice === undefined) {
      throw new TypeError("Sorcerer fixture is missing its Metamagic choice");
    }
    metamagicChoice.optionIds = [
      "srd521.option.sorcerer.metamagic.quickened",
      "srd521.option.sorcerer.metamagic.quickened",
    ];

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.validations.map((message) => message.code)).toContain(
      "SORCERER_METAMAGIC_CHOICE_COUNT",
    );

    metamagicChoice.optionIds = [
      "srd521.option.sorcerer.metamagic.quickened",
      "srd521.option.sorcerer.metamagic.unknown",
    ];
    const unknownEvaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });
    expect(unknownEvaluation.validations.map((message) => message.code)).toContain(
      "SORCERER_METAMAGIC_OPTION_INVALID",
    );
  });

  it("rejects Metamagic before Sorcerer level 2", () => {
    const character = loadCharacter();
    character.build.levels = character.build.levels.slice(0, 1);
    delete character.build.subclassId;
    character.build.featIds = character.build.featIds.filter(
      (featId) => featId !== "srd521.feat.general.ability-score-improvement",
    );
    character.build.featAbilityScoreIncreases = {};
    const levelOne = character.build.levels[0];
    if (levelOne === undefined) throw new TypeError("Sorcerer fixture is missing level 1");
    levelOne.selectedFeatureChoices = [
      {
        choiceId: "srd521.choice.sorcerer.metamagic",
        optionIds: [
          "srd521.option.sorcerer.metamagic.quickened",
          "srd521.option.sorcerer.metamagic.subtle",
        ],
      },
    ];

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.validations.map((message) => message.code)).toContain(
      "SORCERER_METAMAGIC_LEVEL_REQUIRED",
    );
  });

  it("spends Sorcery Points for selected Metamagic", () => {
    const proposal = proposeAction(
      { character: loadCharacter(), packages: [loadRulesPackage()] },
      { actionId: "action.metamagic.quickened" },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedResources["srd521.resource.sorcerer.sorcery-points"]).toBe(4);
  });

  it("uses Sorcerous Restoration to recover two Sorcery Points", () => {
    const character = loadCharacter();
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.sorcerous-restoration" },
    );

    expect(proposal.applicable).toBe(true);
    expect(
      proposal.changes.find(
        (change) =>
          change.path === "state.expendedResources.srd521.resource.sorcerer.sorcerous-restoration",
      ),
    ).toBeDefined();
    expect(proposal.nextState.expendedResources["srd521.resource.sorcerer.sorcery-points"]).toBe(0);
    expect(character.state.expendedResources["srd521.resource.sorcerer.sorcery-points"]).toBe(2);
    expect(
      proposal.nextState.expendedResources["srd521.resource.sorcerer.sorcerous-restoration"],
    ).toBe(1);
  });

  it("restores Sorcerer resources and spell slots on a Long Rest", () => {
    const proposal = proposeRest(
      { character: loadCharacter(), packages: [loadRulesPackage()] },
      { event: "long-rest" },
    );

    expect(proposal.nextState.expendedResources["srd521.resource.sorcerer.sorcery-points"]).toBe(0);
    expect(proposal.nextState.expendedResources["srd521.resource.sorcerer.innate-sorcery"]).toBe(0);
    expect(proposal.nextState.expendedSpellSlots).toEqual({ "1": 0, "2": 0, "3": 0 });
  });

  it("applies a level-6 Draconic Sorcerer's Elemental Affinity", () => {
    const character = loadCharacter();
    character.build.levels.push({
      characterLevel: 6,
      classId: "srd521.class.sorcerer",
      hitPointChoice: "fixed",
      selectedFeatureChoices: [
        {
          choiceId: "srd521.choice.sorcerer.draconic.elemental-affinity",
          optionIds: ["srd521.option.sorcerer.draconic.elemental-affinity.cold"],
        },
      ],
    });
    character.loadout.preparedSpellIds.push("srd521.spell.counterspell");

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.resistances).toContain("cold");
    expect(evaluation.values["sorcerer.elementalAffinity.spellDamageBonus"]?.value).toBe(3);
    expect(
      evaluation.spells
        .find((spell) => spell.id === "srd521.spell.ray-of-frost")
        ?.damage.find((damage) => damage.type === "cold"),
    ).toMatchObject({ bonus: 3, bonusAppliesToOneRoll: true });
  });

  it("requires a valid Elemental Affinity choice at Sorcerer level 6", () => {
    const character = loadCharacter();
    character.build.levels.push({
      characterLevel: 6,
      classId: "srd521.class.sorcerer",
      hitPointChoice: "fixed",
      selectedFeatureChoices: [],
    });
    character.loadout.preparedSpellIds.push("srd521.spell.counterspell");

    const missing = evaluateCharacter({ character, packages: [loadRulesPackage()] });
    expect(missing.validations.map((message) => message.code)).toContain(
      "SORCERER_ELEMENTAL_AFFINITY_CHOICE_COUNT",
    );

    character.build.levels[5]?.selectedFeatureChoices.push({
      choiceId: "srd521.choice.sorcerer.draconic.elemental-affinity",
      optionIds: ["srd521.option.sorcerer.draconic.elemental-affinity.force"],
    });
    const invalid = evaluateCharacter({ character, packages: [loadRulesPackage()] });
    expect(invalid.validations.map((message) => message.code)).toContain(
      "SORCERER_ELEMENTAL_AFFINITY_OPTION_INVALID",
    );
  });
});
