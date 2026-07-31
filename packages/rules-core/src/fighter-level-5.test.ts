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
  "fighter.second-wind.json",
  "fighting-style.defense.json",
  "origin.savage-attacker.json",
  "fighter.action-surge.json",
  "fighter.tactical-mind.json",
  "fighter.extra-attack.json",
  "fighter.tactical-shift.json",
  "champion.improved-critical.json",
  "champion.remarkable-athlete.json",
  "feat.ability-score-improvement.json",
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
    readJson(new URL("characters/fighter-5.json", fixturesRoot)),
  );
}

describe("evaluateCharacter Fighter level-5 vertical slice", () => {
  it("matches the reviewed level-5 golden outputs and traces", () => {
    const expected = readJson(new URL("expected/fighter-5.json", fixturesRoot)) as {
      values: Record<string, number>;
      rollModes: Record<string, string>;
      actions: Record<string, Record<string, unknown>>;
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
    expect(
      Object.fromEntries(
        Object.keys(expected.rollModes).map((id) => [id, evaluation.d20Tests[id]?.rollMode]),
      ),
    ).toEqual(expected.rollModes);
    for (const [actionId, action] of Object.entries(expected.actions)) {
      expect(evaluation.actions.find((candidate) => candidate.id === actionId)).toMatchObject(
        action,
      );
    }
    expect(evaluation.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.resource.fighter.second-wind",
          maximum: 3,
          current: 2,
        }),
        expect.objectContaining({
          id: "srd521.resource.fighter.action-surge",
          maximum: 1,
          current: 1,
        }),
      ]),
    );
    expect(evaluation.attacks).toHaveLength(4);
    expect(evaluation.attacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          weaponId: "srd521.equipment.weapon.greatsword",
          criticalHitThreshold: 19,
          mastery: { property: "graze", enabled: true },
        }),
        expect.objectContaining({
          weaponId: "srd521.equipment.weapon.longbow",
          criticalHitThreshold: 19,
          mastery: { property: "slow", enabled: true },
        }),
      ]),
    );
    expect(evaluation.validations.map((message) => message.code)).toEqual(expected.validationCodes);
    expect(evaluation.coverageWarnings).toHaveLength(10);

    for (const [id, value] of Object.entries(evaluation.values)) {
      expect(evaluation.traces[value.traceId], `Missing trace for ${id}`).toBeDefined();
      expect(evaluation.traces[value.traceId]?.result).toBe(value.value);
    }
    expect(evaluation.traces.initiative?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.subclass-feature.fighter.champion.remarkable-athlete",
          page: 49,
        }),
      ]),
    );
    expect(evaluation.traces["weaponAttacks.criticalHitThreshold"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.subclass-feature.fighter.champion.improved-critical",
          page: 49,
        }),
      ]),
    );
    expect(evaluation.traces["attackAction.attacks"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.class-feature.fighter.extra-attack",
          page: 48,
        }),
      ]),
    );
  });

  it("spends Action Surge atomically without requiring a roll", () => {
    const character = loadCharacter();
    const input = { character, packages: [loadRulesPackage()] };

    const proposal = proposeAction(input, { actionId: "action.action-surge" });
    const invalid = proposeAction(input, {
      actionId: "action.action-surge",
      rolls: [1],
    });

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedResources["srd521.resource.fighter.action-surge"]).toBe(1);
    expect(proposal.changes.map((change) => change.path)).toEqual([
      "state.expendedResources.srd521.resource.fighter.action-surge",
    ]);
    expect(character.state.expendedResources["srd521.resource.fighter.action-surge"]).toBe(0);
    expect(invalid.applicable).toBe(false);
    expect(invalid.changes).toEqual([]);
    expect(invalid.validations.map((message) => message.code)).toContain(
      "ACTION_ROLLS_NOT_EXPECTED",
    );
  });

  it("recharges Action Surge and the scaled Second Wind resource", () => {
    const character = loadCharacter();
    const depleted: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        expendedResources: {
          "srd521.resource.fighter.second-wind": 3,
          "srd521.resource.fighter.action-surge": 1,
        },
      },
    };
    const input = { character: depleted, packages: [loadRulesPackage()] };

    const shortRest = proposeRest(input, { event: "short-rest" });
    const longRest = proposeRest(input, { event: "long-rest" });

    expect(shortRest.nextState.expendedResources).toMatchObject({
      "srd521.resource.fighter.second-wind": 2,
      "srd521.resource.fighter.action-surge": 0,
    });
    expect(longRest.nextState.expendedResources).toMatchObject({
      "srd521.resource.fighter.second-wind": 0,
      "srd521.resource.fighter.action-surge": 0,
    });
  });

  it("keeps Tactical Mind roll-assisted until the check outcome is known", () => {
    const character = loadCharacter();
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.tactical-mind", rolls: [6] },
    );

    expect(proposal.applicable).toBe(false);
    expect(proposal.changes).toEqual([]);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.validations.map((message) => message.code)).toContain(
      "ACTION_TRANSITION_UNSUPPORTED",
    );
  });

  it("validates subclass, feat, ability increase, and mastery level gates", () => {
    const character = loadCharacter();
    const premature: CharacterDocument = {
      ...character,
      build: {
        ...character.build,
        levels: character.build.levels.slice(0, 2),
        featAbilityScoreIncreases: {
          strength: 1,
        },
      },
    };
    const missingSubclass: CharacterDocument = {
      ...character,
      build: {
        ...character.build,
      },
    };
    delete missingSubclass.build.subclassId;

    const prematureEvaluation = evaluateCharacter({
      character: premature,
      packages: [loadRulesPackage()],
    });
    const missingSubclassEvaluation = evaluateCharacter({
      character: missingSubclass,
      packages: [loadRulesPackage()],
    });

    expect(prematureEvaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining([
        "FIGHTER_SUBCLASS_LEVEL_REQUIRED",
        "FIGHTER_GENERAL_FEAT_CHOICE_COUNT",
        "FEAT_LEVEL_PREREQUISITE",
        "FEAT_ABILITY_INCREASE_PATTERN",
        "WEAPON_MASTERY_SELECTION_LIMIT",
      ]),
    );
    expect(missingSubclassEvaluation.validations.map((message) => message.code)).toContain(
      "FIGHTER_SUBCLASS_REQUIRED",
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
