"use client";
import { useState } from "react";
import type { AttackSummary, CharacterEvaluation, WeaponDamageModeSummary } from "@dnd/rules-api";
import { resolveAttackRollOptions, type AttackRollOptionResolution } from "@dnd/rules-core";
import { declaredAttackRollRequest, attackTradeoffDamageRequest } from "../lib/attack-roll-options";
import type { D20RollRequest, DicePoolRollRequest } from "../lib/dice-roll";
import { signed } from "../lib/presentation";

export function AttackRollControls({
  attack,
  evaluation,
  damageMode,
  masteryReplacement,
  busy,
  attackDisabled = false,
  onRoll,
  onDamage,
  onExplain,
}: {
  attack: AttackSummary;
  evaluation: CharacterEvaluation;
  damageMode: WeaponDamageModeSummary | undefined;
  masteryReplacement: string | undefined;
  busy: boolean;
  attackDisabled?: boolean;
  onRoll: (request: D20RollRequest) => void;
  onDamage: (request: DicePoolRollRequest) => void;
  onExplain: (traceId: string) => void;
}) {
  const [benefitSourceIds, setBenefits] = useState<string[]>([]);
  const [declared, setDeclared] = useState(false);
  const [ownTurn, setOwnTurn] = useState(false);
  const [unused, setUnused] = useState(false);
  const [advantage, setAdvantage] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const [tradeoff, setTradeoff] = useState("");
  const [effectId, setEffectId] = useState("");
  const [receipt, setReceipt] = useState<AttackRollOptionResolution>();
  const [hit, setHit] = useState(false);
  const [damageRolled, setDamageRolled] = useState(false);
  const [error, setError] = useState("");
  const options = attack.rollOptions ?? [];
  const selected = options.find(({ sourceId }) => sourceId === tradeoff);
  const unavailable =
    evaluation.facts["actions.disabled"] === true || evaluation.facts["deathSave.dead"] === true;
  function rollDamage(critical: boolean) {
    if (receipt === undefined) return;
    try {
      onDamage(attackTradeoffDamageRequest(attack, receipt, hit, critical, damageMode));
      setDamageRolled(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to roll extra damage.");
    }
  }
  return (
    <div className="play-control">
      <button
        type="button"
        className="roll-cell"
        disabled={busy || unavailable || attackDisabled}
        title="Roll attack · Shift-click to inspect calculation"
        onClick={(event) => {
          if (event.shiftKey) {
            onExplain(attack.traceId);
            return;
          }
          try {
            const resolution = resolveAttackRollOptions(evaluation, attack.id, {
              benefitSourceIds,
              firstAttackDeclarationConfirmed: declared,
              ownTurnConfirmed: ownTurn,
              unusedThisTurnConfirmed: unused,
              additionalAdvantage: advantage,
              additionalDisadvantage: disadvantage,
              ...(tradeoff === "" ? {} : { tradeoffSourceId: tradeoff, effectId }),
            });
            onRoll(declaredAttackRollRequest(evaluation, attack, resolution, masteryReplacement));
            setReceipt(resolution);
            setHit(false);
            setDamageRolled(false);
            setError("");
            setTradeoff("");
            setEffectId("");
            setUnused(false);
          } catch (error) {
            setError(error instanceof Error ? error.message : "Unable to roll attack.");
          }
        }}
      >
        <strong>{signed(attack.attackBonus)}</strong>
        <small>Roll attack</small>
      </button>
      {options.length === 0 ? null : (
        <details>
          <summary>Attack options</summary>
          {options
            .filter(({ kind }) => kind === "advantage")
            .map((option) => (
              <div key={option.sourceId}>
                <label>
                  <input
                    type="checkbox"
                    checked={benefitSourceIds.includes(option.sourceId)}
                    onChange={(event) => {
                      setBenefits((current) =>
                        event.target.checked
                          ? [...current, option.sourceId]
                          : current.filter((id) => id !== option.sourceId),
                      );
                    }}
                  />{" "}
                  {option.sourceName}
                </label>
                <small>{option.instructions}</small>
                <button
                  type="button"
                  onClick={() => {
                    onExplain(option.traceId);
                  }}
                >
                  Explain {option.sourceName}
                </button>
              </div>
            ))}
          {options.some(({ requiresFirstAttackDeclaration }) => requiresFirstAttackDeclaration) ? (
            <label>
              <input
                type="checkbox"
                checked={declared}
                onChange={(event) => {
                  setDeclared(event.target.checked);
                }}
              />{" "}
              I declared the selected benefit on my first attack roll on my turn; it has not
              expired.
            </label>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={advantage}
              onChange={(event) => {
                setAdvantage(event.target.checked);
              }}
            />{" "}
            Additional situational Advantage
          </label>
          <label>
            <input
              type="checkbox"
              checked={disadvantage}
              onChange={(event) => {
                setDisadvantage(event.target.checked);
              }}
            />{" "}
            Any additional situational Disadvantage applies
          </label>
          {options.some(({ kind }) => kind === "forgo-advantage") ? (
            <>
              <label>
                Attack tradeoff
                <select
                  aria-label={`Attack tradeoff for ${attack.name}`}
                  value={tradeoff}
                  onChange={(event) => {
                    setTradeoff(event.target.value);
                    setEffectId("");
                  }}
                >
                  <option value="">None</option>
                  {options
                    .filter(({ kind }) => kind === "forgo-advantage")
                    .map((option) => (
                      <option key={option.sourceId} value={option.sourceId}>
                        {option.sourceName}
                      </option>
                    ))}
                </select>
              </label>
              {selected === undefined ? null : (
                <>
                  <small>{selected.instructions}</small>
                  <button
                    type="button"
                    onClick={() => {
                      onExplain(selected.traceId);
                    }}
                  >
                    Explain {selected.sourceName}
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={ownTurn}
                      onChange={(event) => {
                        setOwnTurn(event.target.checked);
                      }}
                    />{" "}
                    This attack is on my turn
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={unused}
                      onChange={(event) => {
                        setUnused(event.target.checked);
                      }}
                    />{" "}
                    I have not chosen an attack for this tradeoff this turn (including misses)
                  </label>
                  <label>
                    Effect on a hit
                    <select
                      value={effectId}
                      onChange={(event) => {
                        setEffectId(event.target.value);
                      }}
                    >
                      <option value="">Choose one</option>
                      {selected.effects.map((effect) => (
                        <option key={effect.id} value={effect.id}>
                          {effect.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </>
          ) : null}
          <small>
            Timing and targets are manually declared. Clear expired benefits; a missed chosen attack
            still uses the once-per-turn choice. Extra damage is separate from normal weapon damage.
          </small>
        </details>
      )}
      {error === "" ? null : <p role="alert">{error}</p>}
      {receipt?.tradeoff === undefined ? null : (
        <div role="status">
          <strong>{receipt.tradeoff.sourceName} declared · all Advantage forgone</strong>
          <small>{receipt.effect?.instructions}</small>
          {receipt.effect?.movement === undefined ? null : (
            <small>
              Move up to {String(receipt.effect.movement.maximumFeet)} ft. straight toward the
              target;{" "}
              {receipt.effect.movement.provokesOpportunityAttacks
                ? "normal Opportunity Attack rules apply"
                : "no Opportunity Attacks"}
              .
            </small>
          )}
          <label>
            <input
              type="checkbox"
              checked={hit}
              onChange={(event) => {
                setHit(event.target.checked);
              }}
            />{" "}
            This chosen attack hit
          </label>
          <button
            type="button"
            disabled={busy || !hit || damageRolled}
            onClick={() => {
              rollDamage(false);
            }}
          >
            Roll extra damage
          </button>
          <button
            type="button"
            disabled={busy || !hit || damageRolled}
            onClick={() => {
              rollDamage(true);
            }}
          >
            Critical extra damage
          </button>
          {damageRolled ? (
            <small>
              Extra damage rolled. Apply it and the chosen effect to the target manually.
            </small>
          ) : null}
        </div>
      )}
    </div>
  );
}
