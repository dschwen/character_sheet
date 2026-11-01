import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { evaluateCharacter } from "./character-evaluator.js";

const packageRoot = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
const fixturesRoot = new URL("../../test-fixtures/", import.meta.url);

const ritual2024FeatId = "dnd2024.feat.general.ritual-caster";
const ritual2014FeatId = "dnd2014.feat.general.ritual-caster";
const abilityScoreImprovementId = "srd521.feat.general.ability-score-improvement";
const classChoiceId = `${ritual2014FeatId}.choice.spell-list-class`;
const initialChoiceId = `${ritual2014FeatId}.choice.ritual-spells`;
const researchChoiceId = `${ritual2014FeatId}.choice.ritual-book-research`;

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

function loadLevelFour(character: CharacterDocument) {
  const levelFour = character.build.levels[3];
  if (levelFour === undefined) throw new Error("Expected a level-4 row in the fixture.");
  return levelFour;
}

// A level-5 Wizard that took the 2024-variant feat at its level-4 Ability Score Improvement
// instead of the Ability Score Improvement itself. Bookkeeping is complete: the feat's +1 replaces
// the fixture's ASI aggregate, and the recorded selection matches it. Effective Intelligence 17 →
// attack bonus 6, save difficulty 14.
function ritualCaster2024Wizard(spellIds: string[]): CharacterDocument {
  const character = characterDocumentSchema.parse(
    readJson(new URL("characters/wizard-5.json", fixturesRoot)),
  );
  character.build.featIds = character.build.featIds
    .filter((id) => id !== abilityScoreImprovementId)
    .concat(ritual2024FeatId);
  character.build.abilityScores.intelligence = 16;
  character.build.featAbilityScoreIncreases = { intelligence: 1 };
  loadLevelFour(character).featSelections = [
    { featId: ritual2024FeatId, abilityScoreIncreases: { intelligence: 1 } },
  ];
  if (spellIds.length > 0)
    character.build.choices = [
      { choiceId: `${ritual2024FeatId}.choice.ritual-spells`, optionIds: spellIds },
    ];
  return character;
}

// A level-5 Wizard that took the 2014-variant feat at its level-4 Ability Score Improvement and
// got no ability increase from it. Effective Intelligence 15 → attack bonus 5, save difficulty 13;
// the book casts with the chosen class's ability, which for a Wizard is also Intelligence.
function ritualBook2014Wizard(
  classId: string,
  initialSpellIds: string[],
  researchSpellIds: string[] = [],
): CharacterDocument {
  const character = characterDocumentSchema.parse(
    readJson(new URL("characters/wizard-5.json", fixturesRoot)),
  );
  character.build.featIds = character.build.featIds
    .filter((id) => id !== abilityScoreImprovementId)
    .concat(ritual2014FeatId);
  character.build.featAbilityScoreIncreases = {};
  loadLevelFour(character).featSelections = [
    { featId: ritual2014FeatId, abilityScoreIncreases: {} },
  ];
  character.build.choices = [
    { choiceId: classChoiceId, optionIds: [classId] },
    { choiceId: initialChoiceId, optionIds: initialSpellIds },
    ...(researchSpellIds.length > 0
      ? [{ choiceId: researchChoiceId, optionIds: researchSpellIds }]
      : []),
  ];
  return character;
}

function evaluate(character: CharacterDocument) {
  return evaluateCharacter({ character, packages: [loadRulesPackage()] });
}

function codes(character: CharacterDocument): string[] {
  return evaluate(character).validations.map((validation) => validation.code);
}

function featOptionFor(evaluation: ReturnType<typeof evaluate>, spellId: string, featId: string) {
  return evaluation.spells
    .find((spell) => spell.id === spellId)
    ?.castingOptions?.find((option) => option.sourceId === featId);
}

// A trace citing its record's edition-reference span honestly: no page is invented for it.
function expectEditionReferenceTrace(
  evaluation: ReturnType<typeof evaluate>,
  traceId: string,
  result: number,
  featId: string,
  sourceId: string,
) {
  const trace = evaluation.traces[traceId];
  expect(trace?.result).toBe(result);
  const sourceReferences = trace?.sourceReferences ?? [];
  expect(sourceReferences).toHaveLength(1);
  const reference = sourceReferences[0];
  expect(reference?.entityId).toBe(featId);
  expect(reference?.sourceId).toBe(sourceId);
  expect(reference?.quoteHash).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(reference ?? {}).sort()).toEqual(["entityId", "quoteHash", "sourceId"]);
}

