import { describe, expect, it } from "vitest";
import {
  evaluateCharacter,
  resolveAttackRollOptions,
  type AttackRollDeclaration,
} from "@dnd/rules-core";
import type { AttackSummary } from "@dnd/rules-api";
import { characterDocumentSchema } from "@dnd/character-model";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  barbarianId,
  fighterId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";
import { declaredAttackRollRequest, attackTradeoffDamageRequest } from "./attack-roll-options";
import { resolveD20Roll, resolveDicePoolRoll } from "./dice-roll";

const reckless = "srd521.class-feature.barbarian.reckless-attack";
const brutal = "srd521.class-feature.barbarian.brutal-strike";
const options = { id: "barbarian-nine", now: new Date("2026-10-11T09:00:00Z") };
function setup(level = 9, classId: typeof barbarianId | typeof fighterId = barbarianId) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(classId, catalog, level, "Brutal Berserker"),
    rulesPackage,
    options,
  );
  const input = { character, packages: [rulesPackage] };
  const evaluation = evaluateCharacter(input);
  const attack =
    evaluation.attacks.find(({ weaponId }) => weaponId === "srd521.equipment.weapon.greataxe") ??
    evaluation.attacks[0];
  if (attack === undefined) throw new Error("Missing attack");
  return { character, catalog, rulesPackage, input, evaluation, attack };
}
const declaration = (): AttackRollDeclaration => ({
  benefitSourceIds: [reckless],
  firstAttackDeclarationConfirmed: true,
  tradeoffSourceId: brutal,
  effectId: "forceful-blow",
  ownTurnConfirmed: true,
  unusedThisTurnConfirmed: true,
});

