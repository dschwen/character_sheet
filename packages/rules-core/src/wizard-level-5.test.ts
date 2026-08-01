import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

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
  };
}

function loadCharacter(): CharacterDocument {
  return characterDocumentSchema.parse(readJson(new URL("characters/wizard-5.json", fixturesRoot)));
}

describe("evaluateCharacter Wizard level-5 vertical slice", () => {
  it("evaluates spellcasting, preparation, spellbook, and slots with traces", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting).toMatchObject({
      classId: "srd521.class.wizard",
      ability: "intelligence",
      abilityModifier: 3,
      attackBonus: 6,
      saveDifficultyClass: 14,
      cantripsKnown: 4,
      preparedSpellLimit: 9,
      alwaysPreparedSpells: 0,
      spellbookMinimum: 14,
      slots: [
        { level: 1, maximum: 4, expended: 2, current: 2 },
        { level: 2, maximum: 3, expended: 1, current: 2 },
        { level: 3, maximum: 2, expended: 1, current: 1 },
      ],
    });
    expect(evaluation.spells).toHaveLength(18);
    expect(evaluation.spells.filter((spell) => spell.level === 0)).toHaveLength(4);
    expect(evaluation.spells.filter((spell) => spell.prepared)).toHaveLength(9);
    expect(evaluation.spells.find((spell) => spell.id === "srd521.spell.fireball")).toMatchObject({
      level: 3,
      school: "evocation",
      concentration: false,
      savingThrows: ["dexterity"],
      sources: [expect.objectContaining({ page: 131 })],
    });
    expect(evaluation.spells.find((spell) => spell.id === "srd521.spell.web")).toMatchObject({
      prepared: true,
      concentration: true,
      sources: [expect.objectContaining({ page: 174 })],
    });
    const attackTrace = evaluation.traces[evaluation.spellcasting?.attackTraceId ?? ""];
    expect(attackTrace?.result).toBe(6);
    expect(attackTrace?.sourceReferences.map((source) => source.page)).toContain(77);
    expect(evaluation.traces[evaluation.spellcasting?.saveTraceId ?? ""]?.result).toBe(14);
    for (const slot of evaluation.spellcasting?.slots ?? []) {
      expect(evaluation.traces[slot.traceId]?.result).toBe(slot.current);
    }
    for (const derived of Object.values(evaluation.values)) {
      expect(evaluation.traces[derived.traceId]?.result).toBe(derived.value);
    }
  });

  it("validates spellbook, preparation, slots, and concentration selections", () => {
    const character = loadCharacter();
    character.build.learnedSpellIds = character.build.learnedSpellIds.filter(
      (spellId) => spellId !== "srd521.spell.web",
    );
    character.loadout.preparedSpellIds = [
      ...character.loadout.preparedSpellIds,
      "srd521.spell.ray-of-frost",
    ];
    character.state.expendedSpellSlots["3"] = 3;
    character.state.concentrationSpellId = "srd521.spell.fireball";

    const evaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((validation) => validation.code)).toEqual(
      expect.arrayContaining([
        "SPELL_SLOTS_EXPENDED_ABOVE_MAXIMUM",
        "PREPARED_SPELL_NOT_IN_SPELLBOOK",
        "CANTRIP_CANNOT_BE_PREPARED",
        "WIZARD_PREPARED_SPELL_COUNT",
        "WIZARD_SPELLBOOK_BELOW_MINIMUM",
        "CONCENTRATION_SPELL_INVALID",
      ]),
    );
  });

  it("restores all spell slots and ends concentration on a Long Rest", () => {
    const proposal = proposeRest(
      { character: loadCharacter(), packages: [loadRulesPackage()] },
      { event: "long-rest" },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots).toEqual({ "1": 0, "2": 0, "3": 0 });
    expect(proposal.nextState.concentrationSpellId).toBeUndefined();
    expect(proposal.changes.map((change) => change.path)).toEqual(
      expect.arrayContaining([
        "state.expendedSpellSlots.1",
        "state.expendedSpellSlots.2",
        "state.expendedSpellSlots.3",
        "state.concentrationSpellId",
      ]),
    );
  });

  it("spends a slot and starts Concentration as one spell-cast proposal", () => {
    const character = loadCharacter();
    delete character.state.concentrationSpellId;
    const proposal = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.web", slotLevel: 2 },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots["2"]).toBe(2);
    expect(proposal.nextState.concentrationSpellId).toBe("srd521.spell.web");
    expect(proposal.changes.map((change) => change.path)).toEqual([
      "state.expendedSpellSlots.2",
      "state.concentrationSpellId",
    ]);
    expect(
      Object.values(proposal.traces).every((trace) => trace.sourceReferences[0]?.page === 174),
    ).toBe(true);
  });

  it("allows Wizard ritual casting without preparation or a slot", () => {
    const character = loadCharacter();
    character.loadout.preparedSpellIds = character.loadout.preparedSpellIds.filter(
      (spellId) => spellId !== "srd521.spell.detect-magic",
    );
    character.loadout.preparedSpellIds.push("srd521.spell.burning-hands");
    const ritual = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.detect-magic", asRitual: true },
    );
    const invalid = proposeSpellCast(
      { character, packages: [loadRulesPackage()] },
      { spellId: "srd521.spell.fireball", slotLevel: 2 },
    );

    expect(ritual.applicable).toBe(true);
    expect(ritual.nextState.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
    expect(ritual.nextState.concentrationSpellId).toBe("srd521.spell.detect-magic");
    expect(invalid.applicable).toBe(false);
    expect(invalid.validations.map((validation) => validation.code)).toContain(
      "SPELL_SLOT_LEVEL_INVALID",
    );
  });
});
