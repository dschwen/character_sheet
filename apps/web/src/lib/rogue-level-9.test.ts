import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import { onHitExtraDamageSchema } from "@dnd/content-schema";
import { evaluateCharacter } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  rogueId,
  fighterId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import {
  eligibleDamageWeapon,
  onHitDamageDefinition,
  onHitDamageOptions,
  onHitDamageRollRequest,
  onHitRequirements,
  type OnHitDamageContext,
} from "./on-hit-damage";
import { actionInstructions } from "./action-targeting";
import { actionMovementMessage } from "./action-roll";
import { rollDiceFullscreen } from "./fullscreen-dice";
import { rollDice } from "./dice-roll";
import { loadWebData } from "./server-data";
import { abilityScoreImprovementId } from "./ability-score-improvements";

const options = { id: "rogue-nine", now: new Date("2026-10-12T12:00:00Z") };
const supremeId = "srd521.subclass-feature.rogue.thief.supreme-sneak";
const stealthId = "action.cunning-strike.stealth-attack";
function setup(level = 9) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(rogueId, catalog, level, "Supreme Scout"),
    rulesPackage,
    options,
  );
  const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
  const action = evaluation.actions.find(({ id }) => id === "action.sneak-attack");
  if (action === undefined) throw new Error("Missing Sneak Attack");
  const weapon = evaluation.attacks.find((attack) => eligibleDamageWeapon(action, attack));
  if (weapon === undefined) throw new Error("Missing eligible weapon");
  const context: OnHitDamageContext = {
    attackId: weapon.id,
    optionIds: [],
    hitCreature: true,
    unusedThisTurn: true,
    critical: false,
    confirmedRequirements: onHitRequirements(action),
  };
  const request = (patch: Partial<OnHitDamageContext> = {}) =>
    onHitDamageRollRequest(
      action,
      evaluation.actions,
      evaluation.attacks,
      { ...context, ...patch },
      "Sneak Attack",
    );
  return { rulesPackage, catalog, character, evaluation, action, weapon, context, request };
}