describe("Barbarian level 9 and source-driven attack Advantage tradeoffs", () => {
  it("creates a legal level-9 character with source-linked effects and Rage Damage 3", () => {
    const { evaluation, attack, character, catalog } = setup();
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(attack.rollOptions?.map(({ sourceId }) => sourceId)).toEqual(
      expect.arrayContaining([reckless, brutal]),
    );
    const strike = attack.rollOptions?.find(({ sourceId }) => sourceId === brutal);
    expect(strike).toMatchObject({
      kind: "forgo-advantage",
      damage: { diceCount: 1, diceSize: 10 },
      onceOnYourTurn: true,
    });
    expect(strike?.effects.map(({ id }) => id)).toEqual(["forceful-blow", "hamstring-blow"]);
    expect(evaluation.traces[strike?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ page: 29 }),
        expect.objectContaining({ page: 30 }),
      ]),
    );
    character.state.activeEffectIds.push("srd521.effect.barbarian.rage");
    const raging = evaluateCharacter({ character, packages: [setup().rulesPackage] });
    expect(raging.attacks.find(({ id }) => id === attack.id)?.damage.bonus).toBe(
      attack.damage.bonus + 3,
    );
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: true,
      currentLevel: 9,
    });
  });

  it("advances 8→9 without replacing resources, feats, loadout, or earlier history", () => {
    const { character, catalog, rulesPackage } = setup(8);
    character.state.currentHitPoints = 11;
    character.state.expendedResources["srd521.resource.barbarian.rage"] = 2;
    const before = structuredClone(character);
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(advanced.build.levels.slice(0, 8)).toEqual(character.build.levels);
    expect(advanced.build.featIds).toEqual(character.build.featIds);
    expect(advanced.build.featAbilityScoreIncreases).toEqual(
      character.build.featAbilityScoreIncreases,
    );
    expect(advanced.state).toEqual(character.state);
    expect(advanced.loadout).toEqual(character.loadout);
    expect(character).toEqual(before);
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(advanced)))).toEqual(advanced);
  });

  it.each([1, 2, 8, 9])(
    "grants Reckless Attack at 2 and Brutal Strike only at 9 (level %i)",
    (level) => {
      const { attack } = setup(level);
      expect(attack.rollOptions?.some(({ sourceId }) => sourceId === reckless)).toBe(level >= 2);
      expect(attack.rollOptions?.some(({ sourceId }) => sourceId === brutal)).toBe(level >= 9);
    },
  );

  it("uses Reckless Attack with Strength, including thrown attacks and Unarmed Strikes, without requiring Rage", () => {
    const { evaluation } = setup();
    expect(evaluation.attacks.find(({ id }) => id === "attack.unarmed-strike")).toMatchObject({
      ability: "strength",
      damage: { flat: 1, type: "bludgeoning" },
    });
    const strength = evaluation.attacks.filter(({ ability }) => ability === "strength");
    expect(strength.length).toBeGreaterThan(1);
    for (const attack of strength) {
      const result = resolveAttackRollOptions(evaluation, attack.id, {
        benefitSourceIds: [reckless],
        firstAttackDeclarationConfirmed: true,
      });
      expect(result.mode).toBe("advantage");
      const strike = resolveAttackRollOptions(evaluation, attack.id, declaration());
      expect(strike.mode).toBe("normal");
    }
  });

  it("preserves normal off-turn Reckless attacks, but cannot use Brutal Strike off-turn", () => {
    const { evaluation, attack } = setup();
    expect(
      resolveAttackRollOptions(evaluation, attack.id, {
        benefitSourceIds: [reckless],
        firstAttackDeclarationConfirmed: true,
        ownTurnConfirmed: false,
      }).mode,
    ).toBe("advantage");
    expect(() =>
      resolveAttackRollOptions(evaluation, attack.id, {
        ...declaration(),
        ownTurnConfirmed: false,
      }),
    ).toThrow(/your turn/);
  });

  it("applies matching-type Brutal Strike damage to ordinary Unarmed Strikes and preserves Rage damage separately", () => {
    const { input } = setup();
    input.character.state.activeEffectIds.push("srd521.effect.barbarian.rage");
    const evaluation = evaluateCharacter(input);
    const unarmed = evaluation.attacks.find(({ id }) => id === "attack.unarmed-strike");
    if (unarmed === undefined) throw new Error("Missing Unarmed Strike");
    const modifier = evaluation.values["ability.strength.modifier"]?.value;
    expect(unarmed.damage.bonus).toBe(Number(modifier) + 3);
    expect(unarmed.damage.flat).toBe(1);
    expect(evaluation.traces[unarmed.traceId]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 190 })]),
    );
    const result = resolveAttackRollOptions(evaluation, unarmed.id, declaration());
    expect(attackTradeoffDamageRequest(unarmed, result, true)).toMatchObject({
      diceCount: 1,
      diceSize: 10,
      modifier: 0,
    });
    expect(attackTradeoffDamageRequest(unarmed, result, true).label).toContain("bludgeoning");
  });

  it("gives up all Advantage, preserves bonus dice, and annotates the chosen effect", () => {
    const { evaluation, attack } = setup();
    evaluation.attackRollBonusDice = [{ diceCount: 1, diceSize: 4, source: "Blessed" }];
    attack.advantageSources = ["invisible", "other-source"];
    const before = structuredClone(evaluation);
    const resolution = resolveAttackRollOptions(evaluation, attack.id, {
      ...declaration(),
      additionalAdvantage: true,
    });
    expect(resolution.mode).toBe("normal");
    expect(resolution.advantageSources).toHaveLength(4);
    const request = declaredAttackRollRequest(evaluation, attack, resolution);
    expect(request).toMatchObject({ testId: attack.id, mode: "normal", criticalThreshold: 20 });
    expect(request.label).toContain("Forceful Blow on a hit");
    expect(request.label).toContain("all Advantage forgone");
    const result = resolveD20Roll(request, [12], [], [[3]]);
    expect(result.total).toBe(12 + attack.attackBonus + 3);
    expect(evaluation).toEqual(before);
  });

  it.each([
    "missing-benefit",
    "undeclared-first-attack",
    "off-turn",
    "already-chosen",
    "no-effect",
    "foreign-effect",
    "foreign-benefit",
    "foreign-tradeoff",
    "duplicate-benefit",
    "disadvantage",
  ])("rejects %s without mutating evaluation", (kind) => {
    const { evaluation, attack } = setup();
    const request = declaration();
    if (kind === "missing-benefit") request.benefitSourceIds = [];
    if (kind === "undeclared-first-attack") request.firstAttackDeclarationConfirmed = false;
    if (kind === "off-turn") request.ownTurnConfirmed = false;
    if (kind === "already-chosen") request.unusedThisTurnConfirmed = false;
    if (kind === "no-effect") delete request.effectId;
    if (kind === "foreign-effect") request.effectId = "staggering-blow";
    if (kind === "foreign-benefit") request.benefitSourceIds = ["fake"];
    if (kind === "foreign-tradeoff") request.tradeoffSourceId = "fake";
    if (kind === "duplicate-benefit") request.benefitSourceIds = [reckless, reckless];
    if (kind === "disadvantage") request.additionalDisadvantage = true;
    const before = structuredClone(evaluation);
    expect(() => resolveAttackRollOptions(evaluation, attack.id, request)).toThrow();
    expect(evaluation).toEqual(before);
  });

  it("rejects source Disadvantage despite cancellation and leaves ordinary Reckless attacks normal", () => {
    const { input, attack } = setup();
    input.character.state.conditionIds.push("srd521.condition.poisoned");
    const evaluation = evaluateCharacter(input);
    expect(evaluation.attacks.find(({ id }) => id === attack.id)?.disadvantageSources).toContain(
      "srd521.condition.poisoned",
    );
    expect(() => resolveAttackRollOptions(evaluation, attack.id, declaration())).toThrow(
      /any Disadvantage/,
    );
    expect(
      resolveAttackRollOptions(evaluation, attack.id, {
        benefitSourceIds: [reckless],
        firstAttackDeclarationConfirmed: true,
      }).mode,
    ).toBe("normal");
  });

  it("honors attack-specific and universal declared context Disadvantage", () => {
    const { input, attack } = setup();
    for (const testId of [attack.id, "attack-rolls"]) {
      const evaluation = evaluateCharacter({
        ...input,
        context: { d20RollEffects: [{ testId, kind: "disadvantage", source: "long-range" }] },
      });
      expect(() => resolveAttackRollOptions(evaluation, attack.id, declaration())).toThrow(
        /any Disadvantage/,
      );
    }
  });

  it("does not allow an ungranted option, wrong attack, or a Dexterity attack", () => {
    const fighter = setup(9, fighterId);
    expect(() =>
      resolveAttackRollOptions(fighter.evaluation, fighter.attack.id, declaration()),
    ).toThrow();
    const { input, attack } = setup();
    input.character.build.abilityScores.strength = 10;
    input.character.build.abilityScores.dexterity = 20;
    input.character.loadout.inventory.push({
      id: "rapier",
      entityId: "srd521.equipment.weapon.rapier",
      quantity: 1,
    });
    const evaluation = evaluateCharacter(input);
    const rapier = evaluation.attacks.find(({ itemId }) => itemId === "rapier");
    expect(rapier?.ability).toBe("dexterity");
    expect(rapier?.rollOptions).toEqual([]);
    expect(() =>
      resolveAttackRollOptions(evaluation, rapier?.id ?? "missing", declaration()),
    ).toThrow();
    expect(() => resolveAttackRollOptions(evaluation, "missing", declaration())).toThrow();
    expect(() =>
      declaredAttackRollRequest(evaluation, attack, {
        attackId: "missing",
        mode: "normal",
        benefits: [],
        advantageSources: [],
        disadvantageSources: [],
      }),
    ).toThrow();
  });

  it.each(["srd521.condition.incapacitated", "srd521.condition.unconscious"])(
    "cannot attack while %s",
    (id) => {
      const { input, attack } = setup();
      input.character.state.conditionIds.push(id);
      expect(() =>
        resolveAttackRollOptions(evaluateCharacter(input), attack.id, declaration()),
      ).toThrow(/cannot make an attack/);
    },
  );

  it("rolls the separate matching-type damage only on a declared hit and doubles dice, not bonuses, on a crit", () => {
    const { evaluation, attack } = setup();
    const resolution = resolveAttackRollOptions(evaluation, attack.id, declaration());
    expect(() => attackTradeoffDamageRequest(attack, resolution, false)).toThrow(/hit/);
    const normal = attackTradeoffDamageRequest(attack, resolution, true);
    expect(normal).toMatchObject({ diceCount: 1, diceSize: 10, modifier: 0 });
    expect(normal.label).toContain(attack.damage.type);
    expect(resolveDicePoolRoll(normal, [7]).total).toBe(7);
    const critical = attackTradeoffDamageRequest(attack, resolution, true, true);
    expect(critical).toMatchObject({ diceCount: 2, modifier: 0 });
    expect(resolveDicePoolRoll(critical, [7, 8]).total).toBe(15);
    const other: AttackSummary = { ...attack, id: "other" };
    expect(() => attackTradeoffDamageRequest(other, resolution, true)).toThrow();
  });

  it.each([
    { condition: undefined, effect: undefined, exhaustion: 0, feet: 20 },
    { condition: undefined, effect: undefined, exhaustion: 1, feet: 17 },
    { condition: "srd521.condition.grappled", effect: undefined, exhaustion: 0, feet: 0 },
    { condition: undefined, effect: "srd521.status.spell.haste", exhaustion: 0, feet: 40 },
  ])(
    "uses adjusted Speed for Forceful Blow movement ($feet ft)",
    ({ condition, effect, exhaustion, feet }) => {
      const { input, attack } = setup();
      if (condition !== undefined) input.character.state.conditionIds.push(condition);
      if (effect !== undefined) input.character.state.activeEffectIds.push(effect);
      input.character.state.exhaustion = exhaustion;
      const result = resolveAttackRollOptions(evaluateCharacter(input), attack.id, declaration());
      expect(result.effect?.movement).toMatchObject({
        maximumFeet: feet,
        provokesOpportunityAttacks: false,
      });
      const hamstring = resolveAttackRollOptions(evaluateCharacter(input), attack.id, {
        ...declaration(),
        effectId: "hamstring-blow",
      });
      expect(hamstring.effect?.instructions).toContain("most recent");
      expect(hamstring.effect?.movement).toBeUndefined();
    },
  );

  it("reads dice and movement from content rather than hard-coded Barbarian UI logic", () => {
    const { rulesPackage, character, attack } = setup();
    const edited = structuredClone(rulesPackage);
    const feature = edited.entities.find(({ id }) => id === brutal);
    if (
      feature === undefined ||
      typeof feature.body !== "object" ||
      feature.body === null ||
      Array.isArray(feature.body)
    )
      throw new Error("Missing feature");
    feature.body = {
      ...feature.body,
      attackRollOptions: [
        {
          kind: "forgo-advantage",
          ability: "strength",
          requiredOptionSourceId: reckless,
          requiresFirstAttackDeclaration: false,
          onceOnYourTurn: true,
          instructions: "Test authored option",
          damage: { diceCount: 2, diceSize: 8 },
          effects: [
            {
              id: "authored",
              name: "Authored",
              instructions: "Test movement",
              movement: { speedFraction: 0.25, provokesOpportunityAttacks: true },
            },
          ],
        },
      ],
    };
    const result = resolveAttackRollOptions(
      evaluateCharacter({ character, packages: [edited] }),
      attack.id,
      { ...declaration(), effectId: "authored" },
    );
    expect(result.effect?.movement?.maximumFeet).toBe(10);
    expect(attackTradeoffDamageRequest(attack, result, true)).toMatchObject({
      diceCount: 2,
      diceSize: 8,
    });
  });
});
