import type { SpellSummary } from "@dnd/rules-api";

export function spellStatusInstructions(spell: SpellSummary): string[] {
  return spell.appliedStatuses.map((status) => `Set "${status.statusName}" on the target's sheet.`);
}

export function spellStatusMessage(spell: SpellSummary): string {
  return spellStatusInstructions(spell).join(" ");
}
