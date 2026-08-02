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
  "druid.wild-shape.json",
  "druid.wild-companion.json",
  "circle-of-the-land.lands-aid.json",
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
  return characterDocumentSchema.parse(readJson(new URL("characters/druid-5.json", fixturesRoot)));
}

describe("evaluateCharacter Druid level-5 vertical slice", () => {
  it("evaluates prepared primal spellcasting, land spells, and Wild Shape", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(38);
    expect(evaluation.values.armorClass?.value).toBe(15);
    expect(evaluation.spellcasting).toMatchObject({
      classId: "srd521.class.druid",
      ability: "wisdom",
      abilityModifier: 3,
      attackBonus: 6,
      saveDifficultyClass: 14,
      cantripsKnown: 3,
      preparedSpellLimit: 9,
      alwaysPreparedSpells: 5,
      slots: [
        { level: 1, maximum: 4, expended: 1, current: 3 },
        { level: 2, maximum: 3, expended: 1, current: 2 },
        { level: 3, maximum: 2, expended: 1, current: 1 },
      ],
    });
    expect(evaluation.spells).toHaveLength(17);
    expect(evaluation.spells.filter((spell) => spell.prepared)).toHaveLength(14);
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.speak-with-animals"),
    ).toMatchObject({ prepared: true, ritual: true });
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.sleet-storm"),
    ).toMatchObject({ prepared: true, level: 3, concentration: true });
    expect(evaluation.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.resource.druid.wild-shape",
          maximum: 2,
          expended: 1,
          current: 1,
        }),
      ]),
    );
    expect(evaluation.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(["action.wild-shape", "action.wild-companion", "action.lands-aid"]),
    );
  });

  it("validates Primal Order, land type, and full-list spell choices", () => {
    const character = loadCharacter();
    const firstLevel = character.build.levels[0];
    const thirdLevel = character.build.levels[2];
    if (firstLevel === undefined || thirdLevel === undefined) {
      throw new Error("Druid fixture requires levels 1 and 3");
    }
    firstLevel.selectedFeatureChoices = [];
    thirdLevel.selectedFeatureChoices = [];
    character.build.learnedSpellIds.push("srd521.spell.entangle");
    character.loadout.preparedSpellIds = character.loadout.preparedSpellIds.slice(0, 8);

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining([
        "DRUID_PRIMAL_ORDER_CHOICE_COUNT",
        "DRUID_CIRCLE_LAND_CHOICE_COUNT",
        "DRUID_LEVELED_SPELL_RECORDED_AS_LEARNED",
        "DRUID_PREPARED_SPELL_COUNT",
      ]),
    );
  });

  it("applies the Magician cantrip grant as the alternate Primal Order", () => {
    const character = loadCharacter();
    const firstLevel = character.build.levels[0];
    const armor = character.loadout.inventory.find((item) => item.id === "chain-shirt-1");
    if (firstLevel?.selectedFeatureChoices?.[0] === undefined || armor === undefined) {
      throw new Error("Druid fixture requires its Primal Order and armor");
    }
    firstLevel.selectedFeatureChoices[0].optionIds = ["srd521.option.druid.primal-order.magician"];
    character.build.learnedSpellIds.push("srd521.spell.guidance");
    armor.entityId = "srd521.equipment.armor.light.leather-armor";

    const evaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.cantripsKnown).toBe(4);
  });

  it("casts a spell and spends Wild Shape through each supported action", () => {
    const character = loadCharacter();
    delete character.state.concentrationSpellId;
    const cast = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.call-lightning", slotLevel: 3 },
    );
    const wildShape = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.wild-shape" },
    );
    const landsAid = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.lands-aid" },
    );

    expect(cast.applicable).toBe(true);
    expect(cast.nextState.concentrationSpellId).toBe("srd521.spell.call-lightning");
    expect(wildShape.applicable).toBe(true);
    expect(landsAid.applicable).toBe(true);
    expect(wildShape.nextState.expendedResources["srd521.resource.druid.wild-shape"]).toBe(2);
  });

  it("restores one Wild Shape on a Short Rest and all resources on a Long Rest", () => {
    const input = { character: loadCharacter(), packages: [loadRulesPackage()] };
    const shortRest = proposeRest(input, { event: "short-rest" });
    const longRest = proposeRest(input, { event: "long-rest" });

    expect(shortRest.nextState.expendedResources["srd521.resource.druid.wild-shape"]).toBe(0);
    expect(longRest.nextState.expendedSpellSlots).toEqual({ "1": 0, "2": 0, "3": 0 });
    expect(longRest.nextState.concentrationSpellId).toBeUndefined();
  });
});
