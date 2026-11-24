"use client";

import { useState } from "react";
import type { InventoryItemSummary } from "@dnd/rules-api";

export function TimedMagicItemControls({
  name,
  power,
  actionsDisabled,
  onToggle,
  onElapse,
}: {
  name: string;
  power: NonNullable<InventoryItemSummary["timedPower"]>;
  actionsDisabled: boolean;
  onToggle: () => void;
  onElapse: (rounds: number) => void;
}) {
  const [rounds, setRounds] = useState("1");
  return (
    <div className="effect-action-setup">
      <strong>{name}</strong>
      <small>
        {String(power.remainingRounds)} / {String(power.maximumRounds)} rounds remaining
      </small>
      {power.active ? <p>{power.activeDescription}</p> : null}
      {!power.available && power.remainingRounds > 0 ? (
        <small>Equip and attune this item to use it.</small>
      ) : null}
      {power.remainingRounds === 0 ? (
        <small>Finish a Long Rest to restore its duration.</small>
      ) : null}
      <div className="effect-selection-action">
        <button
          type="button"
          className="button secondary compact"
          disabled={!power.available || actionsDisabled}
          onClick={onToggle}
        >
          {power.active ? "Deactivate" : "Activate"} · Bonus Action
        </button>
        {power.active ? (
          <>
            <label>
              Elapsed rounds
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={rounds}
                onChange={(event) => {
                  setRounds(event.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="button secondary compact"
              onClick={() => {
                onElapse(Number(rounds));
              }}
            >
              Record rounds
            </button>
            <small>Record elapsed rounds before deactivating.</small>
          </>
        ) : null}
      </div>
    </div>
  );
}
