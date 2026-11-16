import type { CharacterEvaluation } from "@dnd/rules-api";
import {
  resolveGrappledTargetAttack,
  resolvePunchAndGrab,
  type GrappledTargetAttackRequest,
  type PunchAndGrabRequest,
} from "@dnd/rules-core";
import { d20RerollRequest, type DicePoolRollRequest, type D20RollRequest } from "./dice-roll";

export function grappledTargetRollRequest(
  evaluation: CharacterEvaluation,
  request: GrappledTargetAttackRequest,
  attackLabel?: string,
): D20RollRequest {
  const result = resolveGrappledTargetAttack(evaluation, request);
  const rerolls = d20RerollRequest(evaluation.d20Tests.initiative, evaluation.attackRollBonusDice);
  delete rerolls.dieMinimum;
  return {
    label: `${attackLabel ?? `${result.attackName} attack`} · ${result.sourceName} · target ${result.targetName} (Grappled by you)`,
    modifier: result.modifier,
    mode: result.mode,
    criticalThreshold: result.criticalThreshold,
    ...rerolls,
  };
}

export function punchAndGrabDamageRequest(
  evaluation: CharacterEvaluation,
  request: PunchAndGrabRequest,
) {
  const result = resolvePunchAndGrab(evaluation, request);
  const label = `${result.sourceName} · Damage and Grapple · ${result.targetName} · ${result.damage.type}`;
  if (result.damage.diceCount === undefined || result.damage.diceSize === undefined)
    return { result, fixedDamage: Math.max(0, (result.damage.flat ?? 0) + result.damage.bonus) };
  const pool: DicePoolRollRequest = {
    label: `${label}${result.critical ? " critical" : ""} damage`,
    diceCount: result.damage.diceCount * (result.critical ? 2 : 1),
    diceSize: result.damage.diceSize,
    modifier: result.damage.bonus + (result.damage.flat ?? 0),
    minimumTotal: 0,
  };
  return { result, pool };
}
