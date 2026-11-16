import { describe, expect, it } from "vitest";
import { grappleBenefitsSchema } from "@dnd/content-schema";
import {
  evaluateCharacter,
  resolveGrappledTargetAttack,
  resolvePunchAndGrab,
  resolveGrappleMovement,
  type PunchAndGrabRequest,
} from "@dnd/rules-core";
import type { EvaluateCharacterInput } from "@dnd/rules-api";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  updateBuilderBackground,
  fighterId,
  monkId,
  wizardId,
  type BuilderClassId,
} from "./character-builder";
import { loadWebData } from "./server-data";
import { grappledTargetRollRequest, punchAndGrabDamageRequest } from "./grappling";
import { resolveDicePoolRoll } from "./dice-roll";

const featId = "srd521.feat.general.grappler";
const target = { sourceId: featId, targetName: "Ogre" };
function setup(classId: BuilderClassId = fighterId, backgroundId?: string) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  let draft = defaultBuilderDraft(classId, catalog, 4, "Grapple test");
  if (backgroundId) draft = updateBuilderBackground(draft, catalog, backgroundId);
  draft.advancementFeats[0] = {
    featId,
    abilityScoreIncreases: { [classId === fighterId ? "strength" : "dexterity"]: 1 },
  };
  const character = buildCharacter(draft, rulesPackage, {
    id: "grapple-test",
    now: new Date("2026-11-16T12:00:00Z"),
  });
  const evaluate = (context?: EvaluateCharacterInput["context"]) =>
    evaluateCharacter({ character, packages: [rulesPackage], ...(context ? { context } : {}) });
  return { character, rulesPackage, evaluate };
}
function punchRequest(): PunchAndGrabRequest {
  return {
    ...target,
    attackId: "attack.unarmed-strike",
    currentSize: "medium",
    targetSize: "large",
    sizesConfirmed: true,
    hitCreatureConfirmed: true,
    attackActionConfirmed: true,
    ownTurnConfirmed: true,
    unusedThisTurnConfirmed: true,
    freeHandConfirmed: true,
    withinReachConfirmed: true,
    targetEligibleConfirmed: true,
  };
}
describe("data-driven declared Grappler benefits", () => {
  it("exposes source-linked capabilities without global Advantage or permanent effects", () => {
    const { character, evaluate } = setup();
    const before = structuredClone(character);
    const evaluation = evaluate();
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    const benefit = evaluation.grappleBenefits?.[0];
    expect(benefit).toMatchObject({ sourceId: featId, sourceName: "Grappler" });
    expect(evaluation.traces[benefit?.traceId ?? ""]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: featId, page: 87 }),
    );
    for (const attack of evaluation.attacks) expect(attack.advantageSources).not.toContain(featId);
    expect(character).toEqual(before);
    expect(grappleBenefitsSchema.safeParse({}).success).toBe(false);
  });
  it("uses feature metadata and labels rather than a feat-name branch", () => {
    const { rulesPackage, evaluate } = setup();
    const feat = rulesPackage.entities.find(({ id }) => id === featId);
    if (!feat?.body || typeof feat.body !== "object" || Array.isArray(feat.body))
      throw new Error("Missing feat");
    feat.name = { en: "Custom declared benefit" };
    expect(evaluate().grappleBenefits?.[0]?.sourceName).toBe("Custom declared benefit");
    feat.body = { ...feat.body, grappleBenefits: {} };
    expect(evaluate().grappleBenefits).toBeUndefined();
  });
  it("grants target-specific weapon and Unarmed Strike Advantage without persisting it", () => {
    const { evaluate } = setup();
    const evaluation = evaluate();
    for (const attack of evaluation.attacks) {
      const request = {
        ...target,
        targetGrappledByYouConfirmed: true as const,
        attack: { kind: "weapon" as const, attackId: attack.id },
      };
      expect(resolveGrappledTargetAttack(evaluation, request).mode).toBe("advantage");
      expect(grappledTargetRollRequest(evaluation, request).label).toContain("target Ogre");
      expect(attack.advantageSources).not.toContain(featId);
    }
  });
  it("retains uncancelled spell sources so another Advantage cannot override cancellation", () => {
    const { evaluate } = setup(wizardId, "srd521.background.acolyte");
    const evaluation = evaluate({
      d20RollEffects: [
        { testId: "attack-rolls", kind: "advantage", source: "test.advantage" },
        { testId: "attack-rolls", kind: "disadvantage", source: "test.disadvantage" },
      ],
    });
    const request = {
      ...target,
      targetGrappledByYouConfirmed: true as const,
      attack: { kind: "spell" as const, castingSourceId: wizardId },
    };
    const result = resolveGrappledTargetAttack(evaluation, request);
    expect(result.mode).toBe("normal");
    expect(result.advantageSources).toContain(featId);
    expect(result.disadvantageSources).toContain("test.disadvantage");
    expect(resolveGrappledTargetAttack(evaluate(), request).mode).toBe("advantage");
    expect(
      resolveGrappledTargetAttack(evaluate(), { ...request, additionalDisadvantage: true }).mode,
    ).toBe("normal");
    const featOption = evaluation.spells
      .flatMap((spell) => spell.castingOptions ?? [])
      .find(({ sourceId }) => sourceId !== wizardId);
    expect(featOption).toBeDefined();
    if (!featOption) throw new Error("Missing foreign casting source");
    expect(
      resolveGrappledTargetAttack(evaluation, {
        ...request,
        attack: { kind: "spell", castingSourceId: featOption.sourceId },
      }).mode,
    ).toBe("normal");
  });
  it("requires the exact held-target declaration and known attack/casting source", () => {
    const evaluation = setup().evaluate();
    const request = {
      ...target,
      targetGrappledByYouConfirmed: true as const,
      attack: { kind: "weapon" as const, attackId: "attack.unarmed-strike" },
    };
    for (const change of [
      { targetName: " " },
      { sourceId: "test.unowned" },
      { targetGrappledByYouConfirmed: false },
      { attack: { kind: "weapon", attackId: "fake" } },
    ]) {
      expect(() =>
        resolveGrappledTargetAttack(evaluation, { ...request, ...change } as typeof request),
      ).toThrow();
    }
  });
  it("calculates Strength grapple DC and fixed damage without duplicating critical damage", () => {
    const evaluation = setup().evaluate();
    const expected =
      8 +
      Number(evaluation.facts["ability.strength.modifier"]) +
      Number(evaluation.facts.proficiencyBonus);
    const resolved = resolvePunchAndGrab(evaluation, punchRequest());
    expect(resolved.difficultyClass).toBe(expected);
    expect(resolved.instructions).toContain("Strength or Dexterity saving throw");
    expect(resolved.instructions).toContain("set Grappled");
    const normal = punchAndGrabDamageRequest(evaluation, punchRequest());
    const critical = punchAndGrabDamageRequest(evaluation, { ...punchRequest(), critical: true });
    expect(critical.pool).toBeUndefined();
    expect(critical.fixedDamage).toBe(normal.fixedDamage);
    expect(normal.fixedDamage).toBe(1 + Number(evaluation.facts["ability.strength.modifier"]));
    expect(evaluation.traces[resolved.saveTraceId]?.sourceReferences).toContainEqual(
      expect.objectContaining({ page: 190 }),
    );
  });
  it("uses the Monk's source-granted Dexterity DC only while Martial Arts applies", () => {
    const { evaluate, character } = setup(monkId);
    const evaluation = evaluate();
    const attack = evaluation.attacks.find(({ id }) => id === "attack.unarmed-strike");
    expect(attack?.grapple?.ability).toBe("dexterity");
    expect(attack?.grapple?.difficultyClass).toBe(
      8 +
        Number(evaluation.facts["ability.dexterity.modifier"]) +
        Number(evaluation.facts.proficiencyBonus),
    );
    expect(evaluation.traces[attack?.grapple?.traceId ?? ""]?.sourceReferences).toContainEqual(
      expect.objectContaining({ page: 50 }),
    );
    const normal = punchAndGrabDamageRequest(evaluation, punchRequest()).pool;
    const critical = punchAndGrabDamageRequest(evaluation, {
      ...punchRequest(),
      critical: true,
    }).pool;
    expect(critical?.diceCount).toBe((normal?.diceCount ?? 0) * 2);
    expect(critical?.modifier).toBe(normal?.modifier);
    if (!critical) throw new Error("Missing dice");
    expect(resolveDicePoolRoll(critical, [1, 2]).total).toBe(3 + (normal?.modifier ?? 0));
    if (!attack) throw new Error("Missing Unarmed Strike");
    expect(() =>
      punchAndGrabDamageRequest(evaluation, { ...punchRequest(), damageType: "acid" }),
    ).toThrow(/damage type/);
    attack.damage.alternativeTypes = ["force"];
    expect(
      punchAndGrabDamageRequest(evaluation, { ...punchRequest(), damageType: "force" }).pool?.label,
    ).toContain("force");
    character.loadout.inventory.push({
      id: "armor-test",
      entityId: "srd521.equipment.armor.light.leather-armor",
      quantity: 1,
    });
    character.loadout.equippedItemIds.push("armor-test");
    expect(
      evaluate().attacks.find(({ id }) => id === "attack.unarmed-strike")?.grapple?.ability,
    ).toBe("strength");
  });
  it.each([
    "sizesConfirmed",
    "hitCreatureConfirmed",
    "attackActionConfirmed",
    "ownTurnConfirmed",
    "unusedThisTurnConfirmed",
    "freeHandConfirmed",
    "withinReachConfirmed",
    "targetEligibleConfirmed",
  ])("rejects missing declaration %s", (flag) => {
    const evaluation = setup().evaluate();
    expect(() => resolvePunchAndGrab(evaluation, { ...punchRequest(), [flag]: false })).toThrow();
  });
  it("rejects weapons and oversized grapple targets and uses confirmed transformed size", () => {
    const evaluation = setup().evaluate();
    const weapon = evaluation.attacks.find(
      ({ properties }) => !properties.includes("unarmed-strike"),
    );
    expect(() =>
      resolvePunchAndGrab(evaluation, { ...punchRequest(), attackId: weapon?.id ?? "fake" }),
    ).toThrow();
    expect(() =>
      resolvePunchAndGrab(evaluation, {
        ...punchRequest(),
        currentSize: "small",
        targetSize: "large",
      }),
    ).toThrow(/too large/);
    expect(() =>
      resolvePunchAndGrab(evaluation, { ...punchRequest(), targetSize: "huge" }),
    ).toThrow(/too large/);
    expect(
      resolvePunchAndGrab(evaluation, {
        ...punchRequest(),
        currentSize: "large",
        targetSize: "huge",
      }).difficultyClass,
    ).toBeGreaterThan(0);
  });
  it.each(["small", "medium", "large"] as const)(
    "guides movement for a %s target without changing Speed or state",
    (targetSize) => {
      const { character, evaluate } = setup();
      const before = structuredClone(character);
      const evaluation = evaluate();
      const result = resolveGrappleMovement(evaluation, {
        ...target,
        currentSize: "medium",
        targetSize,
        sizesConfirmed: true,
        targetGrappledByYouConfirmed: true,
        distanceFeet: 10,
      });
      expect(result.movementCostFeet).toBe(targetSize === "large" ? 20 : 10);
      expect(result.benefitApplies).toBe(targetSize !== "large");
      expect(character).toEqual(before);
      expect(evaluate().facts["speed.walking"]).toBe(evaluation.facts["speed.walking"]);
    },
  );
  it("rejects malformed movement, unowned features, invalid history and disabled actors", () => {
    const { character, evaluate } = setup();
    for (const distanceFeet of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() =>
        resolveGrappleMovement(evaluate(), {
          ...target,
          currentSize: "medium",
          targetSize: "small",
          sizesConfirmed: true,
          targetGrappledByYouConfirmed: true,
          distanceFeet,
        }),
      ).toThrow();
    character.state.conditionIds.push("srd521.condition.unconscious");
    expect(() => resolvePunchAndGrab(evaluate(), punchRequest())).toThrow();
    character.state.conditionIds = [];
    delete character.build.levels[3]?.featSelections;
    expect(() => resolvePunchAndGrab(evaluate(), punchRequest())).toThrow(/validation errors/);
    character.build.featIds = character.build.featIds.filter((id) => id !== featId);
    expect(() => resolvePunchAndGrab(evaluate(), punchRequest())).toThrow();
  });
});
