"use client";

import { useState } from "react";
import type { ActionSummary, CharacterEvaluation, AttackSummary } from "@dnd/rules-api";
import {
  eligibleReactionAttack,
  reactionAttackDefinition,
  resolveReactionAttack,
} from "@dnd/rules-core";
import type { D20RollRequest, DicePoolRollRequest } from "../lib/dice-roll";
import { AttackRollControls } from "./attack-roll-controls";
import { selectedWeaponDamageMode } from "../lib/weapon-damage-roll";

export function ReactionAttackControls({
  action,
  evaluation,
  busy,
  damageModeIds,
  onRoll,
  onDamage,
  onBaseDamage,
  onExplain,
  onNotice,
}: {
  action: ActionSummary;
  evaluation: CharacterEvaluation;
  busy: boolean;
  damageModeIds: Readonly<Record<string, string>>;
  onRoll: (request: D20RollRequest) => void;
  onDamage: (request: DicePoolRollRequest) => void;
  onBaseDamage: (attack: AttackSummary, critical: boolean) => void;
  onExplain: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const [damage, setDamage] = useState("");
  const [distance, setDistance] = useState("5");
  const [creature, setCreature] = useState(false);
  const [reaction, setReaction] = useState(false);
  const [selected, setSelected] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [used, setUsed] = useState(false);
  const [hit, setHit] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState("");
  const definition = reactionAttackDefinition(action);
  if (!definition) return null;
  const attacks = evaluation.attacks.filter((attack) => eligibleReactionAttack(action, attack));
  const attack = attacks.find(({ id }) => id === selected) ?? attacks[0];
  return (
    <div className="saving-throw-reroll-controls">
      <button
        type="button"
        className="button secondary compact"
        onClick={() => {
          onExplain(action.traceId);
        }}
      >
        Explain reaction attack
      </button>
      <fieldset disabled={authorized || busy}>
        <label>
          Damage already taken{" "}
          <input
            type="number"
            min="1"
            step="1"
            value={damage}
            onChange={(event) => {
              setDamage(event.target.value);
            }}
          />
        </label>
        <label>
          Distance to damaging creature (feet){" "}
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
        <label>
          <input
            type="checkbox"
            checked={creature}
            onChange={(event) => {
              setCreature(event.target.checked);
            }}
          />{" "}
          Damage came from a creature; I will attack that same creature
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
        <label>
          Reaction attack{" "}
          <select
            value={attack?.id ?? ""}
            onChange={(event) => {
              setSelected(event.target.value);
            }}
          >
            {attacks.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <p>
        Exactly one attack, not the Attack action. Damage taken, target identity, and Reaction use
        are tracked manually. Rage is not required.
      </p>
      {!authorized ? (
        <button
          type="button"
          className="button primary compact"
          disabled={
            busy ||
            !action.available ||
            !attack ||
            !creature ||
            !reaction ||
            damage.trim() === "" ||
            distance.trim() === ""
          }
          onClick={() => {
            if (!attack) return;
            try {
              resolveReactionAttack(evaluation, action.id, {
                attackId: attack.id,
                damageTaken: Number(damage),
                sourceIsCreature: creature,
                distanceFeet: Number(distance),
                reactionAvailable: reaction,
              });
              setAuthorized(true);
              setError("");
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Invalid reaction trigger.");
            }
          }}
        >
          Confirm trigger
        </button>
      ) : attack ? (
        <>
          <AttackRollControls
            key={generation}
            attack={attack}
            evaluation={evaluation}
            damageMode={selectedWeaponDamageMode(attack, damageModeIds[attack.id])}
            masteryReplacement={undefined}
            busy={busy}
            attackDisabled={used}
            onRoll={(request) => {
              setUsed(true);
              onRoll({ ...request, label: `${request.label} · Reaction` });
              onNotice(
                "One reaction attack rolled. Mark your Reaction used manually; confirm the hit and apply damage to the triggering creature.",
              );
            }}
            onDamage={onDamage}
            onExplain={onExplain}
          />
          <label>
            <input
              type="checkbox"
              checked={hit}
              disabled={!used || busy}
              onChange={(event) => {
                setHit(event.target.checked);
              }}
            />{" "}
            Attack hit the triggering creature
          </label>
          <button
            type="button"
            className="button secondary compact"
            disabled={busy || !hit}
            onClick={() => {
              onBaseDamage(attack, false);
            }}
          >
            Roll reaction damage
          </button>
          <button
            type="button"
            className="button secondary compact"
            disabled={busy || !hit}
            onClick={() => {
              onBaseDamage(attack, true);
            }}
          >
            Roll critical reaction damage
          </button>
          <button
            type="button"
            className="button secondary compact"
            disabled={busy}
            onClick={() => {
              setAuthorized(false);
              setUsed(false);
              setHit(false);
              setCreature(false);
              setReaction(false);
              setDamage("");
              setGeneration(generation + 1);
            }}
          >
            New reaction trigger
          </button>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
