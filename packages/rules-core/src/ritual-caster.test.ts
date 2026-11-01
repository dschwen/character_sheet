import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { evaluateCharacter } from "./character-evaluator.js";

const packageRoot = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
const fixturesRoot = new URL("../../test-fixtures/", import.meta.url);

const ritualFeatId = "dnd2024.feat.general.ritual-caster";
const ritual2014FeatId = "dnd2014.feat.general.ritual-caster";
const abilityScoreImprovementId = "srd521.feat.general.ability-score-improvement";
const choiceId = `${ritualFeatId}.choice.ritual-spells`;
const resourceId = `${ritualFeatId}.free-cast`;

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

function loadRulesPackage(): LoadedRulesPackage {
  return {
    manifest: packageManifestSchema.parse(readJson(new URL("manifest.json", packageRoot))),
    entities: contentEntitySchema.array().parse(readJson(new URL("entities.json", packageRoot))),
    authoringIr: [],
  };
}

// A level-5 Wizard that took the 2024 Ritual Caster at its level-4 Ability Score Improvement
// instead of the Ability Score Improvement itself. Bookkeeping is complete: the feat's +1 replaces
// the fixture's ASI aggregate, and the recorded selection matches it.
function ritualCasterWizard(
  ability: "intelligence" | "strength",
  spellIds: string[],
  options: { recordSelection?: boolean } = {},
): CharacterDocument {
  const character = characterDocumentSchema.parse(
    readJson(new URL("characters/wizard-5.json", fixturesRoot)),
  );
  character.build.featIds = character.build.featIds
    .filter((id) => id !== abilityScoreImprovementId)
    .concat(ritualFeatId);
  character.build.abilityScores.intelligence = 16;
  character.build.featAbilityScoreIncreases = { [ability]: 1 };
  const levelFour = character.build.levels[3];
  if (levelFour === undefined) throw new Error("Expected a level-4 row in the fixture.");
  if (options.recordSelection !== false)
    levelFour.featSelections = [{ featId: ritualFeatId, abilityScoreIncreases: { [ability]: 1 } }];
  if (spellIds.length > 0) character.build.choices = [{ choiceId, optionIds: spellIds }];
  return character;
}

function evaluate(character: CharacterDocument) {
  return evaluateCharacter({ character, packages: [loadRulesPackage()] });
}

function ritualCodes(character: CharacterDocument): string[] {
  return evaluate(character)
    .validations.filter((validation) => validation.code.startsWith("RITUAL_CASTER_"))
    .map((validation) => validation.code);
}

function featOptionFor(evaluation: ReturnType<typeof evaluate>, spellId: string) {
  return evaluation.spells
    .find((spell) => spell.id === spellId)
    ?.castingOptions?.find((option) => option.sourceId === ritualFeatId);
}

