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

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

function loadRulesPackage(): LoadedRulesPackage {
  return {
    manifest: packageManifestSchema.parse(readJson(new URL("manifest.json", packageRoot))),
    entities: contentEntitySchema.array().parse(readJson(new URL("entities.json", packageRoot))),
    authoringIr: [
      "barbarian.rage.json",
      "barbarian.unarmored-defense.json",
      "fighter.second-wind.json",
      "fighting-style.defense.json",
      "origin.savage-attacker.json",
    ].map((file) =>
      authoringIrSchema.parse(readJson(new URL(`authoring-ir/${file}`, packageRoot))),
    ),
  };
}

function loadCharacter(): CharacterDocument {
  return characterDocumentSchema.parse(
    readJson(new URL("characters/fighter-1.json", fixturesRoot)),
  );
}

describe("evaluateCharacter Fighter level-1 vertical slice", () => {
  it("matches the golden Fighter outputs with complete traces", () => {
    const expected = readJson(new URL("expected/fighter-1.json", fixturesRoot)) as {
      values: Record<string, number>;
      selectedArmorClassCandidate: string;
      resource: {
        id: string;
        maximum: number;
        expended: number;
        current: number;
      };
      action: Record<string, unknown>;
      savageAttackerAction: Record<string, unknown>;
      attacks: Record<string, unknown>[];
      validationCodes: string[];
    };
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(
      Object.fromEntries(
        Object.keys(expected.values).map((id) => [id, evaluation.values[id]?.value]),
      ),
    ).toEqual(expected.values);
    expect(evaluation.values.armorClass?.selectedCandidate).toBe(
      expected.selectedArmorClassCandidate,
    );
    expect(evaluation.resources[0]).toMatchObject(expected.resource);
    expect(evaluation.actions.find((action) => action.id === "action.second-wind")).toMatchObject(
      expected.action,
    );
    expect(
      evaluation.actions.find((action) => action.id === "action.savage-attacker"),
    ).toMatchObject(expected.savageAttackerAction);
    expect(evaluation.attacks).toMatchObject(expected.attacks);
    expect(evaluation.validations.map((message) => message.code)).toEqual(expected.validationCodes);
    expect(evaluation.coverageWarnings).toHaveLength(3);

    for (const [id, value] of Object.entries(evaluation.values)) {
      expect(evaluation.traces[value.traceId], `Missing trace for ${id}`).toBeDefined();
      expect(evaluation.traces[value.traceId]?.result).toBe(value.value);
    }
    expect(evaluation.traces.armorClass?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.feat.fighting-style.defense",
          page: 88,
        }),
        expect.objectContaining({
          entityId: "srd521.equipment.armor.heavy.chain-mail",
          page: 92,
        }),
      ]),
    );
    expect(
      evaluation.traces["srd521.resource.fighter.second-wind.current"]?.sourceReferences,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.class-feature.fighter.second-wind",
          page: 48,
        }),
      ]),
    );
    expect(evaluation.traces["speed.walking"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.species.human",
          page: 86,
        }),
      ]),
    );
    expect(evaluation.traces["skill.athletics"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.background.soldier",
          page: 83,
        }),
      ]),
    );
  });

  it("applies Defense only while armor is worn", () => {
    const character = loadCharacter();
    const withoutStyle: CharacterDocument = {
      ...character,
      build: {
        ...character.build,
        featIds: [],
      },
    };
    const unarmored: CharacterDocument = {
      ...character,
      loadout: {
        ...character.loadout,
        equippedItemIds: ["greatsword-1"],
      },
    };

    const noStyleEvaluation = evaluateCharacter({
      character: withoutStyle,
      packages: [loadRulesPackage()],
    });
    const unarmoredEvaluation = evaluateCharacter({
      character: unarmored,
      packages: [loadRulesPackage()],
    });

    expect(noStyleEvaluation.values.armorClass?.value).toBe(16);
    expect(unarmoredEvaluation.values.armorClass?.value).toBe(12);
  });

  it("makes Second Wind unavailable at full HP or with no remaining uses", () => {
    const character = loadCharacter();
    const fullHealth: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        currentHitPoints: 12,
      },
    };
    const depleted: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        expendedResources: {
          "srd521.resource.fighter.second-wind": 2,
        },
      },
    };

    expect(
      evaluateCharacter({
        character: fullHealth,
        packages: [loadRulesPackage()],
      }).actions[0]?.available,
    ).toBe(false);
    expect(
      evaluateCharacter({
        character: depleted,
        packages: [loadRulesPackage()],
      }).actions[0]?.available,
    ).toBe(false);
  });

  it("recharges one Second Wind on a Short Rest and all uses on a Long Rest", () => {
    const character = loadCharacter();
    const depleted: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        expendedResources: {
          "srd521.resource.fighter.second-wind": 2,
        },
      },
    };
    const evaluationInput = {
      character: depleted,
      packages: [loadRulesPackage()],
    };

    const shortRest = proposeRest(evaluationInput, { event: "short-rest" });
    const longRest = proposeRest(evaluationInput, { event: "long-rest" });

    expect(shortRest.nextState.expendedResources["srd521.resource.fighter.second-wind"]).toBe(1);
    expect(longRest.nextState.expendedResources["srd521.resource.fighter.second-wind"]).toBe(0);
    expect(longRest.nextState.currentHitPoints).toBe(12);
    expect(longRest.nextState.heroicInspiration).toBe(true);
    expect(longRest.traces["transition.state.heroicInspiration"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.species.human",
          page: 86,
        }),
      ]),
    );
  });

  it("validates Human and Soldier origin selections", () => {
    const character = loadCharacter();
    const invalid: CharacterDocument = {
      ...character,
      build: {
        ...character.build,
        speciesSize: "large",
        backgroundAbilityScoreIncreases: {
          strength: 1,
          wisdom: 1,
        },
        featIds: ["srd521.feat.fighting-style.defense"],
        proficiencyChoices: {
          ...character.build.proficiencyChoices,
          skills: [
            ...character.build.proficiencyChoices.skills.filter(
              (choice) =>
                choice.sourceId !== "srd521.species.human" &&
                choice.sourceId !== "srd521.feat.origin.skilled",
            ),
            {
              skillId: "srd521.skill.arcana",
              sourceId: "srd521.feat.origin.savage-attacker",
            },
          ],
        },
      },
    };

    const evaluation = evaluateCharacter({
      character: invalid,
      packages: [loadRulesPackage()],
    });
    const codes = evaluation.validations.map((message) => message.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "BACKGROUND_ABILITY_INCREASE_NOT_ALLOWED",
        "BACKGROUND_ABILITY_INCREASE_PATTERN",
        "BACKGROUND_FEAT_MISSING",
        "SPECIES_SIZE_INVALID",
        "SPECIES_ORIGIN_FEAT_COUNT",
        "SPECIES_SKILL_PROFICIENCY_COUNT",
        "SKILL_PROFICIENCY_SOURCE_NOT_GRANTED",
      ]),
    );
  });

  it("rejects repeating a non-repeatable Origin feat", () => {
    const character = loadCharacter();
    const repeated: CharacterDocument = {
      ...character,
      build: {
        ...character.build,
        featIds: [
          "srd521.feat.fighting-style.defense",
          "srd521.feat.origin.savage-attacker",
          "srd521.feat.origin.savage-attacker",
        ],
        proficiencyChoices: {
          ...character.build.proficiencyChoices,
          skills: character.build.proficiencyChoices.skills.filter(
            (choice) => choice.sourceId !== "srd521.feat.origin.skilled",
          ),
        },
      },
    };

    const evaluation = evaluateCharacter({
      character: repeated,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((message) => message.code)).toContain("FEAT_NOT_REPEATABLE");
  });

  it("proposes Second Wind healing and resource spending atomically", () => {
    const character = loadCharacter();
    const proposal = proposeAction(
      {
        character,
        packages: [loadRulesPackage()],
      },
      {
        actionId: "action.second-wind",
        rolls: [2],
      },
    );
    const invalid = proposeAction(
      {
        character,
        packages: [loadRulesPackage()],
      },
      {
        actionId: "action.second-wind",
        rolls: [11],
      },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.currentHitPoints).toBe(10);
    expect(proposal.nextState.expendedResources["srd521.resource.fighter.second-wind"]).toBe(2);
    expect(proposal.changes.map((change) => change.path)).toEqual(
      expect.arrayContaining([
        "state.currentHitPoints",
        "state.expendedResources.srd521.resource.fighter.second-wind",
      ]),
    );
    expect(character.state.currentHitPoints).toBe(7);
    expect(invalid.applicable).toBe(false);
    expect(invalid.changes).toEqual([]);
    expect(invalid.nextState).toEqual(character.state);
    expect(invalid.validations.map((message) => message.code)).toContain(
      "ACTION_ROLL_OUT_OF_RANGE",
    );
  });

  it("is deterministic", () => {
    const input = {
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    };

    expect(evaluateCharacter(input)).toEqual(evaluateCharacter(input));
  });
});
