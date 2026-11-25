import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import {
  deathSaveStatus,
  evaluateCharacter,
  proposeAction,
  proposeDeathSavingThrow,
  proposeRest,
  proposeSpellCast,
  applyDamage,
  applyHealing,
  setTemporaryHitPoints,
  setExhaustion,
} from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  warlockId,
  updateBuilderSpecies,
} from "./character-builder";
import { loadWebData } from "./server-data";

import {
  canResolveDeathSave,
  deathSaveResolutionRequest,
  deathSaveRollRequest,
} from "./death-save-roll";
import { resolveD20Roll, rollD20 } from "./dice-roll";
import { failedSaveRerollRequest } from "./failed-save-reroll";

function setup(halfling = false) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  let draft = defaultBuilderDraft(fighterId, catalog, 9, "Death Saves");
  if (halfling) draft = updateBuilderSpecies(draft, catalog, "srd521.species.halfling");
  const character = buildCharacter(draft, rulesPackage, {
    id: "death-saves",
    now: new Date("2026-10-10T20:00:00Z"),
  });
  character.state.currentHitPoints = 0;
  const input = { character, packages: [rulesPackage] };
  return { character, input, rulesPackage };
}
const resolution = (naturalRoll: number, total = naturalRoll) => ({
  kind: "roll" as const,
  naturalRoll,
  total,
  startOfTurnConfirmed: true,
});

