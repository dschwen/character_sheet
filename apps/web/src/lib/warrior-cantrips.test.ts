import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeSpellCast } from "@dnd/rules-core";
import { featureChoiceEnabled } from "@dnd/content-schema";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  migrateFeatureFeatChoices,
  paladinId,
  rangerId,
  updateBuilderFeatureChoice,
  validateBuilderDraft,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, previewLevelUp } from "./character-level-up";
import { loadWebData } from "./server-data";

const classes = [
  {
    id: paladinId,
    name: "Blessed Warrior",
    slug: "blessed-warrior",
    ability: "charisma",
    spell: "srd521.spell.sacred-flame",
    page: 54,
  },
  {
    id: rangerId,
    name: "Druidic Warrior",
    slug: "druidic-warrior",
    ability: "wisdom",
    spell: "srd521.spell.starry-wisp",
    page: 59,
  },
] as const;
const options = { id: "warrior", now: new Date("2026-11-14T12:00:00Z") };
function setup(entry: (typeof classes)[number], level = 2) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(entry.id, catalog, level, entry.name);
  const parent = catalog.classes[entry.id].featureChoices.find((choice) =>
    choice.id.endsWith("fighting-style"),
  );
  const child = catalog.classes[entry.id].featureChoices.find(
    (choice) => choice.requiredOption !== undefined,
  );
  if (!parent || !child) throw new Error("Missing conditional choice");
  const option = child.requiredOption?.optionId;
  if (!option) throw new Error("Missing alternative");
  return { rulesPackage, catalog, draft, parent, child, option };
}
describe.each(classes)("$name source-driven Fighting Style alternative", (entry) => {
  it("migrates legacy style feats into explicit choices without changing other saved data", () => {
    const { rulesPackage, catalog, draft, parent } = setup(entry);
    const character = buildCharacter(draft, rulesPackage, options);
    const level = character.build.levels[1];
    if (!level) throw new Error("Missing level 2");
    level.selectedFeatureChoices = level.selectedFeatureChoices.filter(
      (choice) => choice.choiceId !== parent.id,
    );
    const before = structuredClone(character);
    const migrated = migrateFeatureFeatChoices(character, catalog);
    expect(migrated.build.featIds).toEqual(before.build.featIds);
    expect(migrated.state).toEqual(before.state);
    expect(migrated.loadout).toEqual(before.loadout);
    expect(character).toEqual(before);
    expect(
      evaluateCharacter({ character: migrated, packages: [rulesPackage] }).validations,
    ).toEqual([]);
    expect(migrateFeatureFeatChoices(migrated, catalog)).toBe(migrated);
  });
  it.each(["archery", "defense", "great-weapon-fighting", "two-weapon-fighting"])(
    "offers and evaluates %s",
    (style) => {
      const { rulesPackage, catalog, draft, parent } = setup(entry);
      expect(parent.options.filter((option) => option.grantedFeatId)).toHaveLength(4);
      const selected = updateBuilderFeatureChoice(
        draft,
        catalog,
        parent.id,
        `srd521.feat.fighting-style.${style}`,
      );
      const character = buildCharacter(selected, rulesPackage, options);
      expect(
        evaluateCharacter({ character, packages: [rulesPackage] }).validations.filter(
          ({ severity }) => severity === "error",
        ),
      ).toEqual([]);
      expect(character.build.featIds).toContain(`srd521.feat.fighting-style.${style}`);
    },
  );
  it("grants two cantrips as its own class spells, not a style feat or ordinary preparations", () => {
    const { rulesPackage, catalog, draft, parent, child, option } = setup(entry);
    expect(featureChoiceEnabled(child, draft.featureChoiceSelections)).toBe(false);
    const selected = updateBuilderFeatureChoice(draft, catalog, parent.id, option);
    expect(selected.featureChoiceSelections[child.id]).toHaveLength(2);
    expect(validateBuilderDraft(selected, catalog)).toEqual([]);
    const character = buildCharacter(selected, rulesPackage, options);
    expect(character.build.featIds.some((id) => id.startsWith("srd521.feat.fighting-style."))).toBe(
      false,
    );
    expect(character.build.learnedSpellIds).toEqual([]);
    expect(character.loadout.preparedSpellIds).toHaveLength(3);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.spellcasting).toMatchObject({ ability: entry.ability, cantripsKnown: 2 });
    const spell = evaluation.spells.find(({ id }) => id === entry.spell);
    expect(spell).toMatchObject({ level: 0, prepared: true });
    expect(spell?.castingOptions?.[0]).toMatchObject({
      sourceId: entry.id,
      ability: entry.ability,
    });
    expect(evaluation.traces[child.id]?.sourceReferences).toContainEqual(
      expect.objectContaining({ page: entry.page }),
    );
    const cast = proposeSpellCast(
      { character, packages: [rulesPackage] },
      { spellId: entry.spell },
    );
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
  });
  it("clears the conditional cantrips when a style is selected instead", () => {
    const { rulesPackage, catalog, draft, parent, child, option } = setup(entry);
    const alternative = updateBuilderFeatureChoice(draft, catalog, parent.id, option);
    const restored = updateBuilderFeatureChoice(
      alternative,
      catalog,
      parent.id,
      "srd521.feat.fighting-style.defense",
    );
    expect(restored.featureChoiceSelections[child.id]).toEqual([]);
    const character = buildCharacter(restored, rulesPackage, options);
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).spells.some(
        ({ id }) => id === entry.spell,
      ),
    ).toBe(false);
  });
  it("permits one replacement on level up while preserving history, equipment and spent state", () => {
    const { rulesPackage, catalog, draft, parent, child, option } = setup(entry);
    const character = buildCharacter(
      updateBuilderFeatureChoice(draft, catalog, parent.id, option),
      rulesPackage,
      options,
    );
    character.state.currentHitPoints = 7;
    character.state.expendedSpellSlots = { "1": 1 };
    const before = structuredClone(character);
    const next = createLevelUpDraft(character, catalog);
    const previous = next.featureChoiceSelections[child.id] ?? [];
    const replacement = child.options.find((candidate) => !previous.includes(candidate.id))?.id;
    if (!replacement) throw new Error("Missing cantrip replacement");
    next.featureChoiceSelections = {
      ...next.featureChoiceSelections,
      [child.id]: [previous[0] ?? "", replacement],
    };
    expect(previewLevelUp(character, next, rulesPackage, options).issues).toEqual([]);
    const advanced = levelUpCharacter(character, next, rulesPackage, options);
    expect(advanced.state).toEqual(before.state);
    expect(advanced.loadout.inventory).toEqual(before.loadout.inventory);
    expect(character).toEqual(before);
    expect(advanced.build.levels[0]).toEqual(before.build.levels[0]);
    expect(
      evaluateCharacter({ character: advanced, packages: [rulesPackage] }).validations.filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
  });
  it("rejects two replacements and changing the fixed alternative on later level ups", () => {
    const { rulesPackage, catalog, draft, parent, child, option } = setup(entry);
    const character = buildCharacter(
      updateBuilderFeatureChoice(draft, catalog, parent.id, option),
      rulesPackage,
      options,
    );
    const next = createLevelUpDraft(character, catalog);
    const before = next.featureChoiceSelections[child.id] ?? [];
    next.featureChoiceSelections = {
      ...next.featureChoiceSelections,
      [child.id]: child.options
        .filter((candidate) => !before.includes(candidate.id))
        .slice(0, 2)
        .map((candidate) => candidate.id),
    };
    expect(previewLevelUp(character, next, rulesPackage, options).issues.join(" ")).toMatch(
      /Replace no more than 1/,
    );
    const changed = updateBuilderFeatureChoice(
      createLevelUpDraft(character, catalog),
      catalog,
      parent.id,
      "srd521.feat.fighting-style.defense",
    );
    expect(previewLevelUp(character, changed, rulesPackage, options).issues.join(" ")).toMatch(
      /Earlier feature choices/,
    );
  });
  it("rejects inactive, wrong-list, leveled, and duplicate child choices", () => {
    const { rulesPackage, catalog, draft, parent, child, option } = setup(entry);
    const inactive = buildCharacter(draft, rulesPackage, options);
    const level = inactive.build.levels[1];
    if (!level) throw new Error("Missing level");
    level.selectedFeatureChoices.push({
      choiceId: child.id,
      optionIds: [entry.spell, "srd521.spell.guidance"],
    });
    expect(
      evaluateCharacter({ character: inactive, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEATURE_SPELL_CHOICE_COUNT");
    for (const ids of [
      ["srd521.spell.magic-missile", "srd521.spell.guidance"],
      [entry.spell, entry.spell],
      ["srd521.spell.fire-bolt", "srd521.spell.guidance"],
    ]) {
      const selected = updateBuilderFeatureChoice(draft, catalog, parent.id, option);
      selected.featureChoiceSelections = { ...selected.featureChoiceSelections, [child.id]: ids };
      expect(validateBuilderDraft(selected, catalog).length).toBeGreaterThan(0);
    }
  });
  it("does not grant the option at level 1", () => {
    const { rulesPackage, draft, child } = setup(entry, 1);
    const character = buildCharacter(draft, rulesPackage, options);
    expect(
      character.build.levels
        .flatMap((level) => level.selectedFeatureChoices)
        .some((choice) => choice.choiceId === child.id),
    ).toBe(false);
  });
});
