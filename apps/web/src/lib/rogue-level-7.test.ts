import { describe, expect, it, vi } from "vitest";
import { evaluateCharacter, resolveSavingThrowDamage, proposeAction } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  rogueId,
  bardId,
  warlockId,
  updateBuilderBackground,
  updateBuilderSpecies,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { d20RerollRequest, resolveD20Roll, rollD20, applyD20MinimumPreference } from "./dice-roll";
import { rollD20Fullscreen } from "./fullscreen-dice";
import { loadWebData } from "./server-data";
import { canApplyPostRollBonus, applyPostRollBonus } from "./action-roll";

const talentId = "srd521.class-feature.rogue.reliable-talent";
const options = { id: "rogue-seven", now: new Date("2026-10-10T12:00:00Z") };
function setup(level = 7) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(rogueId, catalog, level, "Reliable Rogue");
  const character = buildCharacter(draft, rulesPackage, options);
  return { rulesPackage, catalog, draft, character };
}

describe("Rogue level 7, Reliable Talent, and fixed tool checks", () => {
  it("grants minima to proficient/expert skills and tools only at level 7", () => {
    for (const level of [6, 7]) {
      const { character, rulesPackage } = setup(level);
      const result = evaluateCharacter({ character, packages: [rulesPackage] });
      expect(result.validations.filter(({ severity }) => severity === "error")).toEqual([]);
      for (const test of Object.values(result.d20Tests)) {
        const eligible =
          (test.id.startsWith("skill.") || test.id.startsWith("tool.")) &&
          ["proficient", "expertise"].includes(test.proficiency.level);
        expect(test.dieMinimum?.value).toBe(level === 7 && eligible ? 10 : undefined);
      }
      expect(
        Object.values(result.d20Tests).some((test) => test.proficiency.level === "expertise"),
      ).toBe(true);
      expect(result.d20Tests["tool.thieves-tools.dexterity"]?.modifier).toBe(7);
      if (level === 7)
        expect(result.traces["tool.thieves-tools.dexterity.dieMinimum"]?.sourceReferences).toEqual(
          expect.arrayContaining([expect.objectContaining({ page: 63, entityId: talentId })]),
        );
    }
  });

  it.each([1, 4, 9, 10, 17, 20])(
    "treats physical %i with a minimum without rerolling",
    async (die) => {
      const { character, rulesPackage } = setup();
      const result = evaluateCharacter({ character, packages: [rulesPackage] });
      const test = result.d20Tests["tool.thieves-tools.dexterity"];
      if (test === undefined) throw new Error("Missing tool check");
      const throwDice = vi.fn(() => Promise.resolve([die]));
      const roll = await rollD20Fullscreen(
        {
          label: "Thieves’ Tools",
          testId: test.id,
          modifier: test.modifier,
          mode: test.rollMode,
          ...d20RerollRequest(test),
        },
        throwDice,
      );
      expect(roll.dice).toEqual([die]);
      expect(roll.kept).toBe(die);
      expect(roll.effectiveKept).toBe(Math.max(die, 10));
      expect(roll.total).toBe(Math.max(die, 10) + test.modifier);
      expect(throwDice).toHaveBeenCalledTimes(1);
      expect(roll.rerolls).toBeUndefined();
    },
  );

  it.each(["advantage", "disadvantage"] as const)(
    "selects the %s die before minimum and adds bonuses once",
    (mode) => {
      const roll = resolveD20Roll(
        {
          label: "Skill",
          modifier: -2,
          mode,
          dieMinimum: { value: 10, sourceName: "Reliable Talent" },
          bonusDice: [{ diceCount: 1, diceSize: 4, source: "Guidance" }],
        },
        [3, 18],
        [],
        [[4]],
      );
      expect(roll.kept).toBe(mode === "advantage" ? 18 : 3);
      expect(roll.total).toBe((mode === "advantage" ? 18 : 10) + 2);
      expect(roll.dice).toEqual([3, 18]);
    },
  );

  it("uses the same treatment for fallback dice and applies Luck rerolls first", () => {
    const roll = rollD20(
      {
        label: "Skill",
        modifier: 5,
        mode: "normal",
        dieMinimum: { value: 10, sourceName: "Reliable Talent" },
      },
      () => 0,
    );
    expect(roll).toMatchObject({ dice: [1], kept: 1, effectiveKept: 10, total: 15 });
    const luck = resolveD20Roll(
      {
        label: "Skill",
        modifier: 5,
        mode: "normal",
        dieMinimum: { value: 10, sourceName: "Reliable Talent" },
        rerollValues: [1],
      },
      [1],
      [8],
    );
    expect(luck).toMatchObject({
      dice: [8],
      kept: 8,
      effectiveKept: 10,
      total: 15,
      rerolls: [{ original: 1, replacement: 8, dieIndex: 0 }],
    });
  });

  it("lets the player decline an optional minimum without changing other roll features", () => {
    const request = {
      label: "Tool",
      mode: "normal",
      modifier: 4,
      dieMinimum: { value: 10, sourceName: "Reliable Talent" },
    } as const;
    const unchanged = structuredClone(request);
    expect(resolveD20Roll(applyD20MinimumPreference(request, false), [3]).total).toBe(7);
    expect(resolveD20Roll(applyD20MinimumPreference(request, true), [3]).total).toBe(14);
    expect(request).toEqual(unchanged);
  });

  it("retains the minimum after a Halfling Luck physical reroll", async () => {
    const { draft, catalog, rulesPackage } = setup();
    const character = buildCharacter(
      updateBuilderSpecies(draft, catalog, "srd521.species.halfling"),
      rulesPackage,
      options,
    );
    const result = evaluateCharacter({ character, packages: [rulesPackage] });
    const test = result.d20Tests["tool.thieves-tools.dexterity"];
    if (test === undefined) throw new Error("Missing check");
    const throwDice = vi.fn().mockResolvedValueOnce([1]).mockResolvedValueOnce([3]);
    const roll = await rollD20Fullscreen(
      { label: "Tool", modifier: test.modifier, mode: test.rollMode, ...d20RerollRequest(test) },
      throwDice,
    );
    expect(roll.effectiveKept).toBe(10);
    expect(roll.kept).toBe(3);
    expect(throwDice).toHaveBeenCalledTimes(2);
  });

  it("derives fixed background tool grants without inventing unresolved choices or stacking proficiency", () => {
    const { draft, catalog, rulesPackage } = setup();
    const criminal = buildCharacter(
      updateBuilderBackground(draft, catalog, "srd521.background.criminal"),
      rulesPackage,
      options,
    );
    const result = evaluateCharacter({ character: criminal, packages: [rulesPackage] });
    expect(Object.values(result.d20Tests).filter(({ id }) => id.startsWith("tool."))).toHaveLength(
      6,
    );
    expect(result.d20Tests["tool.thieves-tools.dexterity"]?.proficiency.bonus).toBe(3);
    expect(result.traces["tool.thieves-tools.dexterity"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: rogueId }),
        expect.objectContaining({ entityId: "srd521.background.criminal" }),
      ]),
    );
    const soldier = evaluateCharacter({
      character: buildCharacter(draft, rulesPackage, options),
      packages: [rulesPackage],
    });
    expect(Object.values(soldier.d20Tests).some(({ id }) => id.includes("gaming"))).toBe(false);
  });

  it("applies global Exhaustion penalties and Poisoned disadvantage to tool checks", () => {
    const { character, rulesPackage } = setup();
    character.state.exhaustion = 1;
    character.state.conditionIds.push("srd521.condition.poisoned");
    const result = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(result.d20Tests["tool.thieves-tools.dexterity"]?.modifier).toBe(5);
    expect(result.d20Tests["tool.thieves-tools.dexterity"]?.rollMode).toBe("disadvantage");
    expect(result.d20Tests["tool.thieves-tools.wisdom"]?.rollMode).toBe("disadvantage");
  });

  it("does not apply to half-proficiency from Jack of All Trades", () => {
    const { catalog, rulesPackage } = setup();
    const character = buildCharacter(
      defaultBuilderDraft(bardId, catalog, 6, "Bard"),
      rulesPackage,
      options,
    );
    const result = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(Object.values(result.d20Tests).some((test) => test.dieMinimum !== undefined)).toBe(
      false,
    );
  });

  it("uses content-defined minima and test kinds instead of Rogue UI branches", () => {
    const { character, rulesPackage } = setup();
    const edited = structuredClone(rulesPackage);
    const feature = edited.entities.find(({ id }) => id === talentId);
    if (
      feature === undefined ||
      feature.body === null ||
      typeof feature.body !== "object" ||
      Array.isArray(feature.body)
    )
      throw new Error("Missing talent");
    feature.body = {
      ...feature.body,
      d20Minimums: [{ testKinds: ["tool"], requiresProficiency: true, minimum: 12 }],
    };
    const result = evaluateCharacter({ character, packages: [edited] });
    expect(result.d20Tests["tool.thieves-tools.dexterity"]?.dieMinimum?.value).toBe(12);
    expect(
      Object.values(result.d20Tests)
        .filter(({ id }) => id.startsWith("skill."))
        .every(({ dieMinimum }) => dieMinimum === undefined),
    ).toBe(true);
  });

  it("permits Dark One's Own Luck on a fixed-tool check with atomic resource use", () => {
    const { catalog, rulesPackage } = setup();
    const draft = updateBuilderBackground(
      defaultBuilderDraft(warlockId, catalog, 6, "Tool Warlock"),
      catalog,
      "srd521.background.criminal",
    );
    const character = buildCharacter(draft, rulesPackage, options);
    const result = evaluateCharacter({ character, packages: [rulesPackage] });
    const test = result.d20Tests["tool.thieves-tools.dexterity"];
    const action = result.actions.find(({ id }) => id === "action.dark-ones-own-luck");
    if (test === undefined || action === undefined) throw new Error("Missing tool or action");
    const roll = resolveD20Roll(
      {
        label: "Tool",
        testId: test.id,
        modifier: test.modifier,
        mode: test.rollMode,
        ...d20RerollRequest(test),
      },
      [5],
    );
    expect(canApplyPostRollBonus(action, roll)).toBe(true);
    const proposal = proposeAction(
      { character, packages: [rulesPackage] },
      {
        actionId: action.id,
        rolls: [4],
        completedD20Test: { testId: test.id, appliedActionIds: [] },
      },
    );
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedResources["srd521.resource.warlock.dark-ones-own-luck"]).toBe(
      1,
    );
    const updated = applyPostRollBonus(action, roll, [4], "Luck");
    expect(updated.total).toBe(roll.total + 4);
    expect(updated.kept).toBe(5);
  });

  it("uses Rogue Evasion on eligible saves and disables it for inherited Incapacitated", () => {
    const { character, rulesPackage } = setup();
    const input = {
      damage: 21,
      ability: "dexterity",
      outcome: "failure",
      damageOnSuccess: "half",
    } as const;
    let result = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(resolveSavingThrowDamage(result, input).damage).toBe(10);
    expect(resolveSavingThrowDamage(result, { ...input, outcome: "success" }).damage).toBe(0);
    character.state.conditionIds.push("srd521.condition.paralyzed");
    result = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(resolveSavingThrowDamage(result, input).damage).toBe(21);
  });

  it("advances without changing expertise, possessions, history, or play state", () => {
    const { character, catalog, rulesPackage } = setup(6);
    character.state.currentHitPoints = 15;
    character.state.temporaryHitPoints = 4;
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(advanced.build.proficiencyChoices).toEqual(character.build.proficiencyChoices);
    expect(advanced.build.proficiencyChoices.expertise).toHaveLength(4);
    expect(advanced.build.levels.slice(0, 6)).toEqual(character.build.levels);
    expect(advanced.loadout).toEqual(character.loadout);
    expect(advanced.state).toEqual(character.state);
    const result = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(result.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(
      result.actions.find(({ id }) => id === "action.sneak-attack")?.parameters?.extraDamage,
    ).toMatchObject({ diceCount: 4, diceSize: 6 });
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({ eligible: true, targetLevel: 8 });
  });

  it.each([0, 21, 1.5, NaN])("rejects malformed d20 minimum %s", (value) => {
    expect(() =>
      resolveD20Roll(
        {
          label: "Check",
          mode: "normal",
          modifier: 0,
          dieMinimum: { value, sourceName: "Invalid" },
        },
        [4],
      ),
    ).toThrow();
  });
});
