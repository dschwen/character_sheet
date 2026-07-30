import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { EvaluateCharacterInput, LoadedRulesPackage, RestRequest } from "@dnd/rules-api";

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
      authoringIrSchema.parse(readJson(new URL("authoring-ir/barbarian.rage.json", packageRoot))),
      authoringIrSchema.parse(
        readJson(new URL("authoring-ir/barbarian.unarmored-defense.json", packageRoot)),
      ),
    ],
  };
}

function loadCharacter(): CharacterDocument {
  return characterDocumentSchema.parse(
    readJson(new URL("characters/barbarian-1.json", fixturesRoot)),
  );
}

function input(character = loadCharacter()): EvaluateCharacterInput {
  return { character, packages: [loadRulesPackage()] };
}

describe("proposeRest", () => {
  it("proposes Short Rest Hit Die healing and partial resource recharge without mutation", () => {
    const character = loadCharacter();
    const before = structuredClone(character);
    const proposal = proposeRest(input(character), {
      event: "short-rest",
      hitDice: [
        {
          classId: "srd521.class.barbarian",
          rolls: [5],
        },
      ],
    });

    expect(proposal.applicable).toBe(true);
    expect(proposal.validations).toEqual([]);
    expect(proposal.nextState.currentHitPoints).toBe(15);
    expect(proposal.nextState.expendedHitDice["srd521.class.barbarian"]).toBe(1);
    expect(proposal.nextState.expendedResources["srd521.resource.barbarian.rage"]).toBe(0);
    expect(proposal.changes.map((change) => change.path)).toEqual(
      expect.arrayContaining([
        "state.currentHitPoints",
        "state.expendedHitDice.srd521.class.barbarian",
        "state.expendedResources.srd521.resource.barbarian.rage",
      ]),
    );
    expect(proposal.traces["transition.state.currentHitPoints"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.rule.short-rest",
          page: 187,
        }),
      ]),
    );
    expect(character).toEqual(before);
  });

  it("restores only one Rage use on a Short Rest", () => {
    const character = loadCharacter();
    const depleted: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        expendedResources: {
          "srd521.resource.barbarian.rage": 2,
        },
      },
    };

    const proposal = proposeRest(input(depleted), { event: "short-rest" });

    expect(proposal.nextState.expendedResources["srd521.resource.barbarian.rage"]).toBe(1);
  });

  it("proposes the complete modeled Long Rest transition", () => {
    const character = loadCharacter();
    const depleted: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        currentHitPoints: 5,
        temporaryHitPoints: 4,
        expendedResources: {
          "srd521.resource.barbarian.rage": 2,
        },
        expendedHitDice: {
          "srd521.class.barbarian": 1,
        },
        concentrationSpellId: "srd521.spell.acid-arrow",
        deathSaveSuccesses: 2,
        deathSaveFailures: 1,
        exhaustion: 2,
      },
    };

    const proposal = proposeRest(input(depleted), { event: "long-rest" });

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState).toMatchObject({
      currentHitPoints: 15,
      temporaryHitPoints: 0,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      exhaustion: 1,
    });
    expect(proposal.nextState.expendedResources["srd521.resource.barbarian.rage"]).toBe(0);
    expect(proposal.nextState.expendedHitDice["srd521.class.barbarian"]).toBe(0);
    expect(proposal.nextState.concentrationSpellId).toBeUndefined();
    expect(proposal.traces["transition.state.exhaustion"]?.sourceReferences).toEqual([
      expect.objectContaining({
        entityId: "srd521.rule.long-rest",
        page: 185,
      }),
    ]);
    expect(
      proposal.traces["transition.state.expendedResources.srd521.resource.barbarian.rage"]
        ?.sourceReferences,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.class-feature.barbarian.rage",
        }),
      ]),
    );
  });

  it("rejects rests at 0 Hit Points without proposing partial changes", () => {
    const character = loadCharacter();
    const unconscious: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        currentHitPoints: 0,
      },
    };

    const proposal = proposeRest(input(unconscious), { event: "long-rest" });

    expect(proposal.applicable).toBe(false);
    expect(proposal.changes).toEqual([]);
    expect(proposal.nextState).toEqual(unconscious.state);
    expect(proposal.validations.map((message) => message.code)).toContain(
      "REST_REQUIRES_POSITIVE_HIT_POINTS",
    );
  });

  it("rejects invalid Hit Die rolls atomically before resource recharge", () => {
    const character = loadCharacter();
    const proposal = proposeRest(input(character), {
      event: "short-rest",
      hitDice: [
        {
          classId: "srd521.class.barbarian",
          rolls: [13],
        },
      ],
    });

    expect(proposal.applicable).toBe(false);
    expect(proposal.changes).toEqual([]);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.validations.map((message) => message.code)).toContain(
      "HIT_DIE_ROLL_OUT_OF_RANGE",
    );
    expect(proposal.nextState.expendedResources).toEqual(character.state.expendedResources);
  });

  it("is deterministic", () => {
    const evaluationInput = input();
    const request: RestRequest = {
      event: "short-rest",
      hitDice: [
        {
          classId: "srd521.class.barbarian",
          rolls: [4],
        },
      ],
    };

    expect(proposeRest(evaluationInput, request)).toEqual(proposeRest(evaluationInput, request));
  });
});
