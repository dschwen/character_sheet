"use client";

import { useState } from "react";
import type { ActionSummary, ActionUseRequest, CharacterEvaluation } from "@dnd/rules-api";
import type { DiceRollResult } from "../lib/dice-roll";
import { savingThrowRerollDefinition, savingThrowRerollRequest } from "../lib/saving-throw-reroll";
import { abilities, shortEntityName } from "../lib/presentation";

export function SavingThrowRerollControls({
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
  onUse: (request: ActionUseRequest, disadvantage: boolean) => void;
  onExplain: () => void;
}) {
  const [target, setTarget] = useState<"self" | "other">("self");
  const [ability, setAbility] = useState<(typeof abilities)[number]>("wisdom");
  const [conditionId, setConditionId] = useState("");
  const [distance, setDistance] = useState("30");
  const [failed, setFailed] = useState(false);
  const [reaction, setReaction] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const definition = savingThrowRerollDefinition(action);
  if (!definition) return null;
  let ownAbility: (typeof abilities)[number] | undefined;
  try {
    const request = savingThrowRerollRequest(action, evaluation, previous, disadvantage);
    ownAbility = abilities.find((candidate) => request.testId === `savingThrow.${candidate}`);
  } catch {
    /* A matching roll is required only for self-targeted use. */
  }
  const selectedAbility = target === "self" ? ownAbility : ability;
  const selectedCondition = conditionId === "" ? (definition.conditionIds[0] ?? "") : conditionId;
  return (
    <div className="saving-throw-reroll-controls">
      <button type="button" className="button secondary compact" onClick={onExplain}>
        Explain reroll feature
      </button>
      <label>
        Target{" "}
        <select
          value={target}
          onChange={(event) => {
            setTarget(event.target.value === "other" ? "other" : "self");
            setFailed(false);
            setReaction(false);
          }}
        >
          <option value="self">My latest saving throw</option>
          <option value="other">Another creature (roll on its sheet)</option>
        </select>
      </label>
      {target === "other" ? (
        <>
          <label>
            Saving throw{" "}
            <select
              value={ability}
              onChange={(event) => {
                const selected = abilities.find((candidate) => candidate === event.target.value);
                if (selected) setAbility(selected);
              }}
            >
              {abilities.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {shortEntityName(candidate)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Distance (feet){" "}
            <input
              type="number"
              min="0"
              max={definition.rangeFeet}
              value={distance}
              onChange={(event) => {
                setDistance(event.target.value);
              }}
            />
          </label>
        </>
      ) : (
        <p>
          {ownAbility
            ? `${shortEntityName(ownAbility)} save selected.`
            : "Roll a saving throw first; attacks and ability checks cannot be rerolled here."}
        </p>
      )}
      <label>
        Effect applies{" "}
        <select
          value={selectedCondition}
          onChange={(event) => {
            setConditionId(event.target.value);
          }}
        >
          {definition.conditionIds.map((id) => (
            <option key={id} value={id}>
              {shortEntityName(id)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={failed}
          onChange={(event) => {
            setFailed(event.target.checked);
          }}
        />{" "}
        The selected save failed against this effect
      </label>
      <label>
        <input
          type="checkbox"
          checked={reaction}
          onChange={(event) => {
            setReaction(event.target.checked);
          }}
        />{" "}
        My Reaction is available
      </label>
      {target === "self" ? (
        <label>
          <input
            type="checkbox"
            checked={disadvantage}
            onChange={(event) => {
              setDisadvantage(event.target.checked);
            }}
          />{" "}
          Additional Disadvantage applies (cancels Advantage)
        </label>
      ) : null}
      <p>
        Range, failure, and Reaction availability are declared manually. The new save replaces the
        failed save; compare it with the DC and resolve any condition manually. Post-roll consumable
        bonuses are not carried forward automatically.
      </p>
      <button
        className="button primary compact"
        type="button"
        disabled={
          busy ||
          !action.available ||
          !failed ||
          !reaction ||
          !selectedAbility ||
          (target === "other" &&
            (distance.trim() === "" ||
              !Number.isFinite(Number(distance)) ||
              Number(distance) < 0 ||
              Number(distance) > definition.rangeFeet))
        }
        onClick={() => {
          if (!selectedAbility) return;
          onUse(
            {
              actionId: action.id,
              failedSavingThrow: {
                target,
                ability: selectedAbility,
                conditionId: selectedCondition,
                failed,
                reactionAvailable: reaction,
                ...(target === "other" ? { distanceFeet: Number(distance) } : {}),
              },
              ...(target === "self" && previous?.kind === "d20" && previous.testId
                ? {
                    completedD20Test: {
                      testId: previous.testId,
                      appliedActionIds: [...(previous.appliedActionIds ?? [])],
                    },
                  }
                : {}),
            },
            disadvantage,
          );
          setFailed(false);
          setReaction(false);
        }}
      >
        {target === "self" ? "Use Reaction & reroll" : "Use Reaction & instruct target"}
      </button>
    </div>
  );
}
