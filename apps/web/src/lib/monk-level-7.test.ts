import { describe, expect, it } from "vitest";
import { evaluateCharacter, resolveSavingThrowDamage } from "@dnd/rules-core";
import { featureAutomationBodySchema } from "@dnd/content-schema";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  monkId,
  fighterId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { applyDamage } from "./play-state";
import { loadWebData } from "./server-data";

const evasionId = "srd521.class-feature.monk.evasion";
const options = { id: "monk-seven", now: new Date("2026-10-10T12:00:00Z") };
function setup(level = 7, classId: typeof monkId | typeof fighterId = monkId) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(classId, catalog, level, "Evasive Monk"),
    rulesPackage,
    options,
  );
  return { character, rulesPackage, catalog };
}
function request(outcome: "success" | "failure", damage = 21) {
  return { ability: "dexterity", outcome, damage, damageOnSuccess: "half" } as const;
}

describe("Monk level 7 and shared saving-throw damage resolution", () => {
  it.each([
    [6, "success", 10],
    [6, "failure", 21],
    [7, "success", 0],
    [7, "failure", 10],
  ] as const)("resolves level %i %s to %i damage", (level, outcome, expected) => {
    const { character, rulesPackage } = setup(level);
    const before = structuredClone(character);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const resolution = resolveSavingThrowDamage(evaluation, request(outcome));
    expect(resolution.damage).toBe(expected);
    expect(resolution.appliedEffectIds).toEqual(level === 7 ? [evasionId] : []);
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    if (level === 7)
      expect(resolution.trace.sourceReferences).toEqual(
        expect.arrayContaining([expect.objectContaining({ page: 51, entityId: evasionId })]),
      );
    expect(character).toEqual(before);
  });

  it.each(["incapacitated", "stunned", "paralyzed", "unconscious"])(
    "disables Evasion for effective %s",
    (condition) => {
      const { character, rulesPackage } = setup();
      character.state.conditionIds.push(`srd521.condition.${condition}`);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const effect = evaluation.savingThrowDamageEffects?.find(
        ({ sourceId }) => sourceId === evasionId,
      );
      expect(effect?.active).toBe(false);
      expect(effect?.reasons.join(" ")).toContain("Incapacitated");
      expect(resolveSavingThrowDamage(evaluation, request("success")).damage).toBe(10);
      expect(resolveSavingThrowDamage(evaluation, request("failure")).damage).toBe(21);
    },
  );

  it("does not treat Prone or Grappled as Incapacitated or require Focus", () => {
    const { character, rulesPackage } = setup();
    character.state.conditionIds = ["srd521.condition.prone", "srd521.condition.grappled"];
    character.state.expendedResources["srd521.resource.monk.focus-points"] = 7;
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(resolveSavingThrowDamage(evaluation, request("success")).damage).toBe(0);
    expect(evaluation.savingThrowDamageEffects?.[0]?.active).toBe(true);
  });

  it("does not require unarmored Martial Arts eligibility", () => {
    const { character, rulesPackage } = setup();
    character.loadout.inventory.push(
      { id: "heavy", entityId: "srd521.equipment.armor.chain-mail", quantity: 1 },
      { id: "shield", entityId: "srd521.equipment.shield", quantity: 1 },
    );
    character.loadout.equippedItemIds.push("heavy", "shield");
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(resolveSavingThrowDamage(evaluation, request("success")).damage).toBe(0);
  });

  it("does not apply to other abilities or effects without half damage on success", () => {
    const { character, rulesPackage } = setup();
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    for (const ability of [
      "strength",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ] as const) {
      expect(resolveSavingThrowDamage(evaluation, { ...request("success"), ability }).damage).toBe(
        10,
      );
      expect(resolveSavingThrowDamage(evaluation, { ...request("failure"), ability }).damage).toBe(
        21,
      );
    }
    for (const damageOnSuccess of ["none", "full"] as const) {
      expect(
        resolveSavingThrowDamage(evaluation, { ...request("failure"), damageOnSuccess }).damage,
      ).toBe(21);
      expect(
        resolveSavingThrowDamage(evaluation, { ...request("success"), damageOnSuccess })
          .appliedEffectIds,
      ).toEqual([]);
    }
  });

  it("does not grant Evasion to another class", () => {
    const { character, rulesPackage } = setup(7, fighterId);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.savingThrowDamageEffects).toEqual([]);
    expect(resolveSavingThrowDamage(evaluation, request("success")).damage).toBe(10);
  });

  it("applies reduced damage to Temporary HP before current HP exactly once", () => {
    const { character, rulesPackage } = setup();
    character.state.currentHitPoints = 20;
    character.state.temporaryHitPoints = 4;
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const result = resolveSavingThrowDamage(evaluation, request("failure"));
    const updated = applyDamage(character, result.damage, options.now);
    expect(updated.state.temporaryHitPoints).toBe(0);
    expect(updated.state.currentHitPoints).toBe(14);
    expect(updated.metadata.revision).toBe(character.metadata.revision + 1);
    const avoided = applyDamage(
      character,
      resolveSavingThrowDamage(evaluation, request("success")).damage,
      options.now,
    );
    expect(avoided.state).toEqual(character.state);
  });

  it("takes fractions from content and selects the lowest benefit without multiplying duplicates", () => {
    const { character, rulesPackage } = setup();
    const edited = structuredClone(rulesPackage);
    const feature = edited.entities.find(({ id }) => id === evasionId);
    if (
      feature === undefined ||
      feature.body === null ||
      typeof feature.body !== "object" ||
      Array.isArray(feature.body)
    )
      throw new Error("Missing Evasion");
    const effect = {
      ability: "wisdom",
      requiresHalfDamageOnSuccess: true,
      successFraction: 0.25,
      failureFraction: 0.25,
      inactiveConditionIds: [],
    };
    feature.body = { ...feature.body, savingThrowDamageEffects: [effect, effect] };
    const evaluation = evaluateCharacter({ character, packages: [edited] });
    const result = resolveSavingThrowDamage(evaluation, {
      ...request("failure"),
      ability: "wisdom",
    });
    expect(result.damage).toBe(5);
    expect(result.fraction).toBe(0.25);
    expect(result.appliedEffectIds).toEqual([evasionId]);
    expect(resolveSavingThrowDamage(evaluation, request("failure")).damage).toBe(21);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects malformed damage %s",
    (damage) => {
      const { character, rulesPackage } = setup();
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      expect(() => resolveSavingThrowDamage(evaluation, request("failure", damage))).toThrow();
    },
  );

  it("accepts zero damage and rejects invalid feature fractions", () => {
    const { character, rulesPackage } = setup();
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(resolveSavingThrowDamage(evaluation, request("failure", 0)).damage).toBe(0);
    for (const failureFraction of [-1, 1.1, NaN])
      expect(
        featureAutomationBodySchema.safeParse({
          savingThrowDamageEffects: [
            {
              ability: "dexterity",
              requiresHalfDamageOnSuccess: true,
              successFraction: 0,
              failureFraction,
              inactiveConditionIds: [],
            },
          ],
        }).success,
      ).toBe(false);
  });

  it("advances an existing Monk without replacing state or earlier choices", () => {
    const { character, catalog, rulesPackage } = setup(6);
    character.state.currentHitPoints = 13;
    character.state.expendedResources["srd521.resource.monk.wholeness-of-body"] = 1;
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(advanced.state).toEqual(character.state);
    expect(advanced.loadout).toEqual(character.loadout);
    expect(advanced.build.levels.slice(0, 6)).toEqual(character.build.levels);
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.monk.focus-points")?.maximum,
    ).toBe(7);
    expect(
      evaluation.attacks.find(({ id }) => id === "attack.unarmed-strike")?.damage.diceSize,
    ).toBe(8);
    expect(resolveSavingThrowDamage(evaluation, request("success")).damage).toBe(0);
    expect(levelUpEligibility(advanced, catalog).eligible).toBe(false);
  });
});
