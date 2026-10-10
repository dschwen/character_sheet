import type { AttackDamageRiderSummary, SpellDamageSummary, SpellSummary } from "@dnd/rules-api";
import type { DicePoolRollRequest } from "./dice-roll";

export function spellDamageRollRequest(
  spell: SpellSummary,
  damage: SpellDamageSummary,
  castingSourceId?: string,
): DicePoolRollRequest {
  const option =
    castingSourceId === undefined
      ? spell.castingOptions?.[0]
      : spell.castingOptions?.find(({ sourceId }) => sourceId === castingSourceId);
  if (castingSourceId !== undefined && option === undefined)
    throw new Error("That spell casting source is not available.");
  const bonuses = spell.level === 0 ? (option?.cantripDamageBonuses ?? []) : [];
  return {
    label: `${spell.name} · ${damage.type} damage${bonuses.length === 0 ? "" : ` · ${bonuses.map(({ sourceName }) => sourceName).join(", ")}`}`,
    diceCount: damage.diceCount,
    diceSize: damage.diceSize,
    modifier: (damage.bonus ?? 0) + bonuses.reduce((total, { amount }) => total + amount, 0),
    minimumTotal: 0,
  };
}

export interface DamageRiderContext {
  attackKind: "weapon" | "wild-shape-beast" | "unarmed" | "spell";
  damageType: string;
  hitCreature: boolean;
  ownTurn: boolean;
  unusedThisTurn: boolean;
  critical: boolean;
}

export function damageRiderRollRequest(
  rider: AttackDamageRiderSummary,
  context: DamageRiderContext,
): DicePoolRollRequest {
  if (!context.hitCreature || !context.ownTurn || !context.unusedThisTurn)
    throw new Error(
      "Confirm a creature was hit on your turn and this rider has not been used this turn.",
    );
  if (!rider.attackKinds.some((kind) => kind === context.attackKind))
    throw new Error("This attack kind is not eligible for the damage rider.");
  if (!rider.damageTypes.includes(context.damageType))
    throw new Error("Choose an eligible damage type for the rider.");
  return {
    label: `${rider.sourceName}${context.critical ? " critical" : ""} rider · ${context.damageType}`,
    diceCount: rider.diceCount * (context.critical ? 2 : 1),
    diceSize: rider.diceSize,
    modifier: 0,
    minimumTotal: 0,
  };
}
