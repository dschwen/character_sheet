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
  "cleric.channel-divinity.json",
  "life-domain.preserve-life.json",
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
  return characterDocumentSchema.parse(readJson(new URL("characters/cleric-5.json", fixturesRoot)));
}

describe("evaluateCharacter Cleric levels 1–6 vertical slice", () => {
  function levelSixInput() {
    const character = loadCharacter();
    character.build.levels.push({
      characterLevel: 6,
      classId: "srd521.class.cleric",
      hitPointChoice: "fixed",
      selectedFeatureChoices: [],
    });
    character.loadout.preparedSpellIds.push("srd521.spell.command");
    character.state.currentHitPoints = 10;
    return { character, packages: [loadRulesPackage()] };
  }

  it("heals the caster only after a slotted spell restores HP to another creature", () => {
    const input = levelSixInput();
    const evaluation = evaluateCharacter(input);
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.slots).toMatchObject([
      { maximum: 4 },
      { maximum: 3 },
      { maximum: 3 },
    ]);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.cleric.channel-divinity")
        ?.maximum,
    ).toBe(3);
    expect(evaluation.spells.find(({ id }) => id === "srd521.spell.cure-wounds")?.healing).toEqual([
      { diceCount: 2, diceSize: 8, addSpellcastingModifier: true, dicePerSlotLevel: 2 },
    ]);
    const cast = proposeSpellCast(input, {
      spellId: "srd521.spell.cure-wounds",
      slotLevel: 3,
      restoresHitPointsToOther: true,
    });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.currentHitPoints).toBe(15);
    expect(cast.nextState.expendedSpellSlots["3"]).toBe(2);
    expect(cast.traces["transition.spell-cast.state.currentHitPoints"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.subclass-feature.cleric.life-domain.blessed-healer",
        }),
      ]),
    );
    expect(
      proposeSpellCast(input, { spellId: "srd521.spell.cure-wounds", slotLevel: 1 }).nextState
        .currentHitPoints,
    ).toBe(10);
    expect(
      proposeSpellCast(input, {
        spellId: "srd521.spell.bless",
        slotLevel: 1,
        restoresHitPointsToOther: true,
      }).nextState.currentHitPoints,
    ).toBe(10);
  });

  it("caps Blessed Healer at maximum HP and never heals on a rejected cast", () => {
    const input = levelSixInput();
    input.character.state.currentHitPoints = 44;
    const cast = proposeSpellCast(input, {
      spellId: "srd521.spell.healing-word",
      slotLevel: 1,
      restoresHitPointsToOther: true,
    });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.currentHitPoints).toBe(45);
    input.character.state.expendedSpellSlots["1"] = 4;
    const rejected = proposeSpellCast(input, {
      spellId: "srd521.spell.healing-word",
      slotLevel: 1,
      restoresHitPointsToOther: true,
    });
    expect(rejected.applicable).toBe(false);
    expect(rejected.nextState).toEqual(input.character.state);
    expect(rejected.changes).toEqual([]);
  });

  it("does not grant Blessed Healer below level 6", () => {
    const character = loadCharacter();
    character.state.currentHitPoints = 10;
    const cast = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.cure-wounds", slotLevel: 1, restoresHitPointsToOther: true },
    );
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.currentHitPoints).toBe(10);
  });
  it("evaluates prepared divine spellcasting, Life Domain spells, and Channel Divinity", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(38);
    expect(evaluation.values.armorClass?.value).toBe(18);
    expect(evaluation.spellcasting).toMatchObject({
      classId: "srd521.class.cleric",
      ability: "wisdom",
      abilityModifier: 3,
      attackBonus: 6,
      saveDifficultyClass: 14,
      cantripsKnown: 4,
      preparedSpellLimit: 9,
      alwaysPreparedSpells: 6,
      slots: [
        { level: 1, maximum: 4, expended: 2, current: 2 },
        { level: 2, maximum: 3, expended: 1, current: 2 },
        { level: 3, maximum: 2, expended: 1, current: 1 },
      ],
    });
    expect(evaluation.spellcasting?.spellbookMinimum).toBeUndefined();
    expect(evaluation.spells).toHaveLength(19);
    expect(evaluation.spells.filter((spell) => spell.prepared)).toHaveLength(15);
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.cure-wounds"),
    ).toMatchObject({
      prepared: true,
      level: 1,
      sources: [expect.objectContaining({ page: 121 })],
    });
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.spirit-guardians"),
    ).toMatchObject({ prepared: true, concentration: true });
    expect(evaluation.spells.find((spell) => spell.id === "srd521.spell.bless")).toMatchObject({
      appliedStatuses: [
        {
          statusId: "srd521.status.spell.bless",
          statusName: "Blessed",
          target: "target",
        },
      ],
    });
    expect(evaluation.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.resource.cleric.channel-divinity",
          maximum: 2,
          expended: 1,
          current: 1,
        }),
      ]),
    );
    expect(evaluation.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(["action.divine-spark", "action.turn-undead", "action.preserve-life"]),
    );
    for (const derived of Object.values(evaluation.values)) {
      expect(evaluation.traces[derived.traceId]?.result).toBe(derived.value);
    }
  });

  it("validates Divine Order and full-list preparation independently from learned cantrips", () => {
    const character = loadCharacter();
    const firstLevel = character.build.levels[0];
    if (firstLevel === undefined) {
      throw new Error("Cleric fixture requires a first level");
    }
    firstLevel.selectedFeatureChoices = [];
    character.build.learnedSpellIds.push("srd521.spell.bless");
    character.loadout.preparedSpellIds = character.loadout.preparedSpellIds.slice(0, 8);

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining([
        "CLERIC_DIVINE_ORDER_CHOICE_COUNT",
        "CLERIC_LEVELED_SPELL_RECORDED_AS_LEARNED",
        "CLERIC_PREPARED_SPELL_COUNT",
      ]),
    );
  });

  it("casts a prepared spell and spends Channel Divinity atomically", () => {
    const character = loadCharacter();
    delete character.state.concentrationSpellId;
    const cast = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.spirit-guardians", slotLevel: 3 },
    );
    const channel = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.turn-undead" },
    );

    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots["3"]).toBe(2);
    expect(cast.nextState.concentrationSpellId).toBe("srd521.spell.spirit-guardians");
    expect(channel.applicable).toBe(true);
    expect(channel.nextState.expendedResources["srd521.resource.cleric.channel-divinity"]).toBe(2);
  });

  it("recharges Channel Divinity on a Short Rest and all slots on a Long Rest", () => {
    const input = { character: loadCharacter(), packages: [loadRulesPackage()] };
    const shortRest = proposeRest(input, { event: "short-rest" });
    const longRest = proposeRest(input, { event: "long-rest" });

    expect(shortRest.nextState.expendedResources["srd521.resource.cleric.channel-divinity"]).toBe(
      0,
    );
    expect(longRest.nextState.expendedSpellSlots).toEqual({ "1": 0, "2": 0, "3": 0 });
    expect(longRest.nextState.concentrationSpellId).toBeUndefined();
  });
});