describe("Death Saving Throws and deferred final-result resolution", () => {
  it("uses no ability or proficiency, and does not automatically fail while unconscious", () => {
    const { input, character } = setup();
    character.build.abilityScores.constitution = 18;
    const evaluation = evaluateCharacter(input);
    expect(evaluation.d20Tests["savingThrow.death"]).toMatchObject({
      ability: "none",
      modifier: 0,
      proficiency: { level: "none", bonus: 0 },
      rollMode: "normal",
    });
    expect(evaluation.facts["condition.unconscious.active"]).toBe(true);
    expect(evaluation.facts["savingThrow.strength.automaticFailure"]).toBe(true);
    expect(evaluation.facts["savingThrow.death.automaticFailure"]).toBeUndefined();
    expect(evaluation.traces["savingThrow.death"]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 17 })]),
    );
    expect(character.state.conditionIds).not.toContain("srd521.condition.unconscious");
  });

  it("applies Exhaustion, general saving-throw bonus dice, and another Paladin's declared aura", () => {
    const { character, input } = setup();
    character.state.exhaustion = 1;
    character.state.activeEffectIds = [
      "srd521.status.spell.bless",
      "srd521.status.feature.aura-of-protection",
    ];
    character.state.activeEffectSelections["srd521.status.feature.aura-of-protection"] = "3";
    const evaluation = evaluateCharacter(input);
    const request = deathSaveRollRequest(evaluation);
    expect(request.modifier).toBe(1);
    expect(request.bonusDice?.map(({ diceCount, diceSize }) => ({ diceCount, diceSize }))).toEqual([
      { diceCount: 1, diceSize: 4 },
    ]);
    expect(resolveD20Roll(request, [8], [], [[4]]).total).toBe(13);
  });

  it("retains Halfling Luck replacement dice and resolves the replacement's natural result", () => {
    const { input, character } = setup(true);
    const request = deathSaveRollRequest(evaluateCharacter(input));
    expect(request.rerollValues).toEqual([1]);
    const roll = resolveD20Roll(request, [1], [20]);
    const proposal = proposeDeathSavingThrow(
      input,
      deathSaveResolutionRequest(character.state, roll, true),
    );
    expect(proposal.outcome).toBe("regain-one-hit-point");
    expect(proposal.nextState.currentHitPoints).toBe(1);
  });

  it("resolves situational Advantage and Disadvantage for a death save without adding an ability", () => {
    const { input } = setup();
    const advantage = {
      testId: "savingThrow.death",
      kind: "advantage" as const,
      source: "situational",
    };
    const disadvantage = { ...advantage, kind: "disadvantage" as const, source: "other" };
    const one = evaluateCharacter({ ...input, context: { d20RollEffects: [advantage] } });
    expect(deathSaveRollRequest(one).mode).toBe("advantage");
    expect(resolveD20Roll(deathSaveRollRequest(one), [3, 18]).kept).toBe(18);
    const both = evaluateCharacter({
      ...input,
      context: { d20RollEffects: [advantage, disadvantage] },
    });
    expect(deathSaveRollRequest(both)).toMatchObject({ mode: "normal", modifier: 0 });
  });

  it("allows a no-action Dark One's Own Luck bonus while unconscious, but blocks actions and Reactions", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const character = buildCharacter(
      defaultBuilderDraft(warlockId, catalog, 6, "Fiend"),
      rulesPackage,
      { id: "fiend-death-save", now: new Date("2026-10-10T20:00:00Z") },
    );
    character.state.currentHitPoints = 0;
    const input = { character, packages: [rulesPackage] };
    const proposal = proposeAction(input, {
      actionId: "action.dark-ones-own-luck",
      rolls: [4],
      completedD20Test: { testId: "savingThrow.death", appliedActionIds: [] },
    });
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedResources["srd521.resource.warlock.dark-ones-own-luck"]).toBe(
      1,
    );
    expect(
      evaluateCharacter(input)
        .actions.filter(({ actionEconomy }) =>
          ["action", "bonus-action", "reaction"].includes(actionEconomy ?? ""),
        )
        .every(({ available }) => !available),
    ).toBe(true);
  });

  it.each([
    [2, 9, "failure", 0, 1],
    [10, 10, "success", 1, 0],
    [2, 10, "success", 1, 0],
    [19, 9, "failure", 0, 1],
    [1, 99, "two-failures", 0, 2],
  ] as const)(
    "resolves natural %s, total %s as %s",
    (naturalRoll, total, outcome, successes, failures) => {
      const { input, character } = setup();
      const original = structuredClone(character);
      const proposal = proposeDeathSavingThrow(input, resolution(naturalRoll, total));
      expect(proposal).toMatchObject({
        applicable: true,
        outcome,
        nextState: {
          currentHitPoints: 0,
          deathSaveSuccesses: successes,
          deathSaveFailures: failures,
        },
      });
      expect(character).toEqual(original);
      for (const trace of Object.values(proposal.traces))
        expect(trace.sourceReferences.map(({ page }) => page)).toEqual([17, 18]);
    },
  );

  it("becomes Stable on the third success and resets both counters", () => {
    const { character, input } = setup();
    character.state.deathSaveSuccesses = 2;
    character.state.deathSaveFailures = 2;
    const proposal = proposeDeathSavingThrow(input, resolution(10));
    expect(proposal.outcome).toBe("stable");
    expect(proposal.nextState).toMatchObject({
      currentHitPoints: 0,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      stableAtZeroHitPoints: true,
    });
    expect(deathSaveStatus(proposal.nextState)).toBe("stable");
    character.state = proposal.nextState;
    expect(proposeDeathSavingThrow(input, resolution(20)).applicable).toBe(false);
    expect(evaluateCharacter(input).facts["condition.unconscious.active"]).toBe(true);
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
  });

  it("dies on a third failure and natural 20 cannot revive an already dead character", () => {
    const { character, input } = setup();
    character.state.deathSaveFailures = 2;
    const proposal = proposeDeathSavingThrow(input, resolution(2));
    expect(proposal.outcome).toBe("dead");
    character.state = proposal.nextState;
    expect(deathSaveStatus(character.state)).toBe("dead");
    expect(proposeDeathSavingThrow(input, resolution(20)).applicable).toBe(false);
    expect(
      proposeAction(input, {
        actionId: "action.indomitable",
        failedSave: true,
        completedD20Test: { testId: "savingThrow.death", appliedActionIds: [] },
      }).applicable,
    ).toBe(false);
    expect(proposeRest(input, { event: "long-rest" }).applicable).toBe(false);
    expect(() => applyHealing(character, 10, 90)).toThrow("cannot revive");
  });

  it("a natural 20 regains 1 HP regardless of modified total, resetting marks without removing unrelated unconsciousness", () => {
    const { character, input } = setup();
    character.state.deathSaveSuccesses = 1;
    character.state.deathSaveFailures = 2;
    character.state.conditionIds = ["srd521.condition.unconscious"];
    const proposal = proposeDeathSavingThrow(input, resolution(20, -10));
    expect(proposal.nextState).toMatchObject({
      currentHitPoints: 1,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      stableAtZeroHitPoints: false,
    });
    expect(proposal.nextState.conditionIds).toEqual(character.state.conditionIds);
    character.state = proposal.nextState;
    expect(evaluateCharacter(input).facts["condition.unconscious.active"]).toBe(true);
    character.state.conditionIds = [];
    expect(evaluateCharacter(input).facts["condition.unconscious.active"]).not.toBe(true);
  });

  it("allows Indomitable before applying death marks and applies only the replacement", () => {
    const { character, input } = setup();
    const evaluation = evaluateCharacter(input);
    const initial = resolveD20Roll(deathSaveRollRequest(evaluation), [2]);
    expect(initial.total).toBe(2);
    expect(character.state.deathSaveFailures).toBe(0);
    const action = evaluation.actions.find(({ id }) => id === "action.indomitable");
    if (action === undefined) throw new Error("Missing Indomitable");
    const spend = proposeAction(input, {
      actionId: action.id,
      failedSave: true,
      completedD20Test: { testId: initial.testId ?? "", appliedActionIds: [] },
    });
    expect(spend.validations).toEqual([]);
    expect(spend.applicable).toBe(true);
    character.state = spend.nextState;
    const reroll = resolveD20Roll(failedSaveRerollRequest(action, evaluation, initial), [2]);
    expect(reroll.total).toBe(11);
    const result = proposeDeathSavingThrow(
      input,
      deathSaveResolutionRequest(character.state, reroll, true),
    );
    expect(result.nextState).toMatchObject({
      deathSaveSuccesses: 1,
      deathSaveFailures: 0,
      expendedResources: { "srd521.resource.fighter.indomitable": 1 },
    });
    expect(proposeDeathSavingThrow(input, resolution(1, 10)).outcome).toBe("two-failures");
  });

  it("requires explicit timing or successful first aid, and rejects living/stable/dead resolution atomically", () => {
    const { character, input } = setup();
    for (const request of [
      { ...resolution(10), startOfTurnConfirmed: false },
      { kind: "stabilize" as const, successfulFirstAidConfirmed: false },
    ]) {
      const result = proposeDeathSavingThrow(input, request);
      expect(result.applicable).toBe(false);
      expect(result.changes).toEqual([]);
      expect(result.nextState).toEqual(character.state);
    }
    const result = proposeDeathSavingThrow(input, {
      kind: "stabilize",
      successfulFirstAidConfirmed: true,
    });
    expect(result.outcome).toBe("stable");
    character.state.currentHitPoints = 1;
    expect(proposeDeathSavingThrow(input, resolution(1)).applicable).toBe(false);
    for (const value of [0, 21, 1.5, Number.NaN])
      expect(() => proposeDeathSavingThrow(input, resolution(value))).toThrow();
  });

  it("rejects missing, unrelated, or already resolved rolls in the UI helper", () => {
    const { character, input } = setup();
    const roll = rollD20(deathSaveRollRequest(evaluateCharacter(input)), () => 0.5);
    expect(canResolveDeathSave(character.state, roll)).toBe(true);
    expect(() => deathSaveResolutionRequest(character.state, roll, false)).toThrow();
    expect(
      canResolveDeathSave(character.state, { ...roll, appliedActionIds: ["death-save.resolve"] }),
    ).toBe(false);
    expect(canResolveDeathSave(character.state, { ...roll, testId: "savingThrow.wisdom" })).toBe(
      false,
    );
    expect(canResolveDeathSave(character.state, undefined)).toBe(false);
    expect(() => deathSaveResolutionRequest(character.state, undefined, true)).toThrow();
  });

  it("temporary HP do not stabilize or prevent failures from damage at zero, including critical damage", () => {
    const { character } = setup();
    character.state.stableAtZeroHitPoints = true;
    const temporary = setTemporaryHitPoints(character, 10);
    expect(deathSaveStatus(temporary.state)).toBe("stable");
    const ordinary = applyDamage(temporary, 1);
    expect(ordinary.state).toMatchObject({
      currentHitPoints: 0,
      temporaryHitPoints: 9,
      deathSaveFailures: 1,
      stableAtZeroHitPoints: false,
    });
    const critical = applyDamage(temporary, 1, undefined, { critical: true });
    expect(critical.state.deathSaveFailures).toBe(2);
    expect(applyDamage(temporary, 0).state.stableAtZeroHitPoints).toBe(true);
  });

  it("handles massive damage and ends concentration when dropping to zero", () => {
    const { character } = setup();
    character.state.currentHitPoints = 2;
    character.state.concentrationSpellId = "srd521.spell.bless";
    character.state.activeEffectIds = [
      "srd521.status.spell.bless",
      "srd521.status.spell.longstrider",
    ];
    const dead = applyDamage(character, 12, undefined, {
      maximumHitPoints: 10,
      concentrationEffectIds: ["srd521.status.spell.bless"],
    });
    expect(deathSaveStatus(dead.state)).toBe("dead");
    expect(dead.state.dead).toBe(true);
    expect(dead.state.deathSaveFailures).toBe(0);
    expect(dead.state.concentrationSpellId).toBeUndefined();
    expect(dead.state.activeEffectIds).toEqual(["srd521.status.spell.longstrider"]);
    const protectedCharacter = setTemporaryHitPoints(character, 5);
    expect(
      deathSaveStatus(
        applyDamage(protectedCharacter, 12, undefined, { maximumHitPoints: 10 }).state,
      ),
    ).toBe("dying");
  });

  it("healing clears both marks and stability, without restoring unrelated resources", () => {
    const { character } = setup();
    character.state.stableAtZeroHitPoints = true;
    character.state.deathSaveSuccesses = 1;
    character.state.deathSaveFailures = 2;
    character.state.expendedResources["srd521.resource.fighter.second-wind"] = 1;
    const healed = applyHealing(character, 1, 90);
    expect(healed.state).toMatchObject({
      currentHitPoints: 1,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      stableAtZeroHitPoints: false,
    });
    expect(healed.state.expendedResources).toEqual(character.state.expendedResources);
    expect(applyHealing(character, 0, 90).state).toEqual(character.state);
    expect(deathSaveStatus(applyDamage(healed, 1).state)).toBe("dying");
  });

  it("six levels of Exhaustion cause death and reducing Exhaustion does not revive the character", () => {
    const { character } = setup();
    const dead = setExhaustion(character, 6);
    expect(dead.state.dead).toBe(true);
    expect(deathSaveStatus(dead.state)).toBe("dead");
    expect(deathSaveStatus(setExhaustion(dead, 5).state)).toBe("dead");
    expect(() => applyHealing(dead, 1, 90)).toThrow("cannot revive");
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(dead)))).toEqual(dead);
  });

  it("normalizes legacy stabilized marks on damage and clears stale healed marks on a fresh fall", () => {
    const { character } = setup();
    character.state.deathSaveSuccesses = 3;
    character.state.deathSaveFailures = 2;
    expect(deathSaveStatus(character.state)).toBe("stable");
    expect(applyDamage(character, 1).state).toMatchObject({
      deathSaveSuccesses: 0,
      deathSaveFailures: 1,
      stableAtZeroHitPoints: false,
    });
    character.state.currentHitPoints = 1;
    character.state.deathSaveSuccesses = 1;
    expect(applyDamage(character, 1).state).toMatchObject({
      currentHitPoints: 0,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
    });
  });

  it("does not allow an unconscious zero-HP caster to cast, even if it has spell slots", () => {
    const { rulesPackage, fixtures } = loadWebData();
    const character = fixtures.find(({ filename }) => filename === "wizard-5.json")?.character;
    if (character === undefined) throw new Error("Missing Wizard");
    character.state.currentHitPoints = 0;
    const input = { character, packages: [rulesPackage] };
    const spellId = evaluateCharacter(input).spells.find(
      ({ prepared, level }) => prepared && level === 1,
    )?.id;
    if (spellId === undefined) throw new Error("Missing prepared spell");
    expect(
      proposeSpellCast(input, { spellId, slotLevel: 1 }).validations.map(({ code }) => code),
    ).toContain("INCAPACITATED_CHARACTER_CAST");
  });
});
