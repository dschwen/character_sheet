import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeAction, proposeRest, proposeSpellCast } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  sorcererId,
  wizardId,
  updateBuilderBackground,
  updateBuilderSpecies,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";
import { setActiveEffectActive } from "./play-state";

const statusId = "srd521.status.feature.innate-sorcery";
const innateResource = "srd521.resource.sorcerer.innate-sorcery";
const pointsResource = "srd521.resource.sorcerer.sorcery-points";
const actionId = "action.sorcery-incarnate";
const options = { id: "sorcerer-seven", now: new Date("2026-10-10T12:00:00Z") };
function setup(level = 7) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(sorcererId, catalog, level, "Incarnate Sorcerer"),
    rulesPackage,
    options,
  );
  const input = { character, packages: [rulesPackage] };
  return { catalog, rulesPackage, character, input };
}

describe("Sorcerer level 7 and class-scoped Innate Sorcery", () => {
  it("advances with new spell access and resources, preserving choices and all play state", () => {
    const { character, catalog, rulesPackage } = setup(6);
    character.state.currentHitPoints = 11;
    character.state.expendedSpellSlots["3"] = 2;
    character.state.expendedResources[pointsResource] = 4;
    const original = structuredClone(character);
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(51);
    expect(character).toEqual(original);
    expect(next.state).toEqual(character.state);
    expect(next.loadout.inventory).toEqual(character.loadout.inventory);
    expect(next.build.levels.slice(0, 6)).toEqual(character.build.levels);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 11,
      alwaysPreparedSpells: 8,
      cantripsKnown: 5,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 3 },
        { level: 4, maximum: 1 },
      ],
    });
    expect(evaluation.resources.find(({ id }) => id === pointsResource)).toMatchObject({
      maximum: 7,
      expended: 4,
      current: 3,
    });
    for (const spellId of ["srd521.spell.arcane-eye", "srd521.spell.charm-monster"]) {
      expect(evaluation.spells.find(({ id }) => id === spellId)).toMatchObject({
        level: 4,
        prepared: true,
      });
      expect(next.loadout.preparedSpellIds).not.toContain(spellId);
      const cast = proposeSpellCast(
        { character: next, packages: [rulesPackage] },
        { spellId, slotLevel: 4 },
      );
      expect(cast.applicable).toBe(true);
      expect(cast.nextState.expendedSpellSlots["4"]).toBe(1);
      expect(
        proposeSpellCast({ character: next, packages: [rulesPackage] }, { spellId, slotLevel: 3 })
          .applicable,
      ).toBe(false);
    }
    expect(levelUpEligibility(next, catalog)).toMatchObject({
      eligible: true,
      currentLevel: 7,
      targetLevel: 8,
    });
  });

  it.each([1, 6, 7])(
    "normal activation at level %s spends one use and sets a visible source-linked status",
    (level) => {
      const { character, input } = setup(level);
      const original = structuredClone(character);
      const baseline = evaluateCharacter(input);
      const proposal = proposeAction(input, { actionId: "action.innate-sorcery" });
      expect(proposal.applicable).toBe(true);
      expect(character).toEqual(original);
      expect(proposal.nextState.expendedResources[innateResource]).toBe(1);
      expect(proposal.nextState.expendedResources[pointsResource]).toBeUndefined();
      expect(proposal.nextState.activeEffectIds).toContain(statusId);
      character.state = proposal.nextState;
      const active = evaluateCharacter(input);
      expect(active.validations).toEqual([]);
      expect(active.spellcasting?.saveDifficultyClass).toBe(
        (baseline.spellcasting?.saveDifficultyClass ?? 0) + 1,
      );
      expect(active.spellcasting?.attackRollMode).toBe("advantage");
      expect(active.spellcasting?.attackBonus).toBe(baseline.spellcasting?.attackBonus);
      expect(active.facts["attackRoll.mode"]).toBe("normal");
      expect(active.d20Tests["savingThrow.constitution"]).toEqual(
        baseline.d20Tests["savingThrow.constitution"],
      );
      expect(proposeAction(input, { actionId: "action.innate-sorcery" }).applicable).toBe(false);
      const trace = active.traces[active.spellcasting?.saveTraceId ?? ""];
      expect(trace?.sourceReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityId: "srd521.class-feature.sorcerer.innate-sorcery",
            page: 66,
          }),
        ]),
      );
      for (const spell of active.spells) {
        for (const option of spell.castingOptions ?? []) {
          if (option.sourceId !== sorcererId) continue;
          expect(option.saveDifficultyClass).toBe(active.spellcasting?.saveDifficultyClass);
          expect(option.attackRollMode).toBe("advantage");
        }
      }
    },
  );

  it("spends exactly two points only after the normal uses are exhausted", () => {
    const { input, character } = setup();
    expect(proposeAction(input, { actionId }).applicable).toBe(false);
    character.state.expendedResources[innateResource] = 2;
    const original = structuredClone(character);
    const proposal = proposeAction(input, { actionId });
    expect(proposal.applicable).toBe(true);
    expect(character).toEqual(original);
    expect(proposal.nextState.expendedResources).toEqual({
      [innateResource]: 2,
      [pointsResource]: 2,
    });
    expect(proposal.nextState.activeEffectIds).toContain(statusId);
    const action = evaluateCharacter(input).actions.find(({ id }) => id === actionId);
    expect(action).toMatchObject({
      available: true,
      actionEconomy: "bonus-action",
      parameters: { spends: 2, resourceId: pointsResource },
    });
    expect(evaluateCharacter(input).traces[action?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "srd521.class-feature.sorcerer.sorcery-incarnate",
          page: 66,
        }),
      ]),
    );
    character.state = proposal.nextState;
    expect(proposeAction(input, { actionId }).applicable).toBe(false);
    character.state = setActiveEffectActive(character, statusId, false).state;
    expect(proposeAction(input, { actionId }).applicable).toBe(true);
  });

  it.each([0, 1])(
    "rejects alternate activation atomically with %s Sorcery Points left",
    (remaining) => {
      const { input, character } = setup();
      character.state.expendedResources = { [innateResource]: 2, [pointsResource]: 7 - remaining };
      const proposal = proposeAction(input, { actionId });
      expect(evaluateCharacter(input).actions.find(({ id }) => id === actionId)?.available).toBe(
        false,
      );
      expect(proposal.applicable).toBe(false);
      expect(proposal.changes).toEqual([]);
      expect(proposal.nextState).toEqual(character.state);
    },
  );

  it.each([1, 6])("does not grant Sorcery Incarnate at level %s", (level) => {
    const { input, character } = setup(level);
    character.state.expendedResources[innateResource] = 2;
    expect(evaluateCharacter(input).actions.some(({ id }) => id === actionId)).toBe(false);
    expect(proposeAction(input, { actionId }).applicable).toBe(false);
  });

  it.each(["incapacitated", "stunned", "unconscious"])("cannot activate while %s", (condition) => {
    const { character, input } = setup();
    character.state.conditionIds = [`srd521.condition.${condition}`];
    character.state.expendedResources[innateResource] = 2;
    const proposal = proposeAction(input, { actionId });
    expect(proposal.applicable).toBe(false);
    expect(proposal.nextState).toEqual(character.state);
  });

  it.each([
    [[], "advantage"],
    [["poisoned"], "normal"],
    [["invisible"], "advantage"],
    [["invisible", "poisoned"], "normal"],
  ] as const)(
    "resolves spell-attack Advantage against %s without stacking or losing cancellation",
    (conditions, mode) => {
      const { character, input } = setup();
      character.state.activeEffectIds = [statusId, statusId];
      character.state.conditionIds = conditions.map((id) => `srd521.condition.${id}`);
      const evaluation = evaluateCharacter(input);
      expect(evaluation.spellcasting?.attackRollMode).toBe(mode);
      expect(evaluation.spellcasting?.saveDifficultyClass).toBe(15);
      const ended = setActiveEffectActive(character, statusId, false);
      expect(
        evaluateCharacter({ ...input, character: ended }).spellcasting?.saveDifficultyClass,
      ).toBe(14);
    },
  );

  it("does not enhance species or Magic Initiate casting, including a spell shared with the class", () => {
    const { rulesPackage, catalog } = setup();
    let draft = updateBuilderBackground(
      defaultBuilderDraft(sorcererId, catalog, 7, "Scoped Sorcerer"),
      catalog,
      "srd521.background.acolyte",
    );
    draft = updateBuilderSpecies(draft, catalog, "srd521.species.tiefling");
    const character = buildCharacter(draft, rulesPackage, options);
    const input = { character, packages: [rulesPackage] };
    const before = evaluateCharacter(input);
    character.state.activeEffectIds = [statusId];
    const after = evaluateCharacter(input);
    expect(after.validations).toEqual([]);
    const foreign = before.spells.flatMap((spell) =>
      (spell.castingOptions ?? [])
        .filter(({ sourceId }) => sourceId !== sorcererId)
        .map((option) => ({ spellId: spell.id, option })),
    );
    expect(foreign.length).toBeGreaterThan(0);
    for (const { spellId, option } of foreign) {
      expect(
        after.spells
          .find(({ id }) => id === spellId)
          ?.castingOptions?.find(({ sourceId }) => sourceId === option.sourceId),
      ).toEqual(option);
    }
  });

  it("ignores an Innate Sorcery status on a character without the feature", () => {
    const { rulesPackage, catalog } = setup();
    const character = buildCharacter(
      defaultBuilderDraft(wizardId, catalog, 7, "Foreign Status"),
      rulesPackage,
      options,
    );
    const before = evaluateCharacter({ character, packages: [rulesPackage] });
    character.state.activeEffectIds = [statusId];
    expect(evaluateCharacter({ character, packages: [rulesPackage] }).spellcasting).toEqual(
      before.spellcasting,
    );
  });

  it.each(["short-rest", "long-rest"] as const)(
    "ends the one-minute status on %s while preserving unrelated statuses",
    (event) => {
      const { character, input } = setup();
      character.state.activeEffectIds = [statusId, "srd521.status.spell.longstrider"];
      character.state.expendedResources = { [innateResource]: 2, [pointsResource]: 3 };
      const proposal = proposeRest(input, { event });
      expect(proposal.applicable).toBe(true);
      expect(proposal.nextState.activeEffectIds).toEqual(["srd521.status.spell.longstrider"]);
      expect(proposal.nextState.expendedResources[innateResource]).toBe(
        event === "long-rest" ? 0 : 2,
      );
      expect(proposal.nextState.expendedResources[pointsResource]).toBe(
        event === "long-rest" ? 0 : 3,
      );
      expect(character.state.activeEffectIds).toContain(statusId);
      character.state.currentHitPoints = 0;
      const rejected = proposeRest(input, { event });
      expect(rejected.applicable).toBe(false);
      expect(rejected.nextState).toEqual(character.state);
    },
  );
});
