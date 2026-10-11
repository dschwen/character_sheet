"use client";
import { useState } from "react";
import type { ActionSummary, ActionUseRequest, CharacterEvaluation } from "@dnd/rules-api";
import type { DiceRollResult } from "../lib/dice-roll";
import { failedSaveRerollDefinition, failedSaveRerollRequest } from "../lib/failed-save-reroll";

export function FailedSaveRerollControls({
  action,
  evaluation,
  previous,
  busy,
  onUse,
  onExplain,
}: {
  action: ActionSummary;
  evaluation: CharacterEvaluation;
  previous: DiceRollResult | undefined;
  busy: boolean;
  onUse: (request: ActionUseRequest) => void;
  onExplain: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [confirmedRoll, setConfirmedRoll] = useState<DiceRollResult | undefined>();
  const definition = failedSaveRerollDefinition(action);
  if (definition === undefined) return null;
  const bonus = evaluation.facts[definition.bonusFact];
  let eligible = false;
  try {
    failedSaveRerollRequest(action, evaluation, previous);
    eligible = true;
  } catch {
    /* No eligible save. */
  }
  return (
    <div className="saving-throw-reroll-controls">
      <button type="button" className="button secondary compact" onClick={onExplain}>
        Explain reroll feature
      </button>
      <label>
        <input
          type="checkbox"
          checked={failed && confirmedRoll === previous}
          onChange={(event) => {
            setFailed(event.target.checked);
            setConfirmedRoll(previous);
          }}
        />{" "}
        My latest saving throw failed
      </label>
      <p>
        Reroll with +{typeof bonus === "number" ? String(bonus) : "unavailable"}. Keep the original
        roll mode and use the new result, even if it is worse. One use is spent; no Reaction is
        required. Compare with the DC manually. Post-roll consumable bonuses are not carried
        forward.
      </p>
      <button
        type="button"
        className="button primary compact"
        disabled={busy || !action.available || !failed || confirmedRoll !== previous || !eligible}
        onClick={() => {
          if (!eligible || previous?.kind !== "d20" || previous.testId === undefined) return;
          onUse({
            actionId: action.id,
            failedSave: true,
            completedD20Test: {
              testId: previous.testId,
              appliedActionIds: [...(previous.appliedActionIds ?? [])],
            },
          });
          setFailed(false);
        }}
      >
        Spend use & reroll failed save
      </button>
    </div>
  );
}
