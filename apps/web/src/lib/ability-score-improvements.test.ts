import { describe, expect, it } from "vitest";
import { asiFeatSelection, featIncreases } from "./advancement-feats";
import { characterDocumentSchema } from "@dnd/character-model";
import { evaluateCharacter } from "@dnd/rules-core";
import {
  abilityScoreImprovementId,
  asiIncreases,
  asiLabel,
  asiOptions,
  savedAsiAllocations,
  validAsiAllocation,
} from "./ability-score-improvements";
import {
  buildCharacter,
  builderClassIds,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  updateBuilderLevel,
} from "./character-builder";
import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import { loadWebData } from "./server-data";

const options = { id: "repeat-asi", now: new Date("2026-10-10T16:00:00Z") };
function setup(level = 7) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(fighterId, catalog, level, "Improving Fighter");
  // Deliberately reverse ability ordering across acquisitions.
  draft.advancementFeats[0] = asiFeatSelection(["wisdom", "wisdom"]);
  if (level >= 6) draft.advancementFeats[1] = asiFeatSelection(["dexterity", "intelligence"]);
  const character = buildCharacter(draft, rulesPackage, options);
  return { rulesPackage, catalog, draft, character };
}

describe("repeatable, per-level Ability Score Improvements", () => {
  it("offers all six +2 and fifteen distinct +1/+1 allocations", () => {
    expect(asiOptions).toHaveLength(21);
    expect(new Set(asiOptions.map(({ value }) => value)).size).toBe(21);
    expect(asiOptions.filter(({ allocation }) => allocation[0] === allocation[1])).toHaveLength(6);
    expect(asiLabel(["wisdom", "wisdom"])).toBe("+2 Wisdom");
    expect(asiLabel(["dexterity", "wisdom"])).toBe("+1 Dexterity, +1 Wisdom");
    expect(
      asiIncreases([
        ["strength", "strength"],
        ["dexterity", "wisdom"],
      ]),
    ).toEqual({ strength: 2, dexterity: 1, wisdom: 1 });
  });

  it("rejects missing, extra, and unknown ability points at the draft boundary", () => {
    expect(validAsiAllocation(["strength", "dexterity"])).toBe(true);
    for (const allocation of [
      [],
      ["strength"],
      ["strength", "wisdom", "dexterity"],
      ["strength", "luck"],
    ])
      expect(validAsiAllocation(allocation)).toBe(false);
  });

  it.each(builderClassIds)("supports a split level-4 choice for %s", (classId) => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(classId, catalog, 4, "Split Caster");
    draft.advancementFeats[0] = asiFeatSelection(["intelligence", "wisdom"]);
    const character = buildCharacter(draft, rulesPackage, options);
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
    expect(character.build.featAbilityScoreIncreases).toEqual({ intelligence: 1, wisdom: 1 });
    expect(character.build.levels[3]?.featSelections).toEqual([
      { featId: abilityScoreImprovementId, abilityScoreIncreases: { intelligence: 1, wisdom: 1 } },
    ]);
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
  });

  it("advances Fighter 7→8 without sorting or rewriting earlier acquisitions or play state", () => {
    const { character, catalog, rulesPackage } = setup();
    character.state.currentHitPoints = 9;
    character.state.temporaryHitPoints = 3;
    character.state.expendedResources["srd521.resource.fighter.second-wind"] = 1;
    const draft = createLevelUpDraft(character, catalog);
    expect(draft.advancementFeats.slice(0, 2)).toEqual([
      asiFeatSelection(["wisdom", "wisdom"]),
      asiFeatSelection(["dexterity", "intelligence"]),
    ]);
    draft.advancementFeats[2] = asiFeatSelection(["constitution", "constitution"]);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(next.build.levels.slice(0, 7)).toEqual(character.build.levels);
    expect(next.build.levels[7]?.featSelections).toEqual([
      { featId: abilityScoreImprovementId, abilityScoreIncreases: { constitution: 2 } },
    ]);
    expect(next.build.featAbilityScoreIncreases).toEqual({
      wisdom: 2,
      dexterity: 1,
      intelligence: 1,
      constitution: 2,
    });
    expect(next.build.featIds.filter((id) => id === abilityScoreImprovementId)).toHaveLength(3);
    expect(next.state).toEqual(character.state);
    expect(next.loadout).toEqual(character.loadout);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(76);
    expect(evaluation.values.proficiencyBonus?.value).toBe(3);
    expect(levelUpEligibility(next, catalog)).toMatchObject({
      eligible: true,
      currentLevel: 8,
      targetLevel: 9,
    });
  });

  it("does not allow changing earlier choices, even if totals stay legal", () => {
    const { character, catalog, rulesPackage } = setup();
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    draft.advancementFeats[0] = asiFeatSelection(["charisma", "charisma"]);
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toContain(
      "Earlier Ability Score Improvement allocations cannot change during level up.",
    );
    expect(() => levelUpCharacter(character, draft, rulesPackage, options)).toThrow();
    expect(character).toEqual(before);
  });

  it("preserves legacy aggregate-only split choices without inventing records on old levels", () => {
    const { character, catalog, rulesPackage } = setup();
    for (const level of character.build.levels) delete level.featSelections;
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    expect(featIncreases(draft.advancementFeats.slice(0, 2))).toEqual(
      character.build.featAbilityScoreIncreases,
    );
    draft.advancementFeats[2] = asiFeatSelection(["constitution", "charisma"]);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(next.build.levels.slice(0, 7)).toEqual(before.build.levels);
    expect(next.build.featAbilityScoreIncreases).toEqual({
      wisdom: 2,
      dexterity: 1,
      intelligence: 1,
      constitution: 1,
      charisma: 1,
    });
    expect(
      evaluateCharacter({ character: next, packages: [rulesPackage] }).validations.filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
  });

  it.each([
    "totals",
    "wrong-level",
    "missing-feat",
    "wrong-pattern",
    "origin-feat",
    "empty-record",
  ])("rejects forged acquisition data: %s", (kind) => {
    const { character, rulesPackage } = setup();
    const fourth = character.build.levels[3];
    const first = character.build.levels[0];
    const record = fourth?.featSelections?.[0];
    if (!fourth || !first || !record) throw new Error("Missing acquisition fixture");
    if (kind === "totals") character.build.featAbilityScoreIncreases.wisdom = 1;
    if (kind === "wrong-level") {
      first.featSelections = fourth.featSelections;
      delete fourth.featSelections;
    }
    if (kind === "missing-feat")
      character.build.featIds = character.build.featIds.filter(
        (id) => id !== abilityScoreImprovementId,
      );
    if (kind === "wrong-pattern") record.abilityScoreIncreases = { wisdom: 3 };
    if (kind === "origin-feat") record.featId = "srd521.feat.origin.alert";
    if (kind === "empty-record") fourth.featSelections = [];
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.some(
        ({ severity }) => severity === "error",
      ),
    ).toBe(true);
  });

  it("rejects over-cap choices and supplies a legal default at the third Fighter grant", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(fighterId, catalog, 8, "Capped Fighter");
    const character = buildCharacter(draft, rulesPackage, options);
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
    draft.abilityScores.dexterity = 18;
    draft.advancementFeats = [
      asiFeatSelection(["dexterity", "dexterity"]),
      asiFeatSelection(["dexterity", "dexterity"]),
      asiFeatSelection(["dexterity", "dexterity"]),
    ];
    expect(() => buildCharacter(draft, rulesPackage, options)).toThrow();
  });

  it("reconciles target level without dropping a split choice or sharing tuple references", () => {
    const { draft, catalog } = setup(5);
    draft.advancementFeats[0] = asiFeatSelection(["dexterity", "wisdom"]);
    const next = updateBuilderLevel(draft, catalog, 8);
    expect(next.advancementFeats[0]).toEqual(asiFeatSelection(["dexterity", "wisdom"]));
    expect(next.advancementFeats).toHaveLength(3);
    const first = next.advancementFeats[0];
    if (!first) throw new Error("Missing allocation");
    first.abilityScoreIncreases.charisma = 1;
    expect(draft.advancementFeats[0]).toEqual(asiFeatSelection(["dexterity", "wisdom"]));
  });

  it("fails explicitly for incompatible legacy totals instead of silently adding a fallback", () => {
    const { character } = setup(5);
    delete character.build.levels[3]?.featSelections;
    character.build.featAbilityScoreIncreases = { wisdom: 1 };
    expect(() => savedAsiAllocations(character, [4])).toThrow("cannot be represented");
  });
});
