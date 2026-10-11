"use client";
import { useState } from "react";
import type { CharacterState } from "@dnd/character-model";
import type { CharacterEvaluation, DeathSavingThrowRequest } from "@dnd/rules-api";
import { deathSaveStatus } from "@dnd/rules-core";
import type { D20RollRequest, DiceRollResult } from "../lib/dice-roll";
import {
  canResolveDeathSave,
  deathSaveResolutionRequest,
  deathSaveRollRequest,
} from "../lib/death-save-roll";

export function DeathSaveControls({
  state,
  evaluation,
  previous,
  busy,
  onRoll,
  onResolve,
  onExplain,
}: {
  state: CharacterState;
  evaluation: CharacterEvaluation;
  previous: DiceRollResult | undefined;
  busy: boolean;
  onRoll: (request: D20RollRequest) => void;
  onResolve: (request: DeathSavingThrowRequest) => void;
  onExplain: () => void;
}) {
  const [turn, setTurn] = useState(false);
  const [firstAid, setFirstAid] = useState(false);
  const status = deathSaveStatus(state);
  return (
    <div className="play-control">
      <strong>Death Saving Throws · {status}</strong>
      <small>
        {String(state.deathSaveSuccesses)} successes · {String(state.deathSaveFailures)} failures
      </small>
      <button type="button" className="button secondary compact" onClick={onExplain}>
        Explain death save
      </button>
      <label>
        <input
          type="checkbox"
          checked={turn}
          onChange={(event) => {
            setTurn(event.target.checked);
          }}
        />{" "}
        My turn starts at 0 HP and I am not Stable
      </label>
      <button
        type="button"
        className="button secondary compact"
        disabled={
          busy ||
          status !== "dying" ||
          state.currentHitPoints !== 0 ||
          !turn ||
          canResolveDeathSave(state, previous)
        }
        onClick={() => {
          onRoll(deathSaveRollRequest(evaluation));
        }}
      >
        Roll death save
      </button>
      <p>
        DC 10; no ability or proficiency modifier. Resolve any reroll or post-roll bonus first, then
        apply only the final result. A natural 1 is two failures; a natural 20 restores 1 HP.
      </p>
      <button
        type="button"
        className="button primary compact"
        disabled={busy || !turn || !canResolveDeathSave(state, previous)}
        onClick={() => {
          onResolve(deathSaveResolutionRequest(state, previous, turn));
          setTurn(false);
        }}
      >
        Apply final death save result
      </button>
      <label>
        <input
          type="checkbox"
          checked={firstAid}
          onChange={(event) => {
            setFirstAid(event.target.checked);
          }}
        />{" "}
        Another creature used Help and succeeded on the DC 10 Wisdom (Medicine) check
      </label>
      <button
        type="button"
        className="button secondary compact"
        disabled={busy || status !== "dying" || !firstAid}
        onClick={() => {
          onResolve({ kind: "stabilize", successfulFirstAidConfirmed: firstAid });
          setFirstAid(false);
          setTurn(false);
        }}
      >
        Apply successful first aid
      </button>
      <small>
        Stable characters remain unconscious at 0 HP and stop rolling. Damage ends stability.
        Regaining HP resets both marks. Stable recovery after 1d4 hours and revival magic remain
        manually adjudicated.
      </small>
    </div>
  );
}
