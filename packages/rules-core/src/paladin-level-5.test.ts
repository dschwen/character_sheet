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
  "paladin.lay-on-hands.json",
  "paladin.channel-divinity.json",
  "oath-of-devotion.sacred-weapon.json",
  "paladin.smite.json",
  "paladin.extra-attack.json",
  "paladin.faithful-steed.json",
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
    readJson(new URL("characters/paladin-5.json", fixturesRoot)),
  );
}

describe("evaluateCharacter Paladin level-5 vertical slice", () => {
  it("evaluates Oath spellcasting, defenses, weapon mastery, and feature resources", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(44);
    expect(evaluation.values.armorClass?.value).toBe(19);
    expect(evaluation.values["attackAction.attacks"]?.value).toBe(2);
    expect(evaluation.spellcasting).toMatchObject({
      classId: "srd521.class.paladin",
      ability: "charisma",
      abilityModifier: 3,
      attackBonus: 6,
      saveDifficultyClass: 14,
      cantripsKnown: 0,
      preparedSpellLimit: 6,
      alwaysPreparedSpells: 6,
      slots: [
        { level: 1, maximum: 4, expended: 2, current: 2 },
        { level: 2, maximum: 2, expended: 1, current: 1 },
      ],
    });
    expect(evaluation.spells).toHaveLength(12);
    expect(evaluation.spells.every((spell) => spell.prepared)).toBe(true);
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.divine-smite"),
    ).toMatchObject({ prepared: true, level: 1 });
    expect(evaluation.spells.find((spell) => spell.id === "srd521.spell.find-steed")).toMatchObject(
      { prepared: true, level: 2 },
    );
    expect(evaluation.attacks.find((attack) => attack.id === "attack.longsword-1")).toMatchObject({
      attackBonus: 6,
      mastery: { property: "sap", enabled: true },
    });
    expect(evaluation.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.resource.paladin.lay-on-hands",
          maximum: 25,
          current: 15,
        }),
        expect.objectContaining({
          id: "srd521.resource.paladin.channel-divinity",
          maximum: 2,
          current: 1,
        }),
        expect.objectContaining({
          id: "srd521.resource.paladin.free-divine-smite",
          maximum: 1,
          current: 0,
        }),
        expect.objectContaining({
          id: "srd521.resource.paladin.free-find-steed",
          maximum: 1,
          current: 1,
        }),
      ]),
    );
    expect(
      evaluation.actions.find((action) => action.id === "action.free-divine-smite")?.available,
    ).toBe(false);
    expect(
      evaluation.actions.find((action) => action.id === "action.free-find-steed")?.available,
    ).toBe(true);
  });

  it("validates Paladin subclass and prepared-spell choices", () => {
    const character = loadCharacter();
    delete character.build.subclassId;
    character.loadout.preparedSpellIds = character.loadout.preparedSpellIds.slice(0, 5);

    const evaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining(["PALADIN_SUBCLASS_REQUIRED", "PALADIN_PREPARED_SPELL_COUNT"]),
    );
  });

  it("spends a requested Lay On Hands amount and heals atomically", () => {
    const character = loadCharacter();
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.lay-on-hands", amount: 7 },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.currentHitPoints).toBe(39);
    expect(proposal.nextState.expendedResources["srd521.resource.paladin.lay-on-hands"]).toBe(17);
    expect(character.state.currentHitPoints).toBe(32);
  });

  it("rejects Lay On Hands spending above the remaining pool", () => {
    const proposal = proposeAction(
      { character: loadCharacter(), packages: [loadRulesPackage()] },
      { actionId: "action.lay-on-hands", amount: 16 },
    );

    expect(proposal.applicable).toBe(false);
    expect(proposal.validations.map((message) => message.code)).toContain(
      "ACTION_RESOURCE_AMOUNT_INSUFFICIENT",
    );
  });

  it("spends Channel Divinity and casts a prepared spell", () => {
    const character = loadCharacter();
    delete character.state.concentrationSpellId;
    const sacredWeapon = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.sacred-weapon" },
    );
    const cast = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.heroism", slotLevel: 1 },
    );

    expect(sacredWeapon.applicable).toBe(true);
    expect(
      sacredWeapon.nextState.expendedResources["srd521.resource.paladin.channel-divinity"],
    ).toBe(2);
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.concentrationSpellId).toBe("srd521.spell.heroism");
  });

  it("recharges Paladin resources and spell slots on rests", () => {
    const input = { character: loadCharacter(), packages: [loadRulesPackage()] };
    const shortRest = proposeRest(input, { event: "short-rest" });
    const longRest = proposeRest(input, { event: "long-rest" });

    expect(shortRest.nextState.expendedResources["srd521.resource.paladin.channel-divinity"]).toBe(
      0,
    );
    expect(shortRest.nextState.expendedResources["srd521.resource.paladin.lay-on-hands"]).toBe(10);
    expect(longRest.nextState.expendedResources["srd521.resource.paladin.lay-on-hands"]).toBe(0);
    expect(longRest.nextState.expendedResources["srd521.resource.paladin.free-divine-smite"]).toBe(
      0,
    );
    expect(longRest.nextState.expendedSpellSlots).toEqual({ "1": 0, "2": 0 });
  });
});
