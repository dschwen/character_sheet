import { describe, expect, it } from "vitest";

import type { SpellSummary } from "@dnd/rules-api";

import { spellStatusInstructions, spellStatusMessage } from "./spell-status";

const spell = {
  id: "srd521.spell.bless",
  name: "Bless",
  appliedStatuses: [
    {
      statusId: "srd521.status.spell.bless",
      statusName: "Blessed",
      target: "target",
    },
  ],
} as SpellSummary;

describe("beneficial spell status instructions", () => {
  it("names the status and target sheet after casting", () => {
    expect(spellStatusInstructions(spell)).toEqual(['Set "Blessed" on the target\'s sheet.']);
    expect(spellStatusMessage(spell)).toBe('Set "Blessed" on the target\'s sheet.');
  });

  it("returns no instruction for a spell without a lasting status", () => {
    expect(spellStatusMessage({ ...spell, appliedStatuses: [] })).toBe("");
  });
});
