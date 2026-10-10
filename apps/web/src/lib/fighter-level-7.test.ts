import { describe, expect, it } from "vitest";
import { evaluateCharacter } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  migrateFeatureFeatChoices,
  updateBuilderFeatureChoice,
  validateBuilderDraft,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter } from "./character-level-up";
import { loadWebData } from "./server-data";

const baseChoice = "srd521.choice.fighter.fighting-style";
const extraChoice = "srd521.choice.fighter.champion.additional-fighting-style";
const prefix = "srd521.feat.fighting-style.";
const styles = ["archery", "defense", "great-weapon-fighting", "two-weapon-fighting"];
const options = { id: "level-seven-fighter", now: new Date("2026-10-10T12:00:00Z") };
function setup(level = 7) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(fighterId, catalog, level, "Champion");
  const character = buildCharacter(draft, rulesPackage, options);
  return { rulesPackage, catalog, draft, character };
}

describe("Fighter level 7 and shared feature feat selections", () => {
  it.each(
    styles.flatMap((first) =>
      styles.filter((second) => first !== second).map((second) => [first, second]),
    ),
  )("builds distinct %s and %s styles", (first, second) => {
    const { draft, catalog, rulesPackage } = setup();
    draft.featureChoiceSelections = {
      [baseChoice]: [prefix + first],
      [extraChoice]: [prefix + second],
    };
    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(character.build.featIds.filter((id) => id.startsWith(prefix))).toEqual([
      prefix + first,
      prefix + second,
    ]);
    expect(evaluation.traces[baseChoice]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 47 })]),
    );
    expect(evaluation.traces[extraChoice]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 49 })]),
    );
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
  });

  it("advances to level 7 while preserving play state and the initial style", () => {
    const { character, catalog, rulesPackage } = setup(6);
    character.state.currentHitPoints = 17;
    character.state.expendedResources["srd521.resource.fighter.second-wind"] = 1;
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(advanced.state).toEqual(character.state);
    expect(advanced.loadout).toEqual(character.loadout);
    expect(advanced.build.levels.slice(0, 6)).toEqual(character.build.levels);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(60);
    expect(advanced.build.featIds).toEqual(
      expect.arrayContaining([prefix + "defense", prefix + "archery"]),
    );
    expect(advanced.build.levels[6]?.selectedFeatureChoices).toEqual([
      { choiceId: extraChoice, optionIds: [prefix + "archery"] },
    ]);
  });

  it("replaces the initial style without retaining its old feat or armor bonus", () => {
    const { character, catalog, rulesPackage } = setup(6);
    const oldEvaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const draft = updateBuilderFeatureChoice(
      createLevelUpDraft(character, catalog),
      catalog,
      baseChoice,
      prefix + "great-weapon-fighting",
    );
    const advanced = levelUpCharacter(character, draft, rulesPackage, options);
    expect(advanced.build.featIds).not.toContain(prefix + "defense");
    expect(advanced.build.featIds).toContain(prefix + "great-weapon-fighting");
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.values.armorClass?.value).toBe(
      Number(oldEvaluation.values.armorClass?.value) - 1,
    );
    expect(character.build.featIds).toContain(prefix + "defense");
  });

  it("applies Archery only to ranged weapons with a source-linked trace", () => {
    const { character, rulesPackage } = setup();
    character.loadout.inventory.push({
      id: "archery-test-bow",
      entityId: "srd521.equipment.weapon.longbow",
      quantity: 1,
    });
    const input = { character, packages: [rulesPackage] };
    const withStyle = evaluateCharacter(input);
    const baseline = structuredClone(character);
    baseline.build.featIds = baseline.build.featIds.filter((id) => id !== prefix + "archery");
    const withoutStyle = evaluateCharacter({ character: baseline, packages: [rulesPackage] });
    for (const attack of withStyle.attacks) {
      const ordinary = withoutStyle.attacks.find(({ id }) => id === attack.id);
      expect(attack.attackBonus).toBe(
        (ordinary?.attackBonus ?? 0) + (attack.attackType === "ranged" ? 2 : 0),
      );
      expect(attack.damage).toEqual(ordinary?.damage);
      if (attack.attackType === "ranged")
        expect(withStyle.traces[attack.traceId]?.sourceReferences).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ entityId: prefix + "archery", page: 87 }),
          ]),
        );
    }
    expect(withStyle.attacks.some((attack) => attack.attackType === "ranged")).toBe(true);
  });

  it("rejects duplicate styles in both the builder and direct engine input", () => {
    const { character, draft, catalog, rulesPackage } = setup();
    expect(updateBuilderFeatureChoice(draft, catalog, extraChoice, prefix + "defense")).toBe(draft);
    draft.featureChoiceSelections = {
      ...draft.featureChoiceSelections,
      [extraChoice]: [prefix + "defense"],
    };
    expect(validateBuilderDraft(draft, catalog)).toContain(
      "Each feature-granted feat in the same group must be distinct.",
    );
    const entry = character.build.levels[6]?.selectedFeatureChoices.find(
      (choice) => choice.choiceId === extraChoice,
    );
    if (!entry) throw new Error("Missing additional style");
    entry.optionIds = [prefix + "defense"];
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEATURE_FEAT_CHOICE_INVALID");
  });

  it("requires the level-7 grant and its selected feat, rejecting extra unselected feats", () => {
    const { character, rulesPackage } = setup(6);
    const entry = character.build.levels[5];
    if (!entry) throw new Error("Missing level 6");
    entry.selectedFeatureChoices.push({ choiceId: extraChoice, optionIds: [prefix + "archery"] });
    character.build.featIds.push(prefix + "archery");
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEATURE_FEAT_CHOICE_COUNT");
    entry.selectedFeatureChoices = [];
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEATURE_FEAT_NOT_SELECTED");
    character.build.featIds = character.build.featIds.filter((id) => id !== prefix + "defense");
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEATURE_FEAT_CHOICE_INVALID");
  });

  it("records an old saved Fighter's existing style without inventing a new feat", () => {
    const { character, catalog, rulesPackage } = setup(6);
    const entry = character.build.levels[0];
    if (!entry) throw new Error("Missing level 1");
    entry.selectedFeatureChoices = [];
    const original = structuredClone(character);
    const migrated = migrateFeatureFeatChoices(character, catalog);
    expect(migrated.build.featIds).toEqual(original.build.featIds);
    expect(migrated.state).toEqual(original.state);
    expect(migrated.loadout).toEqual(original.loadout);
    expect(migrated.metadata).toEqual(original.metadata);
    expect(character).toEqual(original);
    expect(
      evaluateCharacter({ character: migrated, packages: [rulesPackage] }).validations.filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
    expect(migrateFeatureFeatChoices(migrated, catalog)).toBe(migrated);
    character.build.featIds = character.build.featIds.filter((id) => !id.startsWith(prefix));
    expect(migrateFeatureFeatChoices(character, catalog)).toBe(character);
  });

  it("labels conditional damage styles assisted instead of applying their bonus to every attack", () => {
    const { catalog } = setup();
    const choice = catalog.classes[fighterId].featureChoices.find(
      (choice) => choice.id === baseChoice,
    );
    for (const style of ["great-weapon-fighting", "two-weapon-fighting"])
      expect(choice?.options.find(({ id }) => id === prefix + style)?.description).toContain(
        "Assisted",
      );
  });
});
