import { describe, expect, it } from "vitest";
import { evaluateCharacter } from "@dnd/rules-core";
import { characterDocumentSchema } from "@dnd/character-model";
import {
  advancementOptions,
  buildCharacter,
  builderClassIds,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  previewBuilderCharacter,
} from "./character-builder";
import {
  asiFeatSelection,
  featAllocationOptions,
  featIncreases,
  featSelectionKey,
  savedAdvancementFeats,
} from "./advancement-feats";
import { createLevelUpDraft, levelUpCharacter, previewLevelUp } from "./character-level-up";
import { loadWebData } from "./server-data";

const grapplerId = "srd521.feat.general.grappler";
const options = { id: "grappler", now: new Date("2026-10-10T18:00:00Z") };
const grappler = (ability: "strength" | "dexterity") => ({
  featId: grapplerId,
  abilityScoreIncreases: { [ability]: 1 },
});
function setup(level = 4) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(fighterId, catalog, level, "Grappler");
  draft.abilityScores.strength = 13;
  draft.advancementFeats[0] = grappler("strength");
  return { rulesPackage, catalog, draft };
}
function errors(
  character: ReturnType<typeof buildCharacter>,
  rulesPackage: ReturnType<typeof loadWebData>["rulesPackage"],
) {
  return evaluateCharacter({ character, packages: [rulesPackage] }).validations.filter(
    ({ severity }) => severity === "error",
  );
}

