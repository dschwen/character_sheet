"use client";

import { useState } from "react";
import type { AttackSummary, WeaponDamageRollChoiceSummary } from "@dnd/rules-api";
import {
  weaponDamageChoiceRequest,
  type WeaponDamageChoiceRequest,
} from "../lib/weapon-damage-roll";

export function WeaponDamageChoiceControls({
  attack,
  choice,
  modeId,
  busy,
  unavailable,
  onRoll,
  onExplain,
}: {
  attack: AttackSummary;
  choice: WeaponDamageRollChoiceSummary;
  modeId?: string | undefined;
  busy: boolean;
  unavailable: boolean;
  onRoll: (request: WeaponDamageChoiceRequest) => Promise<void>;
  onExplain: (traceId: string) => void;
}) {
  const [hitTarget, setHitTarget] = useState(false);
  const [unusedThisTurn, setUnusedThisTurn] = useState(false);
  const [critical, setCritical] = useState(false);
  const [error, setError] = useState("");
  async function roll() {
    setError("");
    try {
      const request = weaponDamageChoiceRequest(
        attack,
        choice.sourceId,
        { hitTarget, unusedThisTurn, critical },
        modeId,
      );
      setHitTarget(false);
      setUnusedThisTurn(false);
      setCritical(false);
      await onRoll(request);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not roll weapon damage.");
    }
  }
  return (
    <fieldset className="builder-subsection" aria-label={`${choice.sourceName} for ${attack.name}`}>
      <legend>{choice.sourceName}</legend>
      <p>
        Once per turn on a weapon hit, not only on your turn. Choose one complete pool; extra damage
        riders are rolled separately. Turn use and target damage remain manual.
      </p>
      <label>
        <input
          type="checkbox"
          checked={hitTarget}
          onChange={(event) => {
            setHitTarget(event.target.checked);
          }}
        />
        This weapon hit a target
      </label>
      <label>
        <input
          type="checkbox"
          checked={unusedThisTurn}
          onChange={(event) => {
            setUnusedThisTurn(event.target.checked);
          }}
        />
        This benefit is unused this turn
      </label>
      <label>
        <input
          type="checkbox"
          checked={critical}
          onChange={(event) => {
            setCritical(event.target.checked);
          }}
        />
        Critical hit (double weapon dice only)
      </label>
      <button
        type="button"
        disabled={busy || unavailable || !hitTarget || !unusedThisTurn}
        onClick={() => {
          void roll();
        }}
      >
        {choice.sourceName}: roll {String(choice.rollCount)} damage pools
      </button>
      <button
        type="button"
        className="button secondary compact"
        onClick={() => {
          onExplain(choice.traceId);
        }}
      >
        Explain {choice.sourceName}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </fieldset>
  );
}
