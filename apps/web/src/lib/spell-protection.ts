import type { SpellProtectionApplication } from "@dnd/rules-api";

export function spellProtectionInstructions(protection: SpellProtectionApplication): string {
  return `${protection.sourceName}: choose ${String(protection.creatureCount)} other affected creatures you can see (maximum ${String(protection.maximumCreatures)}). They automatically succeed on saving throws against this spell and take no damage only where a successful save would normally deal half damage. This does not prevent attack-roll or automatic damage. Confirm eligibility and apply results on the target sheets; target HP and saves are not changed automatically.`;
}