describe("2024-variant Ritual Caster", () => {
  it("grants exactly Proficiency Bonus level 1 Ritual spells, always prepared, tied to the increased ability", () => {
    const evaluation = evaluate(
      ritualCaster2024Wizard(["srd521.spell.alarm", "srd521.spell.detect-magic"]),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toEqual([]);

    for (const spellId of ["srd521.spell.alarm", "srd521.spell.detect-magic"]) {
      const spell = evaluation.spells.find((candidate) => candidate.id === spellId);
      expect(spell, spellId).toBeDefined();
      expect(spell?.prepared).toBe(true);
      expect(spell?.ritual).toBe(true);
      const option = featOptionFor(evaluation, spellId, ritual2024FeatId);
      expect(option, spellId).toMatchObject({
        ability: "intelligence",
        attackBonus: 6,
        saveDifficultyClass: 14,
        freeCastResourceId: `${ritual2024FeatId}.free-cast`,
        freeCastAvailable: true,
      });
    }

    const quickRitual = evaluation.resources.find(
      (resource) => resource.id === `${ritual2024FeatId}.free-cast`,
    );
    expect(quickRitual).toMatchObject({
      maximum: 1,
      current: 1,
      recharge: [{ event: "long-rest", amount: "all" }],
    });

    expectEditionReferenceTrace(
      evaluation,
      `spellcasting.${ritual2024FeatId}.attackBonus`,
      6,
      ritual2024FeatId,
      "phb-2024",
    );
    const spell = evaluation.spells.find((candidate) => candidate.id === "srd521.spell.alarm");
    expect(spell?.sources.some((source) => source.sourceId === "wotc-srd-5.2.1-en")).toBe(true);
    expect(spell?.sources.some((source) => source.sourceId === "phb-2024")).toBe(false);
  });

  it("counts grow with Proficiency Bonus; additions are allowed, not required", () => {
    const evaluation = evaluate(
      ritualCaster2024Wizard([
        "srd521.spell.alarm",
        "srd521.spell.detect-magic",
        "srd521.spell.comprehend-languages",
      ]),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toEqual([]);
    expect(
      featOptionFor(evaluation, "srd521.spell.comprehend-languages", ritual2024FeatId),
    ).toBeDefined();
  });

  it("flags a selection below the acquisition-time minimum or above the current bonus", () => {
    const tooFew = evaluate(ritualCaster2024Wizard(["srd521.spell.alarm"]));
    expect(tooFew.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_SPELL_COUNT_INVALID",
    );
    const tooMany = evaluate(
      ritualCaster2024Wizard([
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
      ritualCaster2024Wizard(["srd521.spell.bless", "srd521.spell.augury"]),
    );
    const validationCodes = evaluation.validations.map((validation) => validation.code);
    expect(validationCodes.filter((code) => code === "RITUAL_CASTER_SPELL_INVALID")).toHaveLength(
      2,
    );
    for (const spellId of ["srd521.spell.bless", "srd521.spell.augury"]) {
      expect(featOptionFor(evaluation, spellId, ritual2024FeatId)).toBeUndefined();
    }
  });

  it("requires exactly one recorded ability increase among the feat's own abilities", () => {
    const wrongAbility = ritualCaster2024Wizard([
      "srd521.spell.alarm",
      "srd521.spell.detect-magic",
    ]);
    wrongAbility.build.featAbilityScoreIncreases = { strength: 1 };
    loadLevelFour(wrongAbility).featSelections = [
      { featId: ritual2024FeatId, abilityScoreIncreases: { strength: 1 } },
    ];
    const evaluation = evaluate(wrongAbility);
    expect(evaluation.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_CASTING_ABILITY_TIE_INVALID",
    );
    expect(
      evaluation.spells.some(
        (spell) =>
          spell.id === "srd521.spell.alarm" &&
          (spell.castingOptions ?? []).some((option) => option.sourceId === ritual2024FeatId),
      ),
    ).toBe(false);

    const withoutSelection = ritualCaster2024Wizard([
      "srd521.spell.alarm",
      "srd521.spell.detect-magic",
    ]);
    loadLevelFour(withoutSelection).featSelections = [];
    expect(codes(withoutSelection)).toContain("RITUAL_CASTER_CASTING_ABILITY_TIE_INVALID");
  });

  it("a Wisdom increase is a legal tie and sets Wisdom as the casting ability", () => {
    const character = ritualCaster2024Wizard(["srd521.spell.alarm", "srd521.spell.detect-magic"]);
    character.build.abilityScores.intelligence = 15;
    character.build.featAbilityScoreIncreases = { wisdom: 1 };
    loadLevelFour(character).featSelections = [
      { featId: ritual2024FeatId, abilityScoreIncreases: { wisdom: 1 } },
    ];
    const evaluation = evaluate(character);
    expect(evaluation.validations.map((validation) => validation.code)).toEqual([]);
    // Wisdom 12 + the feat's +1 = 13 → modifier +1; attack 1+3, DC 8+1+3.
    expect(featOptionFor(evaluation, "srd521.spell.alarm", ritual2024FeatId)).toMatchObject({
      ability: "wisdom",
      attackBonus: 4,
      saveDifficultyClass: 12,
    });
  });
});

describe("2014-variant Ritual Caster", () => {
  it("grants the chosen class list's level 1 Rituals as unprepared always-ritual book spells", () => {
    const evaluation = evaluate(
      ritualBook2014Wizard("srd521.class.wizard", ["srd521.spell.alarm", "srd521.spell.identify"]),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toEqual([]);

    for (const spellId of ["srd521.spell.alarm", "srd521.spell.identify"]) {
      const spell = evaluation.spells.find((candidate) => candidate.id === spellId);
      expect(spell, spellId).toBeDefined();
      expect(spell?.prepared).toBe(false);
      expect(spell?.ritual).toBe(true);
      const option = featOptionFor(evaluation, spellId, ritual2014FeatId);
      expect(option, spellId).toMatchObject({
        ability: "intelligence",
        attackBonus: 5,
        saveDifficultyClass: 13,
        freeCastAtWill: true,
      });
      expect(option?.freeCastGuidance).toBeDefined();
      expect(option?.freeCastResourceId).toBeUndefined();
    }

    expect(evaluation.resources.some((resource) => resource.id.startsWith(ritual2014FeatId))).toBe(
      false,
    );
    expectEditionReferenceTrace(
      evaluation,
      `spellcasting.${ritual2014FeatId}.attackBonus`,
      5,
      ritual2014FeatId,
      "phb-2014",
    );
  });

  it("research extends the book up to half the character's level, rounded up", () => {
    // Level 5 → research spells of level 3 or lower. Augury is level 2 and on the Wizard list.
    const evaluation = evaluate(
      ritualBook2014Wizard(
        "srd521.class.wizard",
        ["srd521.spell.alarm", "srd521.spell.identify"],
        ["srd521.spell.find-familiar", "srd521.spell.augury"],
      ),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toEqual([]);
    for (const spellId of ["srd521.spell.find-familiar", "srd521.spell.augury"]) {
      expect(featOptionFor(evaluation, spellId, ritual2014FeatId), spellId).toBeDefined();
    }
  });

  it("researched spells may not exceed half the character level rounded up", () => {
    // Divination is level 4; at level 5 the research cap is 3.
    const evaluation = evaluate(
      ritualBook2014Wizard(
        "srd521.class.wizard",
        ["srd521.spell.alarm", "srd521.spell.identify"],
        ["srd521.spell.divination"],
      ),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_SPELL_INVALID",
    );
    expect(featOptionFor(evaluation, "srd521.spell.divination", ritual2014FeatId)).toBeUndefined();
  });

  it("the book must start with exactly two spells", () => {
    const tooFew = evaluate(ritualBook2014Wizard("srd521.class.wizard", ["srd521.spell.alarm"]));
    expect(tooFew.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_INITIAL_COUNT_INVALID",
    );
    const tooMany = evaluate(
      ritualBook2014Wizard("srd521.class.wizard", [
        "srd521.spell.alarm",
        "srd521.spell.identify",
        "srd521.spell.find-familiar",
      ]),
    );
    expect(tooMany.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_INITIAL_COUNT_INVALID",
    );
  });

  it("book spells must be Ritual spells from the chosen class list at the allowed level", () => {
    // Level 1 Rituals, but speak-with-animals and purify-food-and-drink are not Wizard spells.
    const offList = evaluate(
      ritualBook2014Wizard("srd521.class.wizard", [
        "srd521.spell.speak-with-animals",
        "srd521.spell.purify-food-and-drink",
      ]),
    );
    const offListCodes = offList.validations.map((validation) => validation.code);
    expect(offListCodes.filter((code) => code === "RITUAL_CASTER_SPELL_INVALID")).toHaveLength(2);
    for (const spellId of [
      "srd521.spell.speak-with-animals",
      "srd521.spell.purify-food-and-drink",
    ]) {
      expect(featOptionFor(offList, spellId, ritual2014FeatId), spellId).toBeUndefined();
    }

    // Augury is a Wizard Ritual but level 2; the initial book is limited to level 1.
    const evaluation = evaluate(
      ritualBook2014Wizard("srd521.class.wizard", ["srd521.spell.alarm", "srd521.spell.augury"]),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_SPELL_INVALID",
    );
    expect(featOptionFor(evaluation, "srd521.spell.augury", ritual2014FeatId)).toBeUndefined();
    expect(featOptionFor(evaluation, "srd521.spell.alarm", ritual2014FeatId)).toBeDefined();
  });

  it("researched spells must not duplicate the initial book", () => {
    const evaluation = evaluate(
      ritualBook2014Wizard(
        "srd521.class.wizard",
        ["srd521.spell.alarm", "srd521.spell.identify"],
        ["srd521.spell.alarm"],
      ),
    );
    expect(evaluation.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_RESEARCH_DUPLICATE",
    );
  });

  it("only the record's own class lists are selectable, and the selection is required", () => {
    const fighterList = evaluate(
      ritualBook2014Wizard("srd521.class.fighter", ["srd521.spell.alarm", "srd521.spell.identify"]),
    );
    expect(fighterList.validations.map((validation) => validation.code)).toContain(
      "RITUAL_CASTER_CLASS_CHOICE_INVALID",
    );
    expect(featOptionFor(fighterList, "srd521.spell.alarm", ritual2014FeatId)).toBeUndefined();

    const withoutClassChoice = ritualBook2014Wizard("srd521.class.wizard", [
      "srd521.spell.alarm",
      "srd521.spell.detect-magic",
    ]);
    withoutClassChoice.build.choices = withoutClassChoice.build.choices.filter(
      (choice) => choice.choiceId !== classChoiceId,
    );
    expect(codes(withoutClassChoice)).toContain("RITUAL_CASTER_CLASS_CHOICE_INVALID");
  });
});

describe("both variants on one sheet", () => {
  it("keeps each variant's spellcasting calculation distinct and correctly attributed", () => {
    // Deliberately over-subscribed for a five-level Wizard (one ASI grant, two feat records):
    // the shared feat-acquisition machinery flags that, while both feats still evaluate.
    const character = ritualCaster2024Wizard(["srd521.spell.alarm", "srd521.spell.detect-magic"]);
    character.build.featIds.push(ritual2014FeatId);
    loadLevelFour(character).featSelections = [
      { featId: ritual2024FeatId, abilityScoreIncreases: { intelligence: 1 } },
      { featId: ritual2014FeatId, abilityScoreIncreases: {} },
    ];
    character.build.choices = [
      ...character.build.choices,
      { choiceId: classChoiceId, optionIds: ["srd521.class.wizard"] },
      {
        choiceId: initialChoiceId,
        optionIds: ["srd521.spell.find-familiar", "srd521.spell.identify"],
      },
    ];
    const evaluation = evaluate(character);
    const validationCodes = evaluation.validations.map((validation) => validation.code);
    expect(validationCodes).toContain("GENERAL_FEAT_CHOICE_COUNT");
    expect(validationCodes).toContain("FEAT_ACQUISITION_LEVEL");

    expectEditionReferenceTrace(
      evaluation,
      `spellcasting.${ritual2024FeatId}.attackBonus`,
      6,
      ritual2024FeatId,
      "phb-2024",
    );
    // The 2014 book casts with the chosen class's ability; effective Intelligence here comes
    // from the 2024 feat's recorded +1, so the shared ability yields attack 6.
    expectEditionReferenceTrace(
      evaluation,
      `spellcasting.${ritual2014FeatId}.attackBonus`,
      6,
      ritual2014FeatId,
      "phb-2014",
    );
    expect(featOptionFor(evaluation, "srd521.spell.alarm", ritual2024FeatId)).toBeDefined();
    expect(featOptionFor(evaluation, "srd521.spell.find-familiar", ritual2014FeatId)).toBeDefined();
  });
});
