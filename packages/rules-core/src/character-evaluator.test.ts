import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { evaluateCharacter, proposeAction } from "./index.js";

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
      attacks: {
        id: string;
        weaponId: string;
        ability: string;
        attackBonus: number;
        proficient: boolean;
        damage: {
          diceCount: number;
          diceSize: number;
          bonus: number;
          type: string;
        };
        mastery: {
          property: string;
          enabled: boolean;
        };
      }[];
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
    expect(evaluation.attacks).toMatchObject(expected.attacks);
    expect(evaluation.inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "greataxe-1",
          entityId: "srd521.equipment.weapon.greataxe",
          equipped: true,
        }),
      ]),
    );
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
    expect(evaluation.traces["attack.greataxe-1.bonus"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.equipment.weapon.greataxe",
          page: 91,
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

  it("spends a Rage use and activates Rage atomically", () => {
    const character = loadCharacter();
    character.state.activeEffectIds = [];
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.enter-rage" },
    );

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedResources["srd521.resource.barbarian.rage"]).toBe(2);
    expect(proposal.nextState.activeEffectIds).toEqual(["srd521.effect.barbarian.rage"]);
    expect(proposal.changes.map((change) => change.path)).toContain("state.activeEffectIds");
    expect(character.state.activeEffectIds).toEqual([]);
    expect(
      evaluateCharacter({
        character: { ...character, state: proposal.nextState },
        packages: [loadRulesPackage()],
      }).actions[0]?.available,
    ).toBe(false);
  });

  it("rejects Unarmored Defense and entering Rage while Heavy armor is equipped", () => {
    const character = loadCharacter();
    const equipped: CharacterDocument = {
      ...character,
      loadout: {
        ...character.loadout,
        inventory: [
          ...character.loadout.inventory,
          {
            id: "chain-mail-1",
            entityId: "srd521.equipment.armor.heavy.chain-mail",
            quantity: 1,
          },
        ],
        equippedItemIds: ["chain-mail-1"],
      },
    };

    const evaluation = evaluateCharacter({
      character: equipped,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.values.armorClass).toMatchObject({
      value: 16,
      selectedCandidate: "equipped-chain-mail-1",
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
    expect(evaluation.validations.map((message) => message.code)).toContain(
      "ARMOR_TRAINING_MISSING",
    );
    expect(evaluation.d20Tests["savingThrow.strength"]?.rollMode).toBe("disadvantage");
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

  it("applies trained medium armor, a Shield, and armor Stealth Disadvantage", () => {
    const character = loadCharacter();
    const armored: CharacterDocument = {
      ...character,
      loadout: {
        ...character.loadout,
        inventory: [
          ...character.loadout.inventory,
          {
            id: "scale-mail-1",
            entityId: "srd521.equipment.armor.medium.scale-mail",
            quantity: 1,
          },
          {
            id: "shield-1",
            entityId: "srd521.equipment.shield",
            quantity: 1,
          },
        ],
        equippedItemIds: ["scale-mail-1", "shield-1"],
      },
    };

    const evaluation = evaluateCharacter({
      character: armored,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.values.armorClass).toMatchObject({
      value: 18,
      selectedCandidate: "equipped-scale-mail-1",
    });
    expect(evaluation.d20Tests["skill.stealth"]?.rollMode).toBe("disadvantage");
    expect(evaluation.validations.map((validation) => validation.code)).not.toContain(
      "ARMOR_TRAINING_MISSING",
    );
    expect(evaluation.traces.armorClass?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.equipment.armor.medium.scale-mail",
          page: 92,
        }),
        expect.objectContaining({
          entityId: "srd521.equipment.shield",
          page: 92,
        }),
      ]),
    );
  });

  it("selects Dexterity for a Finesse weapon when it is higher", () => {
    const character = loadCharacter();
    const finesse: CharacterDocument = {
      ...character,
      build: {
        ...character.build,
        abilityScores: {
          ...character.build.abilityScores,
          strength: 10,
          dexterity: 18,
        },
      },
      loadout: {
        ...character.loadout,
        inventory: [
          {
            id: "dagger-1",
            entityId: "srd521.equipment.weapon.dagger",
            quantity: 1,
          },
        ],
        equippedItemIds: ["dagger-1"],
        selectedWeaponMasteryIds: [],
      },
      state: {
        ...character.state,
        activeEffectIds: [],
      },
    };

    const evaluation = evaluateCharacter({
      character: finesse,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.attacks[0]).toMatchObject({
      ability: "dexterity",
      attackBonus: 6,
      damage: {
        diceCount: 1,
        diceSize: 4,
        bonus: 4,
      },
    });
  });

  it("traces the armor speed penalty when Strength is below the requirement", () => {
    const character = loadCharacter();
    const encumbered: CharacterDocument = {
      ...character,
      build: {
        ...character.build,
        abilityScores: {
          ...character.build.abilityScores,
          strength: 11,
        },
      },
      loadout: {
        ...character.loadout,
        inventory: [
          ...character.loadout.inventory,
          {
            id: "chain-mail-1",
            entityId: "srd521.equipment.armor.heavy.chain-mail",
            quantity: 1,
          },
        ],
        equippedItemIds: ["chain-mail-1"],
      },
    };

    const evaluation = evaluateCharacter({
      character: encumbered,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.values["speed.armorPenalty"]?.value).toBe(-10);
    expect(evaluation.traces["speed.armorPenalty"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.equipment.armor.heavy.chain-mail",
          page: 92,
        }),
      ]),
    );
  });

  it("validates the class Weapon Mastery selection limit", () => {
    const character = loadCharacter();
    const tooMany: CharacterDocument = {
      ...character,
      loadout: {
        ...character.loadout,
        inventory: [
          ...character.loadout.inventory,
          {
            id: "dagger-1",
            entityId: "srd521.equipment.weapon.dagger",
            quantity: 1,
          },
        ],
        selectedWeaponMasteryIds: [
          ...character.loadout.selectedWeaponMasteryIds,
          "srd521.equipment.weapon.dagger",
        ],
      },
    };

    const evaluation = evaluateCharacter({
      character: tooMany,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((validation) => validation.code)).toContain(
      "WEAPON_MASTERY_SELECTION_LIMIT",
    );
  });

  it("validates expended Hit Dice against class levels", () => {
    const character = loadCharacter();
    const invalid: CharacterDocument = {
      ...character,
      state: {
        ...character.state,
        expendedHitDice: {
          "srd521.class.barbarian": 2,
        },
      },
    };

    const evaluation = evaluateCharacter({
      character: invalid,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((validation) => validation.code)).toContain(
      "HIT_DICE_EXPENDED_ABOVE_MAXIMUM",
    );
  });

  it("applies condition mechanics from condition entity data", () => {
    const source = loadCharacter();
    const character: CharacterDocument = {
      ...source,
      state: {
        ...source.state,
        conditionIds: ["srd521.condition.unconscious"],
        exhaustion: 2,
      },
    };

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.values["speed.walking"]?.value).toBe(0);
    expect(evaluation.d20Tests["skill.athletics"]?.modifier).toBe(1);
    expect(evaluation.facts["savingThrow.strength.automaticFailure"]).toBe(true);
    expect(evaluation.facts["condition.incapacitated.active"]).toBe(true);
    expect(evaluation.facts["condition.prone.active"]).toBe(true);
    expect(evaluation.facts["attackRoll.mode"]).toBe("disadvantage");
    expect(evaluation.actions.every((action) => !action.available)).toBe(true);
  });

  it("cancels condition-granted attack advantage and disadvantage", () => {
    const source = loadCharacter();
    const character: CharacterDocument = {
      ...source,
      state: {
        ...source.state,
        conditionIds: ["srd521.condition.invisible", "srd521.condition.poisoned"],
      },
    };

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.facts["attackRoll.mode"]).toBe("normal");
    expect(evaluation.d20Tests.initiative?.rollMode).toBe("advantage");
    expect(evaluation.d20Tests["abilityCheck.strength"]?.rollMode).toBe("disadvantage");
  });

  it("applies data-driven beneficial spell status mechanics", () => {
    const source = loadCharacter();
    const character: CharacterDocument = {
      ...source,
      state: {
        ...source.state,
        activeEffectIds: [
          ...source.state.activeEffectIds,
          "srd521.status.spell.fly",
          "srd521.status.spell.haste",
          "srd521.status.spell.longstrider",
          "srd521.status.spell.shield-of-faith",
        ],
      },
    };

    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.values["speed.walking"]?.value).toBe(80);
    expect(evaluation.values["speed.fly"]?.value).toBe(140);
    expect(evaluation.values.armorClass?.value).toBe(19);
    expect(evaluation.d20Tests["savingThrow.dexterity"]?.rollMode).toBe("advantage");
    expect(evaluation.facts["status.haste.active"]).toBe(true);
    expect(evaluation.traces["speed.fly"]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: "srd521.status.spell.fly" })]),
    );
  });

  it("offers Mage Armor only while unarmored", () => {
    const source = loadCharacter();
    source.state.activeEffectIds.push("srd521.status.spell.mage-armor");
    const unarmored = evaluateCharacter({ character: source, packages: [loadRulesPackage()] });

    expect(unarmored.values.armorClass?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.status.spell.mage-armor",
          applicable: true,
          value: 15,
        }),
      ]),
    );

    source.loadout.inventory.push({
      id: "chain-mail-1",
      entityId: "srd521.equipment.armor.heavy.chain-mail",
      quantity: 1,
    });
    source.loadout.equippedItemIds = ["chain-mail-1"];
    const armored = evaluateCharacter({ character: source, packages: [loadRulesPackage()] });
    expect(armored.values.armorClass?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.status.spell.mage-armor",
          applicable: false,
        }),
      ]),
    );
  });

  it("attaches Bless and selected-skill Guidance dice to d20 rolls", () => {
    const source = loadCharacter();
    source.state.activeEffectIds.push("srd521.status.spell.bless", "srd521.status.spell.guidance");
    source.state.activeEffectSelections["srd521.status.spell.guidance"] = "skill.stealth";

    const evaluation = evaluateCharacter({ character: source, packages: [loadRulesPackage()] });

    expect(evaluation.attackRollBonusDice).toEqual([
      { diceCount: 1, diceSize: 4, source: "Blessed" },
    ]);
    expect(evaluation.d20Tests["savingThrow.strength"]?.bonusDice).toEqual([
      { diceCount: 1, diceSize: 4, source: "Blessed" },
    ]);
    expect(evaluation.d20Tests["skill.stealth"]?.bonusDice).toEqual([
      { diceCount: 1, diceSize: 4, source: "Guided" },
    ]);
    expect(evaluation.d20Tests["skill.arcana"]?.bonusDice).toEqual([]);
    expect(evaluation.d20Tests["abilityCheck.dexterity"]?.bonusDice).toEqual([]);
    expect(evaluation.traces["skill.stealth"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "srd521.status.spell.guidance" }),
      ]),
    );
  });

  it("applies Aid slot scaling and Pass without Trace from status data", () => {
    const source = loadCharacter();
    source.state.activeEffectIds.push(
      "srd521.status.spell.aid",
      "srd521.status.spell.pass-without-trace",
    );
    source.state.activeEffectSelections["srd521.status.spell.aid"] = "3";

    const evaluation = evaluateCharacter({ character: source, packages: [loadRulesPackage()] });

    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(25);
    expect(evaluation.facts["status.aid.hitPointBonus"]).toBe(10);
    expect(evaluation.d20Tests["skill.stealth"]?.modifier).toBe(14);
    expect(evaluation.facts["stealth.leavesNoTracks"]).toBe(true);
    expect(evaluation.traces["hitPoints.maximum"]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: "srd521.status.spell.aid" })]),
    );
  });
});
