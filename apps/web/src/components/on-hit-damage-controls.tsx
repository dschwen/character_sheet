"use client";

import { useState } from "react";
import type { ActionSummary, AttackSummary } from "@dnd/rules-api";
import type { DicePoolRollRequest, DicePoolRollResult } from "../lib/dice-roll";
import {
  eligibleDamageWeapon,
  onHitDamageDefinition,
  onHitDamageOptions,
  onHitDamageRollRequest,
  onHitRequirements,
  onHitSave,
} from "../lib/on-hit-damage";
import { actionInstructions } from "../lib/action-targeting";
import { actionMovementMessage } from "../lib/action-roll";
import { titleCase } from "../lib/presentation";

export function OnHitDamageControls({
  action,
  actions,
  attacks,
  actionName,
  busy,
  onRoll,
  onExplain,
  onNotice,
}: {
  action: ActionSummary;
  actions: ActionSummary[];
  attacks: AttackSummary[];
  actionName: (action: ActionSummary) => string;
  busy: boolean;
  onRoll: (request: DicePoolRollRequest) => Promise<DicePoolRollResult | undefined>;
  onExplain: (traceId: string) => void;
  onNotice: (message: string) => void;
}) {
  const weapons = attacks.filter((attack) => eligibleDamageWeapon(action, attack));
  const [attackId, setAttackId] = useState(weapons[0]?.id ?? "");
  const [optionId, setOptionId] = useState("");
  const [hitCreature, setHitCreature] = useState(false);
  const [unusedThisTurn, setUnusedThisTurn] = useState(false);
  const [critical, setCritical] = useState(false);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const definition = onHitDamageDefinition(action);
  if (definition === undefined) return null;
  const options = onHitDamageOptions(action, actions);
  const selected = options.find(({ id }) => id === optionId);
  const name = actionName(action);
  const requirements = [
    ...new Set([action, ...(selected ? [selected] : [])].flatMap(onHitRequirements)),
  ];
  const instructions = [action, ...(selected ? [selected] : [])].flatMap(actionInstructions);
  const save = selected === undefined ? undefined : onHitSave(selected);
  async function roll() {
    setError("");
    try {
      const { request, options: chosen } = onHitDamageRollRequest(
        action,
        actions,
        attacks,
        {
          attackId,
          optionIds: optionId === "" ? [] : [optionId],
          hitCreature,
          unusedThisTurn,
          critical,
          confirmedRequirements: confirmed,
        },
        name,
      );
      const result = await onRoll(request);
      if (result === undefined) return;
      setUnusedThisTurn(false);
      setHitCreature(false);
      setConfirmed([]);
      onNotice(
        `${name}: ${String(result.total)} extra damage; apply separately from weapon damage on the target's sheet. ${chosen
          .map((option) => {
            const save = onHitSave(option);
            return `${actionName(option)}${save === undefined ? "" : `: ${save.ability} save DC ${String(save.difficultyClass)}`}. ${actionMovementMessage(option) ?? ""} ${actionInstructions(option).join(" ")}`;
          })
          .join(" ")} Turn use and target effects remain manual.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not roll extra damage.");
    }
  }
  return (
    <div className="on-hit-damage-card">
      <strong>
        {name} · {definition.diceCount}d{definition.diceSize}
      </strong>
      <p>
        Extra damage only · once per turn, including another creature’s turn. Subtract an effect’s
        cost before doubling the remaining dice for a critical hit.
      </p>
      <div className="on-hit-damage-inputs">
        <label>
          Weapon
          <select
            value={attackId}
            onChange={(event) => {
              setAttackId(event.target.value);
              setConfirmed([]);
              setHitCreature(false);
            }}
          >
            {weapons.length === 0 ? <option value="">No eligible weapon</option> : null}
            {weapons.map((attack) => (
              <option key={attack.id} value={attack.id}>
                {attack.name} · {attack.damage.type}
              </option>
            ))}
          </select>
        </label>
        {options.length === 0 ? null : (
          <label>
            Effect (at most {definition.maximumOptions})
            <select
              value={optionId}
              onChange={(event) => {
                setOptionId(event.target.value);
                setConfirmed([]);
              }}
            >
              <option value="">None · full damage</option>
              {options.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.available}>
                  {actionName(option)} · cost{" "}
                  {typeof option.parameters?.sneakAttackDiceCost === "number"
                    ? String(option.parameters.sneakAttackDiceCost)
                    : "?"}
                  d{definition.diceSize}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={hitCreature}
            onChange={(event) => {
              setHitCreature(event.target.checked);
            }}
          />
          Hit a creature
        </label>
        <label>
          <input
            type="checkbox"
            checked={unusedThisTurn}
            onChange={(event) => {
              setUnusedThisTurn(event.target.checked);
            }}
          />
          Not used this turn
        </label>
        <label>
          <input
            type="checkbox"
            checked={critical}
            onChange={(event) => {
              setCritical(event.target.checked);
            }}
          />
          Critical hit
        </label>
        {requirements.map((requirement) => (
          <label key={requirement}>
            <input
              type="checkbox"
              checked={confirmed.includes(requirement)}
              onChange={(event) => {
                setConfirmed((previous) =>
                  event.target.checked
                    ? [...previous, requirement]
                    : previous.filter((value) => value !== requirement),
                );
              }}
            />
            {titleCase(requirement)}
          </label>
        ))}
      </div>
      {save === undefined ? null : (
        <p>
          {titleCase(save.ability)} save · DC {save.difficultyClass} · resolve on target’s sheet
          after damage.
        </p>
      )}
      {selected === undefined || actionMovementMessage(selected) === undefined ? null : (
        <p>{actionMovementMessage(selected)}</p>
      )}
      <details className="action-guidance">
        <summary>Eligibility, target effects, and timing (manual)</summary>
        {instructions.map((instruction) => (
          <p key={instruction}>{instruction}</p>
        ))}
      </details>
      <div className="action-inputs">
        <button
          type="button"
          disabled={
            busy ||
            !action.available ||
            weapons.length === 0 ||
            !hitCreature ||
            !unusedThisTurn ||
            requirements.some((requirement) => !confirmed.includes(requirement))
          }
          onClick={() => {
            void roll();
          }}
        >
          Roll extra damage
        </button>
        <button
          type="button"
          onClick={() => {
            onExplain(`${action.id}.extraDamage.diceCount`);
          }}
        >
          Explain dice
        </button>
        {selected === undefined ? null : (
          <button
            type="button"
            onClick={() => {
              onExplain(selected.traceId);
            }}
          >
            Explain effect
          </button>
        )}
      </div>
      {error === "" ? null : <p role="alert">{error}</p>}
    </div>
  );
}
