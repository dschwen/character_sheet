import type { AttackSummary, CharacterEvaluation, WeaponDamageModeSummary } from "@dnd/rules-api";
import type { AttackRollOptionResolution } from "@dnd/rules-core";
import type { D20RollRequest, DicePoolRollRequest } from "./dice-roll";
import { d20RerollRequest } from "./dice-roll";
import { selectedAttackMastery } from "./weapon-mastery";

export function declaredAttackRollRequest(
  evaluation: CharacterEvaluation,
  attack: AttackSummary,
  resolution: AttackRollOptionResolution,
  masteryReplacement?: string,
): D20RollRequest {
  if (resolution.attackId !== attack.id)
    throw new TypeError("This declaration belongs to another attack.");
  const mastery = selectedAttackMastery(attack, masteryReplacement);
  const annotations = [
    ...resolution.benefits.map(({ sourceName }) => sourceName),
    ...(resolution.tradeoff === undefined
      ? []
      : [`${resolution.tradeoff.sourceName}: all Advantage forgone`]),
    ...(resolution.effect === undefined
      ? []
      : [`${resolution.effect.name} on a hit (target effects manual)`]),
    ...(mastery === undefined ? [] : [`${mastery} mastery (target effects manual)`]),
  ];
  const reroll = d20RerollRequest(evaluation.d20Tests.initiative, evaluation.attackRollBonusDice);
  delete reroll.dieMinimum;
  return {
    testId: attack.id,
    label: `${attack.name} attack${annotations.length === 0 ? "" : ` · ${annotations.join(" · ")}`}`,
    modifier: attack.attackBonus,
    mode: resolution.mode,
    criticalThreshold: attack.criticalHitThreshold,
    ...reroll,
  };
}

export function attackTradeoffDamageRequest(
  attack: AttackSummary,
  resolution: AttackRollOptionResolution,
  hitConfirmed: boolean,
  critical = false,
  mode?: WeaponDamageModeSummary,
): DicePoolRollRequest {
  if (
    resolution.attackId !== attack.id ||
    !hitConfirmed ||
    resolution.tradeoff?.damage === undefined
  )
    throw new TypeError("Confirm the chosen attack hit before rolling its declared extra damage.");
  if (mode?.available === false) throw new TypeError(mode.reasons.join(" "));
  const damage = mode?.damage ?? attack.damage;
  return {
    label: `${resolution.tradeoff.sourceName} · ${attack.name}${critical ? " critical" : ""} extra damage · ${damage.type}`,
    diceCount: resolution.tradeoff.damage.diceCount * (critical ? 2 : 1),
    diceSize: resolution.tradeoff.damage.diceSize,
    modifier: 0,
    ...(damage.dieMinimum === undefined ? {} : { dieMinimum: damage.dieMinimum }),
  };
}
