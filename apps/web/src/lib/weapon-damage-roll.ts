import type {
  AttackSummary,
  WeaponDamageModeSummary,
  WeaponDamageRollChoiceSummary,
} from "@dnd/rules-api";
import type { DicePoolRollRequest } from "./dice-roll";

export function selectedWeaponDamageMode(
  attack: AttackSummary,
  selectedId?: string,
): WeaponDamageModeSummary | undefined {
  if (selectedId !== undefined) return attack.damageModes?.find((mode) => mode.id === selectedId);
  return (
    attack.damageModes?.find(
      (mode) => mode.id === "two-handed" && attack.properties.includes("two-handed"),
    ) ?? attack.damageModes?.find((mode) => mode.id === "normal")
  );
}

export function weaponDamageRollRequest(
  attack: AttackSummary,
  modeId?: string,
  critical = false,
  damageType?: string,
): DicePoolRollRequest {
  const mode = selectedWeaponDamageMode(attack, modeId);
  if ((modeId !== undefined && mode === undefined) || mode?.available === false)
    throw new Error(mode?.reasons.join(" ") ?? "That weapon damage mode is not available.");
  const damage = mode?.damage ?? attack.damage;
  if (damage.diceCount === undefined || damage.diceSize === undefined)
    throw new Error(`${attack.name} has no structured damage dice to roll.`);
  return {
    label: `${attack.name}${mode === undefined || mode.id === "normal" ? "" : ` · ${mode.name}`}${critical ? " critical" : ""} damage · ${damageType ?? damage.type}`,
    diceCount: damage.diceCount * (critical ? 2 : 1),
    diceSize: damage.diceSize,
    modifier: damage.bonus + (damage.flat ?? 0),
    minimumTotal: 0,
    ...(damage.dieMinimum === undefined ? {} : { dieMinimum: damage.dieMinimum }),
  };
}

export interface WeaponDamageChoiceRequest {
  pool: DicePoolRollRequest;
  choice: WeaponDamageRollChoiceSummary;
}

export function weaponDamageChoiceRequest(
  attack: AttackSummary,
  sourceId: string,
  declarations: { hitTarget: boolean; unusedThisTurn: boolean; critical: boolean },
  modeId?: string,
): WeaponDamageChoiceRequest {
  const choice = attack.damageRollChoices?.find((entry) => entry.sourceId === sourceId);
  if (!choice || attack.properties.includes("unarmed-strike"))
    throw new Error("This attack has no eligible weapon-damage choice.");
  if (!declarations.hitTarget || !declarations.unusedThisTurn)
    throw new Error("Confirm a weapon hit and that this benefit has not been used this turn.");
  const pool = weaponDamageRollRequest(attack, modeId, declarations.critical);
  return { choice, pool: { ...pool, label: `${choice.sourceName} · ${pool.label}` } };
}
