import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { proposeAction } from "./action-transition.js";
import { evaluateCharacter } from "./character-evaluator.js";

const packageRoot = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
const fixturesRoot = new URL("../../test-fixtures/", import.meta.url);
const authoringIrFiles = [
  "rogue.sneak-attack.json",
  "rogue.cunning-action.json",
  "rogue.steady-aim.json",
  "rogue.cunning-strike.json",
  "rogue.uncanny-dodge.json",
  "thief.fast-hands.json",
  "thief.second-story-work.json",
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
  return characterDocumentSchema.parse(readJson(new URL("characters/rogue-5.json", fixturesRoot)));
}

describe("evaluateCharacter Rogue level-5 vertical slice", () => {
  it("evaluates Thief defenses, Expertise, climb speed, and weapon mastery", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(38);
    expect(evaluation.values.armorClass?.value).toBe(16);
    expect(evaluation.values["speed.walking"]?.value).toBe(30);
    expect(evaluation.values["speed.climb"]?.value).toBe(30);
    expect(evaluation.values["attackAction.attacks"]?.value).toBe(1);
    expect(evaluation.values["classFeature.rogue.saveDifficultyClass"]?.value).toBe(15);
    expect(evaluation.d20Tests["skill.stealth"]).toMatchObject({
      modifier: 10,
      proficiency: { level: "expertise", bonus: 6 },
    });
    expect(evaluation.attacks.find((attack) => attack.id === "attack.shortbow-1")).toMatchObject({
      attackBonus: 7,
      mastery: { property: "vex", enabled: true },
    });
    expect(evaluation.attacks.find((attack) => attack.id === "attack.shortsword-1")).toMatchObject({
      attackBonus: 7,
      proficient: true,
      mastery: { property: "vex", enabled: false },
    });
  });

  it("exposes Sneak Attack, Cunning Action, Cunning Strike, and defensive actions", () => {
    const evaluation = evaluateCharacter({
      character: loadCharacter(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.actions).toHaveLength(11);
    expect(evaluation.actions.find((action) => action.id === "action.sneak-attack")).toMatchObject({
      available: true,
      actionEconomy: "on-hit",
      parameters: {
        extraDamage: {
          diceCount: 3,
          diceSize: 6,
          type: "weapon-damage-type",
          frequency: "once-per-turn",
        },
      },
    });
    expect(
      evaluation.actions.find((action) => action.id === "action.cunning-action.hide"),
    ).toMatchObject({
      actionEconomy: "bonus-action",
      parameters: { grantsAction: "hide" },
    });
    expect(
      evaluation.actions.find((action) => action.id === "action.cunning-strike.trip"),
    ).toMatchObject({
      parameters: {
        sneakAttackDiceCost: 1,
        savingThrow: { ability: "dexterity", difficultyClass: 15 },
      },
    });
    expect(
      evaluation.actions.find((action) => action.id === "action.cunning-strike.withdraw"),
    ).toMatchObject({
      parameters: {
        movement: { speedFraction: 0.5, maximumFeet: 15, provokesOpportunityAttacks: false },
      },
    });
    expect(evaluation.actions.find((action) => action.id === "action.uncanny-dodge")).toMatchObject(
      {
        actionEconomy: "reaction",
        parameters: { damageReductionFraction: 0.5 },
      },
    );
    expect(
      evaluation.actions.find((action) => action.id === "action.fast-hands.use-object"),
    ).toMatchObject({ actionEconomy: "bonus-action" });
  });

  it("validates the Rogue subclass and both Expertise selections", () => {
    const character = loadCharacter();
    delete character.build.subclassId;
    character.build.proficiencyChoices.expertise =
      character.build.proficiencyChoices.expertise.slice(0, 1);

    const evaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((message) => message.code)).toEqual(
      expect.arrayContaining(["ROGUE_SUBCLASS_REQUIRED", "ROGUE_EXPERTISE_CHOICE_COUNT"]),
    );
  });

  it("rejects Expertise on a skill without proficiency", () => {
    const character = loadCharacter();
    character.build.proficiencyChoices.expertise[0] = {
      skillId: "srd521.skill.deception",
      sourceId: "srd521.class-feature.rogue.expertise",
    };

    const evaluation = evaluateCharacter({
      character,
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations.map((message) => message.code)).toContain(
      "EXPERTISE_REQUIRES_PROFICIENCY",
    );
  });

  it("labels target-dependent Rogue actions as transition-assisted", () => {
    const character = loadCharacter();
    const proposal = proposeAction(
      { character, packages: [loadRulesPackage()] },
      { actionId: "action.uncanny-dodge" },
    );

    expect(proposal.applicable).toBe(false);
    expect(proposal.validations.map((message) => message.code)).toContain(
      "ACTION_TRANSITION_UNSUPPORTED",
    );
    expect(proposal.nextState).toEqual(character.state);
  });
});
