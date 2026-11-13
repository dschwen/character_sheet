import { describe, expect, it } from "vitest";
import { evaluateCharacter } from "@dnd/rules-core";
import { characterDocumentSchema } from "@dnd/character-model";
import { featAcquisitionMetadataSchema } from "@dnd/content-schema";
import {
  advancementOptions,
  buildCharacter,
  builderClassIds,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  clericId,
  updateAdvancementFeatSelection,
  updateBuilderSpecies,
  validateBuilderDraft,
  type BuilderClassId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, previewLevelUp } from "./character-level-up";
import { savedAdvancementFeats } from "./advancement-feats";
import { loadWebData } from "./server-data";

const alert = "srd521.feat.origin.alert";
const skilled = "srd521.feat.origin.skilled";
const magic = "srd521.feat.origin.magic-initiate.wizard";
const options = { id: "feat-acquisition", now: new Date("2026-11-13T12:00:00Z") };
function setup(classId: BuilderClassId = fighterId, level = 4) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  return {
    rulesPackage,
    catalog,
    draft: defaultBuilderDraft(classId, catalog, level, "Feat Keeper"),
  };
}
const selection = (featId: string) => ({ featId, abilityScoreIncreases: {} });

describe("shared unrestricted feat acquisition", () => {
  it.each(builderClassIds)(
    "acquires Alert for %s separately from the species/background feat grants",
    (classId) => {
      const { catalog, rulesPackage, draft: initial } = setup(classId);
      const draft = updateAdvancementFeatSelection(initial, catalog, 0, selection(alert));
      expect(validateBuilderDraft(draft, catalog)).toEqual([]);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
      expect(character.build.levels[3]?.featSelections).toEqual([selection(alert)]);
      expect(character.build.featAbilityScoreIncreases).toEqual({});
      expect(evaluation.d20Tests.initiative?.modifier).toBe(
        Number(evaluation.facts["ability.dexterity.modifier"]) + 2,
      );
      expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(
        character,
      );
    },
  );
  it.each([fighterId, clericId] as const)(
    "acquires a new Magic Initiate with its own choices for %s",
    (classId) => {
      const { catalog, rulesPackage, draft: initial } = setup(classId);
      const draft = updateAdvancementFeatSelection(initial, catalog, 0, selection(magic));
      expect(draft.magicInitiateChoices[magic]?.cantripIds).toHaveLength(2);
      expect(validateBuilderDraft(draft, catalog)).toEqual([]);
      const character = buildCharacter(draft, rulesPackage, options);
      expect(
        evaluateCharacter({ character, packages: [rulesPackage] }).validations.filter(
          ({ severity }) => severity === "error",
        ),
      ).toEqual([]);
      expect(
        character.build.choices.some((choice) => choice.choiceId === `${magic}.choice.cantrips`),
      ).toBe(true);
    },
  );
  it("offers all qualifying categories and excludes already-owned non-repeatable feats", () => {
    const { catalog, draft } = setup();
    const offered = advancementOptions(draft, catalog, 0).map((option) => option.selection.featId);
    expect(offered).toContain(alert);
    expect(offered).toContain(skilled);
    expect(offered).toContain(magic);
    expect(offered).not.toContain("srd521.feat.origin.savage-attacker");
    const style = catalog.classes[fighterId].featureChoices.find((choice) =>
      choice.id.endsWith("fighting-style"),
    );
    const owned = draft.featureChoiceSelections[style?.id ?? ""] ?? [];
    const availableStyles = offered.filter((id) => id.startsWith("srd521.feat.fighting-style."));
    expect(availableStyles).toHaveLength(3);
    expect(availableStyles.some((id) => owned.includes(id))).toBe(false);
  });
  it("acquires an additional Fighting Style without replacing the class's first style", () => {
    const { catalog, rulesPackage, draft: initial } = setup();
    const featId = advancementOptions(initial, catalog, 0).find((option) =>
      option.selection.featId.startsWith("srd521.feat.fighting-style."),
    )?.selection.featId;
    if (!featId) throw new Error("Missing style");
    const draft = updateAdvancementFeatSelection(initial, catalog, 0, selection(featId));
    const character = buildCharacter(draft, rulesPackage, options);
    expect(
      character.build.featIds.filter((id) => id.startsWith("srd521.feat.fighting-style.")),
    ).toHaveLength(2);
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
  });
  it("rejects Fighting Styles without their granting feature", () => {
    const { catalog, rulesPackage, draft } = setup(clericId);
    expect(
      advancementOptions(draft, catalog, 0).some((option) =>
        option.selection.featId.startsWith("srd521.feat.fighting-style."),
      ),
    ).toBe(false);
    const character = buildCharacter(draft, rulesPackage, options);
    const first = character.build.levels[3]?.featSelections?.[0];
    if (!first) throw new Error("Missing acquisition");
    character.build.featIds = character.build.featIds.filter((id) => id !== first.featId);
    character.build.featIds.push("srd521.feat.fighting-style.archery");
    const acquired = character.build.levels[3];
    if (!acquired) throw new Error("Missing level");
    acquired.featSelections = [selection("srd521.feat.fighting-style.archery")];
    character.build.featAbilityScoreIncreases = {};
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEAT_ACQUISITION_FEATURE_PREREQUISITE");
  });
  it("records separate skill choices for repeatable Skilled and preserves them on advancement", () => {
    const { catalog, rulesPackage, draft: initial } = setup();
    const draft = updateAdvancementFeatSelection(initial, catalog, 0, selection(skilled));
    expect(draft.advancementFeats[0]?.skillIds).toHaveLength(3);
    const character = buildCharacter(draft, rulesPackage, options);
    expect(character.build.featIds.filter((id) => id === skilled)).toHaveLength(2);
    expect(
      character.build.proficiencyChoices.skills.filter((choice) => choice.sourceId === skilled),
    ).toHaveLength(6);
    character.state.currentHitPoints = 7;
    const before = structuredClone(character);
    const nextDraft = createLevelUpDraft(character, catalog);
    expect(nextDraft.originFeatSkillIds).toEqual(draft.originFeatSkillIds);
    expect(nextDraft.advancementFeats[0]).toEqual(draft.advancementFeats[0]);
    const advanced = levelUpCharacter(character, nextDraft, rulesPackage, options);
    expect(advanced.state).toEqual(before.state);
    expect(advanced.build.levels.slice(0, 4)).toEqual(before.build.levels);
    expect(savedAdvancementFeats(advanced, [4])).toEqual(draft.advancementFeats);
    expect(character).toEqual(before);
  });
  it("adds one repeatable acquisition at a later grant without rewriting earlier skill choices", () => {
    const { catalog, rulesPackage, draft: initial } = setup(fighterId, 5);
    const first = updateAdvancementFeatSelection(initial, catalog, 0, selection(skilled));
    const character = buildCharacter(first, rulesPackage, options);
    const draft = updateAdvancementFeatSelection(
      createLevelUpDraft(character, catalog),
      catalog,
      1,
      selection(skilled),
    );
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toEqual([]);
    const advanced = levelUpCharacter(character, draft, rulesPackage, options);
    expect(advanced.build.levels.slice(0, 5)).toEqual(character.build.levels);
    expect(
      advanced.build.proficiencyChoices.skills.filter((choice) => choice.sourceId === skilled),
    ).toHaveLength(9);
  });
  it("locks earlier acquisition skill choices, not just their feat IDs", () => {
    const { catalog, rulesPackage, draft: initial } = setup();
    const character = buildCharacter(
      updateAdvancementFeatSelection(initial, catalog, 0, selection(skilled)),
      rulesPackage,
      options,
    );
    const draft = createLevelUpDraft(character, catalog);
    const acquired = draft.advancementFeats[0];
    if (!acquired) throw new Error("Missing acquisition");
    acquired.skillIds = [...(draft.advancementFeats[0]?.skillIds ?? [])].reverse();
    expect(previewLevelUp(character, draft, rulesPackage, options).issues.join(" ")).toMatch(
      /Earlier Ability Score Improvement/,
    );
  });
  it("does not mistake an acquired Origin feat for a non-Human species grant", () => {
    const { catalog, rulesPackage, draft: initial } = setup();
    const draft = updateAdvancementFeatSelection(
      updateBuilderSpecies(initial, catalog, "srd521.species.dwarf"),
      catalog,
      0,
      selection(alert),
    );
    const character = buildCharacter(draft, rulesPackage, options);
    expect(createLevelUpDraft(character, catalog).originFeatId).toBe("");
  });
  it("cannot use a single aggregate feat to pay for both a background grant and an acquisition", () => {
    const { catalog, rulesPackage, draft: initial } = setup();
    const character = buildCharacter(
      updateAdvancementFeatSelection(initial, catalog, 0, selection(alert)),
      rulesPackage,
      options,
    );
    character.build.featIds = character.build.featIds.filter((id) => id !== alert);
    const acquired = character.build.levels[3];
    if (!acquired) throw new Error("Missing level");
    acquired.featSelections = [selection("srd521.feat.origin.savage-attacker")];
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEAT_ACQUISITION_COUNT");
  });
  it("shares acquisition metadata and treats no-increase feats as a legal empty allocation", () => {
    expect(featAcquisitionMetadataSchema.parse({ category: "origin" })).toMatchObject({
      abilityScoreIncreasePatterns: [],
      requiresAnyFeatureIds: [],
      repeatable: false,
    });
    expect(featAcquisitionMetadataSchema.safeParse({ category: "epic-boon" }).success).toBe(false);
  });
  it("keeps an acquired style distinct from the later Champion style grant", () => {
    const { catalog, rulesPackage, draft: initial } = setup(fighterId, 6);
    const featId = advancementOptions(initial, catalog, 0).find((option) =>
      option.selection.featId.startsWith("srd521.feat.fighting-style."),
    )?.selection.featId;
    if (!featId) throw new Error("Missing style");
    const character = buildCharacter(
      updateAdvancementFeatSelection(initial, catalog, 0, selection(featId)),
      rulesPackage,
      options,
    );
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(
      advanced.build.featIds.filter((id) => id.startsWith("srd521.feat.fighting-style.")),
    ).toHaveLength(3);
    expect(advanced.build.levels.slice(0, 6)).toEqual(character.build.levels);
  });
  it("reads prerequisite feature IDs at the acquisition level rather than the final level", () => {
    const { catalog, draft } = setup(fighterId, 8);
    const feat = catalog.feats[alert];
    if (!feat?.advancement) throw new Error("Missing metadata");
    feat.advancement.requiresAnyFeatureIds = ["test.feature.future"];
    catalog.classes[fighterId].grantedFeatureIdsByLevel = {
      ...catalog.classes[fighterId].grantedFeatureIdsByLevel,
      8: ["test.feature.future"],
    };
    expect(
      advancementOptions(draft, catalog, 0).some((option) => option.selection.featId === alert),
    ).toBe(false);
    expect(
      advancementOptions(draft, catalog, 2).some((option) => option.selection.featId === alert),
    ).toBe(true);
  });
});
