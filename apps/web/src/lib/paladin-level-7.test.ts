import { describe, expect, it } from "vitest";
import { evaluateCharacter, setActiveEffectActive, setConditionActive } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  paladinId,
  fighterId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";

import { loadWebData } from "./server-data";

const featureId = "srd521.subclass-feature.paladin.oath-of-devotion.aura-of-devotion";
const statusId = "srd521.status.feature.aura-of-devotion";
const charm = "srd521.condition.charmed";
const options = { id: "devotion-seven", now: new Date("2026-10-10T12:00:00Z") };
function setup(level = 7, classId: typeof paladinId | typeof fighterId = paladinId) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(classId, catalog, level, "Devoted Protector"),
    rulesPackage,
    options,
  );
  return {
    rulesPackage,
    catalog,
    character,
    evaluate: (target = character) =>
      evaluateCharacter({ character: target, packages: [rulesPackage] }),
  };
}

describe("Paladin level 7 and source-driven aura condition immunity", () => {
  it("advances with preserved play state, possessions, and earlier choices", () => {
    const { character, catalog, rulesPackage } = setup(6);
    character.state.currentHitPoints = 17;
    character.state.expendedResources["srd521.resource.paladin.lay-on-hands"] = 10;
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(next.state).toEqual(character.state);
    expect(next.loadout.inventory).toEqual(character.loadout.inventory);
    expect(next.build.levels.slice(0, 6)).toEqual(character.build.levels);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 7,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
      ],
    });
    expect(
      evaluation.resources.find(
        (resource) => resource.id === "srd521.resource.paladin.lay-on-hands",
      ),
    ).toMatchObject({ maximum: 35, current: 25 });
    expect(levelUpEligibility(next, catalog)).toMatchObject({
      eligible: true,
      currentLevel: 7,
      targetLevel: 8,
    });
  });

  it("suppresses Charmed without modifying the source document", () => {
    const { character, evaluate } = setup();
    character.state.conditionIds = [charm];
    const original = structuredClone(character);
    const evaluation = evaluate();
    expect(character).toEqual(original);
    expect(evaluation.facts["condition.charmed.active"]).not.toBe(true);
    expect(evaluation.validations.map(({ code }) => code)).toContain(
      "CONDITION_BLOCKED_BY_IMMUNITY",
    );
    expect(evaluation.traces["condition.charmed.suppressed"]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: featureId, page: 56 }),
        expect.objectContaining({
          entityId: "srd521.class-feature.paladin.aura-of-protection",
          page: 55,
        }),
      ]),
    );
    const aura = evaluation.savingThrowAuras?.[0];
    expect(aura).toMatchObject({
      active: true,
      radiusFeet: 10,
      conditionImmunities: [
        { sourceId: featureId, conditionIds: [charm], recipientStatusId: statusId },
      ],
    });
    const traceId = aura?.conditionImmunities?.[0]?.traceId;
    expect(traceId === undefined ? undefined : evaluation.traces[traceId]?.result).toEqual([charm]);
  });

  it("does not grant the enhancement before level 7", () => {
    const { character, evaluate } = setup(6);
    character.state.conditionIds = [charm];
    expect(evaluate().facts["condition.charmed.active"]).toBe(true);
    expect(evaluate().savingThrowAuras?.[0]?.conditionImmunities).toBeUndefined();
  });

  it.each(["incapacitated", "stunned", "paralyzed", "unconscious"])(
    "disables the source protection while %s and restores it afterward",
    (condition) => {
      const { character, evaluate } = setup();
      character.state.conditionIds = [charm, `srd521.condition.${condition}`];
      const blocked = evaluate();
      expect(blocked.facts["condition.charmed.active"]).toBe(true);
      expect(blocked.savingThrowAuras?.[0]?.active).toBe(false);
      const traceId = blocked.savingThrowAuras?.[0]?.conditionImmunities?.[0]?.traceId;
      expect(traceId === undefined ? undefined : blocked.traces[traceId]?.result).toEqual([]);
      const restored = setConditionActive(character, `srd521.condition.${condition}`, false);
      expect(restored.state.conditionIds).toContain(charm);
      expect(evaluate(restored).facts["condition.charmed.active"]).not.toBe(true);
    },
  );

  it.each(["prone", "grappled", "frightened", "poisoned"])(
    "does not disable the aura or suppress unrelated %s",
    (condition) => {
      const { character, evaluate } = setup();
      character.state.conditionIds = [charm, `srd521.condition.${condition}`];
      const evaluation = evaluate();
      expect(evaluation.savingThrowAuras?.[0]?.active).toBe(true);
      expect(evaluation.facts["condition.charmed.active"]).not.toBe(true);
      expect(evaluation.facts[`condition.${condition}.active`]).toBe(true);
    },
  );

  it("lets a party member enter and leave protection without deleting Charmed", () => {
    const { character, evaluate } = setup(5, fighterId);
    character.state.conditionIds = [charm];
    const baseline = evaluate();
    const protectedCharacter = setActiveEffectActive(character, statusId, true);
    const protectedEvaluation = evaluate(protectedCharacter);
    expect(protectedCharacter.state.conditionIds).toEqual([charm]);
    expect(protectedEvaluation.facts["condition.charmed.active"]).not.toBe(true);
    expect(protectedEvaluation.d20Tests).toEqual(baseline.d20Tests);
    expect(protectedEvaluation.savingThrowAuras).toEqual([]);
    expect(protectedEvaluation.traces["condition.charmed.suppressed"]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: statusId, page: 56 })]),
    );
    const outside = setActiveEffectActive(protectedCharacter, statusId, false);
    expect(outside.state.conditionIds).toEqual([charm]);
    expect(evaluate(outside).facts["condition.charmed.active"]).toBe(true);
  });

  it("protects an Incapacitated recipient when another Paladin is the source", () => {
    const { character, evaluate } = setup();
    character.state.conditionIds = [charm, "srd521.condition.incapacitated"];
    const recipient = setActiveEffectActive(character, statusId, true);
    expect(evaluate(recipient).savingThrowAuras?.[0]?.active).toBe(false);
    expect(evaluate(recipient).facts["condition.charmed.active"]).not.toBe(true);
    expect(
      evaluate(setActiveEffectActive(recipient, statusId, false)).facts["condition.charmed.active"],
    ).toBe(true);
  });

  it("derives immunity targets from content and requires the matching granted aura", () => {
    const { character, rulesPackage } = setup();
    character.state.conditionIds = [charm, "srd521.condition.poisoned"];
    const feature = rulesPackage.entities.find((entity) => entity.id === featureId);
    if (feature === undefined) throw new Error("Missing Devotion feature");
    const body = feature.body as Record<string, unknown>;
    body.auraConditionImmunities = [
      {
        auraId: "srd521.aura.protection",
        conditionIds: ["srd521.condition.poisoned"],
        recipientStatusId: statusId,
      },
    ];
    const evaluate = () => evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluate().facts["condition.charmed.active"]).toBe(true);
    expect(evaluate().facts["condition.poisoned.active"]).not.toBe(true);
    body.auraConditionImmunities = [
      { auraId: "srd521.aura.missing", conditionIds: [charm], recipientStatusId: statusId },
    ];
    expect(evaluate().facts["condition.charmed.active"]).toBe(true);
    expect(evaluate().savingThrowAuras?.[0]?.conditionImmunities).toBeUndefined();
  });
});
