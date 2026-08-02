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
const authoringIrFiles = [
  "fighting-style.defense.json",
  "ranger.favored-enemy.json",
  "ranger.extra-attack.json",
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
  return characterDocumentSchema.parse(readJson(new URL("characters/ranger-5.json", fixturesRoot)));
}

describe("evaluateCharacter Ranger level-5 vertical slice", () => {
  it("evaluates Hunter spellcasting, Expertise, defenses, mastery, and Favored Enemy", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(44);
    expect(evaluation.values.armorClass?.value).toBe(16);
    expect(evaluation.values["attackAction.attacks"]?.value).toBe(2);
    expect(evaluation.d20Tests["skill.stealth"]).toMatchObject({
      modifier: 9,
      proficiency: { level: "expertise", bonus: 6 },
    });
    expect(evaluation.spellcasting).toMatchObject({
      classId: "srd521.class.ranger",
      ability: "wisdom",
      abilityModifier: 3,
      attackBonus: 6,
      saveDifficultyClass: 14,
      cantripsKnown: 0,
      preparedSpellLimit: 6,
      alwaysPreparedSpells: 1,
      slots: [
        { level: 1, maximum: 4, expended: 1, current: 3 },
        { level: 2, maximum: 2, expended: 1, current: 1 },
      ],
    });
    expect(evaluation.spells).toHaveLength(7);
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.hunter-s-mark"),
    ).toMatchObject({ prepared: true, level: 1, concentration: true });
    expect(evaluation.attacks.find((attack) => attack.id === "attack.longbow-1")).toMatchObject({
      attackBonus: 6,
      mastery: { property: "slow", enabled: true },
    });
    expect(evaluation.resources).toContainEqual(
      expect.objectContaining({
        id: "srd521.resource.ranger.favored-enemy",
        maximum: 3,
        current: 2,
      }),
    );
    expect(
      evaluation.actions.find((action) => action.id === "action.free-hunters-mark"),
    ).toMatchObject({
      available: true,
      actionEconomy: "bonus-action",
      parameters: { spellId: "srd521.spell.hunter-s-mark" },
    });
  });

  it("retains the selected Hunter’s Prey option as structured content", () => {
    const rulesPackage = loadRulesPackage();
    const hunter = rulesPackage.entities.find(
      (entity) => entity.id === "srd521.subclass.ranger.hunter",
    );
    const colossusSlayer = rulesPackage.entities.find(
      (entity) => entity.id === "srd521.option.ranger.hunters-prey.colossus-slayer",
    );

    expect(hunter?.body).toMatchObject({
      huntersPreyChoice: {
        minimum: 1,
        maximum: 1,
        changeOn: ["short-rest", "long-rest"],
      },
    });
    expect(colossusSlayer?.body).toMatchObject({
      extraDamage: { diceCount: 1, diceSize: 8 },
      frequency: "once-per-turn",
    });
  });

  it("validates Ranger subclass, Hunter’s Prey, and Deft Explorer selections", () => {
    const noSubclass = loadCharacter();
    delete noSubclass.build.subclassId;
    const missingChoices = loadCharacter();
    const hunterLevel = missingChoices.build.levels[2];
    if (hunterLevel === undefined) {
      throw new TypeError("The Ranger fixture is missing character level 3.");
    }
    hunterLevel.selectedFeatureChoices = [];
    missingChoices.build.proficiencyChoices.expertise = [];

    const subclassEvaluation = evaluateCharacter({
      character: noSubclass,
      packages: [loadRulesPackage()],
    });
    const choiceEvaluation = evaluateCharacter({
      character: missingChoices,
      packages: [loadRulesPackage()],
    });

    expect(subclassEvaluation.validations.map((message) => message.code)).toContain(
      "RANGER_SUBCLASS_REQUIRED",
    );
    expect(choiceEvaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining([
        "RANGER_HUNTERS_PREY_CHOICE_COUNT",
        "RANGER_DEFT_EXPLORER_EXPERTISE_COUNT",
      ]),
    );
  });

  it("uses a free Hunter’s Mark and starts Concentration atomically", () => {
    const character = loadCharacter();
    character.state.concentrationSpellId = "srd521.spell.detect-magic";
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.free-hunters-mark" },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedResources["srd521.resource.ranger.favored-enemy"]).toBe(2);
    expect(proposal.nextState.concentrationSpellId).toBe("srd521.spell.hunter-s-mark");
    expect(character.state.expendedResources["srd521.resource.ranger.favored-enemy"]).toBe(1);
    expect(character.state.concentrationSpellId).toBe("srd521.spell.detect-magic");
  });

  it("casts a prepared Ranger spell with a spell slot", () => {
    const character = loadCharacter();
    delete character.state.concentrationSpellId;
    const proposal = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.ensnaring-strike", slotLevel: 1 },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots["1"]).toBe(2);
    expect(proposal.nextState.concentrationSpellId).toBe("srd521.spell.ensnaring-strike");
  });

  it("recharges Favored Enemy and spell slots only on a Long Rest", () => {
    const input = { character: loadCharacter(), packages: [loadRulesPackage()] };
    const shortRest = proposeRest(input, { event: "short-rest" });
    const longRest = proposeRest(input, { event: "long-rest" });

    expect(shortRest.nextState.expendedResources["srd521.resource.ranger.favored-enemy"]).toBe(1);
    expect(longRest.nextState.expendedResources["srd521.resource.ranger.favored-enemy"]).toBe(0);
    expect(longRest.nextState.expendedSpellSlots).toEqual({ "1": 0, "2": 0 });
  });
});
