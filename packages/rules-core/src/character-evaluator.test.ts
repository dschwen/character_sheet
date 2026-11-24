import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import {
  evaluateCharacter,
  proposeAction,
  proposeMagicItemUse,
  proposeRest,
  proposeSpellCast,
} from "./index.js";

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

describe("tracked spell components", () => {
  it("spends one diamond only when the cast is valid and tracking was selected", () => {
    const character = characterDocumentSchema.parse(
      readJson(new URL("characters/cleric-5.json", fixturesRoot)),
    );
    const packages = [loadRulesPackage()];
    const request = {
      spellId: "srd521.spell.revivify",
      slotLevel: 3,
      useTrackedComponent: true,
    };
    const missing = proposeSpellCast({ character, packages }, request);
    expect(missing.validations.map(({ code }) => code)).toContain("SPELL_COMPONENT_UNAVAILABLE");
    expect(missing.nextState).toEqual(character.state);
    const diamond = {
      id: "revivify-diamonds",
      entityId: "srd521.equipment.gear.revivify-diamond",
      quantity: 2,
    };
    character.loadout.inventory.push(diamond);
    const failed = proposeSpellCast({ character, packages }, { ...request, slotLevel: 2 });
    expect(failed.applicable).toBe(false);
    expect(failed.nextLoadout).toBeUndefined();
    const success = proposeSpellCast({ character, packages }, request);
    expect(success.applicable).toBe(true);
    expect(success.nextLoadout?.inventory.find(({ id }) => id === diamond.id)?.quantity).toBe(1);
    expect(diamond.quantity).toBe(2);
    character.settings = { spellComponentTracking: false };
    const disabled = proposeSpellCast({ character, packages }, request);
    expect(disabled.validations.map(({ code }) => code)).toContain(
      "SPELL_COMPONENT_TRACKING_DISABLED",
    );
    expect(disabled.nextLoadout).toBeUndefined();
    const manual = proposeSpellCast(
      { character, packages },
      { ...request, useTrackedComponent: false },
    );
    expect(manual.applicable).toBe(true);
    expect(manual.nextLoadout).toBeUndefined();
  });
});

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

  it("applies Haste lethargy's Incapacitated condition and caps every movement mode", () => {
    const character = loadCharacter();
    const lethargy = "srd521.status.spell.haste-lethargy";
    character.state.activeEffectIds.push("srd521.status.spell.fly", lethargy);
    const evaluation = evaluateCharacter({ character, packages: [loadRulesPackage()] });

    expect(evaluation.values["speed.walking"]?.value).toBe(0);
    expect(evaluation.values["speed.fly"]?.value).toBe(0);
    expect(evaluation.facts["condition.incapacitated.active"]).toBe(true);
    expect(evaluation.facts["actions.disabled"]).toBe(true);
    expect(evaluation.d20Tests.initiative?.rollMode).toBe("disadvantage");
    expect(evaluation.traces["speed.fly"]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: lethargy }),
    );
    expect(character.state.conditionIds).toEqual([]);
  });

  it("applies Barkskin as an AC floor after other modifiers", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const barkskin = "srd521.status.spell.barkskin";
    character.state.activeEffectIds.push(barkskin);
    const below = evaluateCharacter({ character, packages });
    expect(below.values.armorClass).toMatchObject({ value: 17, selectedCandidate: barkskin });
    expect(below.traces.armorClass?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: barkskin }),
    );

    character.state.activeEffectIds.push("srd521.status.spell.shield-of-faith");
    expect(evaluateCharacter({ character, packages }).values.armorClass?.value).toBe(17);
    character.state.activeEffectIds.push("srd521.status.spell.haste");
    expect(evaluateCharacter({ character, packages }).values.armorClass?.value).toBe(19);
  });

  it("limits Enhance Ability and Protection from Energy to valid recipient selections", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const enhance = "srd521.status.spell.enhance-ability";
    const protect = "srd521.status.spell.protection-from-energy";
    character.state.activeEffectIds.push(enhance, protect);
    character.state.activeEffectSelections = { [enhance]: "constitution", [protect]: "poison" };
    const invalid = evaluateCharacter({ character, packages });
    expect(invalid.d20Tests["abilityCheck.constitution"]?.rollMode).toBe("normal");
    expect(invalid.resistances).not.toContain("poison");

    character.state.activeEffectSelections = { [enhance]: "dexterity", [protect]: "fire" };
    const selected = evaluateCharacter({ character, packages });
    expect(selected.d20Tests["abilityCheck.dexterity"]?.rollMode).toBe("advantage");
    expect(selected.d20Tests["skill.stealth"]?.rollMode).toBe("advantage");
    expect(selected.d20Tests.initiative?.rollMode).toBe("advantage");
    expect(selected.d20Tests["savingThrow.dexterity"]?.rollMode).toBe("normal");
    expect(selected.d20Tests["skill.perception"]?.rollMode).toBe("normal");
    expect(selected.resistances).toContain("fire");
    expect(selected.resistances).not.toContain("cold");

    character.state.activeEffectSelections[enhance] = "wisdom";
    const wisdom = evaluateCharacter({ character, packages });
    expect(wisdom.values["passive.perception"]?.value).toBe(
      Number(selected.values["passive.perception"]?.value) + 5,
    );
    character.state.conditionIds.push("srd521.condition.poisoned");
    const canceled = evaluateCharacter({ character, packages });
    expect(canceled.values["passive.perception"]?.value).toBe(
      selected.values["passive.perception"]?.value,
    );
  });

  it("adds Warding Bond to AC, all saves, and defenses without changing other checks", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const baseline = evaluateCharacter({ character, packages });
    const bond = "srd521.status.spell.warding-bond";
    character.state.activeEffectIds.push(bond, "srd521.status.spell.protection-from-energy");
    character.state.activeEffectSelections["srd521.status.spell.protection-from-energy"] = "fire";
    const protectedCharacter = evaluateCharacter({ character, packages });

    expect(protectedCharacter.values.armorClass?.value).toBe(
      Number(baseline.values.armorClass?.value) + 1,
    );
    for (const id of Object.keys(baseline.d20Tests).filter((id) => id.startsWith("savingThrow."))) {
      expect(protectedCharacter.d20Tests[id]?.modifier).toBe(
        Number(baseline.d20Tests[id]?.modifier) + 1,
      );
    }
    expect(protectedCharacter.d20Tests["skill.perception"]).toEqual(
      baseline.d20Tests["skill.perception"],
    );
    expect(protectedCharacter.resistances).toHaveLength(13);
    expect(protectedCharacter.resistances.filter((type) => type === "fire")).toHaveLength(1);
    expect(protectedCharacter.traces["savingThrow.death"]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: bond }),
    );
  });

  it("derives magic item benefits from individual equipped and attuned instances", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const baseline = evaluateCharacter({ character, packages });
    const cloak = "srd521.magic-item.cloak-of-protection";
    const swimming = "srd521.magic-item.ring-of-swimming";
    character.loadout.inventory.push(
      { id: "cloak-one", entityId: cloak, quantity: 1 },
      { id: "cloak-two", entityId: cloak, quantity: 1 },
      { id: "swim-ring", entityId: swimming, quantity: 1 },
    );
    character.loadout.attunedItemIds = ["cloak-one"];
    character.loadout.equippedItemIds = ["cloak-two", "swim-ring"];
    const wrongCopy = evaluateCharacter({ character, packages });
    expect(wrongCopy.values.armorClass?.value).toBe(baseline.values.armorClass?.value);
    expect(wrongCopy.values["speed.swim"]?.value).toBe(40);
    expect(wrongCopy.facts["equipment.wearingArmor"]).toBe(false);

    character.loadout.equippedItemIds = ["cloak-one", "swim-ring"];
    const active = evaluateCharacter({ character, packages });
    expect(active.values.armorClass?.value).toBe(Number(baseline.values.armorClass?.value) + 1);
    expect(active.d20Tests["savingThrow.death"]?.modifier).toBe(1);
    expect(active.traces.armorClass?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: cloak, page: 216 }),
    );
    expect(active.traces["speed.swim"]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: swimming, page: 239 }),
    );
  });

  it("reports illegal imported attunements and derives effects only from legal records", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const ids = [
      "cloak-of-protection",
      "ring-of-protection",
      "ring-of-feather-falling",
      "cloak-of-the-manta-ray",
      "ring-of-swimming",
    ];
    character.loadout.inventory.push(
      ...ids.map((id) => ({
        id,
        entityId: `srd521.magic-item.${id}`,
        quantity: 1,
      })),
    );
    character.loadout.attunedItemIds = [...ids, "missing"];
    character.loadout.equippedItemIds = ["ring-of-feather-falling", "cloak-of-the-manta-ray"];
    const evaluation = evaluateCharacter({ character, packages });
    expect(evaluation.inventory.filter(({ attuned }) => attuned).map(({ id }) => id)).toEqual(
      ids.slice(0, 3),
    );
    expect(evaluation.validations.filter(({ code }) => code === "INVALID_ATTUNEMENT")).toHaveLength(
      3,
    );
    expect(evaluation.facts["fall.damagePreventedOnLanding"]).toBe(true);
    expect(evaluation.facts["respiration.underwater"]).toBeUndefined();
    expect(evaluation.values["speed.swim"]).toBeUndefined();
  });

  it("casts Water Walk from a worn ring and leaves spell slots untouched", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    character.loadout.inventory.push({
      id: "water-ring",
      entityId: "srd521.magic-item.ring-of-water-walking",
      quantity: 1,
    });
    const cast = { mode: "cast", itemId: "water-ring" } as const;
    expect(proposeMagicItemUse({ character, packages }, cast).applicable).toBe(false);
    character.loadout.equippedItemIds.push("water-ring");
    character.state.conditionIds.push("srd521.condition.incapacitated");
    expect(proposeMagicItemUse({ character, packages }, cast).applicable).toBe(false);
    character.state.conditionIds = [];
    const proposal = proposeMagicItemUse({ character, packages }, cast);
    expect(proposal.applicable).toBe(true);
    if (!proposal.applicable) return;
    const next = proposal.nextCharacter;
    expect(next.state.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
    expect(next.state.activeEffectIds).toContain("srd521.status.spell.water-walk");
    next.loadout = { ...next.loadout, equippedItemIds: [] };
    expect(evaluateCharacter({ character: next, packages }).facts["movement.walkOnLiquids"]).toBe(
      true,
    );
  });

  it("spends, recharges and resolves the last charge of individual wands", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const wand = "srd521.magic-item.wand-of-magic-missiles";
    character.loadout.inventory.push(
      { id: "wand-one", entityId: wand, quantity: 1, charges: 3 },
      { id: "wand-two", entityId: wand, quantity: 1 },
    );
    character.loadout.equippedItemIds.push("wand-one", "wand-two");
    const input = { character, packages };
    const last = { mode: "cast", itemId: "wand-one", charges: 3 } as const;
    expect(proposeMagicItemUse(input, last).applicable).toBe(false);
    expect(proposeMagicItemUse(input, { ...last, lastChargeRoll: 0 }).applicable).toBe(false);
    const survives = proposeMagicItemUse(input, { ...last, lastChargeRoll: 20 });
    expect(survives.applicable && survives.destroyed).toBe(false);
    if (!survives.applicable) return;
    const spent = survives.nextCharacter;
    expect(spent.loadout.inventory.find(({ id }) => id === "wand-one")?.charges).toBe(0);
    expect(
      evaluateCharacter({ character: spent, packages }).inventory.find(
        ({ id }) => id === "wand-two",
      )?.power?.charges?.current,
    ).toBe(7);

    const dawn = proposeMagicItemUse(
      { character: spent, packages },
      { mode: "dawn", itemId: "wand-one", roll: 6 },
    );
    expect(dawn.applicable && dawn.restored).toBe(7);
    const capped = proposeMagicItemUse(input, { mode: "dawn", itemId: "wand-one", roll: 6 });
    expect(capped.applicable && capped.restored).toBe(4);
    const destroyed = proposeMagicItemUse(input, { ...last, lastChargeRoll: 1 });
    expect(destroyed.applicable && destroyed.destroyed).toBe(true);
    if (!destroyed.applicable) return;
    expect(destroyed.nextCharacter.loadout.equippedItemIds).not.toContain("wand-one");
    expect(destroyed.nextCharacter.loadout.inventory.map(({ id }) => id)).not.toContain("wand-one");
    expect(destroyed.nextCharacter.state.expendedSpellSlots).toEqual(
      character.state.expendedSpellSlots,
    );
    expect(character.loadout.inventory.find(({ id }) => id === "wand-one")?.charges).toBe(3);
  });

  it("accounts for timed item use and restores the duration on a Long Rest", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const input = { character, packages };
    const itemId = "speed-boots";
    const entityId = "srd521.magic-item.boots-of-speed";
    character.loadout.inventory.push({ id: itemId, entityId, quantity: 1 });
    character.loadout.equippedItemIds.push(itemId);
    const toggle = { mode: "toggle", itemId } as const;
    expect(proposeMagicItemUse(input, toggle).applicable).toBe(false);
    character.loadout.attunedItemIds.push(itemId);
    const start = proposeMagicItemUse(input, toggle);
    expect(start.applicable).toBe(true);
    if (!start.applicable) return;
    const active = { character: start.nextCharacter, packages };
    const evaluation = evaluateCharacter(active);
    expect(evaluation.values["speed.walking"]?.value).toBe(60);
    expect(evaluation.facts["incomingOpportunityAttacks.disadvantage"]).toBe(true);
    expect(evaluation.traces["speed.walking"]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId, page: 214 }),
    );
    expect(proposeMagicItemUse(active, { mode: "elapse", itemId, rounds: 1.25 }).applicable).toBe(
      false,
    );
    const used = proposeMagicItemUse(active, { mode: "elapse", itemId, rounds: 3 });
    if (!used.applicable) throw new Error(used.reason);
    const interrupted = proposeRest(
      { character: used.nextCharacter, packages },
      { event: "short-rest" },
    );
    const depleted = interrupted.nextLoadout?.inventory.find(({ id }) => id === itemId);
    expect(depleted?.timedPowerState).toEqual({ active: false, remainingRounds: 0 });
    expect(interrupted.changes.some(({ path }) => path.includes("timedPowerState"))).toBe(true);
    if (interrupted.nextLoadout === undefined) throw new Error("Missing rest loadout");
    const long = proposeRest(
      {
        character: {
          ...used.nextCharacter,
          loadout: interrupted.nextLoadout,
          state: interrupted.nextState,
        },
        packages,
      },
      { event: "long-rest" },
    );
    expect(long.nextLoadout?.inventory.find(({ id }) => id === itemId)?.timedPowerState).toEqual({
      active: false,
      remainingRounds: 100,
    });
  });

  it("spends a Ring of Evasion charge only for an eligible failed Dexterity save", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const itemId = "evasion-ring";
    character.loadout.inventory.push({
      id: itemId,
      entityId: "srd521.magic-item.ring-of-evasion",
      quantity: 1,
      charges: 1,
    });
    character.loadout.equippedItemIds.push(itemId);
    const input = { character, packages };
    const reaction = {
      mode: "saving-throw-reaction",
      itemId,
      ability: "dexterity",
      outcome: "failure",
    } as const;
    expect(proposeMagicItemUse(input, reaction).applicable).toBe(false);
    character.loadout.attunedItemIds.push(itemId);
    expect(proposeMagicItemUse(input, { ...reaction, ability: "constitution" }).applicable).toBe(
      false,
    );
    expect(proposeMagicItemUse(input, { ...reaction, outcome: "success" }).applicable).toBe(false);
    expect(proposeMagicItemUse(input, { mode: "cast", itemId, charges: 1 }).applicable).toBe(false);
    character.state.conditionIds.push("srd521.condition.incapacitated");
    expect(proposeMagicItemUse(input, reaction).applicable).toBe(false);
    character.state.conditionIds = [];
    const applied = proposeMagicItemUse(input, reaction);
    if (!applied.applicable) throw new Error(applied.reason);
    expect(applied.destroyed).toBe(false);
    expect(applied.nextCharacter.loadout.inventory.find(({ id }) => id === itemId)?.charges).toBe(
      0,
    );
    const spent = { character: applied.nextCharacter, packages };
    expect(proposeMagicItemUse(spent, reaction).applicable).toBe(false);
    expect(proposeMagicItemUse(spent, { mode: "dawn", itemId, roll: 4 }).applicable).toBe(false);
    const dawn = proposeMagicItemUse(spent, { mode: "dawn", itemId, roll: 3 });
    expect(dawn.applicable && dawn.restored).toBe(3);
  });

  it("consumes a dose from a healing potion stack and caps the wearer's healing", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    const itemId = "healing-potions";
    character.loadout.inventory.push({
      id: itemId,
      entityId: "srd521.equipment.gear.potion-of-healing",
      quantity: 2,
    });
    const input = { character, packages };
    const maximum = Number(evaluateCharacter(input).values["hitPoints.maximum"]?.value);
    character.state.currentHitPoints = maximum - 2;
    character.state.temporaryHitPoints = 3;
    const drink = { mode: "consume", itemId, target: "self", rolls: [4, 4] } as const;
    expect(proposeMagicItemUse(input, { ...drink, rolls: [5, 4] }).applicable).toBe(false);
    expect(proposeMagicItemUse(input, { ...drink, rolls: [4] }).applicable).toBe(false);
    character.state.conditionIds.push("srd521.condition.incapacitated");
    expect(proposeMagicItemUse(input, drink).applicable).toBe(false);
    character.state.conditionIds = [];
    const use = proposeMagicItemUse(input, drink);
    if (!use.applicable) throw new Error(use.reason);
    const healed = use.nextCharacter;
    expect(healed.state.currentHitPoints).toBe(maximum);
    expect(healed.state.temporaryHitPoints).toBe(3);
    expect(healed.state.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
    expect(healed.loadout.inventory.find(({ id }) => id === itemId)?.quantity).toBe(1);
    expect(character.loadout.inventory.find(({ id }) => id === itemId)?.quantity).toBe(2);
    const administer = proposeMagicItemUse(
      { character: healed, packages },
      { ...drink, target: "other" },
    );
    if (!administer.applicable) throw new Error(administer.reason);
    expect(administer.nextCharacter.state).toEqual(healed.state);
    expect(administer.nextCharacter.loadout.inventory.some(({ id }) => id === itemId)).toBe(false);
  });

  it("reads the three higher-rarity healing roll formulas from the package", () => {
    const character = loadCharacter();
    const variants = [
      ["greater", 4, 4],
      ["superior", 8, 8],
      ["supreme", 10, 20],
    ] as const;
    character.loadout.inventory.push(
      ...variants.map(([id]) => ({
        id,
        entityId: `srd521.magic-item.potion-of-healing-${id}`,
        quantity: 1,
      })),
    );
    const { inventory } = evaluateCharacter({ character, packages: [loadRulesPackage()] });
    for (const [id, diceCount, bonus] of variants)
      expect(inventory.find((item) => item.id === id)?.healingPotion).toEqual({
        diceCount,
        diceSize: 4,
        bonus,
      });
  });

  it("turns a consumed Potion of Invulnerability into an expiring damage resistance", () => {
    const character = loadCharacter();
    const packages = [loadRulesPackage()];
    character.loadout.inventory.push({
      id: "resistance-dose",
      entityId: "srd521.magic-item.potion-of-invulnerability",
      quantity: 1,
    });
    const used = proposeMagicItemUse(
      { character, packages },
      {
        mode: "consume",
        itemId: "resistance-dose",
        target: "self",
        rolls: [],
      },
    );
    if (!used.applicable) throw new Error(used.reason);
    const activated = { character: used.nextCharacter, packages };
    expect(evaluateCharacter(activated).resistances).toContain("all");
    expect(used.nextCharacter.loadout.inventory.some(({ id }) => id === "resistance-dose")).toBe(
      false,
    );
    const rest = proposeRest(activated, { event: "short-rest" });
    expect(rest.nextState.activeEffectIds).not.toContain(
      "srd521.status.item.potion-of-invulnerability",
    );
  });

  it("summons a Pact familiar with no slot and protects special forms from other casters", () => {
    const packages = [loadRulesPackage()];
    const warlock = characterDocumentSchema.parse(
      readJson(new URL("characters/warlock-5.json", fixturesRoot)),
    );
    const request = {
      spellId: "srd521.spell.find-familiar",
      castingSourceId: "srd521.option.warlock.invocation.pact-of-the-chain",
      useFreeCast: true,
      familiar: { form: "Imp", creatureType: "fiend", maximumHitPoints: 10 },
    } as const;
    const cast = proposeSpellCast({ character: warlock, packages }, request);
    expect(cast.validations).toEqual([]);
    expect(cast.nextState.expendedSpellSlots).toEqual(warlock.state.expendedSpellSlots);
    expect(cast.nextState.familiar).toEqual({
      ...request.familiar,
      currentHitPoints: 10,
      presence: "present",
    });
    const wizard = characterDocumentSchema.parse(
      readJson(new URL("characters/wizard-5.json", fixturesRoot)),
    );
    wizard.build.learnedSpellIds.push(request.spellId);
    const invalid = proposeSpellCast(
      { character: wizard, packages },
      {
        spellId: request.spellId,
        asRitual: true,
        familiar: request.familiar,
      },
    );
    expect(invalid.validations.map(({ code }) => code)).toContain("FAMILIAR_FORM_UNAVAILABLE");
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

  it("blocks Frightened mechanics while Heroism is active", () => {
    const source = loadCharacter();
    source.state.activeEffectIds.push("srd521.status.spell.heroism");
    source.state.conditionIds.push("srd521.condition.frightened");

    const evaluation = evaluateCharacter({ character: source, packages: [loadRulesPackage()] });

    expect(evaluation.facts["condition.frightened.active"]).toBeUndefined();
    expect(evaluation.facts["attackRoll.mode"]).toBe("normal");
    expect(evaluation.d20Tests["skill.athletics"]?.rollMode).toBe("normal");
    expect(evaluation.validations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "CONDITION_BLOCKED_BY_IMMUNITY" })]),
    );
  });

  it("grants a configured Dragon's Breath action from active status data", () => {
    const source = loadCharacter();
    source.state.activeEffectIds.push("srd521.status.spell.dragon-s-breath");

    const incomplete = evaluateCharacter({ character: source, packages: [loadRulesPackage()] });
    expect(incomplete.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "srd521.action.status.dragon-s-breath",
          available: false,
        }),
      ]),
    );

    source.state.activeEffectParameters["srd521.status.spell.dragon-s-breath"] = {
      damageType: "fire",
      spellSlotLevel: "5",
      saveDifficultyClass: "15",
    };
    const evaluation = evaluateCharacter({ character: source, packages: [loadRulesPackage()] });
    const action = evaluation.actions.find(
      ({ id }) => id === "srd521.action.status.dragon-s-breath",
    );

    expect(action).toMatchObject({
      available: true,
      actionEconomy: "magic-action",
      parameters: {
        area: "15-foot Cone",
        damage: { diceCount: 6, diceSize: 6, type: "fire" },
        savingThrow: { ability: "dexterity", difficultyClass: 15 },
      },
    });
    expect(evaluation.traces[action?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "srd521.status.spell.dragon-s-breath" }),
      ]),
    );
  });

  it("publishes Feather Fall and Water Breathing capability facts", () => {
    const source = loadCharacter();
    source.state.activeEffectIds.push(
      "srd521.status.spell.feather-fall",
      "srd521.status.spell.water-breathing",
    );

    const evaluation = evaluateCharacter({ character: source, packages: [loadRulesPackage()] });

    expect(evaluation.facts["fall.descentRateFeetPerRound"]).toBe(60);
    expect(evaluation.facts["fall.damagePreventedOnLanding"]).toBe(true);
    expect(evaluation.facts["respiration.underwater"]).toBe(true);
    expect(evaluation.facts["respiration.normalRetained"]).toBe(true);
  });
});
