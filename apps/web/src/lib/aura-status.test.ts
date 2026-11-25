import { describe, expect, it } from "vitest";
import {
  evaluateCharacter,
  setActiveEffectActive,
  setActiveEffectSelection,
} from "@dnd/rules-core";

import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
} from "./character-builder";

import { loadWebData } from "./server-data";

describe("party Aura of Protection status controls", () => {
  it("toggles a chosen bonus on a non-Paladin and combines it with unrelated effects", () => {
    const { rulesPackage } = loadWebData();
    const original = buildCharacter(
      defaultBuilderDraft(fighterId, characterBuilderCatalog(rulesPackage), 5, "Protected Fighter"),
      rulesPackage,
      { id: "protected-fighter", now: new Date("2026-10-09T12:00:00Z") },
    );
    const statusId = "srd521.status.feature.aura-of-protection";
    const evaluate = (character: typeof original) =>
      evaluateCharacter({ character, packages: [rulesPackage] });
    const baseline = evaluate(original);
    let recipient = setActiveEffectActive(original, statusId, true);
    expect(evaluate(recipient).validations.map(({ code }) => code)).toContain(
      "AURA_BONUS_SELECTION_REQUIRED",
    );
    recipient = setActiveEffectSelection(recipient, statusId, "4");
    recipient = setActiveEffectActive(recipient, "srd521.status.spell.bless", true);
    recipient.state.exhaustion = 1;
    const evaluation = evaluate(recipient);
    expect(evaluation.validations).toEqual(baseline.validations);
    expect(evaluation.savingThrowAuras).toEqual([]);
    expect(evaluation.d20Tests["savingThrow.dexterity"]?.modifier).toBe(
      (baseline.d20Tests["savingThrow.dexterity"]?.modifier ?? 0) + 4 - 2,
    );
    expect(evaluation.d20Tests["savingThrow.dexterity"]?.bonusDice).toEqual(
      expect.arrayContaining([expect.objectContaining({ diceSize: 4 })]),
    );
    expect(evaluation.d20Tests["skill.athletics"]?.modifier).toBe(
      (baseline.d20Tests["skill.athletics"]?.modifier ?? 0) - 2,
    );
    const removed = evaluate(setActiveEffectActive(recipient, statusId, false));
    expect(removed.d20Tests["savingThrow.dexterity"]?.modifier).toBe(
      (baseline.d20Tests["savingThrow.dexterity"]?.modifier ?? 0) - 2,
    );
  });
});
