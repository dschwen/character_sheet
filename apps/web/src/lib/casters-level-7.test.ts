import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeAction, proposeRest, proposeSpellCast } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  featureSpellbookChoices,
  updateBuilderFeatureChoice,
  validateBuilderDraft,
  warlockId,
  wizardId,
} from "./character-builder";
import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import { loadWebData } from "./server-data";

const options = { id: "caster-seven", now: new Date("2026-10-10T12:00:00Z") };
const invocationChoice = "srd521.choice.warlock.eldritch-invocation";
const invocation = (name: string) => `srd521.option.warlock.invocation.${name}`;
const savantChoice = "srd521.choice.wizard.evocation-savant.level-7";
function setup(classId: typeof wizardId | typeof warlockId, level = 7) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(classId, catalog, level, "Seventh-level Caster");
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  return { rulesPackage, catalog, draft, character, input, evaluation: evaluateCharacter(input) };
}

describe("Wizard and Warlock level 7", () => {
  it("advances an Evoker with two ordinary additions and one separate Savant grant", () => {
    const { character, rulesPackage, catalog } = setup(wizardId, 6);
    character.state.currentHitPoints = 12;
    character.state.expendedSpellSlots = { "1": 2, "3": 1 };
    const original = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    const grant = draft.featureChoiceSelections[savantChoice];
    expect(grant).toHaveLength(1);
    const advanced = levelUpCharacter(character, draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(character).toEqual(original);
    expect(advanced.state).toEqual(character.state);
    expect(advanced.loadout.inventory).toEqual(character.loadout.inventory);
    expect(advanced.build.levels.slice(0, 6)).toEqual(character.build.levels);
    expect(advanced.build.learnedSpellIds).toHaveLength(26);
    expect(advanced.build.learnedSpellIds).toEqual(
      expect.arrayContaining(character.build.learnedSpellIds),
    );
    expect(advanced.loadout.preparedSpellIds).toHaveLength(11);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(44);
    expect(evaluation.spellcasting).toMatchObject({
      spellbookMinimum: 22,
      preparedSpellLimit: 11,
      cantripsKnown: 4,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 3 },
        { level: 4, maximum: 1 },
      ],
    });
    expect(advanced.build.levels[6]?.selectedFeatureChoices).toContainEqual({
      choiceId: savantChoice,
      optionIds: grant,
    });
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 7,
    });
  });

  it("offers level-4 Evocations for Savant without making them always prepared", () => {
    const { catalog, rulesPackage, draft } = setup(wizardId);
    const choice = catalog.classes[wizardId].featureChoices.find(({ id }) => id === savantChoice);
    expect(choice?.options.map(({ id }) => id)).toContain("srd521.spell.ice-storm");
    const previousGrant = draft.featureChoiceSelections[savantChoice]?.[0];
    if (!previousGrant) throw new Error("Missing Savant grant");
    let changed = updateBuilderFeatureChoice(draft, catalog, savantChoice, previousGrant);
    changed = updateBuilderFeatureChoice(changed, catalog, savantChoice, "srd521.spell.ice-storm");
    expect(featureSpellbookChoices(changed, catalog)).toContain("srd521.spell.ice-storm");
    changed.preparedSpellIds = changed.preparedSpellIds.filter(
      (id) => id !== "srd521.spell.ice-storm",
    );
    const replacement = changed.learnedSpellIds.find(
      (id) =>
        !changed.preparedSpellIds.includes(id) &&
        id !== "srd521.spell.ice-storm" &&
        catalog.classes[wizardId].spellcasting?.spells.some(
          (spell) => spell.id === id && spell.level > 0,
        ),
    );
    if (changed.preparedSpellIds.length < 11 && replacement)
      changed.preparedSpellIds.push(replacement);
    const character = buildCharacter(changed, rulesPackage, options);
    const input = { character, packages: [rulesPackage] };
    expect(
      proposeSpellCast(input, { spellId: "srd521.spell.ice-storm", slotLevel: 4 }).applicable,
    ).toBe(false);
    character.loadout.preparedSpellIds[0] = "srd521.spell.ice-storm";
    const cast = proposeSpellCast(input, { spellId: "srd521.spell.ice-storm", slotLevel: 4 });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots["4"]).toBe(1);
    expect(
      proposeSpellCast(input, { spellId: "srd521.spell.ice-storm", slotLevel: 3 }).applicable,
    ).toBe(false);
    expect(evaluateCharacter(input).spellcasting?.alwaysPreparedSpells).toBe(0);
  });

  it.each(["srd521.spell.cone-of-cold", "srd521.spell.dimension-door", "srd521.spell.fire-bolt"])(
    "rejects the ineligible Savant selection %s",
    (spellId) => {
      const { character, catalog, rulesPackage } = setup(wizardId, 6);
      const draft = createLevelUpDraft(character, catalog);
      draft.featureChoiceSelections = {
        ...draft.featureChoiceSelections,
        [savantChoice]: [spellId],
      };
      expect(previewLevelUp(character, draft, rulesPackage, options).issues.length).toBeGreaterThan(
        0,
      );
    },
  );

  it.each([0, 1, 2])(
    "upgrades Pact slots while preserving %s spent slots and all other play state",
    (spent) => {
      const { character, catalog, rulesPackage } = setup(warlockId, 6);
      character.state.currentHitPoints = 9;
      character.state.expendedSpellSlots = { "3": spent };
      character.state.expendedResources["srd521.resource.warlock.dark-ones-own-luck"] = 1;
      const original = structuredClone(character);
      const advanced = levelUpCharacter(
        character,
        createLevelUpDraft(character, catalog),
        rulesPackage,
        options,
      );
      const input = { character: advanced, packages: [rulesPackage] };
      const evaluation = evaluateCharacter(input);
      expect(evaluation.validations).toEqual([]);
      expect(character).toEqual(original);
      expect(advanced.state).toEqual({ ...character.state, expendedSpellSlots: { "4": spent } });
      expect(advanced.loadout.inventory).toEqual(character.loadout.inventory);
      expect(advanced.build.levels.slice(0, 6)).toEqual(character.build.levels);
      expect(evaluation.values["hitPoints.maximum"]?.value).toBe(52);
      expect(evaluation.spellcasting).toMatchObject({
        model: "pact-magic",
        preparedSpellLimit: 8,
        alwaysPreparedSpells: 8,
        cantripsKnown: 3,
        slots: [{ level: 4, maximum: 2, expended: spent, current: 2 - spent }],
      });
      expect(levelUpEligibility(advanced, catalog)).toMatchObject({ eligible: false });
      const cast = proposeSpellCast(input, { spellId: "srd521.spell.wall-of-fire", slotLevel: 4 });
      expect(cast.applicable).toBe(spent < 2);
      if (spent < 2) expect(cast.nextState.expendedSpellSlots["4"]).toBe(spent + 1);
      else expect(cast.nextState).toEqual(advanced.state);
      expect(
        proposeSpellCast(input, { spellId: "srd521.spell.wall-of-fire", slotLevel: 3 }).applicable,
      ).toBe(false);
      for (const event of ["short-rest", "long-rest"] as const) {
        const rest = proposeRest(input, { event });
        expect(rest.applicable).toBe(true);
        expect(rest.nextState.expendedSpellSlots["4"] ?? 0).toBe(0);
      }
    },
  );

  it("adds six distinct invocations and the two source-linked fourth-level Fiend spells", () => {
    const { character, evaluation, input } = setup(warlockId);
    const selected = character.build.levels
      .flatMap((level) => level.selectedFeatureChoices)
      .filter(({ choiceId }) => choiceId === invocationChoice)
      .flatMap(({ optionIds }) => optionIds);
    expect(selected).toHaveLength(6);
    expect(new Set(selected).size).toBe(6);
    expect(selected).toContain(invocation("eldritch-mind"));
    expect(evaluation.validations).toEqual([]);
    for (const id of ["srd521.spell.fire-shield", "srd521.spell.wall-of-fire"]) {
      const spell = evaluation.spells.find((spell) => spell.id === id);
      expect(spell).toMatchObject({ level: 4, prepared: true });
      expect(spell?.sources.length).toBeGreaterThan(0);
      expect(character.loadout.preparedSpellIds).not.toContain(id);
    }
    character.state.expendedSpellSlots["4"] = 2;
    const cunning = proposeAction(input, { actionId: "action.magical-cunning" });
    expect(cunning.applicable).toBe(true);
    expect(cunning.nextState.expendedSpellSlots["4"]).toBe(1);
    expect(character.state.expendedSpellSlots["4"]).toBe(2);
  });

  it.each([
    [2, 1, 2],
    [4, 2, 3],
  ] as const)(
    "also preserves spent Pact slots on level %s advancement",
    (level, oldTier, newTier) => {
      const { character, catalog, rulesPackage } = setup(warlockId, level);
      character.state.expendedSpellSlots[String(oldTier)] = 1;
      const next = levelUpCharacter(
        character,
        createLevelUpDraft(character, catalog),
        rulesPackage,
        options,
      );
      expect(next.state.expendedSpellSlots).toEqual({ [String(newTier)]: 1 });
      expect(character.state.expendedSpellSlots).toEqual({ [String(oldTier)]: 1 });
      expect(evaluateCharacter({ character: next, packages: [rulesPackage] }).validations).toEqual(
        [],
      );
    },
  );

  it("casts lower-level spells using the fourth-level Pact pool and not obsolete tiers", () => {
    const { input, character } = setup(warlockId);
    const spellId = "srd521.spell.command";
    expect(proposeSpellCast(input, { spellId, slotLevel: 1 }).applicable).toBe(false);
    const cast = proposeSpellCast(input, { spellId, slotLevel: 4 });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots).toEqual({ "4": 1 });
    expect(character.state.expendedSpellSlots).toEqual({});
    expect(
      setup(warlockId, 6).evaluation.spells.some(({ id }) => id === "srd521.spell.wall-of-fire"),
    ).toBe(false);
  });

  it("recovers a fourth-level Wizard slot within the level-7 Arcane Recovery budget", () => {
    const { input, character } = setup(wizardId);
    character.state.expendedSpellSlots["4"] = 1;
    const recovery = evaluateCharacter(input).spellSlotRecoveries?.[0];
    if (!recovery) throw new Error("Missing Arcane Recovery");
    const rest = proposeRest(input, {
      event: "short-rest",
      spellSlotRecoveries: [{ sourceId: recovery.sourceId, slots: [{ level: 4, count: 1 }] }],
    });
    expect(rest.applicable).toBe(true);
    expect(rest.nextState.expendedSpellSlots["4"] ?? 0).toBe(0);
    expect(character.state.expendedSpellSlots["4"]).toBe(1);
  });

  it("permits one invocation replacement alongside the sixth new invocation", () => {
    const { character, rulesPackage, catalog } = setup(warlockId, 6);
    let draft = createLevelUpDraft(character, catalog);
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      invocationChoice,
      invocation("fiendish-vigor"),
    );
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      invocationChoice,
      invocation("armor-of-shadows"),
    );
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    const selections = next.build.levels
      .flatMap((level) => level.selectedFeatureChoices)
      .filter(({ choiceId }) => choiceId === invocationChoice)
      .flatMap(({ optionIds }) => optionIds);
    expect(selections).toHaveLength(6);
    expect(selections).toContain(invocation("armor-of-shadows"));
    expect(selections).not.toContain(invocation("fiendish-vigor"));
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      invocationChoice,
      invocation("devil-s-sight"),
    );
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      invocationChoice,
      invocation("otherworldly-leap"),
    );
    expect(previewLevelUp(character, draft, rulesPackage, options).issues.length).toBeGreaterThan(
      0,
    );
  });

  it.each([
    ["eldritch-mind", "eldritch-mind"],
    ["eldritch-mind", "devouring-blade"],
    ["pact-of-the-chain", "investment-of-the-chain-master"],
  ])(
    "rejects duplicate, high-level, or unmet dependency invocation %s → %s",
    (oldName, newName) => {
      const { draft, catalog } = setup(warlockId);
      const selected = [...(draft.featureChoiceSelections[invocationChoice] ?? [])];
      selected[selected.indexOf(invocation(oldName))] = invocation(newName);
      if (oldName === newName) selected[0] = invocation(newName);
      draft.featureChoiceSelections = {
        ...draft.featureChoiceSelections,
        [invocationChoice]: selected,
      };
      expect(validateBuilderDraft(draft, catalog).length).toBeGreaterThan(0);
    },
  );
});