describe("2024-variant Ritual Caster", () => {
  it("grants exactly Proficiency Bonus level 1 Ritual spells, always prepared, tied to the increased ability", () => {
    const evaluation = evaluate(
      ritualCasterWizard("intelligence", ["srd521.spell.alarm", "srd521.spell.detect-magic"]),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toEqual([]);

    for (const spellId of ["srd521.spell.alarm", "srd521.spell.detect-magic"]) {
      const spell = evaluation.spells.find((candidate) => candidate.id === spellId);
      expect(spell, spellId).toBeDefined();
      expect(spell?.prepared).toBe(true);
      expect(spell?.ritual).toBe(true);
      const option = featOptionFor(evaluation, spellId);
      expect(option, spellId).toMatchObject({
        ability: "intelligence",
        attackBonus: 6,
        saveDifficultyClass: 14,
        freeCastResourceId: resourceId,
        freeCastAvailable: true,
      });
    }

    const quickRitual = evaluation.resources.find((resource) => resource.id === resourceId);
    expect(quickRitual).toMatchObject({
      maximum: 1,
      current: 1,
      recharge: [{ event: "long-rest", amount: "all" }],
    });

    const attackTrace = evaluation.traces[`spellcasting.general.ritual-caster.attackBonus`];
    expect(attackTrace?.result).toBe(6);
    // The feat cites its edition reference honestly: no page is invented for it. The spells it
    // grants keep their own pinned SRD sources.
    const sourceReferences = attackTrace?.sourceReferences ?? [];
    expect(sourceReferences).toHaveLength(1);
    const reference = sourceReferences[0];
    expect(reference?.entityId).toBe(ritualFeatId);
    expect(reference?.sourceId).toBe("phb-2024");
    expect(reference?.quoteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(reference ?? {}).sort()).toEqual(["entityId", "quoteHash", "sourceId"]);
    const spell = evaluation.spells.find((candidate) => candidate.id === "srd521.spell.alarm");
    expect(spell?.sources.some((source) => source.sourceId === "wotc-srd-5.2.1-en")).toBe(true);
    expect(spell?.sources.some((source) => source.sourceId === "phb-2024")).toBe(false);
  });

  it("counts grow with Proficiency Bonus; additions are allowed, not required", () => {
    const evaluation = evaluate(
      ritualCasterWizard("intelligence", [
        "srd521.spell.alarm",
        "srd521.spell.detect-magic",
        "srd521.spell.comprehend-languages",
      ]),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toEqual([]);
    for (const spellId of ["srd521.spell.comprehend-languages"]) {
      expect(featOptionFor(evaluation, spellId)).toBeDefined();
    }
  });

  it("flags a selection below the acquisition-time minimum or above the current bonus", () => {
    const tooFew = evaluate(ritualCasterWizard("intelligence", ["srd521.spell.alarm"]));
    expect(tooFew.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_SPELL_COUNT_INVALID",
    );
    const tooMany = evaluate(
      ritualCasterWizard("intelligence", [
        "srd521.spell.alarm",
        "srd521.spell.detect-magic",
        "srd521.spell.comprehend-languages",
        "srd521.spell.detect-poison-and-disease",
      ]),
    );
    expect(tooMany.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_SPELL_COUNT_INVALID",
    );
  });

  it("only level 1 spells with the Ritual tag are grantable", () => {
    const evaluation = evaluate(
      ritualCasterWizard("intelligence", ["srd521.spell.bless", "srd521.spell.augury"]),
    );
    const codes = evaluation.validations.map((validation) => validation.code);
    expect(codes.filter((code) => code === "RITUAL_CASTER_SPELL_INVALID")).toHaveLength(2);
    for (const spellId of ["srd521.spell.bless", "srd521.spell.augury"]) {
      expect(featOptionFor(evaluation, spellId)).toBeUndefined();
    }
  });

  it("requires exactly one recorded ability increase among the feat's own abilities", () => {
    const wrongAbility = evaluate(
      ritualCasterWizard("strength", ["srd521.spell.alarm", "srd521.spell.detect-magic"]),
    );
    expect(wrongAbility.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_CASTING_ABILITY_TIE_INVALID",
    );
    const withoutSelection = evaluate(
      ritualCasterWizard("intelligence", ["srd521.spell.alarm", "srd521.spell.detect-magic"], {
        recordSelection: false,
      }),
    );
    expect(withoutSelection.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_CASTING_ABILITY_TIE_INVALID",
    );
    expect(
      wrongAbility.spells.some(
        (spell) =>
          spell.id === "srd521.spell.alarm" &&
          (spell.castingOptions ?? []).some((option) => option.sourceId === ritualFeatId),
      ),
    ).toBe(false);
  });

  it("a Wisdom increase is a legal tie and sets Wisdom as the casting ability", () => {
    const character = ritualCasterWizard("intelligence", [
      "srd521.spell.alarm",
      "srd521.spell.detect-magic",
    ]);
    character.build.featAbilityScoreIncreases = { wisdom: 1 };
    const levelFour = character.build.levels[3];
    if (levelFour?.featSelections === undefined) throw new Error("Expected the level-4 record.");
    levelFour.featSelections = [{ featId: ritualFeatId, abilityScoreIncreases: { wisdom: 1 } }];
    const evaluation = evaluate(character);
    expect(evaluation.validations.map((validation) => validation.code)).toEqual([]);
    // Wisdom 12 + the feat's +1 = 13 → modifier +1; attack 1+3, DC 8+1+3.
    expect(featOptionFor(evaluation, "srd521.spell.alarm")).toMatchObject({
      ability: "wisdom",
      attackBonus: 4,
      saveDifficultyClass: 12,
    });
  });

  it("the 2014 variant record is not evaluated by the 2024 semantics", () => {
    const character = ritualCasterWizard("intelligence", [
      "srd521.spell.alarm",
      "srd521.spell.detect-magic",
    ]);
    character.build.featIds.push(ritual2014FeatId);
    const evaluation = evaluate(character);
    const codes = evaluation.validations.map((validation) => validation.code);
    expect(codes.filter((code) => code.startsWith("RITUAL_CASTER_"))).toEqual([]);
    // The shared feat-acquisition machinery still sees it as an ability-prerequisite General feat
    // without a recorded acquisition. That is its honest state until Stage 2 implements its own
    // ritual-book semantics.
    expect(codes).toContain("FEAT_ACQUISITION_HISTORY_REQUIRED");
    expect(
      evaluation.resources.some((resource) =>
        resource.id.startsWith(`${ritual2014FeatId}.free-cast`),
      ),
    ).toBe(false);
    expect(ritualCodes(ritualCasterWizard("intelligence", ["srd521.spell.alarm"]))).toContain(
      "RITUAL_CASTER_SPELL_COUNT_INVALID",
    );
  });
});
