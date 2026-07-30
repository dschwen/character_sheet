import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { evaluateCharacter } from "./index.js";

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

describe("evaluateCharacter Barbarian vertical slice", () => {
  it("matches critical reviewed level-1 outputs and traces", () => {
    const character = loadCharacter();
    const rulesPackage = loadRulesPackage();
    const expected = readJson(new URL("expected/barbarian-1.json", fixturesRoot)) as {
      values: Record<string, number>;
      selectedArmorClassCandidate: string;
      resistances: string[];
      resource: { id: string; maximum: number; expended: number; current: number };
      action: {
        id: string;
        available: boolean;
        actionEconomy: string;
      };
      proficiencies: {
        savingThrows: string[];
        skills: string[];
      };
      validationCodes: string[];
    };

    const evaluation = evaluateCharacter({
      character,
      packages: [rulesPackage],
    });

    expect(
      Object.fromEntries(
        Object.keys(expected.values).map((id) => [id, evaluation.values[id]?.value]),
      ),
    ).toEqual(expected.values);
    expect(evaluation.values.armorClass?.selectedCandidate).toBe(
      expected.selectedArmorClassCandidate,
    );
    expect(evaluation.resistances).toEqual(expected.resistances);
    expect(evaluation.resources[0]).toMatchObject(expected.resource);
    expect(evaluation.actions[0]).toMatchObject(expected.action);
    expect(
      Object.entries(evaluation.proficiencies.savingThrows)
        .filter(([, proficiency]) => proficiency.level === "proficient")
        .map(([ability]) => ability),
    ).toEqual(expected.proficiencies.savingThrows);
    expect(
      Object.entries(evaluation.proficiencies.skills)
        .filter(([, proficiency]) => proficiency.level === "proficient")
        .map(([skill]) => skill),
    ).toEqual(expected.proficiencies.skills);
    expect(evaluation.validations.map((message) => message.code)).toEqual(expected.validationCodes);
    expect(evaluation.coverageWarnings).toHaveLength(2);

    for (const [id, value] of Object.entries(evaluation.values)) {
      expect(evaluation.traces[value.traceId], `Missing trace for ${id}`).toBeDefined();
      expect(evaluation.traces[value.traceId]?.result).toBe(value.value);
    }
    expect(evaluation.traces.armorClass?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.class-feature.barbarian.unarmored-defense",
          page: 29,
        }),
      ]),
    );
    expect(evaluation.traces["srd521.resource.barbarian.rage.current"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.class-feature.barbarian.rage",
        }),
      ]),
    );
    expect(evaluation.traces["savingThrow.strength"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.class.barbarian",
          page: 28,
        }),
      ]),
    );
  });

  it("is deterministic", () => {
    const input = {
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    };

    expect(evaluateCharacter(input)).toEqual(evaluateCharacter(input));
  });

  it("rejects Unarmored Defense and entering Rage while Heavy armor is equipped", () => {
    const character = loadCharacter();
    const equipped: CharacterDocument = {
      ...character,
      loadout: {
        ...character.loadout,
        equippedItemIds: ["srd521.equipment.armor.heavy.chain-mail"],
      },
    };

    const evaluation = evaluateCharacter({
      character: equipped,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.values.armorClass).toMatchObject({
      value: 12,
      selectedCandidate: "base-unarmored",
    });
    expect(evaluation.values.armorClass?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "barbarian-unarmored-defense",
          applicable: false,
        }),
      ]),
    );
    expect(evaluation.actions[0]?.available).toBe(false);
    expect(evaluation.validations.map((message) => message.code)).toContain(
      "RAGE_WITH_HEAVY_ARMOR",
    );
  });

  it("validates impossible Rage concentration and resource state", () => {
    const character = loadCharacter();
    const invalid: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        concentrationSpellId: "srd521.spell.acid-arrow",
        expendedResources: {
          "srd521.resource.barbarian.rage": 3,
        },
      },
    };

    const evaluation = evaluateCharacter({
      character: invalid,
      packages: [loadRulesPackage()],
    });
    const codes = evaluation.validations.map((message) => message.code);

    expect(codes).toContain("RAGE_FORBIDS_CONCENTRATION");
    expect(codes).toContain("RESOURCE_EXPENDED_ABOVE_MAXIMUM");
    expect(evaluation.resources[0]?.current).toBe(0);
    expect(evaluation.actions[0]?.available).toBe(false);
  });

  it("resolves situational advantage and disadvantage without stacking", () => {
    const input = {
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    };
    const advantaged = evaluateCharacter({
      ...input,
      context: {
        d20RollEffects: [
          {
            testId: "skill.perception",
            kind: "advantage",
            source: "help",
          },
          {
            testId: "skill.perception",
            kind: "advantage",
            source: "inspiration",
          },
        ],
      },
    });
    const cancelled = evaluateCharacter({
      ...input,
      context: {
        d20RollEffects: [
          {
            testId: "skill.perception",
            kind: "advantage",
            source: "help",
          },
          {
            testId: "skill.perception",
            kind: "disadvantage",
            source: "obscured",
          },
        ],
      },
    });

    expect(advantaged.d20Tests["skill.perception"]?.rollMode).toBe("advantage");
    expect(cancelled.d20Tests["skill.perception"]?.rollMode).toBe("normal");
    expect(cancelled.traces["skill.perception"]?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "resolve-advantage-disadvantage",
          output: "normal",
        }),
      ]),
    );
  });

  it("validates illegal or incomplete starting class skill choices", () => {
    const character = loadCharacter();
    const invalid: CharacterDocument = {
      ...character,
      build: {
        ...character.build,
        proficiencyChoices: {
          skills: [
            {
              skillId: "srd521.skill.arcana",
              sourceId: "srd521.class.barbarian",
            },
          ],
          expertise: [],
        },
      },
    };

    const evaluation = evaluateCharacter({
      character: invalid,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((validation) => validation.code)).toEqual(
      expect.arrayContaining([
        "CLASS_SKILL_PROFICIENCY_COUNT",
        "CLASS_SKILL_PROFICIENCY_NOT_ALLOWED",
      ]),
    );
  });
});
