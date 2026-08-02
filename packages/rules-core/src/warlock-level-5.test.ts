import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { proposeAction } from "./action-transition.js";
import { evaluateCharacter } from "./character-evaluator.js";
import { proposeRest } from "./rest.js";
import { proposeSpellCast } from "./spell-transition.js";

const packageRoot = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
const fixturesRoot = new URL("../../test-fixtures/", import.meta.url);

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

function loadRulesPackage(): LoadedRulesPackage {
  return {
    manifest: packageManifestSchema.parse(readJson(new URL("manifest.json", packageRoot))),
    entities: contentEntitySchema.array().parse(readJson(new URL("entities.json", packageRoot))),
    authoringIr: [
      authoringIrSchema.parse(
        readJson(new URL("authoring-ir/warlock.magical-cunning.json", packageRoot)),
      ),
    ],
  };
}

function loadCharacter(): CharacterDocument {
  return characterDocumentSchema.parse(
    readJson(new URL("characters/warlock-5.json", fixturesRoot)),
  );
}

describe("evaluateCharacter Warlock level-5 vertical slice", () => {
  it("evaluates Pact Magic, Fiend spells, invocations, and Magical Cunning", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(38);
    expect(evaluation.values.armorClass?.value).toBe(13);
    expect(evaluation.spellcasting).toMatchObject({
      classId: "srd521.class.warlock",
      model: "pact-magic",
      slotRecharge: "short-rest",
      ability: "charisma",
      abilityModifier: 3,
      attackBonus: 6,
      saveDifficultyClass: 14,
      cantripsKnown: 3,
      preparedSpellLimit: 6,
      alwaysPreparedSpells: 6,
      slots: [{ level: 3, maximum: 2, current: 0 }],
    });
    expect(evaluation.spells).toHaveLength(15);
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.stinking-cloud"),
    ).toMatchObject({ prepared: true, concentration: true });
    expect(evaluation.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.resource.warlock.magical-cunning",
          maximum: 1,
          current: 1,
        }),
      ]),
    );
    expect(
      evaluation.actions.find((action) => action.id === "action.magical-cunning"),
    ).toMatchObject({
      actionEconomy: "one-minute-rite",
      parameters: { restoresSpellSlots: { amount: 1, slotLevel: 3 } },
    });
  });

  it("validates subclass and invocation counts", () => {
    const character = loadCharacter();
    delete character.build.subclassId;
    const levelFive = character.build.levels[4];
    if (levelFive === undefined) throw new TypeError("Warlock fixture is missing level 5");
    levelFive.selectedFeatureChoices = [];

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining([
        "WARLOCK_SUBCLASS_REQUIRED",
        "WARLOCK_ELDRITCH_INVOCATION_CHOICE_COUNT",
      ]),
    );
  });

  it("validates invocation level and dependency prerequisites", () => {
    const earlyCharacter = loadCharacter();
    const levelOne = earlyCharacter.build.levels[0];
    if (levelOne === undefined) throw new TypeError("Warlock fixture is missing level 1");
    levelOne.selectedFeatureChoices[0] = {
      choiceId: "srd521.choice.warlock.eldritch-invocation",
      optionIds: ["srd521.option.warlock.invocation.ascendant-step"],
    };
    const earlyEvaluation = evaluateCharacter({
      character: earlyCharacter,
      packages: [loadRulesPackage()],
    });
    expect(earlyEvaluation.validations.map((message) => message.code)).toContain(
      "WARLOCK_ELDRITCH_INVOCATION_LEVEL_REQUIRED",
    );

    const dependencyCharacter = loadCharacter();
    const levelFive = dependencyCharacter.build.levels[4];
    if (levelFive === undefined) throw new TypeError("Warlock fixture is missing level 5");
    levelFive.selectedFeatureChoices[0] = {
      choiceId: "srd521.choice.warlock.eldritch-invocation",
      optionIds: [
        "srd521.option.warlock.invocation.thirsting-blade",
        "srd521.option.warlock.invocation.one-with-shadows",
      ],
    };
    const dependencyEvaluation = evaluateCharacter({
      character: dependencyCharacter,
      packages: [loadRulesPackage()],
    });
    expect(dependencyEvaluation.validations.map((message) => message.code)).toContain(
      "WARLOCK_ELDRITCH_INVOCATION_PREREQUISITE_MISSING",
    );
  });

  it("casts lower-level spells using the current Pact Magic slot level", () => {
    const character = loadCharacter();
    character.state.expendedSpellSlots = { "3": 1 };
    const proposal = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.hellish-rebuke", slotLevel: 3 },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots).toEqual({ "3": 2 });
    expect(character.state.expendedSpellSlots).toEqual({ "3": 1 });
  });

  it("uses Magical Cunning to restore half the Pact Magic slots", () => {
    const character = loadCharacter();
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.magical-cunning" },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots).toEqual({ "3": 1 });
    expect(proposal.nextState.expendedResources["srd521.resource.warlock.magical-cunning"]).toBe(1);
    expect(character.state.expendedSpellSlots).toEqual({ "3": 2 });
  });

  it("restores Pact Magic slots on both Short and Long Rests", () => {
    const character = loadCharacter();
    character.state.expendedResources["srd521.resource.warlock.magical-cunning"] = 1;
    const shortRest = proposeRest(
      { character, packages: [loadRulesPackage()] },
      { event: "short-rest" },
    );
    const longRest = proposeRest(
      { character, packages: [loadRulesPackage()] },
      { event: "long-rest" },
    );

    expect(shortRest.nextState.expendedSpellSlots).toEqual({ "3": 0 });
    expect(shortRest.nextState.expendedResources["srd521.resource.warlock.magical-cunning"]).toBe(
      1,
    );
    expect(longRest.nextState.expendedSpellSlots).toEqual({ "3": 0 });
    expect(longRest.nextState.expendedResources["srd521.resource.warlock.magical-cunning"]).toBe(0);
  });

  it("does not restore standard spellcasting slots on a Short Rest", () => {
    const cleric = characterDocumentSchema.parse(
      readJson(new URL("characters/cleric-5.json", fixturesRoot)),
    );
    const before = { ...cleric.state.expendedSpellSlots };
    const proposal = proposeRest(
      { character: cleric, packages: [loadRulesPackage()] },
      { event: "short-rest" },
    );

    expect(proposal.nextState.expendedSpellSlots).toEqual(before);
  });
});
