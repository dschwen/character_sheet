"use client";

import { useState } from "react";
import type { AttackDamageRiderSummary } from "@dnd/rules-api";
import { damageRiderRollRequest, type DamageRiderContext } from "../lib/feature-damage-roll";
import type { DicePoolRollRequest, DicePoolRollResult } from "../lib/dice-roll";
import { titleCase } from "../lib/presentation";

export function DamageRiderControls({
  rider,
  busy,
  onRoll,
  onExplain,
}: {
  rider: AttackDamageRiderSummary;
  busy: boolean;
  onRoll: (request: DicePoolRollRequest) => Promise<DicePoolRollResult | undefined>;
  onExplain: () => void;
}) {
  const [attackKind, setAttackKind] = useState<DamageRiderContext["attackKind"]>("weapon");
  const [damageType, setDamageType] = useState(rider.damageTypes[0] ?? "");
  const [hitCreature, setHitCreature] = useState(false);
  const [ownTurn, setOwnTurn] = useState(false);
  const [unusedThisTurn, setUnusedThisTurn] = useState(false);
  const [critical, setCritical] = useState(false);
  const [error, setError] = useState("");
  async function roll() {
    setError("");
    try {
      const request = damageRiderRollRequest(rider, {
        attackKind,
        damageType,
        hitCreature,
        ownTurn,
        unusedThisTurn,
        critical,
      });
      const result = await onRoll(request);
      if (result !== undefined) setUnusedThisTurn(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not roll the damage rider.");
    }
  }
  return (
    <div className="damage-rider-card">
      <strong>
        {rider.sourceName} · {rider.diceCount}d{rider.diceSize}
      </strong>
      <div className="damage-rider-controls">
        <label>
          Hit using{" "}
          <select
            value={attackKind}
            onChange={(event) => {
              setAttackKind(event.target.value as DamageRiderContext["attackKind"]);
            }}
          >
            {rider.attackKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind === "weapon" ? "Weapon" : "Beast attack in Wild Shape"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Damage{" "}
          <select
            value={damageType}
            onChange={(event) => {
              setDamageType(event.target.value);
            }}
          >
            {rider.damageTypes.map((type) => (
              <option key={type} value={type}>
                {titleCase(type)}
              </option>
            ))}
          </select>
        </label>
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
            checked={ownTurn}
            onChange={(event) => {
              setOwnTurn(event.target.checked);
            }}
          />
          On my turn
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
        <button
          type="button"
          disabled={busy || !hitCreature || !ownTurn || !unusedThisTurn}
          onClick={() => {
            void roll();
          }}
        >
          Roll rider
        </button>
        <button type="button" onClick={onExplain}>
          Explain
        </button>
      </div>
      <p>
        Roll separately from weapon or Beast damage. Apply the result to the target’s sheet. Hit,
        turn, and Wild Shape eligibility are manually declared; this does not track encounters.
      </p>
      {error === "" ? null : <p role="alert">{error}</p>}
    </div>
  );
}