describe("Rogue level 9 and declared on-hit extra damage", () => {
  it("creates a legal Thief with PB 4, four Expertise skills, 5d6 and source-linked Supreme Sneak", () => {
    const { character, catalog, evaluation, action } = setup();
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(onHitDamageDefinition(action)?.diceCount).toBe(5);
    expect(
      Object.values(evaluation.d20Tests).filter(
        ({ id, proficiency }) => id.startsWith("skill.") && proficiency.level === "expertise",
      ),
    ).toHaveLength(4);
    expect(evaluation.values["speed.climb"]?.value).toBe(evaluation.values["speed.walking"]?.value);
    expect(evaluation.actions.find(({ id }) => id === stealthId)).toMatchObject({
      available: true,
      actionEconomy: "on-sneak-attack",
      parameters: { sneakAttackDiceCost: 1 },
    });
    expect(evaluation.traces[`${stealthId}.available`]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: supremeId, page: 64 }),
    );
    expect(
      evaluation.traces["action.sneak-attack.extraDamage.diceCount"]?.sourceReferences,
    ).toContainEqual(expect.objectContaining({ page: 62 }));
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
    expect(character.build.featIds.filter((id) => id === abilityScoreImprovementId)).toHaveLength(
      2,
    );
  });

  it("advances 8→9 without modifying prior choices, equipment, or play state", () => {
    const { character, catalog, rulesPackage } = setup(8);
    character.state.currentHitPoints = 7;
    character.state.temporaryHitPoints = 3;
    character.state.conditionIds.push("srd521.condition.invisible");
    const before = structuredClone(character);
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(character).toEqual(before);
    expect(next.state).toEqual(before.state);
    expect(next.loadout).toEqual(before.loadout);
    expect(next.build.levels.slice(0, 8)).toEqual(before.build.levels);
    expect(next.build.featIds).toEqual(before.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(before.build.featAbilityScoreIncreases);
    const result = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(result.validations).toEqual([]);
    expect(result.actions.some(({ id }) => id === stealthId)).toBe(true);
  });

  it.each([3, 5, 7, 8, 9])(
    "gates Stealth Attack at 9 and preserves damage scaling at level %i",
    (level) => {
      const { action, evaluation } = setup(level);
      expect(onHitDamageDefinition(action)?.diceCount).toBe(Math.ceil(level / 2));
      expect(
        onHitDamageOptions(action, evaluation.actions).some(({ id }) => id === stealthId),
      ).toBe(level === 9);
    },
  );

  it.each(["poison", "trip", "withdraw", "stealth-attack"])(
    "subtracts %s's cost before critical doubling, with no ability damage bonus",
    (option) => {
      const { action, evaluation, request, context } = setup();
      const effect = evaluation.actions.find(({ id }) => id === `action.cunning-strike.${option}`);
      if (effect === undefined) throw new Error("Missing effect");
      const patch = {
        optionIds: [effect.id],
        confirmedRequirements: [...onHitRequirements(action), ...onHitRequirements(effect)],
      };
      expect(request(patch).request).toMatchObject({ diceCount: 4, diceSize: 6, modifier: 0 });
      expect(request({ ...patch, critical: true }).request.diceCount).toBe(8);
      expect(request({ ...patch, critical: true }).request.label).toContain("1d6 forgone");
      expect(context.unusedThisTurn).toBe(true);
    },
  );

  it("rolls full 5d6/critical 10d6 separately from weapon damage", async () => {
    const { request, weapon } = setup();
    expect(request().request).toMatchObject({ diceCount: 5, diceSize: 6, modifier: 0 });
    expect(request().request.label).toContain(weapon.damage.type);
    expect(request({ critical: true }).request.diceCount).toBe(10);
    expect(rollDice(request().request, () => 0).total).toBe(5);
    const calls: unknown[] = [];
    const result = await rollDiceFullscreen(request({ critical: true }).request, (dice) => {
      calls.push(dice);
      return Promise.resolve(Array.from({ length: 10 }, () => 6));
    });
    expect(result.total).toBe(60);
    expect(calls).toHaveLength(1);
  });

  it.each([
    { hitCreature: false },
    { unusedThisTurn: false },
    { attackId: "attack.unarmed-strike" },
    { attackId: "not-equipped" },
    { confirmedRequirements: [] },
    { optionIds: ["action.cunning-strike.not-granted"] },
    { optionIds: [stealthId] },
    { optionIds: ["action.cunning-strike.trip", stealthId] },
    { optionIds: [stealthId, stealthId] },
  ])("rejects ineligible or incomplete declarations %j", (patch) => {
    expect(() => setup().request(patch)).toThrow();
  });

  it("requires both Hide-source Invisible and sufficient end-turn cover declarations", () => {
    const { action, evaluation, request } = setup();
    const effect = evaluation.actions.find(({ id }) => id === stealthId);
    if (effect === undefined) throw new Error("Missing effect");
    for (const requirement of onHitRequirements(effect)) {
      expect(() =>
        request({
          optionIds: [stealthId],
          confirmedRequirements: [
            ...onHitRequirements(action),
            ...onHitRequirements(effect).filter((value) => value !== requirement),
          ],
        }),
      ).toThrow("Confirm eligibility");
    }
    const instructions = actionInstructions(effect).join(" ");
    expect(instructions).toContain("spell or another source alone is not enough");
    expect(instructions).toContain("end this turn");
    expect(instructions).toContain("does not grant Invisible");
    expect(instructions).toContain("unrelated Invisible");
    expect(effect.parameters?.activatesEffectId).toBeUndefined();
  });

  it("keeps target DCs and Withdraw movement source-aware", () => {
    const { evaluation } = setup();
    const trip = evaluation.actions.find(({ id }) => id === "action.cunning-strike.trip");
    const poison = evaluation.actions.find(({ id }) => id === "action.cunning-strike.poison");
    const withdraw = evaluation.actions.find(({ id }) => id === "action.cunning-strike.withdraw");
    if (trip === undefined || poison === undefined) throw new Error("Missing Cunning Strike saves");
    expect(trip.parameters?.savingThrow).toMatchObject({
      ability: "dexterity",
      difficultyClass: 17,
    });
    expect(poison.parameters?.savingThrow).toMatchObject({
      ability: "constitution",
      difficultyClass: 17,
    });
    if (withdraw === undefined) throw new Error("Missing Withdraw");
    expect(actionMovementMessage(withdraw)).toContain("15 ft.");
    expect(actionInstructions(trip).join(" ")).toContain("Prone on the target's sheet");
    expect(actionInstructions(poison).join(" ")).toContain("Poisoned on the target's");
  });

  it("does not mutate HP, conditions, resources, or character state during declared rolls", () => {
    const { character, evaluation, action, request } = setup();
    const before = structuredClone(character);
    const effect = evaluation.actions.find(({ id }) => id === stealthId);
    if (effect === undefined) throw new Error("Missing Stealth Attack");
    request({
      optionIds: [stealthId],
      confirmedRequirements: [...onHitRequirements(action), ...onHitRequirements(effect)],
    });
    expect(character).toEqual(before);
    expect(character.state.conditionIds).not.toContain("srd521.condition.invisible");
  });

  it("selects Finesse melee or Ranged weapons, not unarmed or non-Finesse melee", () => {
    const { action, weapon } = setup();
    expect(eligibleDamageWeapon(action, { ...weapon, attackType: "melee", properties: [] })).toBe(
      false,
    );
    expect(
      eligibleDamageWeapon(action, { ...weapon, attackType: "melee", properties: ["finesse"] }),
    ).toBe(true);
    expect(eligibleDamageWeapon(action, { ...weapon, attackType: "ranged", properties: [] })).toBe(
      true,
    );
    expect(
      eligibleDamageWeapon(action, { ...weapon, properties: ["unarmed-strike", "finesse"] }),
    ).toBe(false);
  });

  it("rejects condition-disabled actions and never offers an ungranted subclass option", () => {
    const { character, rulesPackage, context } = setup();
    character.state.conditionIds.push("srd521.condition.incapacitated");
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const action = evaluation.actions.find(({ id }) => id === "action.sneak-attack");
    if (action === undefined) throw new Error("Missing action");
    expect(action.available).toBe(false);
    expect(() =>
      onHitDamageRollRequest(
        action,
        evaluation.actions,
        evaluation.attacks,
        context,
        "Sneak Attack",
      ),
    ).toThrow("not available");
    const lower = setup(8);
    expect(() =>
      lower.request({
        optionIds: [stealthId],
        confirmedRequirements: [
          ...context.confirmedRequirements,
          "hide-action-invisible",
          "end-turn-behind-three-quarters-or-total-cover",
        ],
      }),
    ).toThrow("not available");
  });

  it("has no class-ID switch: an authored extra damage action can be granted to another class", () => {
    const { rulesPackage, catalog } = setup();
    const ir = rulesPackage.authoringIr?.find(
      ({ id }) => id === "srd521.class-feature.rogue.sneak-attack",
    );
    if (ir === undefined) throw new Error("Missing IR");
    ir.id = "srd521.class-feature.fighter.second-wind";
    ir.parentId = fighterId;
    for (const rule of ir.proposedRules) rule.expression = { kind: "literal", value: 2 };
    const character = buildCharacter(
      defaultBuilderDraft(fighterId, catalog, 9, "Authored Fighter"),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const action = evaluation.actions.find(({ id }) => id === "action.sneak-attack");
    expect(action && onHitDamageDefinition(action)?.diceCount).toBe(2);
    expect(evaluation.actions.some(({ id }) => id === stealthId)).toBe(false);
  });

  it.each([
    { maximumOptions: -1 },
    { maximumOptions: 0.5 },
    { weaponEligibility: { anyAttackTypes: ["spell"] } },
    { diceSize: 0 },
  ])("rejects malformed authored extra damage %j", (patch) => {
    expect(
      onHitExtraDamageSchema.safeParse({
        diceSize: 6,
        type: "weapon-damage-type",
        frequency: "once-per-turn",
        ...patch,
      }).success,
    ).toBe(false);
  });
});
