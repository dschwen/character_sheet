import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeRest, proposeSpellCast } from "@dnd/rules-core";

import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  druidId,
  updateBuilderFeatureChoice,
  wizardId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";

const options = { id: "recovering-caster", now: new Date("2026-10-09T12:00:00Z") };
const naturalId = "srd521.subclass-feature.druid.circle-of-the-land.natural-recovery";
const recoveryId = "srd521.resource.druid.natural-recovery";
const freeId = "srd521.resource.druid.natural-recovery-free-cast";

function setup(classId: typeof druidId | typeof wizardId = druidId, level = 6) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  let draft = defaultBuilderDraft(classId, catalog, level, "Recovering caster");
  if (classId === druidId)
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      "srd521.choice.druid.circle-of-land",
      "srd521.option.druid.land.arid",
    );
  const character = buildCharacter(draft, rulesPackage, options);
  return { character, rulesPackage, catalog, input: { character, packages: [rulesPackage] } };
}

describe("rest-based spell slot recovery", () => {
  it("advances a Druid to level 6 with separate Natural Recovery benefits", () => {
    const { character, rulesPackage, catalog } = setup(druidId, 5);
    character.state.currentHitPoints = 10;
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(advanced.state.currentHitPoints).toBe(10);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(45);
    expect(evaluation.spellcasting?.preparedSpellLimit).toBe(10);
    expect(evaluation.spellSlotRecoveries).toEqual([
      expect.objectContaining({
        sourceId: naturalId,
        maximumCombinedLevel: 3,
        maximumSlotLevel: 5,
        available: true,
      }),
    ]);
    expect(evaluation.resources.filter(({ id }) => [recoveryId, freeId].includes(id))).toEqual([
      expect.objectContaining({ maximum: 1, current: 1 }),
      expect.objectContaining({ maximum: 1, current: 1 }),
    ]);
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({ eligible: false });
  });

  it("recovers a chosen mix atomically with rest benefits, without spending free casting", () => {
    const { input, character } = setup();
    character.state.expendedSpellSlots = { "1": 2, "2": 2, "3": 1 };
    const proposal = proposeRest(input, {
      event: "short-rest",
      hitDice: [{ classId: druidId, rolls: [1] }],
      spellSlotRecoveries: [
        {
          sourceId: naturalId,
          slots: [
            { level: 1, count: 1 },
            { level: 2, count: 1 },
          ],
        },
      ],
    });
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots).toEqual({ "1": 1, "2": 1, "3": 1 });
    expect(proposal.nextState.expendedResources[recoveryId]).toBe(1);
    expect(proposal.nextState.expendedResources[freeId] ?? 0).toBe(0);
    expect(proposal.nextState.expendedHitDice[druidId]).toBe(1);
    expect(proposal.traces["transition.state.expendedSpellSlots.2"]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: naturalId })]),
    );
    expect(character.state.expendedSpellSlots).toEqual({ "1": 2, "2": 2, "3": 1 });
    character.state = proposal.nextState;
    expect(
      proposeRest(input, {
        event: "short-rest",
        spellSlotRecoveries: [{ sourceId: naturalId, slots: [{ level: 1, count: 1 }] }],
      }).applicable,
    ).toBe(false);
    expect(proposeRest(input, { event: "long-rest" }).nextState.expendedResources[recoveryId]).toBe(
      0,
    );
  });

  it("does not consume recovery on an ordinary Short Rest or empty selection", () => {
    const { input, character } = setup();
    character.state.expendedSpellSlots["1"] = 1;
    const proposal = proposeRest(input, { event: "short-rest" });
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots["1"]).toBe(1);
    expect(proposal.nextState.expendedResources[recoveryId] ?? 0).toBe(0);
  });

  it.each(
    [
      [{ level: 2, count: 2 }],
      [{ level: 1, count: 3 }],
      [
        { level: 1, count: 1 },
        { level: 1, count: 1 },
      ],
      [{ level: 4, count: 1 }],
    ].map((slots) => ({ slots })),
  )("rejects over-budget, unspent, duplicate, or unavailable slots: %j", ({ slots }) => {
    const { input, character } = setup();
    character.state.expendedSpellSlots = { "1": 2, "2": 2, "3": 1 };
    const proposal = proposeRest(input, {
      event: "short-rest",
      hitDice: [{ classId: druidId, rolls: [1] }],
      spellSlotRecoveries: [{ sourceId: naturalId, slots }],
    });
    expect(proposal.applicable).toBe(false);
    expect(proposal.changes).toEqual([]);
    expect(proposal.nextState).toEqual(character.state);
  });

  it("rejects a Long Rest recovery request, duplicate feature use, and an ungranted source", () => {
    const { input, character } = setup();
    character.state.expendedSpellSlots["1"] = 2;
    const recovery = { sourceId: naturalId, slots: [{ level: 1, count: 1 }] };
    expect(
      proposeRest(input, { event: "long-rest", spellSlotRecoveries: [recovery] }).applicable,
    ).toBe(false);
    expect(
      proposeRest(input, { event: "short-rest", spellSlotRecoveries: [recovery, recovery] })
        .applicable,
    ).toBe(false);
    expect(
      proposeRest(input, {
        event: "short-rest",
        spellSlotRecoveries: [{ ...recovery, sourceId: "unknown" }],
      }).applicable,
    ).toBe(false);
  });

  it("free-casts only a leveled selected Circle spell, independently of rest recovery", () => {
    const { input, character } = setup();
    const evaluation = evaluateCharacter(input);
    const freeSpells = evaluation.spells.filter((spell) =>
      spell.castingOptions?.some(({ sourceId }) => sourceId === naturalId),
    );
    expect(freeSpells.map(({ id }) => id).sort()).toEqual([
      "srd521.spell.blur",
      "srd521.spell.burning-hands",
      "srd521.spell.fireball",
    ]);
    const cast = proposeSpellCast(input, {
      spellId: "srd521.spell.blur",
      useFreeCast: true,
      castingSourceId: naturalId,
    });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
    expect(cast.nextState.concentrationSpellId).toBe("srd521.spell.blur");
    expect(cast.nextState.expendedResources[freeId]).toBe(1);
    expect(cast.nextState.expendedResources[recoveryId] ?? 0).toBe(0);
    character.state = cast.nextState;
    expect(
      proposeSpellCast(input, {
        spellId: "srd521.spell.burning-hands",
        useFreeCast: true,
        castingSourceId: naturalId,
      }).applicable,
    ).toBe(false);
    expect(
      proposeSpellCast(input, {
        spellId: "srd521.spell.cure-wounds",
        useFreeCast: true,
        castingSourceId: naturalId,
      }).applicable,
    ).toBe(false);
    expect(proposeRest(input, { event: "short-rest" }).nextState.expendedResources[freeId]).toBe(1);
    expect(proposeRest(input, { event: "long-rest" }).nextState.expendedResources[freeId]).toBe(0);
  });

  it("uses the same Short Rest selection engine for Wizard Arcane Recovery", () => {
    const { input, character } = setup(wizardId, 5);
    character.state.expendedSpellSlots["3"] = 1;
    const evaluation = evaluateCharacter(input);
    expect(evaluation.spellSlotRecoveries?.[0]).toMatchObject({
      name: "Arcane Recovery",
      maximumCombinedLevel: 3,
    });
    const proposal = proposeRest(input, {
      event: "short-rest",
      spellSlotRecoveries: [
        {
          sourceId: "srd521.class-feature.wizard.arcane-recovery",
          slots: [{ level: 3, count: 1 }],
        },
      ],
    });
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots["3"]).toBe(0);
    expect(proposal.nextState.expendedResources["srd521.resource.wizard.arcane-recovery"]).toBe(1);
  });

  it("consumes a partial recovery and rejects slots of level 6 even within the budget", () => {
    const { input, character } = setup();
    character.state.expendedSpellSlots["1"] = 1;
    const partial = proposeRest(input, {
      event: "short-rest",
      spellSlotRecoveries: [{ sourceId: naturalId, slots: [{ level: 1, count: 1 }] }],
    });
    expect(partial.applicable).toBe(true);
    expect(partial.nextState.expendedResources[recoveryId]).toBe(1);
    for (let level = 7; level <= 12; level += 1)
      character.build.levels.push({
        characterLevel: level,
        classId: druidId,
        hitPointChoice: "fixed",
        selectedFeatureChoices: [],
      });
    character.state.expendedSpellSlots["6"] = 1;
    const highLevel = proposeRest(input, {
      event: "short-rest",
      spellSlotRecoveries: [{ sourceId: naturalId, slots: [{ level: 6, count: 1 }] }],
    });
    expect(highLevel.applicable).toBe(false);
    expect(highLevel.validations.map(({ code }) => code)).toContain(
      "SPELL_SLOT_RECOVERY_SELECTION_INVALID",
    );
    expect(highLevel.nextState).toEqual(character.state);
  });

  it("combines recovery sources into one slot change without losing either source trace", () => {
    // Exercise the generic transition's aggregation with both granted features.
    // This does not claim that the multiclass builder or legality model is implemented.
    const { input, character } = setup();
    for (let level = 7; level <= 11; level += 1)
      character.build.levels.push({
        characterLevel: level,
        classId: wizardId,
        hitPointChoice: "fixed",
        selectedFeatureChoices: [],
      });
    character.state.expendedSpellSlots["1"] = 2;
    const arcaneId = "srd521.class-feature.wizard.arcane-recovery";
    const proposal = proposeRest(input, {
      event: "short-rest",
      spellSlotRecoveries: [
        { sourceId: naturalId, slots: [{ level: 1, count: 1 }] },
        { sourceId: arcaneId, slots: [{ level: 1, count: 1 }] },
      ],
    });
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedSpellSlots["1"]).toBe(0);
    expect(
      proposal.changes.filter(({ path }) => path === "state.expendedSpellSlots.1"),
    ).toHaveLength(1);
    expect(
      proposal.traces["transition.state.expendedSpellSlots.1"]?.sourceReferences.map(
        ({ entityId }) => entityId,
      ),
    ).toEqual(expect.arrayContaining([naturalId, arcaneId]));
    expect(proposal.nextState.expendedResources[recoveryId]).toBe(1);
    expect(proposal.nextState.expendedResources["srd521.resource.wizard.arcane-recovery"]).toBe(1);
    const over = proposeRest(input, {
      event: "short-rest",
      spellSlotRecoveries: [
        { sourceId: naturalId, slots: [{ level: 1, count: 2 }] },
        { sourceId: arcaneId, slots: [{ level: 1, count: 1 }] },
      ],
    });
    expect(over.applicable).toBe(false);
    expect(over.nextState).toEqual(character.state);
  });
});
