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
  "monk.unarmored-defense.json",
  "monk.focus.json",
  "monk.deflect-attacks.json",
  "monk.extra-attack.json",
  "monk.stunning-strike.json",
  "monk.wholeness-of-body.json",
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
  return characterDocumentSchema.parse(readJson(new URL("characters/monk-5.json", fixturesRoot)));
}

describe("evaluateCharacter Monk levels 1–6 vertical slice", () => {
  function levelSixCharacter(): CharacterDocument {
    const character = loadCharacter();
    character.build.levels.push({
      characterLevel: 6,
      classId: "srd521.class.monk",
      hitPointChoice: "fixed",
      selectedFeatureChoices: [],
    });
    character.state.currentHitPoints = 10;
    return character;
  }

  it("grants level-6 healing and optional Force damage only for Unarmed Strikes", () => {
    const character = levelSixCharacter();
    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });
    expect(evaluation.validations).toEqual([]);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.monk.wholeness-of-body"),
    ).toMatchObject({ maximum: 2, current: 2 });
    expect(
      evaluation.attacks.find(({ id }) => id === "attack.unarmed-strike")?.damage,
    ).toMatchObject({ type: "bludgeoning", alternativeTypes: ["force"] });
    expect(
      evaluation.attacks.find(({ id }) => id === "attack.spear-1")?.damage.alternativeTypes,
    ).toBeUndefined();
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.wholeness-of-body", rolls: [8] },
    );
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.currentHitPoints).toBe(20);
    expect(proposal.nextState.expendedResources["srd521.resource.monk.wholeness-of-body"]).toBe(1);
    expect(proposal.nextState.expendedResources["srd521.resource.monk.focus-points"]).toBe(2);
  });

  it("validates healing rolls, exhaustion, and the conscious-use requirement atomically", () => {
    const character = levelSixCharacter();
    for (const rolls of [[], [9], [1, 1]]) {
      const proposal = proposeAction(
        { character, packages: [loadRulesPackage()] },
        { actionId: "action.wholeness-of-body", rolls },
      );
      expect(proposal.applicable).toBe(false);
      expect(proposal.nextState).toEqual(character.state);
    }
    character.state.expendedResources["srd521.resource.monk.wholeness-of-body"] = 2;
    expect(
      proposeAction(
        { character, packages: [loadRulesPackage()] },
        { actionId: "action.wholeness-of-body", rolls: [1] },
      ).applicable,
    ).toBe(false);
    character.state.expendedResources["srd521.resource.monk.wholeness-of-body"] = 0;
    character.state.currentHitPoints = 0;
    expect(
      proposeAction(
        { character, packages: [loadRulesPackage()] },
        { actionId: "action.wholeness-of-body", rolls: [1] },
      ).applicable,
    ).toBe(false);
  });

  it("caps healing at maximum HP and recharges uses only on Long Rest", () => {
    const character = levelSixCharacter();
    character.state.currentHitPoints = 44;
    character.state.expendedResources["srd521.resource.monk.wholeness-of-body"] = 1;
    const input = { character, packages: [loadRulesPackage()] };
    expect(
      proposeAction(input, { actionId: "action.wholeness-of-body", rolls: [8] }).nextState
        .currentHitPoints,
    ).toBe(45);
    expect(
      proposeRest(input, { event: "short-rest" }).nextState.expendedResources[
        "srd521.resource.monk.wholeness-of-body"
      ],
    ).toBe(1);
    expect(
      proposeRest(input, { event: "long-rest" }).nextState.expendedResources[
        "srd521.resource.monk.wholeness-of-body"
      ],
    ).toBe(0);
  });

  it("guarantees one use and at least one healed HP with a negative Wisdom modifier", () => {
    const character = levelSixCharacter();
    character.build.abilityScores.wisdom = 8;
    const input = { character, packages: [loadRulesPackage()] };
    const evaluation = evaluateCharacter(input);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.monk.wholeness-of-body")
        ?.maximum,
    ).toBe(1);
    const proposal = proposeAction(input, { actionId: "action.wholeness-of-body", rolls: [1] });
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.currentHitPoints).toBe(11);
  });

  it("retains Empowered Strikes when armor disables Martial Arts", () => {
    const character = levelSixCharacter();
    character.loadout.inventory.push({
      id: "leather-1",
      entityId: "srd521.equipment.armor.light.leather-armor",
      quantity: 1,
    });
    character.loadout.equippedItemIds.push("leather-1");
    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });
    expect(
      evaluation.attacks.find(({ id }) => id === "attack.unarmed-strike")?.damage,
    ).toMatchObject({ flat: 1, type: "bludgeoning", alternativeTypes: ["force"] });
    expect(
      evaluation.actions.find(({ id }) => id === "action.wholeness-of-body")?.parameters?.healing,
    ).toMatchObject({ diceCount: 1, diceSize: 8 });
  });
  it("evaluates Martial Arts, Unarmored Defense, movement, Focus, and Extra Attack", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(38);
    expect(evaluation.values.armorClass).toMatchObject({
      value: 16,
      selectedCandidate: "monk-unarmored-defense",
    });
    expect(evaluation.values["speed.walking"]?.value).toBe(40);
    expect(evaluation.values["speed.unarmoredMovement"]?.value).toBe(10);
    expect(evaluation.values["classFeature.monk.saveDifficultyClass"]?.value).toBe(13);
    expect(evaluation.values["attackAction.attacks"]?.value).toBe(2);
    expect(evaluation.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.resource.monk.focus-points",
          maximum: 5,
          expended: 2,
          current: 3,
        }),
      ]),
    );
    const spear = evaluation.attacks.find((attack) => attack.id === "attack.spear-1");
    const unarmed = evaluation.attacks.find((attack) => attack.id === "attack.unarmed-strike");
    expect(spear).toMatchObject({ id: "attack.spear-1", ability: "dexterity", attackBonus: 7 });
    expect(spear?.damage).toMatchObject({ diceCount: 1, diceSize: 8, bonus: 4 });
    expect(unarmed).toMatchObject({
      id: "attack.unarmed-strike",
      ability: "dexterity",
      attackBonus: 7,
    });
    expect(unarmed?.damage).toMatchObject({ diceCount: 1, diceSize: 8, bonus: 4 });
    expect(evaluation.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "action.flurry-of-blows",
        "action.patient-defense",
        "action.step-of-the-wind",
        "action.deflect-attacks-redirect",
        "action.stunning-strike",
      ]),
    );
  });

  it("disables Monk defenses and movement when armor and a Shield are equipped", () => {
    const character = loadCharacter();
    character.loadout.inventory.push(
      {
        id: "leather-1",
        entityId: "srd521.equipment.armor.light.leather-armor",
        quantity: 1,
      },
      { id: "shield-1", entityId: "srd521.equipment.shield", quantity: 1 },
    );
    character.loadout.equippedItemIds.push("leather-1", "shield-1");

    const evaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.values["speed.walking"]?.value).toBe(30);
    expect(evaluation.values["speed.unarmoredMovement"]?.value).toBe(0);
    expect(
      evaluation.attacks.find((attack) => attack.id === "attack.unarmed-strike")?.damage,
    ).toMatchObject({ flat: 1, bonus: -1 });
    expect(evaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining(["ARMOR_TRAINING_MISSING", "SHIELD_TRAINING_MISSING"]),
    );
  });

  it("validates the level-3 subclass requirement", () => {
    const character = loadCharacter();
    delete character.build.subclassId;

    const evaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((message) => message.code)).toContain(
      "MONK_SUBCLASS_REQUIRED",
    );
  });

  it("spends Focus atomically for Flurry of Blows and Stunning Strike", () => {
    const input = { character: loadCharacter(), packages: [loadRulesPackage()] };
    const flurry = proposeAction(input, { actionId: "action.flurry-of-blows" });
    const stunningStrike = proposeAction(input, { actionId: "action.stunning-strike" });

    expect(flurry.applicable).toBe(true);
    expect(stunningStrike.applicable).toBe(true);
    expect(flurry.nextState.expendedResources["srd521.resource.monk.focus-points"]).toBe(3);
    expect(stunningStrike.nextState.expendedResources["srd521.resource.monk.focus-points"]).toBe(3);
  });

  it("restores all Focus Points on either rest", () => {
    const input = { character: loadCharacter(), packages: [loadRulesPackage()] };
    const shortRest = proposeRest(input, { event: "short-rest" });
    const longRest = proposeRest(input, { event: "long-rest" });

    expect(shortRest.nextState.expendedResources["srd521.resource.monk.focus-points"]).toBe(0);
    expect(longRest.nextState.expendedResources["srd521.resource.monk.focus-points"]).toBe(0);
  });
});
