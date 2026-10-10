import type { AttackSummary, WeaponDamageModeSummary } from "@dnd/rules-api";
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
