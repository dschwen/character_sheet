import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeRest, resolveAttackRollOptions } from "@dnd/rules-core";
import {
  buildCharacter,
  builderClassIds,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  sorcererId,
  updateBuilderBackground,
  updateBuilderSpecies,
  type BuilderClassId,
} from "./character-builder";
import { loadWebData } from "./server-data";
import { declaredAttackRollRequest } from "./attack-roll-options";
import { resolveD20Roll } from "./dice-roll";

const options = { id: "exhausted-attacker", now: new Date("2026-10-11T10:00:00Z") };
function setup(classId: BuilderClassId = fighterId, level = 1) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(classId, catalog, level, "Exhausted attacker"),
    rulesPackage,
    options,
  );
  const input = { character, packages: [rulesPackage] };
  return { character, rulesPackage, catalog, input, baseline: evaluateCharacter(input) };
}

describe("source-driven condition modifiers on every attack casting source", () => {
  it.each(builderClassIds)(
    "applies Exhaustion once to every %s attack and leaves damage/DCs unchanged",
    (classId) => {
      const { input, baseline } = setup(classId);
      input.character.state.exhaustion = 2;
      const before = structuredClone(input.character);
      const result = evaluateCharacter(input);
      expect(result.attacks.length).toBeGreaterThan(0);
      for (const attack of result.attacks) {
        const original = baseline.attacks.find(({ id }) => id === attack.id);
        expect(attack.attackBonus).toBe((original?.attackBonus ?? 0) - 4);
        expect(attack.damage).toEqual(original?.damage);
        expect(attack.damageModes).toEqual(original?.damageModes);
        expect(result.values[attack.traceId]?.value).toBe(attack.attackBonus);
        expect(result.facts[attack.traceId]).toBe(attack.attackBonus);
        expect(result.traces[attack.traceId]?.result).toBe(attack.attackBonus);
        expect(result.traces[attack.traceId]?.sourceReferences).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ entityId: "srd521.condition.exhaustion", page: 181 }),
          ]),
        );
        const request = declaredAttackRollRequest(
          result,
          attack,
          resolveAttackRollOptions(result, attack.id),
        );
        expect(resolveD20Roll(request, request.mode === "normal" ? [10] : [10, 10]).total).toBe(
          10 + attack.attackBonus,
        );
      }
      if (baseline.spellcasting !== undefined) {
        expect(result.spellcasting?.attackBonus).toBe(baseline.spellcasting.attackBonus - 4);
        expect(result.spellcasting?.saveDifficultyClass).toBe(
          baseline.spellcasting.saveDifficultyClass,
        );
        expect(result.spellcasting?.slots).toEqual(baseline.spellcasting.slots);
      }
      for (const spell of result.spells) {
        const original = baseline.spells.find(({ id }) => id === spell.id);
        expect(spell.damage).toEqual(original?.damage);
        expect(spell.healing).toEqual(original?.healing);
        for (const option of spell.castingOptions ?? []) {
          const previous = original?.castingOptions?.find(
            ({ sourceId }) => sourceId === option.sourceId,
          );
          expect(option.attackBonus).toBe((previous?.attackBonus ?? 0) - 4);
          expect(option.saveDifficultyClass).toBe(previous?.saveDifficultyClass);
          expect(result.traces[option.attackTraceId]?.result).toBe(option.attackBonus);
          expect(result.values[option.attackTraceId]?.value).toBe(option.attackBonus);
        }
      }
      expect(input.character).toEqual(before);
      expect(evaluateCharacter(input)).toEqual(result);
    },
  );

  it.each([0, 1, 2, 3, 4, 5])(
    "uses a -2 × %i penalty, not Disadvantage or an ability score reduction",
    (exhaustion) => {
      const { input, baseline } = setup();
      input.character.state.exhaustion = exhaustion;
      input.character.state.conditionIds = [
        "srd521.condition.exhaustion",
        "srd521.condition.exhaustion",
      ];
      const result = evaluateCharacter(input);
      expect(result.values["ability.strength.modifier"]).toEqual(
        baseline.values["ability.strength.modifier"],
      );
      for (const attack of result.attacks) {
        expect(attack.attackBonus).toBe(
          (baseline.attacks.find(({ id }) => id === attack.id)?.attackBonus ?? 0) - 2 * exhaustion,
        );
        expect(resolveAttackRollOptions(result, attack.id).mode).toBe("normal");
        const nodes = result.traces[attack.traceId]?.nodes.filter(
          ({ operation }) => operation === "apply-condition-d20-modifiers-to-attack",
        );
        expect(nodes?.length).toBe(exhaustion === 0 ? 0 : 1);
      }
    },
  );

  it("adjusts shared class, Magic Initiate, species and free-cast traces only once", () => {
    const { rulesPackage, catalog } = setup(sorcererId, 7);
    let draft = updateBuilderBackground(
      defaultBuilderDraft(sorcererId, catalog, 7, "Many sources"),
      catalog,
      "srd521.background.acolyte",
    );
    draft = updateBuilderSpecies(draft, catalog, "srd521.species.tiefling");
    const character = buildCharacter(draft, rulesPackage, options);
    character.state.activeEffectIds.push(
      "srd521.status.feature.innate-sorcery",
      "srd521.status.spell.bless",
    );
    const input = { character, packages: [rulesPackage] };
    const baseline = evaluateCharacter(input);
    character.state.exhaustion = 3;
    const result = evaluateCharacter(input);
    const sources = new Set(
      result.spells.flatMap((spell) =>
        (spell.castingOptions ?? []).map(({ sourceId }) => sourceId),
      ),
    );
    expect(sources.size).toBeGreaterThanOrEqual(3);
    const traceCounts = new Map<string, number>();
    for (const spell of result.spells) {
      for (const option of spell.castingOptions ?? []) {
        const previous = baseline.spells
          .find(({ id }) => id === spell.id)
          ?.castingOptions?.find(({ sourceId }) => sourceId === option.sourceId);
        expect(option.attackBonus).toBe((previous?.attackBonus ?? 0) - 6);
        expect(option.saveDifficultyClass).toBe(previous?.saveDifficultyClass);
        expect(option.attackRollMode).toBe(previous?.attackRollMode);
        expect(
          result.traces[option.attackTraceId]?.nodes.filter(
            ({ operation }) => operation === "apply-condition-d20-modifiers-to-attack",
          ),
        ).toHaveLength(1);
        traceCounts.set(option.attackTraceId, (traceCounts.get(option.attackTraceId) ?? 0) + 1);
      }
    }
    expect(Math.max(...traceCounts.values())).toBeGreaterThan(1);
    expect(result.attackRollBonusDice).toEqual(baseline.attackRollBonusDice);
    expect(result.spellcasting?.attackRollMode).toBe("advantage");
  });

  it("restores precisely two attack points when a Long Rest removes one level", () => {
    const { input } = setup();
    input.character.state.exhaustion = 2;
    const before = evaluateCharacter(input);
    const rest = proposeRest(input, { event: "long-rest" });
    expect(rest.applicable).toBe(true);
    expect(rest.nextState.exhaustion).toBe(1);
    const after = evaluateCharacter({
      ...input,
      character: { ...input.character, state: rest.nextState },
    });
    expect(after.attacks[0]?.attackBonus).toBe((before.attacks[0]?.attackBonus ?? 0) + 2);
  });

  it("reads the modifier from condition content instead of a hard-coded UI penalty", () => {
    const { input, rulesPackage, baseline } = setup();
    const edited = structuredClone(rulesPackage);
    const condition = edited.entities.find(({ id }) => id === "srd521.condition.exhaustion");
    if (
      condition === undefined ||
      condition.body === null ||
      typeof condition.body !== "object" ||
      Array.isArray(condition.body)
    )
      throw new Error("Missing Exhaustion");
    condition.body = { ...condition.body, d20ModifierPerLevel: -3 };
    input.character.state.exhaustion = 2;
    const result = evaluateCharacter({ ...input, packages: [edited] });
    expect(result.attacks[0]?.attackBonus).toBe((baseline.attacks[0]?.attackBonus ?? 0) - 6);
    expect(result.d20Tests["savingThrow.strength"]?.modifier).toBe(
      (baseline.d20Tests["savingThrow.strength"]?.modifier ?? 0) - 6,
    );
  });

  it("retains Halfling physical rerolls and natural critical results with a negative attack bonus", () => {
    const { rulesPackage, catalog } = setup();
    const draft = updateBuilderSpecies(
      defaultBuilderDraft(fighterId, catalog, 1, "Lucky but exhausted"),
      catalog,
      "srd521.species.halfling",
    );
    const character = buildCharacter(draft, rulesPackage, options);
    character.state.exhaustion = 5;
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const attack = evaluation.attacks[0];
    if (attack === undefined) throw new Error("Missing attack");
    const request = declaredAttackRollRequest(
      evaluation,
      attack,
      resolveAttackRollOptions(evaluation, attack.id),
    );
    expect(request.modifier).toBeLessThan(0);
    expect(request.rerollValues).toContain(1);
    const result = resolveD20Roll(request, [1], [20]);
    expect(result.kept).toBe(20);
    expect(result.total).toBe(20 + attack.attackBonus);
    expect(result.criticalThreshold).toBe(20);
    expect(result.rerolls).toEqual([{ dieIndex: 0, original: 1, replacement: 20 }]);
  });
});
