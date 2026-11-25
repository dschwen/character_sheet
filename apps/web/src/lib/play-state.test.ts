import { describe, expect, it } from "vitest";

import type { CharacterDocument } from "@dnd/character-model";

import {
  applyDamage,
  applyHealing,
  clearConcentration,
  clearConcentrationAndEffects,
  endActiveEffects,
  setActiveEffectActive,
  setActiveEffectSelection,
  setActiveEffectParameter,
  setActiveEffectSelectionWithHitPointAdjustment,
  setActiveEffectWithHitPointBonus,
  setConditionActive,
  setCurrency,
  setExhaustion,
  setHeroicInspiration,
  setTemporaryHitPoints,
} from "@dnd/rules-core";
import { loadWebData } from "./server-data";

function character(): CharacterDocument {
  const fixture = loadWebData().fixtures.find(({ filename }) => filename === "wizard-5.json");
  if (fixture === undefined) throw new Error("Wizard fixture is missing");
  return fixture.character;
}

const updatedAt = new Date("2026-08-02T12:00:00.000Z");

describe("browser play-state edits", () => {
  it("applies damage to temporary HP before current HP", () => {
    const source = setTemporaryHitPoints(character(), 5, updatedAt);
    const damaged = applyDamage(source, 8, updatedAt);

    expect(damaged.state.temporaryHitPoints).toBe(0);
    expect(damaged.state.currentHitPoints).toBe(source.state.currentHitPoints - 3);
    expect(character().state.currentHitPoints).not.toBe(damaged.state.currentHitPoints);
  });

  it("uses Death Ward only when a living character would first drop to zero", () => {
    const id = "srd521.status.spell.death-ward";
    const concentrationSpellId = "srd521.spell.haste";
    const source = character();
    const warded: CharacterDocument = {
      ...source,
      state: {
        ...source.state,
        currentHitPoints: 4,
        temporaryHitPoints: 3,
        activeEffectIds: [id, "srd521.status.spell.haste"],
        concentrationSpellId,
      },
    };
    const options = { dropToOneEffectId: id, maximumHitPoints: 15, critical: true };
    const scratched = applyDamage(warded, 3, updatedAt, options);
    expect(scratched.state.activeEffectIds).toContain(id);
    expect(scratched.state.currentHitPoints).toBe(4);
    const protectedCharacter = applyDamage(warded, 30, updatedAt, options);
    expect(protectedCharacter.state).toMatchObject({
      currentHitPoints: 1,
      temporaryHitPoints: 0,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      concentrationSpellId,
      activeEffectIds: ["srd521.status.spell.haste"],
    });
    expect(protectedCharacter.state.dead).not.toBe(true);
    expect(protectedCharacter.metadata.revision).toBe(warded.metadata.revision + 1);
    expect(applyDamage(protectedCharacter, 1, updatedAt, options).state.currentHitPoints).toBe(0);

    const alreadyAtZero = { ...warded, state: { ...warded.state, currentHitPoints: 0 } };
    expect(applyDamage(alreadyAtZero, 5, updatedAt, options).state.activeEffectIds).toContain(id);
  });

  it("uses Death Ward when ending Aid would drop the character to zero", () => {
    const id = "srd521.status.spell.death-ward";
    const aid = "srd521.status.spell.aid";
    const source = character();
    const aided: CharacterDocument = {
      ...source,
      state: {
        ...source.state,
        activeEffectIds: [id, aid],
        activeEffectSelections: { [aid]: "2" },
        currentHitPoints: 4,
        concentrationSpellId: "srd521.spell.haste",
      },
    };
    const ended = setActiveEffectWithHitPointBonus(aided, aid, false, 5, "2", updatedAt, id);
    expect(ended.state).toMatchObject({
      currentHitPoints: 1,
      concentrationSpellId: "srd521.spell.haste",
      activeEffectIds: [],
      activeEffectSelections: {},
    });
  });

  it("caps healing at maximum HP and advances document metadata", () => {
    const source = character();
    const healed = applyHealing(source, 100, 32, updatedAt);

    expect(healed.state.currentHitPoints).toBe(32);
    expect(healed.metadata.revision).toBe(source.metadata.revision + 1);
    expect(healed.metadata.updatedAt).toBe(updatedAt.toISOString());
  });

  it("bounds exhaustion and updates other direct play state", () => {
    const inspired = setHeroicInspiration(character(), true, updatedAt);
    const exhausted = setExhaustion(inspired, 20, updatedAt);
    const unconcentrated = clearConcentration(exhausted, updatedAt);

    expect(unconcentrated.state.heroicInspiration).toBe(true);
    expect(unconcentrated.state.exhaustion).toBe(6);
    expect(unconcentrated.state.concentrationSpellId).toBeUndefined();
  });

  it("updates one currency denomination without mutating the source", () => {
    const source = character();
    const updated = setCurrency(source, "gp", 37, updatedAt);

    expect(updated.loadout.currency.gp).toBe(37);
    expect(updated.loadout.currency.sp).toBe(source.loadout.currency.sp);
    expect(source.loadout.currency.gp).not.toBe(37);
    expect(updated.metadata.revision).toBe(source.metadata.revision + 1);
  });

  it("toggles conditions and active effects without duplicating state IDs", () => {
    const source = character();
    const blinded = setConditionActive(source, "srd521.condition.blinded", true, updatedAt);
    const stillBlinded = setConditionActive(blinded, "srd521.condition.blinded", true, updatedAt);
    const raging = setActiveEffectActive(
      stillBlinded,
      "srd521.effect.barbarian.rage",
      true,
      updatedAt,
    );
    const cleared = setConditionActive(raging, "srd521.condition.blinded", false, updatedAt);

    expect(stillBlinded.state.conditionIds).toEqual(["srd521.condition.blinded"]);
    expect(raging.state.activeEffectIds).toEqual(["srd521.effect.barbarian.rage"]);
    expect(cleared.state.conditionIds).toEqual([]);
    expect(source.state.conditionIds).toEqual([]);
  });

  it("stores an active effect choice and clears it when the effect ends", () => {
    const effectId = "srd521.status.spell.guidance";
    const active = setActiveEffectActive(character(), effectId, true, updatedAt);
    const selected = setActiveEffectSelection(active, effectId, "skill.stealth", updatedAt);
    const parameterized = setActiveEffectParameter(
      selected,
      effectId,
      "damageType",
      "fire",
      updatedAt,
    );
    const ended = setActiveEffectActive(parameterized, effectId, false, updatedAt);

    expect(selected.state.activeEffectSelections[effectId]).toBe("skill.stealth");
    expect(ended.state.activeEffectSelections[effectId]).toBeUndefined();
    expect(ended.state.activeEffectParameters[effectId]).toBeUndefined();
  });

  it("clears linked effects and their choices when concentration ends", () => {
    const effectId = "srd521.status.spell.dragon-s-breath";
    const source = character();
    const active = {
      ...source,
      state: {
        ...source.state,
        concentrationSpellId: "srd521.spell.dragon-s-breath",
        activeEffectIds: [effectId],
        activeEffectSelections: { [effectId]: "fire" },
        activeEffectParameters: { [effectId]: { damageType: "fire" } },
      },
    };

    const ended = clearConcentrationAndEffects(active, [effectId], updatedAt);
    expect(ended.state.concentrationSpellId).toBeUndefined();
    expect(ended.state.activeEffectIds).toEqual([]);
    expect(ended.state.activeEffectSelections).toEqual({});
    expect(ended.state.activeEffectParameters).toEqual({});

    const replaced = endActiveEffects(active, [effectId], updatedAt);
    expect(replaced.state.concentrationSpellId).toBe("srd521.spell.dragon-s-breath");
    expect(replaced.state.activeEffectIds).toEqual([]);
  });

  it("adjusts current HP as a selected Aid bonus changes and ends", () => {
    const effectId = "srd521.status.spell.aid";
    const source = character();
    const aided = setActiveEffectWithHitPointBonus(source, effectId, true, 5, "2", updatedAt);
    const heightened = setActiveEffectSelectionWithHitPointAdjustment(
      aided,
      effectId,
      "3",
      5,
      updatedAt,
    );
    const ended = setActiveEffectWithHitPointBonus(heightened, effectId, false, 10, "3", updatedAt);

    expect(aided.state.currentHitPoints).toBe(source.state.currentHitPoints + 5);
    expect(heightened.state.currentHitPoints).toBe(source.state.currentHitPoints + 10);
    expect(ended.state.currentHitPoints).toBe(source.state.currentHitPoints);
    expect(ended.state.activeEffectSelections[effectId]).toBeUndefined();
  });

  it("handles Aid crossing zero HP and keeps dead characters at zero", () => {
    const effectId = "srd521.status.spell.aid";
    const source = character();
    const stable = {
      ...source,
      state: {
        ...source.state,
        currentHitPoints: 0,
        stableAtZeroHitPoints: true,
        deathSaveSuccesses: 3,
      },
    };
    const aided = setActiveEffectWithHitPointBonus(stable, effectId, true, 5, "2", updatedAt);
    expect(aided.state).toMatchObject({
      currentHitPoints: 5,
      stableAtZeroHitPoints: false,
      deathSaveSuccesses: 0,
    });
    expect(setActiveEffectWithHitPointBonus(aided, effectId, true, 5, "2", updatedAt)).toBe(aided);
    const concentrating = {
      ...aided,
      state: { ...aided.state, concentrationSpellId: "srd521.spell.bless" },
    };
    const ended = setActiveEffectWithHitPointBonus(
      concentrating,
      effectId,
      false,
      5,
      "2",
      updatedAt,
    );
    expect(ended.state.currentHitPoints).toBe(0);
    expect(ended.state.concentrationSpellId).toBeUndefined();
    const dead = { ...stable, state: { ...stable.state, dead: true } };
    expect(setActiveEffectWithHitPointBonus(dead, effectId, true, 5, "2", updatedAt)).toBe(dead);
  });

  it("ends concentration when condition data says the condition breaks it", () => {
    const source = character();
    const concentrating = {
      ...source,
      state: { ...source.state, concentrationSpellId: "srd521.spell.bless" },
    };

    const updated = setConditionActive(
      concentrating,
      "srd521.condition.incapacitated",
      true,
      updatedAt,
      true,
    );

    expect(updated.state.concentrationSpellId).toBeUndefined();
    expect(updated.state.conditionIds).toContain("srd521.condition.incapacitated");
  });
});