describe("source-driven advancement feat choices", () => {
  it("reads the two Grappler allocations, prerequisites, and combat guidance from content", () => {
    const { catalog } = setup();
    const feat = catalog.feats[grapplerId];
    if (feat === undefined) throw new Error("Missing Grappler");
    expect(feat.advancement).toMatchObject({
      repeatable: false,
      abilityScoreIncreasePatterns: [[1]],
      abilityScoreIncreaseAbilities: ["strength", "dexterity"],
      maximumAbilityScore: 20,
      prerequisite: {
        minimumCharacterLevel: 4,
        anyAbilityScoreMinimums: [
          { ability: "strength", minimum: 13 },
          { ability: "dexterity", minimum: 13 },
        ],
      },
    });
    expect(featAllocationOptions(feat).map(({ selection }) => selection)).toEqual([
      grappler("strength"),
      grappler("dexterity"),
    ]);
    expect(feat.advancement?.combatGuidance).toHaveLength(3);
    expect(feat.advancement?.combatGuidance[1]).toContain("Grappled by you");
  });

  it.each(builderClassIds)(
    "creates a legal Grappler for %s without class-specific feat logic",
    (classId) => {
      const { rulesPackage, catalog } = setup();
      const draft = defaultBuilderDraft(classId, catalog, 4, "Grappler");
      draft.abilityScores.strength = 13;
      draft.advancementFeats[0] = grappler("dexterity");
      expect(
        advancementOptions(draft, catalog, 0).some(
          ({ value }) => value === featSelectionKey(grappler("dexterity")),
        ),
      ).toBe(true);
      const character = buildCharacter(draft, rulesPackage, options);
      expect(errors(character, rulesPackage)).toEqual([]);
      expect(character.build.levels[3]?.featSelections).toEqual([grappler("dexterity")]);
      expect(character.build.featAbilityScoreIncreases).toEqual({ dexterity: 1 });
      expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(
        character,
      );
    },
  );

  it("does not let Grappler's own increase satisfy its prerequisite", () => {
    const { draft, rulesPackage } = setup();
    const character = buildCharacter(draft, rulesPackage, options);
    for (const ability of ["strength", "dexterity"] as const) {
      draft.abilityScores[ability] = 12 - (draft.backgroundAbilityScoreIncreases[ability] ?? 0);
      character.build.abilityScores[ability] = draft.abilityScores[ability];
    }
    expect(previewBuilderCharacter(draft, rulesPackage, options).issues.length).toBeGreaterThan(0);
    expect(errors(character, rulesPackage).map(({ code }) => code)).toContain(
      "FEAT_ABILITY_PREREQUISITE",
    );
  });

  it("accepts either prerequisite independently and either allowed increase", () => {
    for (const qualifying of ["strength", "dexterity"] as const)
      for (const increase of ["strength", "dexterity"] as const) {
        const { draft, rulesPackage } = setup();
        for (const ability of ["strength", "dexterity"] as const)
          draft.abilityScores[ability] =
            (ability === qualifying ? 13 : 10) -
            (draft.backgroundAbilityScoreIncreases[ability] ?? 0);
        draft.advancementFeats[0] = grappler(increase);
        expect(errors(buildCharacter(draft, rulesPackage, options), rulesPackage)).toEqual([]);
      }
  });

  it("preserves Grappler history and play state while acquiring a later ASI", () => {
    const { draft, rulesPackage, catalog } = setup(7);
    const character = buildCharacter(draft, rulesPackage, options);
    character.state.currentHitPoints = 5;
    character.state.expendedResources["srd521.resource.fighter.second-wind"] = 1;
    const advancement = createLevelUpDraft(character, catalog);
    expect(advancement.advancementFeats[0]).toEqual(grappler("strength"));
    expect(
      advancementOptions(advancement, catalog, 2).some(
        ({ selection }) => selection.featId === grapplerId,
      ),
    ).toBe(false);
    advancement.advancementFeats[2] = asiFeatSelection(["wisdom", "constitution"]);
    const next = levelUpCharacter(character, advancement, rulesPackage, options);
    expect(next.build.levels.slice(0, 7)).toEqual(character.build.levels);
    expect(next.state).toEqual(character.state);
    expect(next.loadout).toEqual(character.loadout);
    expect(next.build.featIds.filter((id) => id === grapplerId)).toHaveLength(1);
    expect(next.build.featAbilityScoreIncreases).toEqual(
      featIncreases(advancement.advancementFeats),
    );
    expect(errors(next, rulesPackage)).toEqual([]);
    advancement.advancementFeats[0] = grappler("dexterity");
    expect(previewLevelUp(character, advancement, rulesPackage, options).issues).toContain(
      "Earlier Ability Score Improvement allocations cannot change during level up.",
    );
  });

  it("qualifies from a recorded earlier ASI, never a later one", () => {
    const { draft, rulesPackage } = setup(8);
    draft.abilityScores.strength = 11 - (draft.backgroundAbilityScoreIncreases.strength ?? 0);
    draft.abilityScores.dexterity = 10 - (draft.backgroundAbilityScoreIncreases.dexterity ?? 0);
    draft.advancementFeats = [
      asiFeatSelection(["strength", "strength"]),
      grappler("strength"),
      asiFeatSelection(["wisdom", "wisdom"]),
    ];
    const character = buildCharacter(draft, rulesPackage, options);
    expect(errors(character, rulesPackage)).toEqual([]);
    const fourth = character.build.levels[3];
    const sixth = character.build.levels[5];
    if (fourth === undefined || sixth === undefined) throw new Error("Missing levels");
    [fourth.featSelections, sixth.featSelections] = [sixth.featSelections, fourth.featSelections];
    expect(errors(character, rulesPackage).map(({ code }) => code)).toContain(
      "FEAT_ABILITY_PREREQUISITE",
    );
  });

  it("acquires Grappler during advancement and preserves previous ASIs", () => {
    const { draft, rulesPackage, catalog } = setup(7);
    draft.advancementFeats[0] = asiFeatSelection(["wisdom", "wisdom"]);
    const character = buildCharacter(draft, rulesPackage, options);
    const advancement = createLevelUpDraft(character, catalog);
    advancement.advancementFeats[2] = grappler("dexterity");
    const next = levelUpCharacter(character, advancement, rulesPackage, options);
    expect(next.build.levels.slice(0, 7)).toEqual(character.build.levels);
    expect(next.build.levels[7]?.featSelections).toEqual([grappler("dexterity")]);
    expect(errors(next, rulesPackage)).toEqual([]);
  });

  it("retains explicit Grappler history alongside a legacy ASI without writing old records", () => {
    const { draft, rulesPackage, catalog } = setup(7);
    const character = buildCharacter(draft, rulesPackage, options);
    delete character.build.levels[5]?.featSelections;
    const advancement = createLevelUpDraft(character, catalog);
    expect(advancement.advancementFeats[0]).toEqual(grappler("strength"));
    const next = levelUpCharacter(character, advancement, rulesPackage, options);
    expect(next.build.levels.slice(0, 7)).toEqual(character.build.levels);
    expect(errors(next, rulesPackage)).toEqual([]);
  });

  it.each(["wrong-ability", "wrong-amount", "duplicate", "missing-history", "early", "over-cap"])(
    "rejects forged selections: %s",
    (kind) => {
      const { draft, rulesPackage } = setup(8);
      const character = buildCharacter(draft, rulesPackage, options);
      const record = character.build.levels[3]?.featSelections?.[0];
      if (record === undefined) throw new Error("Missing feat record");
      if (kind === "wrong-ability" || kind === "wrong-amount") {
        record.abilityScoreIncreases = kind === "wrong-ability" ? { wisdom: 1 } : { strength: 2 };
        character.build.featAbilityScoreIncreases = featIncreases(
          character.build.levels.flatMap((level) => level.featSelections ?? []),
        );
      }
      if (kind === "duplicate") {
        character.build.featIds.push(grapplerId);
      }
      if (kind === "missing-history") delete character.build.levels[3]?.featSelections;
      if (kind === "early") {
        const first = character.build.levels[0];
        if (first !== undefined) first.featSelections = [record];
        delete character.build.levels[3]?.featSelections;
      }
      if (kind === "over-cap") character.build.abilityScores.strength = 20;
      expect(errors(character, rulesPackage).length).toBeGreaterThan(0);
    },
  );

  it("does not invent missing Grappler history or apply its Advantage globally", () => {
    const { draft, rulesPackage } = setup();
    const character = buildCharacter(draft, rulesPackage, options);
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).facts["attackRoll.mode"],
    ).toBe("normal");
    delete character.build.levels[3]?.featSelections;
    expect(() => savedAdvancementFeats(character, [4])).toThrow("explicit history");
  });
});
